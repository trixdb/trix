#!/usr/bin/env python3
"""trix-pr: the merge gate for the trix Sentry loop.

It turns a PR's checks, reviews and review threads into one verdict, using the
repo's real rules from fleet.REPOS, so "merge when green" means the same thing
every time and never skips an unanswered review.

Usage:
  pr.py status <owner/repo> <n> [--json]    # verdict + reasons + next command
  pr.py wait   <owner/repo> <n> [--timeout 3600] [--interval 60]
  pr.py merge  <owner/repo> <n> [--admin --reason "…"]
                                            # runs the merge ONLY on a MERGE verdict;
                                            # --admin (human-authorised) bypasses only
                                            # the review bot and the approval rule
  pr.py resolve-threads <owner/repo> <n>    # resolve threads we answered last
  pr.py escalate <owner/repo> <n> --reason "…" --question "…" [--option "…"]…
                 [--evidence "…"] [--issue]  # comment for @devghost + label

Verdicts, in the order they are checked:
  DONE            merged
  ESCALATE        closed without merging: a human decides what happens next
  CONFLICT        merge the default branch in, re-run the local gates, push
  ADDRESS_REVIEW  an unanswered thread, a change request or an unacknowledged
                  review summary: fix it or reply with the reason, then re-check
  RESOLVE_THREADS every thread is answered but the branch requires them resolved:
                  `pr.py resolve-threads` (only resolves threads we answered last)
  FIX_CI          a blocking check failed: read its log, reproduce locally, fix
  READY           still a draft and nothing else is open: `gh pr ready`
  WAIT_CI         blocking checks still running (or not reported yet)
  WAIT_REVIEW     the branch needs an approving review that hasn't arrived
  QUEUED          auto-merge / merge queue is already set: wait for DONE
  UPDATE_BRANCH   behind the base on a repo without a merge queue
  MERGE           everything passed: run `command`

Exit codes: 0 DONE/MERGE, 10 waiting, 20 action needed, 30 escalate.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fleet  # noqa: E402

ME = os.environ.get("TRIX_GH_LOGIN", "devghost")
HUMAN = "devghost"
PASS = {"SUCCESS", "NEUTRAL", "SKIPPED"}
EXIT = {"DONE": 0, "MERGE": 0, "WAIT_CI": 10, "WAIT_REVIEW": 10, "QUEUED": 10,
        "CONFLICT": 20, "ADDRESS_REVIEW": 20, "FIX_CI": 20, "READY": 20,
        "UPDATE_BRANCH": 20, "RESOLVE_THREADS": 20, "ESCALATE": 30}
ESCALATION_LABELS = ("needs-decision", "waiting", "on hold")


def _login(a):
    return a.get("login") if isinstance(a, dict) else a


# ── pure decision logic ──────────────────────────────────────────────────────
def _stamp(r):
    return r.get("completedAt") or r.get("startedAt") or ""


def _bucket(r):
    if r.get("__typename") == "StatusContext":
        state = r.get("state")
        if state in ("PENDING", "EXPECTED"):
            return "pending"
        return "pass" if state == "SUCCESS" else "fail"
    if r.get("status") != "COMPLETED":
        return "pending"
    return "pass" if r.get("conclusion") in PASS else "fail"


def check_buckets(rows, cfg):
    """pass / fail / pending per check name, for the checks that block.

    A name can have several runs (reruns, and the review bot's workflow fires a
    SKIPPED run on every review event). Any run still going means pending; else
    the latest run that wasn't skipped decides, so a skipped run fired by an
    unrelated event never hides a real result.
    """
    runs = {}
    for r in rows or []:
        runs.setdefault(r.get("name") or r.get("context"), []).append(r)
    latest = {}
    for name, rs in runs.items():
        if any(_bucket(r) == "pending" for r in rs):
            latest[name] = "pending"
            continue
        real = [r for r in rs if r.get("conclusion") != "SKIPPED"] or rs
        latest[name] = _bucket(max(real, key=_stamp))
    must = set(cfg["required_checks"]) or set(latest)
    must |= set(cfg.get("wait_checks") or [])
    ignored = set(cfg["ignore_checks"])
    out = {"pass": [], "fail": [], "pending": [], "ignored_fail": []}
    for name, bucket in sorted(latest.items()):
        if bucket == "fail" and name in ignored:
            out["ignored_fail"].append(name)
        elif name in must or bucket == "pass":
            out[bucket].append(name)
    out["pending"] += sorted(must - set(latest))
    return out


def open_threads(threads, me):
    """Unresolved threads whose last word isn't ours. Outdated ones count too."""
    return [t for t in threads
            if not t.get("isResolved") and t.get("comments")
            and _login(t["comments"][-1]["author"]) != me]


def changes_requested(reviews):
    last = {}
    for r in sorted(reviews or [], key=lambda r: r.get("submittedAt") or ""):
        if r.get("state") in ("APPROVED", "CHANGES_REQUESTED", "DISMISSED"):
            last[_login(r["author"])] = r["state"]
    return sorted(k for k, v in last.items() if v == "CHANGES_REQUESTED")


def unacked_reviews(reviews, my_comments, me):
    """Review summaries with content that we haven't replied to since."""
    acked = max((c.get("createdAt") or "" for c in my_comments
                 if _login(c.get("author")) == me), default="")
    return [r for r in reviews or []
            if _login(r.get("author")) != me and r.get("state") in ("COMMENTED",
                                                                     "CHANGES_REQUESTED")
            and (r.get("body") or "").strip() and (r.get("submittedAt") or "") > acked]


def merge_argv(cfg, n, admin=False):
    if admin:  # bypasses the queue too, so name the queue's method (merge commit)
        method = "merge" if cfg["merge"] == "queue" else cfg["merge"]
        return ["gh", "pr", "merge", str(n), "-R", cfg["name"], f"--{method}", "--admin"]
    flag = "--auto" if cfg["merge"] == "queue" else f"--{cfg['merge']}"
    return ["gh", "pr", "merge", str(n), "-R", cfg["name"], flag]


def rules_for_base(cfg, base):
    """The rules that apply to a PR into `base`.

    REPOS describes the default branch. Release PRs (main -> production) target
    an unprotected branch with no merge queue: every check blocks, and they land
    with a merge commit, like every production promotion so far.
    """
    if not base or base == cfg["default_branch"]:
        return cfg
    return dict(cfg, merge="merge", required_checks=[], approvals=0,
                resolve_conversations=False)


def decide(p, threads, cfg, me=ME, admin=False):
    """admin=True: a human authorised bypassing the review bot and the approval
    rule (e.g. the bot's API key is capped). Every other blocker still blocks."""
    cfg = rules_for_base(cfg, p.get("baseRefName"))
    if admin:
        cfg = dict(cfg, wait_checks=[],
                   ignore_checks=list(cfg["ignore_checks"]) + list(cfg.get("wait_checks") or []))
    n, repo = p["number"], cfg["name"]

    def out(verdict, reasons, command=None):
        return {"verdict": verdict, "reasons": reasons, "command": command,
                "exit": EXIT[verdict]}

    if p["state"] == "MERGED":
        return out("DONE", ["merged"])
    if p["state"] == "CLOSED":
        return out("ESCALATE", ["closed without merging"])
    if p.get("mergeable") == "CONFLICTING" or p.get("mergeStateStatus") == "DIRTY":
        return out("CONFLICT", [f"conflicts with {cfg['default_branch']}"])

    mine = list(p.get("comments") or []) + [
        c for t in threads for c in t.get("comments", []) if _login(c["author"]) == me]
    review = []
    for t in open_threads(threads, me):
        c = t["comments"][-1]
        review.append(f"thread {t.get('path')}:{t.get('line')}"
                      f"{' (outdated)' if t.get('isOutdated') else ''} "
                      f"by {_login(c['author'])}: {c['body'][:140]!r}")
    review += [f"changes requested by {who}" for who in changes_requested(p.get("reviews"))]
    review += [f"review {r.get('id')} by {_login(r['author'])} not acknowledged: "
               f"{r['body'].strip()[:140]!r}"
               for r in unacked_reviews(p.get("reviews"), mine, me)]
    if review:
        return out("ADDRESS_REVIEW", review)
    if cfg["resolve_conversations"]:
        answered = [t for t in threads if not t.get("isResolved")]
        if answered:
            return out("RESOLVE_THREADS",
                       [f"answered, unresolved: {t.get('path')}:{t.get('line')}" for t in answered],
                       f"pr.py resolve-threads {repo} {n}")

    b = check_buckets(p.get("statusCheckRollup"), cfg)
    note = [f"ignored known-broken check failing: {c}" for c in b["ignored_fail"]]
    if b["fail"]:
        return out("FIX_CI", [f"failing: {c}" for c in b["fail"]] + note,
                   f"gh pr checks {n} -R {repo}")
    if p.get("isDraft"):
        return out("READY", ["draft; nothing else is open"] + note,
                   f"gh pr ready {n} -R {repo}")
    if b["pending"]:
        return out("WAIT_CI", [f"pending: {c}" for c in b["pending"]] + note)
    if p.get("reviewDecision") == "REVIEW_REQUIRED" and not admin:
        return out("WAIT_REVIEW", [f"needs {cfg['approvals'] or 1} approving review(s)"])
    if p.get("mergeQueueEntry"):
        q = p["mergeQueueEntry"]
        return out("QUEUED", [f"in the merge queue: {q.get('state')} at position "
                              f"{q.get('position')}"] + note)
    if p.get("autoMergeRequest"):
        return out("QUEUED", ["auto-merge enabled; merges when requirements pass"] + note)
    if p.get("mergeStateStatus") == "BEHIND" and cfg["merge"] != "queue":
        return out("UPDATE_BRANCH", [f"behind {cfg['default_branch']}"],
                   f"gh pr update-branch {n} -R {repo}")
    argv = merge_argv(cfg, n, admin)
    if admin:
        note.append("admin override: review bot and approval rule bypassed")
    d = out("MERGE", ["all blocking checks pass, no open review"] + note, " ".join(argv))
    d["argv"] = argv
    return d


def pick_label(existing):
    for name in ESCALATION_LABELS:
        if name in existing:
            return name
    return None


def escalation_body(reason, question, options, evidence):
    lines = [f"@{HUMAN}: a decision is needed before this can go further.", "",
             f"**Why I stopped:** {reason}", ""]
    if evidence:
        lines += [f"**What I verified:** {evidence}", ""]
    lines += [f"**Question:** {question}"]
    if options:
        lines += [""] + [f"{i}. {o}" for i, o in enumerate(options, 1)]
    lines += ["", "I won't merge or change direction until this is answered here."]
    return fleet.redact("\n".join(lines))


# ── GitHub I/O ───────────────────────────────────────────────────────────────
def _run(args, check=True):
    r = subprocess.run(args, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"{' '.join(args[:4])} failed: {r.stderr.strip()[:400]}")
    return r.stdout


FIELDS = ("number,state,isDraft,mergeable,mergeStateStatus,reviewDecision,"
          "statusCheckRollup,autoMergeRequest,reviews,comments,author,url,headRefName,"
          "baseRefName")
THREADS_Q = """query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){
pullRequest(number:$n){mergeQueueEntry{state position} reviewThreads(first:100){nodes{id isResolved isOutdated path line
comments(first:100){nodes{author{login} body createdAt url}}}}}}}"""


def fetch(repo, n):
    p = json.loads(_run(["gh", "pr", "view", str(n), "-R", repo, "--json", FIELDS]))
    owner, name = repo.split("/")
    g = json.loads(_run(["gh", "api", "graphql", "-f", f"query={THREADS_Q}",
                         "-F", f"o={owner}", "-F", f"r={name}", "-F", f"n={n}"]))
    node = g["data"]["repository"]["pullRequest"]
    p["mergeQueueEntry"] = node.get("mergeQueueEntry")
    nodes = node["reviewThreads"]["nodes"]
    threads = [dict(t, comments=t["comments"]["nodes"]) for t in nodes]
    return p, threads


def cfg_for(repo):
    if repo not in fleet.REPOS:
        raise SystemExit(f"{repo} is not in fleet.REPOS: add it with verified rules first")
    return fleet.REPOS[repo]


def status(repo, n, admin=False):
    p, threads = fetch(repo, n)
    return decide(p, threads, cfg_for(repo), ME, admin)


def _print(d, repo, n):
    print(f"{repo}#{n}: {d['verdict']}")
    for r in d["reasons"]:
        print(f"  - {r}")
    if d["command"]:
        print(f"  next: {d['command']}")


def merge(repo, n, admin_reason=None):
    admin = admin_reason is not None
    if admin and not admin_reason.strip():
        raise SystemExit("--admin needs --reason: who authorised the bypass and why")
    d = status(repo, n, admin)
    if d["verdict"] != "MERGE":
        _print(d, repo, n)
        print("  refusing to merge: the verdict is not MERGE", file=sys.stderr)
        return d["exit"] or 2
    if admin:
        _run(["gh", "pr", "comment", str(n), "-R", repo, "--body", fleet.redact(
            f"Admin merge: bypassing the review bot and the approval rule. {admin_reason}\n\n"
            "Every required check passed and no review thread is open (pr.py gate).")])
    _run(d["argv"])
    print(f"{repo}#{n}: ran `{d['command']}`. Re-check with `pr.py wait` until DONE.")
    return 0


def wait(repo, n, timeout, interval):
    end = time.time() + timeout
    while True:
        d = status(repo, n)
        if d["exit"] != 10 or time.time() >= end:
            return d
        time.sleep(interval)


RESOLVE_M = "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}"


def resolve_threads(repo, n):
    """Resolve threads whose last comment is ours. Never one still awaiting us."""
    _, threads = fetch(repo, n)
    done, skipped = 0, 0
    for t in threads:
        if t.get("isResolved"):
            continue
        if t in open_threads([t], ME):
            skipped += 1
            print(f"  skip {t.get('path')}:{t.get('line')}: not answered yet")
            continue
        _run(["gh", "api", "graphql", "-f", f"query={RESOLVE_M}", "-F", f"id={t['id']}"])
        done += 1
    print(f"{repo}#{n}: resolved {done} answered thread(s), {skipped} still need an answer")
    return 0 if not skipped else 20


def escalate(repo, n, reason, question, options, evidence, issue=False):
    kind = "issue" if issue else "pr"
    body = escalation_body(reason, question, options, evidence)
    url = _run(["gh", kind, "comment", str(n), "-R", repo, "--body", body]).strip()
    labels = json.loads(_run(["gh", "label", "list", "-R", repo, "-L", "300",
                              "--json", "name"]))
    label = pick_label([x["name"] for x in labels])
    if label:
        _run(["gh", kind, "edit", str(n), "-R", repo, "--add-label", label])
    print(f"Escalated {repo}#{n}: {url}" + (f" (label {label!r})" if label else ""))
    if ME == HUMAN:
        print("  note: gh posts as @devghost, so the mention does not notify anyone. "
              "Report this escalation in your reply to the user as well.")


def main():
    ap = argparse.ArgumentParser(prog="pr.py", description="merge gate for the trix loop")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("status", "wait", "merge", "resolve-threads", "escalate"):
        s = sub.add_parser(c)
        s.add_argument("repo")
        s.add_argument("n", type=int)
        if c == "status":
            s.add_argument("--json", action="store_true")
        if c == "wait":
            s.add_argument("--timeout", type=int, default=3600)
            s.add_argument("--interval", type=int, default=60)
        if c == "merge":
            s.add_argument("--admin", action="store_true",
                           help="bypass the review bot + approval only; needs --reason")
            s.add_argument("--reason", default=None)
        if c == "escalate":
            s.add_argument("--reason", required=True)
            s.add_argument("--question", required=True)
            s.add_argument("--option", action="append", default=[])
            s.add_argument("--evidence", default="")
            s.add_argument("--issue", action="store_true", help="n is an issue, not a PR")
    a = ap.parse_args()
    if a.cmd == "status":
        d = status(a.repo, a.n)
        print(json.dumps(d, indent=2)) if a.json else _print(d, a.repo, a.n)
        sys.exit(d["exit"])
    if a.cmd == "wait":
        d = wait(a.repo, a.n, a.timeout, a.interval)
        _print(d, a.repo, a.n)
        sys.exit(d["exit"])
    if a.cmd == "merge":
        if a.admin and a.reason is None:
            ap.error("--admin needs --reason")
        sys.exit(merge(a.repo, a.n, a.reason if a.admin else None))
    if a.cmd == "resolve-threads":
        sys.exit(resolve_threads(a.repo, a.n))
    escalate(a.repo, a.n, a.reason, a.question, a.option, a.evidence, a.issue)


if __name__ == "__main__":
    main()
