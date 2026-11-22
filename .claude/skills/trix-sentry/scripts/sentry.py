#!/usr/bin/env python3
"""trix-sentry: a read-mostly CLI over the Sentry API for the trix fleet.

Auth: the token is read from ~/.sentryclirc ([auth] token; SENTRYCLIRC overrides
the path). It is never printed, logged or put on argv: it only rides the
Authorization header, and it is scrubbed from every error message.

API edges baked in (do not "simplify" them away):
  * /projects/{org}/{proj}/issues/ returns HTTP 400. Use the org-level
    /organizations/{org}/issues/?project=<numeric id>.
  * Searching issues by shortId returns []. Resolve it with
    /organizations/{org}/shortids/{shortId}/.

Usage:
  sentry.py projects                          # the fleet map (alias, slug, repo)
  sentry.py list [--project <alias>|all] [--query 'is:unresolved'] [--period 90d] [--group]
  sentry.py show <id>                         # quick look at one issue
  sentry.py events <id> [--limit 20]          # recent events, one line each
  sentry.py evidence <id> [--json|--markdown] [--no-fetch]
                                              # the triage dossier (see SKILL.md)
  sentry.py assign <id> [--to me|<email>] [-m text]
  sentry.py resolve <id> [--next-release] -m "Fixed in <repo>#<pr>"
  sentry.py archive <id> -m "<evidence-backed reason>"
  sentry.py comment <id> -m text
  sentry.py unresolve <id>

<id> is a shortId (HEYWEEK-SERVER-7) or a numeric group id.
"""
import argparse
import collections
import configparser
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fleet  # noqa: E402

ORG = fleet.ORG
PERF_TITLES = ("N+1 Query", "Consecutive HTTP", "Consecutive DB", "Slow DB Query",
               "Large Render Blocking", "Large HTTP payload", "File IO on Main Thread",
               "Uncompressed Asset", "Endpoint Regression")


class SentryError(Exception):
    pass


def _token():
    c = configparser.ConfigParser()
    c.read(os.environ.get("SENTRYCLIRC") or os.path.expanduser("~/.sentryclirc"))
    try:
        return c["auth"]["token"]
    except KeyError:
        raise SentryError("no [auth] token in ~/.sentryclirc (run `sentry-cli login`)") from None


def api(path, params=None, method="GET", body=None):
    tok = _token()
    url = f"https://sentry.io/api/0{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400].replace(tok, "<token>")
        raise SentryError(f"Sentry {method} {path} -> HTTP {e.code}: {detail}") from None
    except urllib.error.URLError as e:
        raise SentryError(f"Sentry {method} {path} -> {e.reason}") from None


def resolve_id(ref):
    ref = str(ref).strip()
    if ref.isdigit():
        return ref
    data = api(f"/organizations/{ORG}/shortids/{ref}/") or {}
    gid = data.get("groupId") or (data.get("group") or {}).get("id")
    if not gid:
        raise SentryError(f"could not resolve shortId {ref}")
    return str(gid)


def resolve_actor(to):
    to = (to or "me").strip()
    if to.startswith(("user:", "team:")):
        return to
    if to == "me":
        return f"user:{api('/')['user']['id']}"
    if "@" in to:
        for m in api(f"/organizations/{ORG}/members/") or []:
            if (m.get("email") or (m.get("user") or {}).get("email")) == to:
                return f"user:{(m.get('user') or {}).get('id')}"
        raise SentryError("no org member with that email")
    raise SentryError(f"unrecognised assignee {to!r} (me | <email> | user:<id>)")


# ── extraction (pure) ────────────────────────────────────────────────────────
def tags(ev):
    return {t["key"]: t["value"] for t in (ev or {}).get("tags", [])}


def _entries(ev, kind):
    return [e["data"] for e in (ev or {}).get("entries", []) if e.get("type") == kind]


def exceptions(ev, repo_dirnames=()):
    out = []
    for data in _entries(ev, "exception"):
        for v in data.get("values") or []:
            frames = (v.get("stacktrace") or {}).get("frames") or []
            out.append({
                "type": v.get("type"), "value": v.get("value"),
                "mechanism": (v.get("mechanism") or {}).get("type"),
                "handled": (v.get("mechanism") or {}).get("handled"),
                # Sentry lists outermost first; the crash site is the last frame.
                "frames": [{
                    "function": f.get("function"),
                    "path": fleet.normalise_frame_path(
                        f.get("filename") or f.get("absPath"), repo_dirnames),
                    "raw_path": f.get("absPath") or f.get("filename"),
                    "line": f.get("lineNo"), "col": f.get("colNo"),
                    "in_app": bool(f.get("inApp")),
                    "context": f.get("context") or [],
                } for f in reversed(frames)],
            })
    return out


def message(ev):
    for data in _entries(ev, "message"):
        return data.get("formatted") or data.get("message")
    return None


def breadcrumbs(ev, last=12):
    for data in _entries(ev, "breadcrumbs"):
        return fleet.redact([{k: b.get(k) for k in ("timestamp", "category", "level",
                                                    "message", "data")}
                             for b in (data.get("values") or [])[-last:]])
    return []


def performance(ev):
    """Evidence of a performance-detector event (N+1 etc.), or None."""
    oc = (ev or {}).get("occurrence") or {}
    if not oc:
        return None
    data = oc.get("evidenceData") or {}
    return {
        "type": oc.get("type"), "transaction": data.get("transactionName"),
        "evidence": [(e.get("name"), str(e.get("value"))[:400])
                     for e in oc.get("evidenceDisplay") or []],
        "offender_spans": len(data.get("offenderSpanIds") or []),
        "repeating": data.get("repeatingSpansCompact") or data.get("repeatingSpans"),
    }


def _user_key(u):
    u = u or {}
    raw = u.get("id") or u.get("email") or u.get("ip_address") or u.get("username")
    return hashlib.sha256(str(raw).encode()).hexdigest()[:12] if raw else None


def spread(events):
    envs, rels, servers, users = (collections.Counter() for _ in range(4))
    stamps = []
    for e in events:
        t = tags(e)
        envs[t.get("environment", "?")] += 1
        rels[t.get("release", "?")] += 1
        servers[t.get("server_name", "?")] += 1
        k = _user_key(e.get("user"))
        if k:
            users[k] += 1
        if e.get("dateCreated"):
            stamps.append(e["dateCreated"])
    return {
        "events": len(events), "environments": dict(envs), "releases": dict(rels),
        "server_names": dict(servers), "distinct_users": len(users),
        "first": min(stamps) if stamps else None, "last": max(stamps) if stamps else None,
    }


def distribution(tag_rows):
    """Tag counts over ALL of an issue's events (the events list is a sample)."""
    keep = ("environment", "release", "server_name", "transaction", "url", "browser", "os")
    return {t["key"]: {v["value"]: v["count"] for v in t.get("topValues") or []}
            for t in tag_rows or [] if t.get("key") in keep}


def signals(issue, sp, project=None, env_counts=None):
    """Facts that bear on the disposition. Each one must still be confirmed."""
    out = []
    envs = env_counts or sp.get("environments") or {}
    scope = "over all events" if env_counts else "in the sampled events"
    prod = set((project or {}).get("prod_envs") or ("production", "prod"))
    if envs and not (prod & set(envs)):
        out.append(f"never seen in production {scope} (envs: {envs}; production is "
                   f"{'/'.join(sorted(prod))} for this project)")
    if issue.get("issueCategory") == "performance" or issue.get("title") in PERF_TITLES:
        out.append("performance detector (grouped spans), not a thrown exception: "
                   "check whether the pattern is real on a production hot path")
    mix = (issue.get("metadata") or {}).get("in_app_frame_mix")
    if mix == "system-only":
        out.append("no in-app frame in the stack: the throw is in a library, so find "
                   "the calling code from the transaction, breadcrumbs and the library")
    if int(issue.get("userCount") or 0) == 0:
        out.append("0 users attached (server jobs and anonymous calls carry none)")
    if int(issue.get("count") or 0) == 1:
        out.append("single event: one sample cannot show a pattern")
    return out


# ── lookups that need the network or git ─────────────────────────────────────
def paired(ts, exclude_pid, window_s=120):
    """Events in the other fleet projects within ±window of `ts`."""
    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
    fmt = "%Y-%m-%dT%H:%M:%S"
    params = {
        "field": ["issue", "title", "project", "environment", "timestamp"],
        "project": [p["pid"] for p in fleet.PROJECTS.values() if p["pid"] != str(exclude_pid)],
        "start": (t - dt.timedelta(seconds=window_s)).strftime(fmt),
        "end": (t + dt.timedelta(seconds=window_s)).strftime(fmt),
        "sort": "timestamp", "per_page": 50, "query": "",
    }
    try:
        res = api(f"/organizations/{ORG}/events/", params) or {}
    except SentryError as e:
        return [{"error": str(e)}]
    return res.get("data", [])


def _fetch(repo):
    subprocess.run(["git", "-C", repo, "fetch", "-q", "origin"], capture_output=True)


def dossier(ref, fetch=True):
    gid = resolve_id(ref)
    issue = api(f"/organizations/{ORG}/issues/{gid}/")
    latest = api(f"/organizations/{ORG}/issues/{gid}/events/latest/")
    evs = api(f"/organizations/{ORG}/issues/{gid}/events/", {"limit": 50}) or []
    try:
        dist = distribution(api(f"/organizations/{ORG}/issues/{gid}/tags/"))
    except SentryError as e:
        dist = {"error": str(e)}
    proj = fleet.PROJECT_BY_PID.get(str((issue.get("project") or {}).get("id"))) or \
        fleet.PROJECT_BY_SLUG.get((issue.get("project") or {}).get("slug"))
    t = tags(latest)
    d = {
        "issue": issue, "project": proj["alias"] if proj else None,
        "tags": t, "message": message(latest), "breadcrumbs": breadcrumbs(latest),
        "performance": performance(latest),
        "contexts": {k: v for k, v in (latest.get("context") or {}).items()},
        "exceptions": [], "spread": spread(evs), "distribution": dist,
        "signals": [], "placement": None,
        "frames": [], "paired": [],
    }
    d["signals"] = signals(issue, d["spread"], proj, dist.get("environment"))
    if latest.get("dateCreated"):
        d["paired"] = paired(latest["dateCreated"], (issue.get("project") or {}).get("id"))
    if not proj:
        d["exceptions"] = exceptions(latest)
        d["placement"] = {"note": "project is not in the fleet map", "known": False, "in": {}}
        return d
    repo = fleet.repo_dir(proj)
    d["exceptions"] = exceptions(latest, (proj["path"], *proj["local_aliases"]))
    if not os.path.isdir(repo):
        d["placement"] = {"note": f"no local clone at {repo}", "known": False, "in": {}}
        return d
    if fetch:
        _fetch(repo)
    branches = [proj["default_branch"]] + ([proj["prod_branch"]] if proj["prod_branch"] else [])
    rel = t.get("release", "")
    d["placement"] = fleet.release_placement(repo, rel, branches)
    # Where the code says it: the static part of the message/exception text,
    # grepped at the release commit when we have it, else the default branch.
    at = rel if d["placement"]["known"] else fleet._ref(repo, proj["default_branch"])
    texts = [d["message"]] + [e["value"] for e in d["exceptions"]]
    d["source_hits"] = {}
    for x in dict.fromkeys(x for x in texts if x):
        n, hits = fleet.find_source(repo, at, x)
        if n:
            d["source_hits"][n] = hits
    d["source_ref"] = at
    seen = set()
    for exc in d["exceptions"]:
        for f in exc["frames"]:
            if not f["in_app"] or f["path"] in seen:
                continue
            seen.add(f["path"])
            row = {"frame": f["path"], "function": f["function"], "line": f["line"],
                   "candidates": fleet.locate(repo, proj["default_branch"], f["path"])}
            if d["placement"]["known"] and len(row["candidates"]) == 1:
                row["changed_since_release"] = {
                    b: fleet.changed_since(repo, rel, b, row["candidates"]).get(
                        row["candidates"][0], []) for b in branches}
            d["frames"].append(row)
    return d


# ── rendering ────────────────────────────────────────────────────────────────
def _print_dossier(d):
    it = d["issue"]
    print(f"{it['shortId']}  (id={it['id']})  [{it.get('status')}]  project={d['project']}")
    print(f"  title    : {it['title']}")
    print(f"  culprit  : {it.get('culprit')}   level={it.get('level')} "
          f"category={it.get('issueCategory')}")
    print(f"  volume   : {it['count']} events / {it.get('userCount', 0)} users   "
          f"first {it['firstSeen'][:19]}  last {it['lastSeen'][:19]}")
    print(f"  latest   : env={d['tags'].get('environment')} release={d['tags'].get('release')} "
          f"transaction={d['tags'].get('transaction')}")
    print(f"  permalink: {it.get('permalink')}")
    sp = d["spread"]
    print(f"\n  spread over {sp['events']} sampled events: envs={sp['environments']} "
          f"users={sp['distinct_users']}\n    releases={sp['releases']}\n"
          f"    servers={sp['server_names']}  {sp['first']} -> {sp['last']}")
    for key, counts in (d.get("distribution") or {}).items():
        if isinstance(counts, dict):
            print(f"  all events by {key}: {counts}")
    if d["message"]:
        print(f"\n  message: {d['message']}")
    perf = d.get("performance")
    if perf:
        print(f"\n  performance evidence: {perf['offender_spans']} offending spans in "
              f"{perf['transaction']}")
        for name, value in perf["evidence"]:
            print(f"    {name}: {value}")
    for exc in d["exceptions"]:
        print(f"\n  {exc['type']}: {exc['value']}\n    mechanism={exc['mechanism']} "
              f"handled={exc['handled']}   (innermost first, * = in-app)")
        for f in exc["frames"][:25]:
            print(f"      {'*' if f['in_app'] else ' '} {f['function']}  {f['path']}:{f['line']}")
            if f["in_app"]:
                for ln, code in f["context"]:
                    mark = ">" if ln == f["line"] else " "
                    print(f"            {mark}{ln:>5} {code}")
    p = d["placement"] or {}
    print(f"\n  release placement: in={p.get('in')} {p.get('note', '')}")
    for row in d["frames"]:
        c = row["candidates"]
        state = "NOT FOUND" if not c else ("AMBIGUOUS" if len(c) > 1 else c[0])
        print(f"    frame {row['frame']} -> {state}")
        for b, commits in (row.get("changed_since_release") or {}).items():
            for cm in commits[:5]:
                print(f"        changed on {b} since release: {cm['sha'][:9]} {cm['date']} "
                      f"{cm['subject']}")
    for n, hits in (d.get("source_hits") or {}).items():
        print(f"\n  source for {n!r} at {str(d.get('source_ref'))[:12]}:")
        if hits and not any(fleet._is_code(h.split(":", 1)[0]) for h in hits):
            print("    (only tests/docs mention it: likely library text, not our code)")
        for h in hits or ["(no match: the text is not literal in this repo)"]:
            print(f"    {'code' if fleet._is_code(h.split(':', 1)[0]) else 'test'} {h}")
    if d["paired"]:
        print("\n  other fleet events within ±2 min of the latest event:")
        for r in d["paired"][:15]:
            print(f"    {r}")
    if d["breadcrumbs"]:
        print("\n  breadcrumbs (last, redacted):")
        for b in d["breadcrumbs"]:
            print(f"    {str(b.get('timestamp'))[:19]} {b.get('category')}: "
                  f"{b.get('message') or ''} {b.get('data') or ''}")
    print("\n  signals (facts to confirm, not verdicts):")
    for s in d["signals"] or ["(none)"]:
        print(f"    - {s}")


def to_markdown(d):
    """The Evidence section for a GitHub issue. Redacted: it leaves Sentry."""
    it, t = d["issue"], d["tags"]
    lines = [
        f"- Sentry: {it.get('permalink')} (`{it['shortId']}`, project `{d['project']}`)",
        f"- Volume: {it['count']} events / {it.get('userCount', 0)} users, "
        f"first {it['firstSeen'][:10]}, last {it['lastSeen'][:10]}",
        f"- Latest event: env `{t.get('environment')}`, release `{t.get('release')}`, "
        f"transaction `{t.get('transaction') or it.get('culprit')}`",
        f"- Spread: environments {d['spread'].get('environments')}",
        f"- Release placement: {(d.get('placement') or {}).get('in')}",
    ]
    if d.get("message"):
        lines.append(f"- Message: `{d['message']}`")
    perf = d.get("performance")
    if perf:
        lines.append(f"- Performance: {perf['offender_spans']} offending spans in "
                     f"`{perf['transaction']}`")
        lines += [f"  - {name}: `{value}`" for name, value in perf["evidence"]]
    for exc in d["exceptions"]:
        lines.append(f"- `{exc['type']}: {exc['value']}` (mechanism `{exc['mechanism']}`, "
                     f"handled `{exc['handled']}`)")
        top = [f for f in exc["frames"] if f["in_app"]][:5]
        if top:
            lines.append("  In-app frames, innermost first:")
            lines += [f"  - `{f['function']}` `{f['path']}:{f['line']}`" for f in top]
    return fleet.redact("\n".join(lines))


# ── commands ─────────────────────────────────────────────────────────────────
def cmd_projects(a):
    for alias, p in fleet.PROJECTS.items():
        print(f"  {alias:<10} {p['slug']:<27} {p['repo']:<35} {p['path']}/{p['subdir']} "
              f"default={p['default_branch']} prod={p['prod_branch']} merge={p['merge']} "
              f"prod_envs={','.join(p['prod_envs'])}")


def cmd_list(a):
    targets = fleet.PROJECTS.values() if a.project == "all" else [fleet.PROJECTS[a.project]]
    rows = []
    for p in targets:
        for it in api(f"/organizations/{ORG}/issues/", {
                "query": a.query, "project": p["pid"], "statsPeriod": a.period,
                "limit": 100}) or []:
            it["_project"] = p["alias"]
            rows.append(it)
    if a.json:
        print(json.dumps(rows, indent=2))
        return
    if not rows:
        print(f"No issues match {a.query!r} in {a.project} ({a.period}).")
        return
    if a.group:
        groups = collections.defaultdict(list)
        for it in rows:
            groups[(it["_project"], it["title"], it.get("culprit"))].append(it)
        print(f"{len(rows)} issue(s) in {len(groups)} title+culprit group(s):\n")
        for (proj, title, culprit), its in groups.items():
            ids = " ".join(i["shortId"] for i in its)
            ev = sum(int(i["count"]) for i in its)
            print(f"  [{proj}] {title[:90]}\n      culprit: {culprit}  events={ev}\n      {ids}")
        return
    print(f"{len(rows)} issue(s) [{a.query}]:\n")
    for it in rows:
        print(f"  {it['shortId']:<24} {it['level']:<7} ev={it['count']:<5} "
              f"usr={it.get('userCount', 0):<4} last={it['lastSeen'][:10]} [{it['_project']}]")
        print(f"      {it['title'][:100]}\n      culprit: {it.get('culprit')}\n"
              f"      {it.get('permalink')}")


def cmd_show(a):
    gid = resolve_id(a.ref)
    it = api(f"/organizations/{ORG}/issues/{gid}/")
    ev = api(f"/organizations/{ORG}/issues/{gid}/events/latest/")
    if a.json:
        print(json.dumps({"issue": it, "tags": tags(ev), "exceptions": exceptions(ev),
                          "message": message(ev)}, indent=2))
        return
    t = tags(ev)
    print(f"{it['shortId']} [{it.get('status')}] {it['title']}\n  culprit {it.get('culprit')}"
          f"  {it['count']} ev / {it.get('userCount', 0)} users  env={t.get('environment')} "
          f"release={t.get('release')}\n  {it.get('permalink')}")
    for exc in exceptions(ev):
        print(f"  {exc['type']}: {exc['value']}")
        for f in exc["frames"][:8]:
            print(f"    {'*' if f['in_app'] else ' '} {f['function']} {f['path']}:{f['line']}")
    if message(ev):
        print(f"  message: {message(ev)}")
    print("  -> run `evidence` before deciding anything")


def cmd_events(a):
    gid = resolve_id(a.ref)
    rows = api(f"/organizations/{ORG}/issues/{gid}/events/", {"limit": a.limit}) or []
    if a.json:
        print(json.dumps(fleet.redact(rows), indent=2))
        return
    for e in rows[: a.limit]:
        t = tags(e)
        print(f"  {e.get('dateCreated', '')[:19]} env={t.get('environment', '?'):<11} "
              f"rel={str(t.get('release'))[:12]:<12} server={t.get('server_name', '-'):<14} "
              f"user={_user_key(e.get('user')) or '-'}")


def cmd_evidence(a):
    d = dossier(a.ref, fetch=not a.no_fetch)
    if a.json:
        print(json.dumps(fleet.redact(d) if a.redact else d, indent=2, default=str))
    elif a.markdown:
        print(to_markdown(d))
    else:
        _print_dossier(d)


def _mutate(gid, payload, comment):
    if payload:
        api(f"/organizations/{ORG}/issues/{gid}/", method="PUT", body=payload)
    if comment:
        api(f"/organizations/{ORG}/issues/{gid}/comments/", method="POST", body={"text": comment})


def cmd_resolve(a):
    payload = {"status": "resolved"}
    if a.next_release:
        payload["statusDetails"] = {"inNextRelease": True}
    _mutate(resolve_id(a.ref), payload, a.comment)
    print(f"Resolved {a.ref}{' (in next release)' if a.next_release else ''}")


def cmd_archive(a):
    _mutate(resolve_id(a.ref), {"status": "ignored"}, a.comment)
    print(f"Archived {a.ref}")


def cmd_unresolve(a):
    _mutate(resolve_id(a.ref), {"status": "unresolved"}, None)
    print(f"Unresolved {a.ref}")


def cmd_assign(a):
    actor = resolve_actor(a.to)
    _mutate(resolve_id(a.ref), {"assignedTo": actor}, a.comment)
    print(f"Assigned {a.ref} -> {actor}")


def cmd_comment(a):
    _mutate(resolve_id(a.ref), None, a.comment)
    print(f"Commented on {a.ref}")


def main():
    p = argparse.ArgumentParser(prog="sentry.py", description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("projects").set_defaults(fn=cmd_projects)

    pl = sub.add_parser("list")
    pl.set_defaults(fn=cmd_list)
    pl.add_argument("--project", choices=[*fleet.PROJECTS, "all"], default="all")
    pl.add_argument("--query", default="is:unresolved")
    pl.add_argument("--period", default="90d")
    pl.add_argument("--group", action="store_true", help="group by title + culprit")
    pl.add_argument("--json", action="store_true")

    ps = sub.add_parser("show")
    ps.set_defaults(fn=cmd_show)
    ps.add_argument("ref")
    ps.add_argument("--json", action="store_true")

    pe = sub.add_parser("events")
    pe.set_defaults(fn=cmd_events)
    pe.add_argument("ref")
    pe.add_argument("--limit", type=int, default=20)
    pe.add_argument("--json", action="store_true")

    pv = sub.add_parser("evidence")
    pv.set_defaults(fn=cmd_evidence)
    pv.add_argument("ref")
    g = pv.add_mutually_exclusive_group()
    g.add_argument("--json", action="store_true")
    g.add_argument("--markdown", action="store_true", help="redacted, for a GitHub issue")
    pv.add_argument("--redact", action="store_true", help="with --json")
    pv.add_argument("--no-fetch", action="store_true", help="skip `git fetch`")

    pr = sub.add_parser("resolve")
    pr.set_defaults(fn=cmd_resolve)
    pr.add_argument("ref")
    pr.add_argument("--next-release", action="store_true")
    pr.add_argument("-m", "--comment", required=True, help="the PR/issue that fixed it")

    pa = sub.add_parser("archive")
    pa.set_defaults(fn=cmd_archive)
    pa.add_argument("ref")
    pa.add_argument("-m", "--comment", required=True, help="the evidence for archiving")

    pu = sub.add_parser("unresolve")
    pu.set_defaults(fn=cmd_unresolve)
    pu.add_argument("ref")

    pg = sub.add_parser("assign")
    pg.set_defaults(fn=cmd_assign)
    pg.add_argument("ref")
    pg.add_argument("--to", default="me")
    pg.add_argument("-m", "--comment", default=None)

    pc = sub.add_parser("comment")
    pc.set_defaults(fn=cmd_comment)
    pc.add_argument("ref")
    pc.add_argument("-m", "--comment", required=True)

    a = p.parse_args()
    if getattr(a, "comment", None) is not None and not a.comment.strip():
        p.error("-m must not be empty")
    try:
        a.fn(a)
    except SentryError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
