"""Tests for sentry.py: API edges, evidence extraction, the status guards."""
import contextlib
import io
import os
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import sentry  # noqa: E402

FAKE_TOKEN = "sntrys_FAKE_TOKEN_DO_NOT_PRINT_123"


def frame(fn, path, line, in_app, ctx=None):
    return {
        "function": fn, "filename": path, "absPath": path, "lineNo": line,
        "inApp": in_app, "context": ctx or [],
    }


def event(**kw):
    ev = {
        "eventID": "e1", "dateCreated": "2026-11-21T03:00:05Z",
        "tags": [
            {"key": "environment", "value": kw.get("env", "production")},
            {"key": "release", "value": kw.get("release", "a" * 40)},
            {"key": "handled", "value": "yes"},
            {"key": "transaction", "value": "POST /api/x"},
        ],
        "entries": [],
        "user": {"id": None, "email": "real.person@example.com", "ip_address": "203.0.113.9"},
    }
    if "frames" in kw:
        ev["entries"].append({"type": "exception", "data": {"values": [{
            "type": kw.get("etype", "TypeError"), "value": kw.get("evalue", "boom"),
            "mechanism": {"type": "generic", "handled": True},
            "stacktrace": {"frames": kw["frames"]},
        }]}})
    if "message" in kw:
        ev["entries"].append({"type": "message", "data": {"formatted": kw["message"]}})
    ev["entries"].append({"type": "breadcrumbs", "data": {"values": [
        {"timestamp": "2026-11-21T03:00:01Z", "category": "http", "message": None,
         "data": {"url": "https://x.io/cb?code=SECRETCODE&state=1", "status_code": 404}},
        {"timestamp": "2026-11-21T03:00:02Z", "category": "log", "message": "mail to a@b.co failed"},
    ]}})
    return ev


ISSUE = {
    "id": "111", "shortId": "TRIX-API-9", "title": "TypeError: boom",
    "culprit": "POST /v1/x", "count": "20", "userCount": 0, "level": "error",
    "status": "unresolved", "issueCategory": "error", "issueType": "error",
    "firstSeen": "2026-11-15T00:00:00Z", "lastSeen": "2026-11-21T03:00:05Z",
    "firstRelease": {"version": "b" * 40}, "permalink": "https://zivrio.sentry.io/issues/111/",
    "project": {"slug": "trix-api", "id": "4512452855660544"},
    "metadata": {"in_app_frame_mix": "mixed"},
}


class Token(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False)
        self.tmp.write(f"[auth]\ntoken={FAKE_TOKEN}\n")
        self.tmp.close()
        self.env = mock.patch.dict(os.environ, {"SENTRYCLIRC": self.tmp.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        os.unlink(self.tmp.name)

    def test_http_error_never_echoes_the_token(self):
        body = io.BytesIO(f"bad token {FAKE_TOKEN}".encode())
        err = urllib.error.HTTPError("u", 401, "no", {}, body)
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(sentry.SentryError) as cm:
                sentry.api("/x/")
        self.assertNotIn(FAKE_TOKEN, str(cm.exception))
        self.assertIn("401", str(cm.exception))

    def test_token_rides_only_the_header(self):
        seen = {}

        class R:
            status = 200

            def read(self):
                return b"{}"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake(req, timeout):
            seen["url"] = req.full_url
            seen["auth"] = req.get_header("Authorization")
            return R()

        with mock.patch("urllib.request.urlopen", side_effect=fake):
            sentry.api("/organizations/zivrio/issues/", {"query": "is:unresolved"})
        self.assertNotIn(FAKE_TOKEN, seen["url"])
        self.assertEqual(seen["auth"], f"Bearer {FAKE_TOKEN}")


class ResolveId(unittest.TestCase):
    def test_numeric_passthrough(self):
        with mock.patch.object(sentry, "api") as api:
            self.assertEqual(sentry.resolve_id("123"), "123")
            api.assert_not_called()

    def test_shortid_goes_through_shortids_endpoint(self):
        # Searching issues by shortId silently returns []; shortids/ is the way.
        with mock.patch.object(sentry, "api", return_value={"groupId": 999}) as api:
            self.assertEqual(sentry.resolve_id("TRIX-API-9"), "999")
        api.assert_called_once_with("/organizations/zivrio/shortids/TRIX-API-9/")


class Extraction(unittest.TestCase):
    def test_exceptions_keep_every_frame_innermost_first(self):
        ev = event(frames=[
            frame("outer", "app:///dist/a.js", 10, True),
            frame("lib", "app:///../node_modules/axios/x.cjs", 5, False),
            frame("inner", "app:///dist/b.js", 20, True, [[19, "x()"], [20, "y()"]]),
        ])
        exc = sentry.exceptions(ev)[0]
        self.assertEqual([f["function"] for f in exc["frames"]], ["inner", "lib", "outer"])
        self.assertEqual(exc["frames"][0]["path"], "dist/b.js")
        self.assertEqual(exc["frames"][0]["context"], [[19, "x()"], [20, "y()"]])
        self.assertEqual(exc["frames"][1]["in_app"], False)

    def test_message_events(self):
        ev = event(message="overdueInvoices endpoint unavailable (404)")
        self.assertEqual(sentry.message(ev), "overdueInvoices endpoint unavailable (404)")
        self.assertEqual(sentry.exceptions(ev), [])

    def test_breadcrumbs_are_redacted(self):
        crumbs = sentry.breadcrumbs(event(message="m"))
        text = repr(crumbs)
        self.assertNotIn("SECRETCODE", text)
        self.assertNotIn("a@b.co", text)
        self.assertEqual(crumbs[0]["data"]["status_code"], 404)

    def test_tags(self):
        self.assertEqual(sentry.tags(event(env="dev"))["environment"], "dev")


class Performance(unittest.TestCase):
    def test_n_plus_one_evidence(self):
        ev = {"occurrence": {"type": 1006, "evidenceDisplay": [
            {"name": "Offending Spans", "value": 'db - {"find":"exchangerates"}'}],
            "evidenceData": {"transactionName": "GET /api/finance/transactions",
                             "offenderSpanIds": ["a", "b", "c"],
                             "repeatingSpansCompact": ['{"find":"exchangerates"}']}}}
        p = sentry.performance(ev)
        self.assertEqual(p["offender_spans"], 3)
        self.assertEqual(p["transaction"], "GET /api/finance/transactions")
        self.assertIn("exchangerates", p["evidence"][0][1])

    def test_errors_have_none(self):
        self.assertIsNone(sentry.performance(event(message="m")))


class Spread(unittest.TestCase):
    def ev(self, env, rel, user=None, ts="2026-11-20T00:00:00Z", server="s1"):
        return {
            "dateCreated": ts, "user": {"id": user} if user else None,
            "tags": [{"key": "environment", "value": env}, {"key": "release", "value": rel},
                     {"key": "server_name", "value": server}],
        }

    def test_counts_and_users_are_counted_not_listed(self):
        s = sentry.spread([
            self.ev("production", "r1", "u1", "2026-11-20T00:00:00Z"),
            self.ev("production", "r2", "u2", "2026-11-21T00:00:00Z"),
            self.ev("dev", "r2", "u1"),
        ])
        self.assertEqual(s["events"], 3)
        self.assertEqual(s["environments"], {"production": 2, "dev": 1})
        self.assertEqual(s["releases"], {"r1": 1, "r2": 2})
        self.assertEqual(s["distinct_users"], 2)
        self.assertEqual(s["first"], "2026-11-20T00:00:00Z")
        self.assertEqual(s["last"], "2026-11-21T00:00:00Z")
        self.assertNotIn("u1", repr(s))


class Signals(unittest.TestCase):
    def test_non_production_only(self):
        sig = sentry.signals(ISSUE, {"environments": {"dev": 20}, "events": 20})
        self.assertTrue(any("never seen in production" in s for s in sig))

    def test_all_event_counts_beat_the_sample(self):
        # The 50-event sample can miss rare production hits; tag counts cover all.
        sig = sentry.signals(ISSUE, {"environments": {"dev": 50}, "events": 50},
                             {"prod_envs": ("prod",)}, {"dev": 990, "prod": 3})
        self.assertFalse(any("never seen in production" in s for s in sig))

    def test_server_prod_env_name(self):
        sig = sentry.signals(ISSUE, {"environments": {"production": 2}, "events": 2},
                             {"prod_envs": ("prod",)})
        self.assertTrue(any("never seen in production" in s for s in sig))

    def test_distribution(self):
        rows = [{"key": "environment", "topValues": [{"value": "dev", "count": 4}]},
                {"key": "correlationId", "topValues": [{"value": "x", "count": 1}]}]
        self.assertEqual(sentry.distribution(rows), {"environment": {"dev": 4}})

    def test_perf_detector(self):
        perf = dict(ISSUE, title="N+1 Query", issueCategory="performance",
                    issueType="performance_n_plus_one_db_queries", level="info")
        sig = sentry.signals(perf, {"environments": {"production": 1}, "events": 1})
        self.assertTrue(any("performance detector" in s for s in sig))

    def test_system_only_stack(self):
        sys_only = dict(ISSUE, metadata={"in_app_frame_mix": "system-only"})
        sig = sentry.signals(sys_only, {"environments": {"production": 3}, "events": 3})
        self.assertTrue(any("no in-app frame" in s for s in sig))

    def test_signals_never_state_a_disposition(self):
        # Signals are facts to check, not verdicts: the agent decides.
        sig = sentry.signals(ISSUE, {"environments": {"dev": 1}, "events": 1})
        for s in sig:
            for verdict in ("archive", "noise", "won't fix", "not a bug"):
                self.assertNotIn(verdict, s.lower())


class StatusGuards(unittest.TestCase):
    def run_cli(self, *argv):
        err = io.StringIO()
        with mock.patch.object(sys, "argv", ["sentry.py", *argv]), \
                contextlib.redirect_stderr(err), mock.patch.object(sentry, "api") as api:
            with self.assertRaises(SystemExit) as cm:
                sentry.main()
        return cm.exception.code, err.getvalue(), api

    def test_resolve_requires_a_reason(self):
        code, err, api = self.run_cli("resolve", "123")
        self.assertNotEqual(code, 0)
        api.assert_not_called()

    def test_archive_requires_a_reason(self):
        code, err, api = self.run_cli("archive", "123")
        self.assertNotEqual(code, 0)
        api.assert_not_called()

    def test_blank_reason_is_rejected(self):
        code, err, api = self.run_cli("archive", "123", "-m", "   ")
        self.assertNotEqual(code, 0)
        self.assertIn("-m must not be empty", err)
        api.assert_not_called()

    def test_resolve_with_reason_puts_status_and_comment(self):
        calls = []
        with mock.patch.object(sentry, "api", side_effect=lambda *a, **k: calls.append((a, k)) or {}):
            with mock.patch.object(sys, "argv", ["sentry.py", "resolve", "123", "--next-release",
                                                 "-m", "Fixed in trixdb/trix-api#1"]):
                with contextlib.redirect_stdout(io.StringIO()):
                    sentry.main()
        put = calls[0]
        self.assertEqual(put[1]["method"], "PUT")
        self.assertEqual(put[1]["body"]["statusDetails"], {"inNextRelease": True})
        self.assertEqual(calls[1][1]["body"], {"text": "Fixed in trixdb/trix-api#1"})


class Paired(unittest.TestCase):
    def test_queries_other_fleet_projects_in_the_window(self):
        rows = {"data": [{"issue": "TRIX-LANDING-9", "title": "BFF upstream timeout",
                          "project": "trix-landing", "timestamp": "2026-11-21T03:00:04Z"}]}
        with mock.patch.object(sentry, "api", return_value=rows) as api:
            out = sentry.paired("2026-11-21T03:00:05Z", exclude_pid="4512452855660544")
        path, params = api.call_args[0]
        self.assertEqual(path, "/organizations/zivrio/events/")
        self.assertNotIn("4512452855660544", params["project"])
        self.assertIn("4512452855857152", params["project"])
        self.assertEqual(params["start"], "2026-11-21T02:58:05")
        self.assertEqual(params["end"], "2026-11-21T03:02:05")
        self.assertEqual(out[0]["issue"], "TRIX-LANDING-9")

    def test_lookup_failure_is_reported_not_swallowed(self):
        with mock.patch.object(sentry, "api", side_effect=sentry.SentryError("HTTP 400")):
            out = sentry.paired("2026-11-21T03:00:05Z", exclude_pid="1")
        self.assertEqual(out, [{"error": "HTTP 400"}])


class Markdown(unittest.TestCase):
    def test_issue_markdown_is_redacted_and_traceable(self):
        d = {
            "issue": ISSUE, "project": "api", "tags": {"environment": "production",
                                                       "release": "a" * 40},
            "message": None, "exceptions": sentry.exceptions(event(frames=[
                frame("h", "app:///dist/x.js", 3, True)], evalue="user real.person@example.com")),
            "spread": {"events": 1, "environments": {"production": 1}, "releases": {}},
            "signals": [], "placement": {"in": {"main": True}, "known": True, "note": ""},
            "frames": [], "paired": [],
        }
        d["performance"] = {"offender_spans": 81, "transaction": "GET /x",
                             "evidence": [("Offending Spans", "db - find")]}
        md = sentry.to_markdown(d)
        self.assertIn("81 offending spans", md)
        self.assertIn("https://zivrio.sentry.io/issues/111/", md)
        self.assertIn("a" * 40, md)
        self.assertNotIn("real.person@example.com", md)


if __name__ == "__main__":
    unittest.main()
