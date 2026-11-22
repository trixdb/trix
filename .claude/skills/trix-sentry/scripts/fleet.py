"""Shared facts and helpers for the trix Sentry loop.

Everything here is either configuration that was verified against GitHub and
the repos (see references/repo-map.md for the evidence), or a deterministic
helper whose answer comes from git or a regex, never from inference.

The trix fleet is the trixdb/trix monorepo and its submodules. Four of them
report to Sentry (org `zivrio`): trix-api, trix-workers-node, trix-bots and
trix-landing. The engines (sentry.py, pr.py) are fleet-agnostic; only the
tables below name trix's projects and repos.
"""
import os
import re
import subprocess

ORG = "zivrio"
TRIX_ROOT = os.environ.get("TRIX_ROOT", "/data/code/trix")

# How a PR lands on the default branch (REPOS[...]["merge"]).
#   queue  - GitHub merge queue ruleset; `gh pr merge <n> --auto` enqueues it.
#   merge  - merge commit;  squash / rebase - the matching gh flag.
MERGE_MODES = ("queue", "merge", "squash", "rebase")

# GitHub repos (all under `trixdb`, all submodules of trixdb/trix). How a fix
# lands. Evidence for every value: references/repo-map.md; re-checked live by
# `python3 fleet.py verify`.
#   required_checks - checks that must pass. [] = the branch is unprotected, so
#                     EVERY reported check must pass except `ignore_checks`.
#   ignore_checks   - checks known broken repo-wide; a failure there is reported
#                     but does not block. Remove an entry once it is fixed.
#   wait_checks     - checks that must have FINISHED (and passed) even though the
#                     branch doesn't require them (e.g. a late-arriving review bot).
#   approvals       - approving reviews the branch requires.
#   resolve_conversations - every review thread must be resolved, not just answered.
#
# All four fix repos are unprotected today (no merge queue, no required checks,
# 0 approvals, no review bot): `required_checks=[]` means the gate requires every
# reported check to pass. Keep this in sync with `fleet.py verify`.
REPOS = {
    "trixdb/trix-api": dict(
        path="trix-api", default_branch="main", prod_branch=None,
        merge="squash", draft_first=False, approvals=0, review_bot=None,
        required_checks=[], ignore_checks=[], wait_checks=[],
        link="Closes", title="fix(<scope>): subject",
    ),
    "trixdb/trix-workers-node": dict(
        path="trix-workers-node", default_branch="main", prod_branch=None,
        merge="squash", draft_first=False, approvals=0, review_bot=None,
        required_checks=[], ignore_checks=[], wait_checks=[],
        link="Closes", title="fix(worker): subject",
    ),
    "trixdb/trix-bots": dict(
        path="trix-bots", default_branch="main", prod_branch=None,
        merge="squash", draft_first=False, approvals=0, review_bot=None,
        required_checks=[], ignore_checks=[], wait_checks=[],
        link="Closes", title="fix: subject",
    ),
    "trixdb/trix-landing": dict(
        path="trix-landing", default_branch="main", prod_branch=None,
        merge="squash", draft_first=False, approvals=0, review_bot=None,
        required_checks=[], ignore_checks=[], wait_checks=[],
        link="Closes", title="fix: subject",
    ),
    # The monorepo root: no Sentry project, but PRs to the skill/tooling land
    # here, so the merge gate needs its rules too.
    "trixdb/trix": dict(
        path=".", default_branch="main", prod_branch=None,
        merge="squash", draft_first=False, approvals=0, review_bot=None,
        required_checks=[], ignore_checks=[], wait_checks=[],
        link="Closes", title="chore: subject",
    ),
}
for _name, _r in REPOS.items():
    _r["name"] = _name
    # Branch protection "require conversation resolution": an answered but
    # unresolved thread still blocks the merge (and the queue) silently.
    _r.setdefault("resolve_conversations", False)
    _r.setdefault("wait_checks", [])

# Sentry projects of the trix fleet. `pid` is Sentry's numeric project id
# (GET /organizations/zivrio/projects/). `path` is relative to TRIX_ROOT.
# `prod_envs` are the Sentry environment names that mean production for that
# project. Branches and the merge mode come from REPOS.
#
# All four init Sentry the same way (src/lib/sentry): environment defaults to
# RAILWAY_ENVIRONMENT_NAME (observed value: `production`), release defaults to
# RAILWAY_GIT_COMMIT_SHA (a git SHA, so release_placement works). None has a
# separate production branch — Railway deploys from `main` (trix-api and
# trix-workers-node deploys are MANUAL, deploy.yml workflow_dispatch).
PROJECTS = {
    "api": dict(slug="trix-api", pid="4512452855660544", repo="trixdb/trix-api",
                path="trix-api", prod_envs=("production",)),
    "workers-node": dict(slug="trix-workers-node", pid="4512452855660545",
                         repo="trixdb/trix-workers-node", path="trix-workers-node",
                         prod_envs=("production",)),
    "bots": dict(slug="trix-bots", pid="4512452855726080", repo="trixdb/trix-bots",
                 path="trix-bots", prod_envs=("production",)),
    "landing": dict(slug="trix-landing", pid="4512452855857152",
                    repo="trixdb/trix-landing", path="trix-landing",
                    prod_envs=("production",)),
}
for _alias, _p in PROJECTS.items():
    _p["alias"] = _alias
    _p["prefix"] = _p["slug"].upper()
    _p.setdefault("subdir", "")
    _p.setdefault("local_aliases", ())
    _p.setdefault("prod_envs", ("production",))
    for _k in ("merge", "default_branch", "prod_branch"):
        _p[_k] = REPOS[_p["repo"]][_k]

PROJECT_BY_SLUG = {p["slug"]: p for p in PROJECTS.values()}
PROJECT_BY_PID = {p["pid"]: p for p in PROJECTS.values()}


def project_for_shortid(short_id):
    """HEYWEEK-SERVER-7 -> the `server` project. None when it isn't ours."""
    sid = (short_id or "").strip().upper()
    if "-" not in sid:
        return None
    prefix = sid.rsplit("-", 1)[0]
    for p in PROJECTS.values():
        if p["prefix"] == prefix:
            return p
    return None


def projects_for_repo(repo):
    return [p for p in PROJECTS.values() if p["repo"] == repo]


def repo_dir(project):
    return os.path.join(TRIX_ROOT, project["path"])


# ── redaction ────────────────────────────────────────────────────────────────
# Applied to anything that leaves Sentry for GitHub (issue bodies, comments).
# Object ids and UUIDs are kept: they trace an event and identify no person.
_REDACTIONS = [
    (re.compile(r"(\b[a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@", re.I), r"\1<creds>@"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), "<jwt>"),
    (re.compile(r"\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+", re.I), r"\1 <redacted>"),
    (re.compile(r"\b(hwk_(?:live|test)_|sntry[su]_)[A-Za-z0-9_=-]+"), r"\1<redacted>"),
    (
        re.compile(
            r"([?&](?:code|token|access_token|refresh_token|id_token|key|api_key|"
            r"apikey|secret|password|sig|signature|auth)=)[^&\s#]+",
            re.I,
        ),
        r"\1<redacted>",
    ),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "<email>"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "<ip>"),
]


def redact(value):
    if isinstance(value, str):
        for rx, sub in _REDACTIONS:
            value = rx.sub(sub, value)
        return value
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    return value


# ── stack-frame paths → repo paths ───────────────────────────────────────────
def normalise_frame_path(path, repo_dirnames=()):
    p = (path or "").strip()
    p = re.sub(r"^[a-z]+:///?", "", p, flags=re.I)
    if p.startswith("/"):
        m = re.search(r"/\.claude/worktrees/[^/]+/(.*)$", p)
        if m:
            return m.group(1)
        for name in sorted(repo_dirnames, key=len, reverse=True):
            marker = f"/{name}/"
            if marker in p:
                return p.split(marker, 1)[1]
    while p.startswith(("./", "../", "~/")):
        p = p.split("/", 1)[1]
    return p


# ── git ──────────────────────────────────────────────────────────────────────
def _git(repo, *args):
    return subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True
    )


def _ref(repo, branch):
    """Prefer the remote-tracking ref: the local branch may be stale or parked."""
    if _git(repo, "rev-parse", "--verify", "-q", f"origin/{branch}").returncode == 0:
        return f"origin/{branch}"
    return branch


_SHA = re.compile(r"^[0-9a-f]{7,40}$")


def release_placement(repo, release, branches):
    """Is the event's release commit on each branch? True/False, None = unknown."""
    rel = (release or "").strip()
    out = {"release": rel, "known": False, "in": {b: None for b in branches}, "note": ""}
    if not _SHA.match(rel):
        out["note"] = (
            "release is not a commit SHA (version string?): place it by tag or "
            "package version, not by git ancestry"
        )
        return out
    if _git(repo, "cat-file", "-e", f"{rel}^{{commit}}").returncode != 0:
        out["note"] = "commit not in the local clone: run `git fetch origin` and retry"
        return out
    out["known"] = True
    for b in branches:
        r = _git(repo, "merge-base", "--is-ancestor", rel, _ref(repo, b))
        out["in"][b] = {0: True, 1: False}.get(r.returncode)
    return out


def changed_since(repo, sha, branch, files):
    """Commits on `branch` after `sha` that touch each file (only files with any)."""
    res = {}
    for f in files:
        r = _git(repo, "log", "--format=%H%x09%cs%x09%s", f"{sha}..{_ref(repo, branch)}", "--", f)
        rows = [ln.split("\t", 2) for ln in r.stdout.splitlines() if ln.strip()]
        if rows:
            res[f] = [{"sha": s, "date": d, "subject": m} for s, d, m in rows]
    return res


_ALT_EXT = (".ts", ".js", ".mjs", ".cjs", ".svelte", ".tsx", ".jsx")


def _variants(path):
    out = [path]
    for lead in ("dist/", "build/", "out/"):
        if path.startswith(lead):
            out.append(path[len(lead):])
    more = []
    for v in out:
        stem, ext = os.path.splitext(v)
        if ext in _ALT_EXT:
            more += [stem + e for e in _ALT_EXT if e != ext]
    return out + more


def _suffix_len(a, b):
    """Number of trailing path components a and b share."""
    pa, pb = a.split("/"), b.split("/")
    n = 0
    while n < min(len(pa), len(pb)) and pa[-1 - n] == pb[-1 - n]:
        n += 1
    return n


_TREES = {}


def locate(repo, branch, path):
    """Repo paths at `branch` that the frame path can refer to. [] = not found.

    The candidates sharing the longest path suffix win. More than one result
    means it is ambiguous: the caller must say so, not pick one.
    """
    ref = _ref(repo, branch)
    head = _git(repo, "rev-parse", ref).stdout.strip()
    if head not in _TREES:
        _TREES[head] = _git(repo, "ls-tree", "-r", "--name-only", head).stdout.splitlines()
    best, hits = 0, []
    for v in _variants(path):
        for t in _TREES[head]:
            n = _suffix_len(v, t)
            if n > best:
                best, hits = n, [t]
            elif n == best and n and t not in hits:
                hits.append(t)
    return hits


_WORDS = re.compile(r"[A-Za-z][A-Za-z' ]*[A-Za-z]")


def needle(text):
    """The longest run of plain words in a message: what the source literally says.

    "overdueInvoices endpoint unavailable (404)" -> "overdueInvoices endpoint unavailable"
    Interpolated values (numbers, ids, quoted strings) break the run, so the
    result is the static part of the template. None when nothing usable is left.
    """
    runs = [m.group(0).strip() for m in _WORDS.finditer(text or "")]
    runs = [r for r in runs if " " in r]
    return max(runs, key=len) if runs else None


def needles(text):
    """needle() plus the same run without its first/last word, most specific first.

    Template literals interpolate at the edges ("${job} endpoint unavailable"),
    so the trimmed runs are what the source spells literally.
    """
    n = needle(text)
    if not n:
        return []
    w = n.split(" ")
    out = [n, " ".join(w[1:]), " ".join(w[:-1]), " ".join(w[1:-1])]
    return [c for c in dict.fromkeys(out) if " " in c]


def _is_code(path):
    p = path.lower()
    return not (p.endswith((".md", ".txt")) or "test" in p or "spec" in p or p.startswith("docs/"))


def find_source(repo, ref, text, limit=10):
    """First needle that matches at `ref`, code before tests/docs. (needle, hits)."""
    for n in needles(text):
        hits = grep(repo, ref, n, limit=50)
        if hits:
            hits.sort(key=lambda h: not _is_code(h.split(":", 1)[0]))
            return n, hits[:limit]
    return needle(text), []


def grep(repo, ref, text, limit=10):
    """`git grep` for the literal text at `ref` (a SHA or a branch)."""
    if not text:
        return []
    r = _git(repo, "grep", "-n", "-F", "-I", "--max-count=3", text, ref, "--")
    rows = [ln.split(":", 1)[1] if ln.startswith(ref + ":") else ln
            for ln in r.stdout.splitlines()]
    return [ln[:200] for ln in rows[:limit]]


# ── drift check: the table above vs GitHub, live ─────────────────────────────
def compare(cfg, live):
    """Differences between a REPOS entry and what GitHub reports. [] = in sync."""
    out = []
    if live["default_branch"] != cfg["default_branch"]:
        out.append(f"default branch is {live['default_branch']}, table says {cfg['default_branch']}")
    mode = cfg["merge"]
    if mode == "queue":
        if not live["merge_queue"]:
            out.append("table says merge queue, but no merge_queue ruleset is active")
    else:
        if live["merge_queue"]:
            out.append(f"a merge queue is active, table says {mode}")
        if not live["allowed"].get(mode):
            out.append(f"merge method {mode} is disabled on GitHub")
    if sorted(live["required_checks"]) != sorted(cfg["required_checks"]):
        out.append(f"required checks are {sorted(live['required_checks'])}, "
                   f"table says {sorted(cfg['required_checks'])}")
    if live["approvals"] != cfg["approvals"]:
        out.append(f"required approvals are {live['approvals']}, table says {cfg['approvals']}")
    if live["conversation_resolution"] != cfg["resolve_conversations"]:
        out.append(f"conversation resolution required={live['conversation_resolution']}, "
                   f"table says {cfg['resolve_conversations']}")
    return out


def _gh_json(*args):
    import json
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None


def live_rules(repo):
    info = _gh_json(f"repos/{repo}") or {}
    branch = info.get("default_branch")
    prot = _gh_json(f"repos/{repo}/branches/{branch}/protection") or {}
    mq = False
    for rs in _gh_json(f"repos/{repo}/rulesets") or []:
        full = _gh_json(f"repos/{repo}/rulesets/{rs['id']}") or {}
        if full.get("enforcement") == "active" and any(
                r.get("type") == "merge_queue" for r in full.get("rules", [])):
            mq = True
    checks = (prot.get("required_status_checks") or {}).get("contexts") or []
    reviews = prot.get("required_pull_request_reviews") or {}
    return {
        "default_branch": branch,
        "allowed": {"merge": info.get("allow_merge_commit"),
                    "squash": info.get("allow_squash_merge"),
                    "rebase": info.get("allow_rebase_merge")},
        "merge_queue": mq, "required_checks": checks,
        "approvals": reviews.get("required_approving_review_count", 0),
        "conversation_resolution": bool(
            (prot.get("required_conversation_resolution") or {}).get("enabled")),
    }


if __name__ == "__main__":
    import sys
    if sys.argv[1:] != ["verify"]:
        sys.exit("usage: fleet.py verify   # compare REPOS with GitHub's live settings")
    drift = 0
    for name, cfg in REPOS.items():
        diffs = compare(cfg, live_rules(name))
        drift += len(diffs)
        print(f"{name}: {'in sync' if not diffs else 'DRIFT'}")
        for d in diffs:
            print(f"  - {d}")
    sys.exit(1 if drift else 0)
