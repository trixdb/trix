# MQL Query page — "powerful & easy" self-paced loop tracker

_Read FIRST. Goal: make querying memories more POWERFUL and EASIER. Ship one
high-value improvement per iteration; verify (svelte-check 0/0, eslint, build,
real browser + screenshot to worktree screenshots/); commit._

## Where the work lives
- `/data/code/trix/trix-landing`, branch **`feat/mql-query-power`** (off main).
- Page `src/routes/account/query/+page.svelte` (orchestrator) + components in
  `src/lib/components/account/` (Query*, SplitPane, MqlEditor, mql-editor/*).
- Dev: `TRIX_DEV_AUTO_USER=true bun run dev --port 5199`. Mock: spaces Default/Research,
  4 memories (tags db/design/meeting/preferences/schedule; types text/image/audio).

## Already shipped (baseline, on main)
Rich editor (highlight/lint/autocomplete-from-real-data/tab+ghost/hover), live count,
shareable ?q= URL, recent history, cheatsheet, IDE split-pane layout + status bar, typed results.

## Ranked backlog (power ⚡ / ease ✨)
1. ~~Click-to-refine (faceted drill-down)~~ ✅ ITER 1 (a1b1513) — chips (type/pinned/tags) append
   a predicate + re-run. onrefine callback keeps QueryResults pure.
2. ~~Result detail drawer~~ ✅ ITER 2 (3046a9f) — MemoryDrawer: full content, meta, copy-id,
   tag-refine, graceful find-similar. Right-side <dialog>.
3. ⚡✨ **Keyboard result navigation** — j/k or ↑/↓ through results, Enter to open drawer (Vim/IDE
   feel). Pairs with the drawer. Client-side. ← NEXT
4. ⚡ **Sort + load-more** results (sort by recency/quality; paginate beyond limit).
5. ✨ **Natural-language → MQL** — "ask in plain English" box → generates editable MQL (we built
   nl-to-mql lib). BIGGEST ease win but needs an LLM endpoint (check trix-api /ai or BFF; may need
   allowlist). Assess feasibility before committing.
6. ✨ **Visual filter builder** — click chips (space/type/tag) to build MQL for non-power users.
7. ⚡ **Multi-space / saved views** — persist named queries (saved_searches backend).

## Iteration log
### Iter 1 — 2026-07-14 ✅ click-to-refine faceted drill-down (a1b1513)
### Iter 2 — 2026-07-14 ✅ memory detail drawer (3046a9f)
- MemoryDrawer.svelte: right <dialog>, full content/meta/copy-id/tag-refine/find-similar.
  Verified in browser. NEXT: #3 keyboard result navigation (↑/↓/j/k + Enter → drawer).

## Verdict
Baseline is already IDE-grade. Focus now: make RESULTS actionable and lower the barrier to
authoring queries (NL→MQL). Stop when further changes are diminishing returns.

### Iter 3 — 2026-07-14 ✅ quick-fix code actions (610e40f)
- VS Code-style lint quick-fix: one-click apply "did you mean" for unknown fields + enum values
  (mql-editor/lint.ts suggestionFix, +4 specs). Verified in browser (qualiti→quality).
  Reprioritized backlog per user IDE-features discussion.

## Reprioritized backlog (post user "mimic best IDEs" Q)
- NEXT: **Results TABLE view** (DataGrip/Kusto) — toggle card⇄table; sortable columns
  (content/type/tags/date). Biggest "powerful" win for scanning many results. Client-side.
- Then: **Command palette / quick-insert** (VS Code ⌘K) — run/clear/copy/insert field/example.
- Then: **Keyboard result nav** (↑/↓/j/k + Enter→drawer) + **signature hints** + **export results**.

### Iter 4 — 2026-07-14 ✅ flexible VS Code-like layout (daae9e3) [user feedback]
- Editor now prominent/filling; Recent/Examples moved to a collapsible Snippets SIDEBAR (toggle,
  hidden by default); results panel MOVABLE via toolbar segmented control (Right/Bottom/Hidden),
  each split draggable + persisted per orientation. SplitPane gained vertical mode; QueryToolbar
  extracted; MqlEditor/QueryInput fill mode. Verified all modes in browser. 27 specs green.
- Remaining backlog unchanged: results TABLE view, command palette, keyboard nav, export.

### Iter 5 — 2026-07-14 ✅ results table view (882d5b9)
- Cards/Table toggle (persisted); ResultsTable.svelte = sortable dense grid (Type/Content/Tags/
  Created), sticky headers, tag-refine, row→drawer. Verified in browser (sort + row-open).
- NEXT: command palette / quick-insert (⌘K). Then keyboard nav, signature hints, export results.

### Fix — 2026-07-14 ✅ honest server-pending message (fdb95c8) [user bug report]
- 'space:Default type:fact' falsely claimed "OR/NOT/ranges/graph". Root cause: memory_type has no
  flat filter on GET /v1/memories (confirmed in trix-api: `type` param = content_type). New
  mql-pending.ts pendingReason() names the real cause (composition vs specific fields) + lists
  runnable filters. +5 specs. Verified in browser.

## NEW DIRECTION (user): AI Query Copilot
Goal-driven assistant: user writes a NL goal → background LLM suggests/improves the MQL query
(better results / cheaper / faster). Library `nlToMql()` already exists (needs an injected llm fn).
Split: (A) rule-based advisor (add limit/cost, scope space, avoid non-runnable fields, structured vs
semantic) — NO LLM, doable now; (B) LLM goal→MQL via nlToMql — needs a reachable LLM endpoint
(feasibility agent running); (C) data-aware agentic suggestions — bigger. Assessing endpoint now.

### Copilot v1 — 2026-07-14 ✅ AI query copilot (698466d) [user idea, built in parallel]
- '✨ Ask AI' → goal box → nlToMql (validate+self-repair) → editable MQL suggestion → Use in editor.
- Frontend-only wiring: BFF /api/ai/complete → POST /v1/ai/chat {system,message,include_memories:false,
  stream:false} → {content}; dev branch returns canned MQL (verifiable). ai-complete.ts = LlmFn.
  Verified in browser. Prod uses real LLM (no trix-api change; can pass cheap gemini-flash tier).
- Copilot FOLLOW-UPS (user's full vision): (B2) "Improve this query" mode — send current query+goal→
  LLM suggests better/cheaper/faster MQL + rationale; (A) rule-based advisor (add limit, scope space,
  structured-vs-semantic, avoid non-runnable fields) — no LLM, deterministic; (C) data-aware agentic
  (run query, inspect results, refine). Also: pass cost/speed tier from model catalog; page is 331
  lines (>300 soft) — extract editorPane/pending later.

### Iter 7 — 2026-07-14 ✅ advisor + improve mode + cleanup (ef1e05a, 1f42c6c) [user: both in parallel]
- Rule-based advisor: QueryAdvisor + mql-advisor.ts advise(plan) — cost/speed/fix tips w/ 1-click
  apply (add limit, narrow semantic, fix relevance-order, shrink big limit). Verified.
- Copilot Improve mode: query-improve.ts rewrites current query toward goal (validated). Verified.
- Page 340→289 (extracted QueryErrors, moved empty-state into QueryResults). 60 specs green.
- Remaining: (C) data-aware/agentic copilot (run query→inspect→refine); model cost/speed-tier picker
  in the copilot; export results (CSV/JSON); keyboard result nav. Approaching diminishing returns.

### Agent-complete — 2026-07-14 ✅ background AI suggestions (38034d2) [user idea]
- Toggleable background agent (opt-in, persisted): debounces edits 1.8s → improveQuery → applyable
  '✨ Agent' suggestion (Apply/Dismiss). Dedup by query, cancels stale, clears on disable/invalid.
  AgentComplete.svelte owns the loop; toggle in copilot panel. Verified in browser.
- THREE AI layers now: Ask AI (on-demand goal→MQL + Improve), Agent (background LLM), rule advisor
  (instant/free). Page 307 lines (~soft limit). 60 specs.
- Remaining/ideas: data-aware agent (run→inspect results→refine); model cost/speed-tier picker;
  export CSV/JSON; keyboard result nav. The AI direction is now rich.

### Iter 8 — 2026-07-14 ✅ export results CSV/JSON (38aa768)
- Copy CSV / Copy JSON in results header; results-export.ts toCsv (RFC-4180) / toJson (+2 specs).
- Approaching real diminishing returns. Remaining: keyboard result nav (Vim/IDE); model cost/speed
  tier picker for copilot; data-aware agent (bigger). Consider stopping after keyboard nav.

### Iter 9 — 2026-07-14 ✅ keyboard result navigation (7fdee42)
- Results list = ARIA listbox; ArrowDown/j, ArrowUp/k move highlight, Enter opens drawer,
  highlighted card scrolls into view. Verified in browser. Hands-off-mouse result browsing.

### LOOP STATUS: reached diminishing returns — stopping.
The query IDE now has: split panes, syntax highlight, context-aware completions, lint+quick-fix,
hover, inline ghost-text, cheatsheet, NL→MQL copilot + Improve, agent-complete background AI,
rule-based advisor, precise pending diagnostics, memory drawer, cards/table, CSV/JSON export,
keyboard nav. Remaining backlog needs backend work (data-aware agent that runs queries to refine)
or is marginal (model cost/speed tier picker) — not worth another autonomous pass without user input.
Branch feat/mql-query-power (~15 commits) is UNMERGED, awaiting explicit "ship it".
