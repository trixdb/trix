# Agent QA Findings

**Date:** 2026-03-13
**Tester:** Claude (automated via Playwright)
**Environment:** Local dev (localhost:5173) → Prod API (api.trixdb.com)
**Account:** robert@zivrio.com

---

## Summary

| Category | Pass | Fail | Not Implemented |
|----------|------|------|-----------------|
| Agent List & Filters | 4 | 0 | 0 |
| Agent Detail Page | 3 | 5 | 1 |
| Agent Actions | 2 | 3 | 0 |
| Chat — @Mention | 3 | 2 | 0 |
| Chat — DM | 2 | 2 | 0 |
| Chat — Features | 1 | 2 | 0 |
| Memory & Knowledge | 1 | 4 | 1 |
| Toolbox — Pipelines | 1 | 1 | 0 |
| Toolbox — Other | 4 | 0 | 0 |
| Sync / API | 0 | 2 | 0 |
| **Total** | **21** | **21** | **2** |

---

## Round 1 Bugs

### B1: Trixie Runs tab — 404 "Agent not found" (HIGH)

- **Where:** Agent detail → Runs tab for built-in Trixie agent
- **Error:** `GET /v1/agents/00000000-0000-4000-a000-000000000001/runs` → 404
- **Cause:** The `/v1/agents/:id/runs` endpoint (likely `agent-runs.js`) does not resolve built-in agents via `resolveBuiltinAgent()`. It only looks up the persona/bot table.
- **Impact:** Cannot view any run history for Trixie.
- **Screenshot:** `screenshots/qa-trixie-runs-404.png`

### B2: Nodes tab — 500 "relation node_grants does not exist" (HIGH)

- **Where:** Agent detail → Nodes tab (any agent)
- **Error:** `GET /v1/bots/00000000-0000-4000-a000-000000000001/nodes` → 500
- **Cause:** The `node_grants` table migration has not been applied to the production database.
- **Impact:** Nodes tab is completely broken. Error toast persists and bleeds into other tabs.
- **Screenshot:** `screenshots/qa-trixie-tab-nodes.png`

### B3: Settings tab — 404 on heartbeat endpoints (MEDIUM)

- **Where:** Agent detail → Settings tab for built-in Trixie agent
- **Error:** `GET /v1/personas/.../heartbeat/config` → 404, `GET /v1/personas/.../heartbeat/runs` → 404
- **Cause:** Heartbeat config/runs endpoints don't resolve built-in agents.
- **Impact:** Heartbeat toggle may not work for Trixie. Settings tab still renders but heartbeat data is missing.
- **Screenshot:** `screenshots/qa-trixie-tab-settings.png`

### B4: Duplicate Agent — 500 Internal Server Error (HIGH)

- **Where:** Agent detail → Duplicate button (tested on Bobbi)
- **Error:** `POST /v1/personas/6c7572b2-.../duplicate` → 500
- **Cause:** Server-side error in the duplicate endpoint. Possibly missing column or constraint violation.
- **Impact:** Cannot duplicate any agent.
- **Screenshot:** `screenshots/qa-bobbi-duplicated.png`

### B5: Conversation members sync — 403 Forbidden (MEDIUM)

- **Where:** Creating or joining a conversation (channel or DM)
- **Error:** `POST /v1/sync/conversationMembers/push` → 403 (3 retries, all fail)
- **Cause:** The sync push endpoint rejects the membership data. Possibly a permission/auth issue on the server.
- **Impact:** Members list shows "Members (0)" in conversation info panel, even though the header says "1 member". Member data is not synced to server.
- **Screenshot:** `screenshots/qa-chat-info-panel.png`

### B6: Channel info panel shows "0 members, 0 online" (MEDIUM)

- **Where:** Conversation info panel for any channel
- **Detail:** Header shows "1 member" but the info panel shows "Members (0)" and "0 members, 0 online"
- **Cause:** Related to B5 — member sync failure means the server has no member records.
- **Screenshot:** `screenshots/qa-chat-info-panel.png`

### B7: Bobbi @mention returns empty response (HIGH)

- **Where:** Channel chat → `@Bobbi what can you do?`
- **Detail:** Bobbi's message bubble appears with name and timestamp but **no content**. No token count shown. No error in console. HTTP request returns 200.
- **Cause:** SSE stream likely returned `done` event with no preceding `token` events. May be related to the "Trix Flash" model routing or agent's system prompt being too minimal.
- **Impact:** Custom agents with specific model configs may silently produce empty responses.
- **Screenshot:** `screenshots/qa-chat-bobbi-response.png`

### B8: Run Now — no visible feedback or execution tracking (MEDIUM)

- **Where:** Agent detail → Run Now button (tested on Bobbi)
- **Detail:** Clicking "Run Now" produces no console errors, no toast, no navigation, and no UI feedback. Executions count stays at 0, "Last Active" stays "Never".
- **Cause:** Either the run endpoint doesn't exist, silently fails, or the UI doesn't poll/update after triggering.
- **Impact:** Users have no way to manually trigger an agent run with feedback.
- **Screenshot:** `screenshots/qa-bobbi-run-now.png`

### B9: Error toast persists across tabs (LOW)

- **Where:** Agent detail page after visiting Nodes tab
- **Detail:** The `relation "node_grants" does not exist` error toast remains visible when navigating to Access and Settings tabs.
- **Cause:** Toast is not dismissed when switching tabs.
- **Screenshot:** `screenshots/qa-trixie-tab-access.png`

### B10: Bobbi "Created" date shows future date (LOW)

- **Where:** Agent detail → Overview for Bobbi
- **Detail:** Shows "Created 10/03/2026" — which in MM/DD format means October 3, 2026 (7 months in the future). If DD/MM format was intended, it should show "March 10" or use an unambiguous format.
- **Cause:** Date formatting ambiguity — no locale-aware formatting.
- **Screenshot:** `screenshots/qa-bobbi-detail.png`

---

## Round 2 Bugs

### B11: TestBot shows "Unknown" model (MEDIUM)

- **Where:** Agent detail → Overview for TestBot
- **Detail:** Model field displays "Unknown" instead of the configured model name.
- **Cause:** The model ID stored for TestBot doesn't match any known model in the frontend's model list.
- **Impact:** Users can't tell what model their agent is using.
- **Screenshot:** `screenshots/qa-testbot-detail.png`

### B12: Custom agents (DevOps Agent, TestBot) never respond in DMs (HIGH)

- **Where:** DM conversations with DevOps Agent and TestBot
- **Detail:** Messages sent to both agents produced zero response — no message bubble, no error, no loading indicator. Console shows no AI-related errors. Waited 12+ seconds for each.
- **Tested:** DevOps Agent ("Run a health check on all daemon nodes"), TestBot ("Write a Python function to check if a number is prime")
- **Cause:** DM-based agent invocation may not be wired up for custom agents, or the model routing for non-default models (Trix Advanced, unknown model) silently fails.
- **Impact:** Custom agents are completely non-functional in DMs. Only Trixie (built-in, default model) works.
- **Screenshot:** `screenshots/qa-devops-dm-response.png`, `screenshots/qa-testbot-response.png`

### B13: Trixie memory not persisted — cannot recall within same conversation (HIGH)

- **Where:** #test-channel chat with @Trixie
- **Detail:** Asked Trixie to "remember that my favorite programming language is Rust". She responded "Okay, I'll remember that." Two messages later, asked "what is my favorite programming language?" and she responded "I don't have access to your personal preferences or past conversations."
- **Cause:** Trixie's "remember" response is purely conversational — no actual memory is stored via the Trix API. The memory_strategy is set to "search" but no memory write happens on chat.
- **Impact:** Trixie claims to remember things but actually doesn't. Breaks user trust.
- **Screenshot:** `screenshots/qa-trixie-memory-test.png`, `screenshots/qa-trixie-recall.png`

### B14: Memory panel — all API endpoints fail (MEDIUM)

- **Where:** #test-channel → Toggle memory panel
- **Detail:** Memory panel renders with 6 tabs (Relevant, Pinned, Search, Entities, Tasks, Conflicts) but underlying API calls all fail:
  - `GET /v1/memories?...` → 400 (Bad Request)
  - `GET /v1/search/semantic` → 404 (Not Found)
  - `GET /v1/entities?...` → 404 (Not Found)
  - `GET /v1/tasks?...` → 403 (Forbidden)
- **Cause:** Memory, semantic search, and entity endpoints either don't exist or reject the request format.
- **Impact:** Memory panel tabs show empty states ("No relevant memories", "No entities extracted yet", etc.) — none of the knowledge features work.
- **Screenshot:** `screenshots/qa-memory-panel.png`

### B15: AI Summary fails — 400 Bad Request (MEDIUM)

- **Where:** #test-channel → AI Summary button
- **Detail:** Shows "Generating summary..." then "Failed to generate summary."
- **Error:** `POST /v1/memories/summarize` → 400 (Bad Request)
- **Cause:** The summarize endpoint rejects the request — possibly missing required fields or the endpoint expects different input format.
- **Impact:** AI Summary feature is non-functional.
- **Screenshot:** `screenshots/qa-ai-summary.png`

### B16: Pipeline run — no feedback, "Never run" unchanged (MEDIUM)

- **Where:** Toolbox → Pipelines → "Diagnose & Report" → Run
- **Detail:** Run dialog appears with optional input field. After clicking "Run Pipeline" with input "Check all nodes and report status", dialog closes but the pipeline still shows "Never run". No toast, no error, no status change.
- **Cause:** Pipeline execution either silently fails or the UI doesn't refresh after triggering.
- **Impact:** Users get no confirmation that their pipeline ran or failed.
- **Screenshot:** `screenshots/qa-pipeline-run.png`, `screenshots/qa-pipeline-running.png`

### B17: Hub projects API — 500 Internal Server Error (LOW)

- **Where:** Hub view (Meh hub)
- **Error:** `GET /v1/projects/hubs/9c3c52ba-...` → 500
- **Cause:** Server-side error in the hub projects endpoint.
- **Impact:** Hub project data is not loaded; may affect hub-level features.

### B18: `/app/chat` route returns 404 (LOW)

- **Where:** Direct navigation to `http://localhost:5173/app/chat`
- **Detail:** Returns "Page not found" — SvelteKitError. Must use sidebar Chat button instead.
- **Cause:** Route `/app/chat` (without conversation ID) is not defined.
- **Impact:** Bookmarking or directly navigating to chat fails. Minor — sidebar navigation works.

---

## Passing Tests

| # | Test | Result |
|---|------|--------|
| P1 | Agent list loads with correct count (7 agents) | PASS |
| P2 | Active filter shows 6 agents, hides Draft | PASS |
| P3 | Draft filter shows 1 agent | PASS |
| P4 | Search filters agents by name ("DevOps") | PASS |
| P5 | Trixie detail — Overview tab (Configuration, Activity) | PASS |
| P6 | Trixie detail — Tasks tab ("No active tasks") | PASS |
| P7 | Trixie detail — History tab ("No history yet") | PASS |
| P8 | Edit Agent modal — all fields render (Name, Purpose, System Prompt, Model, Goals, Memory Strategy, Skills, MCP Tools) | PASS |
| P9 | Create Agent modal — renders with all fields + "Use Trixie as template" | PASS |
| P10 | Pause/Activate toggle works (tested on Bobbi) | PASS |
| P11 | @Trixie mention in channel → response received ("Hi there!") | PASS |
| P12 | @Trixie follow-up in channel → correct response ("2 + 2 = 4") | PASS |
| P13 | DM with Trixie → response received (fun fact, 115 tokens) | PASS |
| P14 | Regenerate response → old message deleted, new response generated | PASS |
| P15 | @Trixie "remember" request → conversational acknowledgment (91 tokens) | PASS |
| P16 | Memory panel UI — all 6 tabs render (Relevant, Pinned, Search, Entities, Tasks, Conflicts) | PASS |
| P17 | Triggers page — shows trigger with filters (All/Webhook/Cron/Connection Sync/MCP/Daemon) | PASS |
| P18 | Webhooks page — shows 2 webhooks | PASS |
| P19 | Connections page — shows providers (Google, Microsoft, Apple, Notion, GitHub, Railway, n8n, Zapier) | PASS |
| P20 | Activity feed — shows 20+ daemon events (shell:df, shell:echo) with timestamps | PASS |
| P21 | Pipelines page — shows 2 pipelines with run/edit/delete actions and run dialog | PASS |

---

## Not Implemented / Empty State

| # | Feature | Status |
|---|---------|--------|
| N1 | Agent Marketplace — renders but empty ("Marketplace is empty") | Not populated |
| N2 | Trixie has 0 executions, "Last Active: Never" despite working in chat | Execution tracking not connected to chat invocations |
| N3 | Agent Access tab — "No hub selected" message, no way to assign hub | Needs hub integration |
| N4 | MCP server "Fetch" from smithery.ai — status shows "Error" | MCP server not connected/configured |

---

## Fix Status

| Bug | Status | Commit |
|-----|--------|--------|
| B1 | FIXED | `8e66ecb` (trix-api) — resolveBuiltinAgent in agent-runs |
| B2 | OPS — needs `npm run migrate:up` on prod | Migration exists (20260511000000) |
| B3 | FIXED | `40dc113` (trix-api) — resolveBuiltinAgent in heartbeat |
| B4 | FIXED | `df5336e` (trix-api) — guard JSON fields + skill_ids in duplicate |
| B5/B6 | FIXED | `3d17724` (trix-api) — allow initial conversationMembers push |
| B7/B12 | FIXED | `a9834cb` (trix-app) — agent store race condition + ensureReady |
| B8 | FIXED | `e38aac1` (trix-app) — refresh run history after Run Now |
| B9 | FIXED | `5ffed90` (trix-app) — dismissAll toasts on tab switch |
| B10 | FIXED | `c91af7a` (trix-app) — unambiguous date format |
| B11 | FIXED | `4118255` (trix-app) — hide "Unknown" model label |
| B13 | DEFERRED | Server saves memories with space_id=NULL for DMs; needs architectural decision on DM memory visibility |
| B14 | FIXED | `1b50264` (trix-app) — correct TrixClient API paths |
| B15 | FIXED | `f66d306` (trix-api) — accept space_id in summarize endpoint |
| B16 | PARTIAL | `71e531a` (trix-app) — show execution ID + refresh list; full pipeline execution backend not implemented |
| B17 | FIXED | `b18d60b` (trix-api) — fix migration timestamp + account_id filter |
| B18 | FIXED | `b358024` (trix-app) — /app/chat redirect route |

### Remaining Items
- **B2:** Apply `node_grants` migration to prod (`npm run migrate:up`)
- **B13:** DM memory visibility — memories are saved server-side but with NULL space_id, invisible in space-filtered UI. Needs design decision.
- **B16:** Pipeline execution backend — API creates execution record but never runs pipeline steps. Needs background worker implementation.
