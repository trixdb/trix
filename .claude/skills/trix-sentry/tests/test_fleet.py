"""Tests for fleet.py: project/repo mapping, redaction, git placement.

The trix fleet is four Sentry projects (api, workers-node, bots, landing) over
four trixdb submodules, plus the monorepo root in REPOS for the tooling PR.
The git/redaction/needle helpers are shared, fleet-agnostic engine code.
"""
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fleet  # noqa: E402


class ProjectForShortId(unittest.TestCase):
    def test_each_prefix_routes_to_its_project(self):
        self.assertEqual(fleet.project_for_shortid("TRIX-API-9")["alias"], "api")
        self.assertEqual(fleet.project_for_shortid("TRIX-BOTS-7")["alias"], "bots")
        self.assertEqual(fleet.project_for_shortid("TRIX-LANDING-7")["alias"], "landing")

    def test_multi_word_slug_prefix(self):
        # trix-workers-node -> prefix TRIX-WORKERS-NODE; the id's last '-<code>'
        # is stripped, the rest must match the slug upper-cased.
        self.assertEqual(
            fleet.project_for_shortid("TRIX-WORKERS-NODE-A")["alias"], "workers-node")
        self.assertEqual(
            fleet.project_for_shortid("TRIX-WORKERS-NODE-10")["alias"], "workers-node")

    def test_case_insensitive(self):
        self.assertEqual(fleet.project_for_shortid("trix-api-9")["alias"], "api")

    def test_unknown_prefix_is_none(self):
        self.assertIsNone(fleet.project_for_shortid("HEYWEEK-SERVER-7"))
        self.assertIsNone(fleet.project_for_shortid("PENDICTIVE-9"))
        self.assertIsNone(fleet.project_for_shortid("12345"))

    def test_every_project_has_the_fields_the_loop_needs(self):
        for alias, p in fleet.PROJECTS.items():
            for key in ("slug", "pid", "repo", "path", "default_branch", "prod_envs"):
                self.assertTrue(p.get(key), f"{alias} lacks {key}")
            self.assertIn(p["repo"], fleet.REPOS, alias)

    def test_every_repo_has_a_valid_merge_mode(self):
        for name, r in fleet.REPOS.items():
            self.assertIn(r["merge"], fleet.MERGE_MODES, name)
            self.assertIsInstance(r["required_checks"], list, name)

    def test_workers_node_ignores_the_chronic_npm_audit_checks(self):
        # NPM Audit / Validate / CI Summary are red repo-wide (moderate dep
        # vulns), merged through; the gate must report but not block on them.
        ign = fleet.REPOS["trixdb/trix-workers-node"]["ignore_checks"]
        self.assertEqual(set(ign), {"NPM Audit", "Validate", "CI Summary"})

    def test_all_projects_report_production_env(self):
        # All four init Sentry with environment defaulting to production.
        for alias, p in fleet.PROJECTS.items():
            self.assertEqual(p["prod_envs"], ("production",), alias)

    def test_no_separate_production_branch(self):
        # Railway deploys from main; none has a production branch.
        for alias, p in fleet.PROJECTS.items():
            self.assertIsNone(p["prod_branch"], alias)

    def test_pids_are_unique(self):
        pids = [p["pid"] for p in fleet.PROJECTS.values()]
        self.assertEqual(len(pids), len(set(pids)))

    def test_root_repo_is_in_repos_but_not_a_project(self):
        self.assertIn("trixdb/trix", fleet.REPOS)
        self.assertNotIn("trixdb/trix", {p["repo"] for p in fleet.PROJECTS.values()})

    def test_by_repo(self):
        aliases = sorted(p["alias"] for p in fleet.projects_for_repo("trixdb/trix-api"))
        self.assertEqual(aliases, ["api"])


class Redact(unittest.TestCase):
    def test_email(self):
        self.assertEqual(fleet.redact("from jane.doe+x@example.co.uk now"), "from <email> now")

    def test_ipv4(self):
        self.assertEqual(fleet.redact("ip 203.0.113.7 hit"), "ip <ip> hit")

    def test_bearer_and_jwt(self):
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl"
        out = fleet.redact(f"Authorization: Bearer abc.def-123 and {jwt}")
        self.assertNotIn("abc.def-123", out)
        self.assertNotIn(jwt, out)

    def test_credentials_in_urls(self):
        out = fleet.redact("postgres://user:s3cret@db.x.net/db")
        self.assertNotIn("s3cret", out)
        out = fleet.redact("https://api.x.com/cb?code=abc123&state=ok&access_token=zzz")
        self.assertNotIn("abc123", out)
        self.assertNotIn("zzz", out)
        self.assertIn("state=ok", out)

    def test_object_ids_and_uuids_are_kept(self):
        # Ids are what makes an event traceable; they are not personal data.
        s = "account acct:7ecc1293ad75cdc9 corr 9c1f2420-cec4-4dc8-ab43-7aff94b9a04e"
        self.assertEqual(fleet.redact(s), s)

    def test_nested(self):
        out = fleet.redact({"a": ["x@y.io", {"b": "10.0.0.1"}], "n": 3})
        self.assertEqual(out, {"a": ["<email>", {"b": "<ip>"}], "n": 3})


class NormaliseFramePath(unittest.TestCase):
    def test_strips_url_scheme_and_parent_hops(self):
        self.assertEqual(fleet.normalise_frame_path("app:///dist/routes/a.js"), "dist/routes/a.js")
        self.assertEqual(
            fleet.normalise_frame_path("app:///../node_modules/pg/x.js"),
            "node_modules/pg/x.js",
        )

    def test_strips_local_checkout_prefix(self):
        self.assertEqual(
            fleet.normalise_frame_path(
                "/data/code/trix/trix-api/src/plugins/sentry.js",
                repo_dirnames=("trix-api",),
            ),
            "src/plugins/sentry.js",
        )

    def test_webpack_and_tilde(self):
        self.assertEqual(fleet.normalise_frame_path("webpack:///./src/a.ts"), "src/a.ts")
        self.assertEqual(fleet.normalise_frame_path("~/src/lib/x.svelte"), "src/lib/x.svelte")


def _git(cwd, *args):
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


class GitPlacement(unittest.TestCase):
    """Uses a real throwaway repo: placement must come from git, not inference."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = cls.d = cls.tmp.name
        _git(d, "init", "-q", "-b", "main")
        _git(d, "config", "user.email", "t@t")
        _git(d, "config", "user.name", "t")
        _git(d, "config", "commit.gpgsign", "false")
        os.makedirs(os.path.join(d, "src"))
        with open(os.path.join(d, "src", "a.js"), "w") as f:
            f.write("one\n")
        with open(os.path.join(d, "src", "b.js"), "w") as f:
            f.write("b\n")
        _git(d, "add", ".")
        _git(d, "commit", "-qm", "c1")
        cls.c1 = _git(d, "rev-parse", "HEAD")
        _git(d, "branch", "production")
        with open(os.path.join(d, "src", "a.js"), "w") as f:
            f.write("two\n")
        _git(d, "commit", "-qam", "fix a")
        cls.c2 = _git(d, "rev-parse", "HEAD")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_contains(self):
        p = fleet.release_placement(self.d, self.c1, ["main", "production"])
        self.assertEqual(p["known"], True)
        self.assertEqual(p["in"], {"main": True, "production": True})
        p = fleet.release_placement(self.d, self.c2, ["main", "production"])
        self.assertEqual(p["in"], {"main": True, "production": False})

    def test_short_sha_release_is_placeable(self):
        # trix-landing releases are short SHAs; _SHA matches 7-40 hex.
        p = fleet.release_placement(self.d, self.c1[:7], ["main"])
        self.assertTrue(p["known"])
        self.assertEqual(p["in"], {"main": True})

    def test_unknown_sha_is_reported_not_guessed(self):
        p = fleet.release_placement(self.d, "deadbeef" * 5, ["main"])
        self.assertFalse(p["known"])
        self.assertEqual(p["in"], {"main": None})

    def test_non_sha_release(self):
        p = fleet.release_placement(self.d, "trix-api@1.0.0", ["main"])
        self.assertFalse(p["known"])
        self.assertIn("not a commit", p["note"])

    def test_changed_since(self):
        out = fleet.changed_since(self.d, self.c1, "main", ["src/a.js", "src/b.js"])
        self.assertEqual(list(out), ["src/a.js"])
        self.assertEqual(out["src/a.js"][0]["subject"], "fix a")

    def test_locate_by_suffix(self):
        self.assertEqual(fleet.locate(self.d, "main", "a.js"), ["src/a.js"])
        self.assertEqual(fleet.locate(self.d, "main", "x/src/a.js"), ["src/a.js"])
        self.assertEqual(fleet.locate(self.d, "main", "nope.js"), [])

    def test_locate_maps_dist_js_to_src_ts(self):
        os.makedirs(os.path.join(self.d, "lib"), exist_ok=True)
        with open(os.path.join(self.d, "lib", "svc.ts"), "w") as f:
            f.write("x\n")
        _git(self.d, "add", ".")
        _git(self.d, "commit", "-qm", "ts")
        self.assertEqual(fleet.locate(self.d, "main", "dist/lib/svc.js"), ["lib/svc.ts"])


class Compare(unittest.TestCase):
    # The live shape every trix fix repo has today: unprotected, squash.
    LIVE = {"default_branch": "main",
            "allowed": {"merge": True, "squash": True, "rebase": True},
            "merge_queue": False, "approvals": 0, "conversation_resolution": False,
            "required_checks": []}

    def test_in_sync(self):
        self.assertEqual(fleet.compare(fleet.REPOS["trixdb/trix-api"], self.LIVE), [])

    def test_reports_each_drift(self):
        live = dict(self.LIVE, merge_queue=True, approvals=1, default_branch="master",
                    conversation_resolution=True, required_checks=["x"])
        diffs = fleet.compare(fleet.REPOS["trixdb/trix-api"], live)
        self.assertEqual(len(diffs), 5, diffs)

    def test_disabled_merge_method(self):
        cfg = fleet.REPOS["trixdb/trix-api"]  # merge mode squash
        live = dict(self.LIVE, allowed={"merge": True, "squash": False, "rebase": True})
        self.assertEqual(fleet.compare(cfg, live), ["merge method squash is disabled on GitHub"])


class Needle(unittest.TestCase):
    def test_static_part_of_a_template(self):
        self.assertEqual(fleet.needle("invalid input syntax for type uuid (500)"),
                         "invalid input syntax for type uuid")
        self.assertEqual(fleet.needle("Invalid cleanup job payload: task enum"),
                         "Invalid cleanup job payload")

    def test_nothing_usable(self):
        self.assertIsNone(fleet.needle("E11000"))
        self.assertIsNone(fleet.needle(""))


class Needles(unittest.TestCase):
    def test_trims_interpolated_edges(self):
        self.assertEqual(fleet.needles("overdueInvoices endpoint unavailable (404)"),
                         ["overdueInvoices endpoint unavailable", "endpoint unavailable",
                          "overdueInvoices endpoint"])


class Grep(GitPlacement):
    def test_find_source_prefers_code_and_trims(self):
        d = self.d
        with open(os.path.join(d, "src", "run.js"), "w") as f:
            f.write("capture(`${job} endpoint unavailable (404)`)\n")
        os.makedirs(os.path.join(d, "test"), exist_ok=True)
        with open(os.path.join(d, "test", "run.test.js"), "w") as f:
            f.write("'x endpoint unavailable (404)'\n")
        _git(d, "add", ".")
        _git(d, "commit", "-qm", "src")
        head = _git(d, "rev-parse", "HEAD")
        n, hits = fleet.find_source(d, head, "overdueInvoices endpoint unavailable (404)")
        self.assertEqual(n, "endpoint unavailable")
        self.assertTrue(hits[0].startswith("src/run.js:1:"), hits)
        self.assertTrue(hits[1].startswith("test/run.test.js"), hits)

    def test_finds_literal_at_ref(self):
        hits = fleet.grep(self.d, self.c2, "two")
        self.assertEqual(hits, ["src/a.js:1:two"])
        self.assertEqual(fleet.grep(self.d, self.c1, "two"), [])
        self.assertEqual(fleet.grep(self.d, "main", None), [])


if __name__ == "__main__":
    unittest.main()
