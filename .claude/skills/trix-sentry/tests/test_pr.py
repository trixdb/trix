"""Tests for pr.py: the merge gate must never say MERGE when anything is open.

pr.py is the fleet-agnostic engine shared with the other Sentry skills. The
trix repos are unprotected squash repos today (no queue, no required checks, no
review bot), so `API` exercises the real trix shape. `QUEUE` and `IGN` are
synthetic cfgs that keep the engine's merge-queue, review-bot and
ignored-check paths under test, so the engine stays safe if a trix repo later
turns protection on.
"""
import contextlib
import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fleet  # noqa: E402
import pr  # noqa: E402

ME = "devghost"

# The real trix shape: unprotected, squash, no required checks, no review bot.
API = fleet.REPOS["trixdb/trix-api"]

# A synthetic protected repo with a merge queue + review bot, so the engine's
# queue / wait-check / approval / conversation-resolution branches stay covered.
QUEUE = dict(
    name="acme/queue-repo", path="x", default_branch="main", prod_branch="production",
    merge="queue", draft_first=True, approvals=1, review_bot="claude[bot]",
    resolve_conversations=True,
    required_checks=["backend (22.x, lint)", "backend (22.x, pretty)",
                     "backend (22.x, test)", "frontend (22.x, lint)",
                     "frontend (22.x, pretty)", "frontend (22.x, test)"],
    ignore_checks=[], wait_checks=["claude-review"],
    link="Closes", title="x",
)
# A synthetic unprotected repo that marks one check known-broken (ignore_checks).
IGN = dict(API, name="acme/ign-repo", ignore_checks=["claude-review"])


def run(name, conclusion="SUCCESS", status="COMPLETED", at="2026-11-21T01:00:00Z"):
    return {"__typename": "CheckRun", "name": name, "status": status,
            "conclusion": conclusion if status == "COMPLETED" else None,
            "completedAt": at if status == "COMPLETED" else None, "startedAt": at}


def green_queue_checks():
    return [run(n) for n in QUEUE["required_checks"]] + [run("claude-review")]


def prv(**kw):
    base = {
        "number": 1, "state": "OPEN", "isDraft": False, "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN", "reviewDecision": "APPROVED",
        "statusCheckRollup": green_queue_checks(), "autoMergeRequest": None,
        "reviews": [{"author": {"login": "claude[bot]"}, "state": "APPROVED", "body": "",
                     "submittedAt": "2026-11-21T01:05:00Z", "id": "r1"}],
        "comments": [], "author": {"login": ME}, "url": "u",
    }
    base.update(kw)
    return base


def thread(*comments, resolved=False, outdated=False, path="a.js"):
    return {"isResolved": resolved, "isOutdated": outdated, "path": path, "line": 3,
            "comments": [{"author": a, "body": b, "createdAt": t, "url": "x"}
                         for a, b, t in comments]}


class Checks(unittest.TestCase):
    def test_rerun_supersedes_failure(self):
        rows = [run("lint", "FAILURE", at="2026-11-21T01:00:00Z"),
                run("lint", "SUCCESS", at="2026-11-21T02:00:00Z")]
        self.assertEqual(pr.check_buckets(rows, API)["fail"], [])

    def test_status_context_shape(self):
        rows = [{"__typename": "StatusContext", "context": "ci/x", "state": "FAILURE"}]
        self.assertEqual(pr.check_buckets(rows, API)["fail"], ["ci/x"])

    def test_missing_required_check_counts_as_pending(self):
        rows = [run(n) for n in QUEUE["required_checks"][:-1]] + [run("claude-review")]
        b = pr.check_buckets(rows, QUEUE)
        self.assertEqual(b["pending"], [QUEUE["required_checks"][-1]])

    def test_unprotected_repo_treats_every_check_as_required(self):
        # trix repos set required_checks=[] -> every reported check blocks.
        b = pr.check_buckets([run("Unit Tests"), run("Lint & Format", "FAILURE")], API)
        self.assertEqual(b["fail"], ["Lint & Format"])

    def test_ignored_check_is_reported_not_blocking(self):
        b = pr.check_buckets([run("Unit Tests"), run("claude-review", "FAILURE")], IGN)
        self.assertEqual(b["fail"], [])
        self.assertEqual(b["ignored_fail"], ["claude-review"])

    def test_review_bot_run_in_progress_blocks_even_if_not_required(self):
        # A wait_check (review bot) still running must hold the gate: its inline
        # comments can land after the required checks go green.
        rows = green_queue_checks()[:-1] + [
            run("claude-review", "SKIPPED", at="2026-11-21T08:47:52Z"),
            run("claude-review", status="IN_PROGRESS", at="2026-11-21T08:47:54Z"),
        ]
        self.assertEqual(pr.check_buckets(rows, QUEUE)["pending"], ["claude-review"])
        self.assertEqual(pr.decide(prv(statusCheckRollup=rows), [], QUEUE, ME)["verdict"],
                         "WAIT_CI")

    def test_in_progress_beats_a_later_skipped_run(self):
        rows = [run("claude-review", status="IN_PROGRESS", at="2026-11-21T08:47:54Z"),
                run("claude-review", "SKIPPED", at="2026-11-21T08:53:24Z")]
        self.assertEqual(pr.check_buckets(rows, QUEUE)["pending"],
                         ["claude-review"] + QUEUE["required_checks"])

    def test_skipped_rerun_does_not_hide_a_real_result(self):
        rows = [run("claude-review", "FAILURE", at="2026-11-21T08:50:00Z"),
                run("claude-review", "SKIPPED", at="2026-11-21T08:53:24Z")]
        self.assertIn("claude-review", pr.check_buckets(rows, QUEUE)["fail"])

    def test_review_bot_must_have_run(self):
        rows = [run(n) for n in QUEUE["required_checks"]]
        self.assertEqual(pr.check_buckets(rows, QUEUE)["pending"], ["claude-review"])

    def test_skipped_and_neutral_pass(self):
        b = pr.check_buckets([run("a", "SKIPPED"), run("b", "NEUTRAL")], API)
        self.assertEqual(b["fail"] + b["pending"], [])


class Threads(unittest.TestCase):
    def test_unresolved_reviewer_thread_is_open(self):
        t = thread(("claude[bot]", "bug here", "2026-11-21T01:00:00Z"))
        self.assertEqual(len(pr.open_threads([t], ME)), 1)

    def test_our_reply_answers_it(self):
        t = thread(("claude[bot]", "bug here", "2026-11-21T01:00:00Z"),
                   (ME, "Fixed in abc123", "2026-11-21T01:10:00Z"))
        self.assertEqual(pr.open_threads([t], ME), [])

    def test_reviewer_follow_up_reopens_it(self):
        t = thread(("claude[bot]", "bug", "2026-11-21T01:00:00Z"),
                   (ME, "won't fix", "2026-11-21T01:10:00Z"),
                   ("claude[bot]", "it is still a bug", "2026-11-21T01:20:00Z"))
        self.assertEqual(len(pr.open_threads([t], ME)), 1)

    def test_resolved_is_closed(self):
        t = thread(("claude[bot]", "bug", "2026-11-21T01:00:00Z"), resolved=True)
        self.assertEqual(pr.open_threads([t], ME), [])

    def test_outdated_but_unresolved_still_needs_an_answer(self):
        t = thread(("claude[bot]", "bug", "2026-11-21T01:00:00Z"), outdated=True)
        self.assertEqual(len(pr.open_threads([t], ME)), 1)


class Reviews(unittest.TestCase):
    def test_latest_review_per_reviewer_wins(self):
        reviews = [
            {"author": {"login": "k"}, "state": "CHANGES_REQUESTED", "body": "no",
             "submittedAt": "2026-11-21T01:00:00Z", "id": "a"},
            {"author": {"login": "k"}, "state": "APPROVED", "body": "",
             "submittedAt": "2026-11-21T02:00:00Z", "id": "b"},
        ]
        self.assertEqual(pr.changes_requested(reviews), [])
        self.assertEqual(pr.changes_requested(reviews[:1]), ["k"])

    def test_review_summary_needs_acknowledgement(self):
        reviews = [{"author": {"login": "claude[bot]"}, "state": "COMMENTED",
                    "body": "Consider handling the null case", "id": "r9",
                    "submittedAt": "2026-11-21T02:00:00Z"}]
        self.assertEqual(len(pr.unacked_reviews(reviews, [], ME)), 1)
        ack = [{"author": {"login": ME}, "createdAt": "2026-11-21T02:30:00Z", "body": "x"}]
        self.assertEqual(pr.unacked_reviews(reviews, ack, ME), [])

    def test_approvals_and_empty_bodies_need_no_ack(self):
        reviews = [{"author": {"login": "claude[bot]"}, "state": "APPROVED", "body": "LGTM",
                    "id": "r1", "submittedAt": "2026-11-21T02:00:00Z"},
                   {"author": {"login": "claude[bot]"}, "state": "COMMENTED", "body": " ",
                    "id": "r2", "submittedAt": "2026-11-21T02:00:00Z"}]
        self.assertEqual(pr.unacked_reviews(reviews, [], ME), [])

    def test_own_reviews_are_ignored(self):
        reviews = [{"author": {"login": ME}, "state": "COMMENTED", "body": "note",
                    "id": "r1", "submittedAt": "2026-11-21T02:00:00Z"}]
        self.assertEqual(pr.unacked_reviews(reviews, [], ME), [])


class Decide(unittest.TestCase):
    def v(self, p, threads=(), cfg=QUEUE):
        return pr.decide(p, list(threads), cfg, ME)

    def test_all_green_queue_goes_through_the_queue(self):
        d = self.v(prv())
        self.assertEqual(d["verdict"], "MERGE")
        self.assertEqual(d["command"], "gh pr merge 1 -R acme/queue-repo --auto")

    def test_trix_api_merges_with_squash(self):
        # The real trix path: unprotected, squash, no bot. One green check.
        p = prv(statusCheckRollup=[run("Unit Tests")], reviewDecision="", reviews=[])
        d = self.v(p, cfg=API)
        self.assertEqual(d["verdict"], "MERGE")
        self.assertEqual(d["command"], "gh pr merge 1 -R trixdb/trix-api --squash")

    def test_merge_commands_per_mode(self):
        p = prv(statusCheckRollup=[run("unit")], reviewDecision="", reviews=[])
        mrg = dict(API, name="acme/m", merge="merge")
        self.assertIn("--merge", self.v(p, cfg=mrg)["command"])
        reb = dict(API, name="acme/r", merge="rebase")
        self.assertIn("--rebase", self.v(p, cfg=reb)["command"])

    def test_never_deletes_the_branch_in_the_merge_call(self):
        for cfg in list(fleet.REPOS.values()) + [QUEUE, IGN]:
            p = prv(statusCheckRollup=[run(n) for n in cfg["required_checks"]] or [run("x")],
                    reviewDecision="", reviews=[])
            d = self.v(p, cfg=cfg)
            self.assertNotIn("--delete-branch", d.get("command") or "", cfg["name"])

    def test_merged_and_closed(self):
        self.assertEqual(self.v(prv(state="MERGED"))["verdict"], "DONE")
        self.assertEqual(self.v(prv(state="CLOSED"))["verdict"], "ESCALATE")

    def test_draft_is_marked_ready_only_after_everything_else(self):
        d = self.v(prv(isDraft=True, statusCheckRollup=[], reviewDecision="REVIEW_REQUIRED"))
        self.assertEqual(d["verdict"], "READY")
        self.assertEqual(d["command"], "gh pr ready 1 -R acme/queue-repo")

    def test_draft_with_open_thread_addresses_review_first(self):
        t = thread(("claude[bot]", "bug", "2026-11-21T01:00:00Z"))
        d = self.v(prv(isDraft=True, statusCheckRollup=[]), [t])
        self.assertEqual(d["verdict"], "ADDRESS_REVIEW")

    def test_conflict(self):
        d = self.v(prv(mergeable="CONFLICTING", mergeStateStatus="DIRTY"))
        self.assertEqual(d["verdict"], "CONFLICT")

    def test_failing_required_check(self):
        rows = green_queue_checks()
        rows[2] = run("backend (22.x, test)", "FAILURE")
        d = self.v(prv(statusCheckRollup=rows))
        self.assertEqual(d["verdict"], "FIX_CI")
        self.assertIn("backend (22.x, test)", " ".join(d["reasons"]))

    def test_pending(self):
        rows = green_queue_checks()
        rows[0] = run("backend (22.x, lint)", status="IN_PROGRESS")
        self.assertEqual(self.v(prv(statusCheckRollup=rows))["verdict"], "WAIT_CI")

    def test_open_thread_blocks_even_when_approved(self):
        t = thread(("claude[bot]", "real bug", "2026-11-21T01:00:00Z"))
        self.assertEqual(self.v(prv(), [t])["verdict"], "ADDRESS_REVIEW")

    def test_answered_threads_must_be_resolved_where_the_branch_requires_it(self):
        t = thread(("claude[bot]", "bug", "2026-11-21T01:00:00Z"),
                   (ME, "fixed in abc", "2026-11-21T01:10:00Z"))
        d = self.v(prv(), [t])
        self.assertEqual(d["verdict"], "RESOLVE_THREADS")
        self.assertIn("resolve-threads", d["command"])
        # An unprotected repo (trix) does not gate on thread resolution.
        self.assertEqual(self.v(prv(statusCheckRollup=[run("unit")], reviewDecision="",
                                    reviews=[]), [t], cfg=API)["verdict"], "MERGE")

    def test_changes_requested_blocks(self):
        reviews = [{"author": {"login": "karl"}, "state": "CHANGES_REQUESTED", "body": "no",
                    "submittedAt": "2026-11-21T03:00:00Z", "id": "z"}]
        d = self.v(prv(reviews=reviews, reviewDecision="CHANGES_REQUESTED"))
        self.assertEqual(d["verdict"], "ADDRESS_REVIEW")

    def test_waits_for_required_approval(self):
        d = self.v(prv(reviewDecision="REVIEW_REQUIRED", reviews=[]))
        self.assertEqual(d["verdict"], "WAIT_REVIEW")

    def test_already_queued(self):
        d = self.v(prv(autoMergeRequest={"enabledAt": "2026-11-21T00:00:00Z"}))
        self.assertEqual(d["verdict"], "QUEUED")

    def test_release_pr_into_production_merges_with_a_merge_commit(self):
        rows = green_queue_checks()
        d = self.v(prv(baseRefName="production", statusCheckRollup=rows))
        self.assertEqual(d["verdict"], "MERGE")
        self.assertEqual(d["argv"][-1], "--merge")

    def test_release_pr_waits_for_every_check(self):
        rows = green_queue_checks() + [run("Check Commit Message", status="IN_PROGRESS")]
        d = self.v(prv(baseRefName="production", statusCheckRollup=rows))
        self.assertEqual(d["verdict"], "WAIT_CI")

    def test_default_base_keeps_the_queue(self):
        d = self.v(prv(baseRefName="main"))
        self.assertEqual(d["argv"][-1], "--auto")

    def test_in_the_merge_queue(self):
        d = self.v(prv(mergeQueueEntry={"state": "AWAITING_CHECKS", "position": 1}))
        self.assertEqual(d["verdict"], "QUEUED")
        self.assertIn("AWAITING_CHECKS", d["reasons"][0])

    def test_behind_base_on_a_non_queue_repo(self):
        p = prv(statusCheckRollup=[run("unit")], mergeStateStatus="BEHIND",
                reviewDecision="", reviews=[])
        d = self.v(p, cfg=API)
        self.assertEqual(d["verdict"], "UPDATE_BRANCH")

    def test_escalate_label(self):
        self.assertEqual(pr.pick_label(["bug", "waiting", "on hold"]), "waiting")
        self.assertEqual(pr.pick_label(["needs-decision", "waiting"]), "needs-decision")
        self.assertIsNone(pr.pick_label(["bug"]))


class AdminOverride(unittest.TestCase):
    """A human-authorised bypass of the review bot / approval, and nothing else."""

    def bot_down(self, **kw):
        rows = [run(n) for n in QUEUE["required_checks"]] + [run("claude-review", "FAILURE")]
        return prv(statusCheckRollup=rows, reviewDecision="REVIEW_REQUIRED", reviews=[], **kw)

    def test_without_admin_the_bot_outage_blocks(self):
        self.assertEqual(pr.decide(self.bot_down(), [], QUEUE, ME)["verdict"], "FIX_CI")

    def test_admin_merges_past_the_bot_and_approval(self):
        d = pr.decide(self.bot_down(), [], QUEUE, ME, admin=True)
        self.assertEqual(d["verdict"], "MERGE")
        self.assertEqual(d["argv"], ["gh", "pr", "merge", "1", "-R", "acme/queue-repo",
                                     "--merge", "--admin"])
        self.assertTrue(any("admin override" in r for r in d["reasons"]))

    def test_admin_still_blocks_on_a_failing_required_check(self):
        p = self.bot_down()
        p["statusCheckRollup"][2] = run("backend (22.x, test)", "FAILURE")
        self.assertEqual(pr.decide(p, [], QUEUE, ME, admin=True)["verdict"], "FIX_CI")

    def test_admin_still_waits_for_required_checks(self):
        p = self.bot_down()
        p["statusCheckRollup"][0] = run("backend (22.x, lint)", status="IN_PROGRESS")
        self.assertEqual(pr.decide(p, [], QUEUE, ME, admin=True)["verdict"], "WAIT_CI")

    def test_admin_still_blocks_on_open_review(self):
        t = thread(("karl", "this is wrong", "2026-11-21T01:00:00Z"))
        self.assertEqual(pr.decide(self.bot_down(), [t], QUEUE, ME, admin=True)["verdict"],
                         "ADDRESS_REVIEW")

    def test_admin_merge_requires_a_reason_and_records_it(self):
        with mock.patch.object(pr, "fetch", return_value=(self.bot_down(), [])), \
                mock.patch.object(pr, "cfg_for", return_value=QUEUE), \
                mock.patch.object(pr, "_run") as run_, \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit):
                pr.merge("acme/queue-repo", 1, admin_reason="  ")
            run_.assert_not_called()
            self.assertEqual(pr.merge("acme/queue-repo", 1, admin_reason="Karl approved"), 0)
        comment, merge_call = run_.call_args_list
        self.assertEqual(comment[0][0][:4], ["gh", "pr", "comment", "1"])
        self.assertIn("Karl approved", comment[0][0][-1])
        self.assertEqual(merge_call[0][0][-1], "--admin")


class EscalateBody(unittest.TestCase):
    def test_addresses_devghost_and_lists_options(self):
        body = pr.escalation_body("touches billing", "Refund or credit?",
                                  ["refund", "credit"], "TRIX-API-E evidence")
        self.assertTrue(body.startswith("@devghost"))
        self.assertIn("1. refund", body)
        self.assertIn("2. credit", body)
        self.assertIn("won't merge", body)

    def test_body_is_redacted(self):
        body = pr.escalation_body("user a@b.co hit it", "q?", [], "")
        self.assertNotIn("a@b.co", body)


class SideEffects(unittest.TestCase):
    def test_merge_runs_only_on_a_merge_verdict(self):
        with mock.patch.object(pr, "fetch", return_value=(prv(state="OPEN", isDraft=True,
                                                               statusCheckRollup=[]), [])), \
                mock.patch.object(pr, "cfg_for", return_value=QUEUE), \
                mock.patch.object(pr, "_run") as run_, \
                contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()):
            code = pr.merge("acme/queue-repo", 1)
        self.assertNotEqual(code, 0)
        run_.assert_not_called()

    def test_merge_runs_the_argv_not_a_split_string(self):
        with mock.patch.object(pr, "fetch", return_value=(prv(), [])), \
                mock.patch.object(pr, "cfg_for", return_value=QUEUE), \
                mock.patch.object(pr, "_run") as run_, \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(pr.merge("acme/queue-repo", 1), 0)
        run_.assert_called_once_with(["gh", "pr", "merge", "1", "-R", "acme/queue-repo", "--auto"])

    def test_resolve_threads_skips_threads_awaiting_us(self):
        answered = dict(thread(("claude", "bug", "2026-11-21T01:00:00Z"),
                               (ME, "fixed", "2026-11-21T01:10:00Z")), id="T1")
        waiting = dict(thread(("claude", "nit", "2026-11-21T01:00:00Z")), id="T2")
        done = dict(thread(("claude", "x", "2026-11-21T01:00:00Z"), resolved=True), id="T3")
        with mock.patch.object(pr, "fetch", return_value=(prv(), [answered, waiting, done])), \
                mock.patch.object(pr, "_run") as run_, \
                contextlib.redirect_stdout(io.StringIO()):
            code = pr.resolve_threads("acme/queue-repo", 1)
        self.assertEqual(code, 20)
        self.assertEqual(run_.call_count, 1)
        self.assertIn("id=T1", run_.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
