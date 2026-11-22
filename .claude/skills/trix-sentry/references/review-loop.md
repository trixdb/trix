# Review loop: take reviews seriously, don't take them on faith

`pr.py status` reports `ADDRESS_REVIEW` for three things: an unresolved thread
whose last comment isn't ours, a reviewer whose latest review requests changes,
and a review summary with content posted after our last reply. All three need an
explicit answer. Approvals and empty reviews need none.

The trix fix repos have **no review bot and 0 required approvals** today, so in
practice reviews are human (or absent). That makes the merge gate's other
checks — CI where it exists, and your own local gate where it doesn't — the main
signal. Don't treat "no review arrived" as approval; treat it as "nobody
objected", and still hold yourself to the proof standard.

## Per item

1. **Read it in full** (the gate truncates): `gh api repos/<repo>/pulls/<n>/comments`
   and `gh pr view <n> -R <repo> --json reviews`.
2. **Verify the claim** against the code at the PR head, the way you triaged the
   Sentry issue: point at file:line, run the case, write the test. Reviewers are
   often right and sometimes confidently wrong.
3. **Right**: fix test-first (the reviewer's scenario becomes a test), push, then
   reply in the thread: what changed and the commit SHA.
4. **Wrong or out of scope**: reply with the evidence (file:line, the test that
   proves it, the doc). Out of scope: file a focused follow-up issue (fully
   labelled, repro + evidence + suggested fix) and link it — never silently fold
   unrelated fixes into this PR.
5. **Praise or an observation with no ask**: a short reply saying no change is
   needed and why, so the thread is answered.
6. **Review summaries** (a review body rather than a thread): answer with one PR
   comment covering each point; that acknowledges it for the gate.

Don't:
- reply "fixed" without a SHA, or "good catch" without the fix;
- resolve a thread you didn't answer;
- argue twice: if the reviewer pushes back after your evidence, escalate (one
  round each, then a human decides);
- `--no-verify` past prettier/eslint to get a green push.

## Escalation

Use `pr.py escalate` (it formats the comment, redacts it, and labels the PR or
issue `needs-decision` / `waiting` / `on hold`, whichever the repo has):

- product / revenue decisions: **billing or credits, auth, tenant or space
  isolation, DB migrations, graph isolation, user-visible behaviour or copy** —
  trix's launch-blocking risk areas. Never merge these on your own judgement;
  the monorepo `CLAUDE.md` is explicit about not self-merging, and hard-to-
  reverse changes on Railway/PlanetScale have caused prod incidents before
  (account memory). Prove a full rollback before any such change.
- reviewer vs evidence deadlock after one round;
- CI failing twice after honest fixes, or a repo-wide red you did not cause (two
  of the four repos have no CI — a failure there is your local gate, so there is
  no CI to blame);
- a PR closed by someone else; a repo whose rules `fleet.py verify` reports DRIFT.

A good escalation is answerable in one reply: why you stopped, what you verified
(with refs), one question, numbered options with your recommendation first.
After escalating, stop work on that item and move on. Because `gh` posts as
`devghost`, the `@devghost` mention doesn't notify: list every escalation, with
its link, in your reply to the user.
