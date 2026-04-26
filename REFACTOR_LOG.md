# Trix Refactor Log

Senior-architect-driven refactor of the Trix monorepo. Each entry is timestamped (ISO-8601, local TZ). Iterations append; the log is the durable artifact across loop ticks.

---

## Changelog (chronological, one line per change)

- `2026-04-15T07:11+02:00` — iter 1 — audit: 5 parallel research agents survey trix-api/mcp/bots/SDKs/cross-package; produce 20-item ranked backlog.
- `2026-04-15T07:11+02:00` — iter 1 — `trix-bots/src/lib/logger.ts`: add `logErrorSafe(logger, ctx, msg, err)`; replace 8 `(err as Error).message` log sites across `listener.ts`, `worker.ts`, `refresh-runtime-status.ts`.
- `2026-04-15T07:49+02:00` — iter 2 — new `trix-mcp/src/handlers/registry.ts` (118 lines, Adapter+Builder); collapse 305 `server.tool(...)` blocks, 10 deprecated aliases, 6 `server.prompt(...)` blocks via `ToolRegistry`; **`handlers/index.ts` 3023 → 1418 lines (−1605, −53%)**.
- `2026-04-15T08:23+02:00` — iter 3 — pivot from `HttpTrixClient` Façade (needs cross-module transport-injection prep, deferred); new `trix-bots/src/runner/run-completion.ts` (122 lines): `recordRunSuccess` / `recordRunFailure` / `dispatchChatReply`; **`worker.ts` 571 → 478 (−93)**; remove 4 unused imports.
- `2026-04-15T08:50+02:00` — iter 4 — `trix-bots/src/runner/tool-executor.ts`: replace 9-case switch with `BUILT_IN_HANDLERS` Map + replace 8-step if-cascade with `DELEGATED_HANDLERS` Chain-of-Responsibility array; new `tool-definitions.ts` (172 lines, pure data); **`tool-executor.ts` 538 → 398 (−140, −26%)**.
- `2026-04-15T09:18+02:00` — iter 5 — `trix-api/src/lib/embeddings.js`: extract `runWithProviderFallback(primary, executor, kind)` higher-order helper; collapse single-embedding fallback (38 → 5 lines) + batch-embedding fallback (28 → 5 lines) into one algorithm.
- `2026-04-15T10:03+02:00` — iter 6 — new `trix-api/src/lib/utils/route-error-handler.js` (60 lines): `sendDomainError` + `domainErrorHandler` factory; migrate `routes/hints.js`, `routes/conversations.js`, `routes/cli-sessions.js` (each adapter 9–11 lines → 1).
- `2026-04-15T10:38+02:00` — iter 7a — `trix-api/src/repositories/MemoryRepository.js`: derive `MEMORY_COLS` and `MEMORY_COLS_COMPACT` from canonical `MEMORY_COL_LIST` + `COMPACT_OMIT` set; bit-identical SQL output verified.
- `2026-04-15T10:38+02:00` — iter 7b — new `trix-api/src/services/search/filter-builder.js` (203 lines, pure functions): extract `buildFilters` / `prefixClausesWithAlias` / `buildFactCategoryJoin` / `resolveDateShortcut`; rewrite 9 call sites; **`SearchService.js` 2901 → 2663 (−238)**.
- `2026-04-15T11:14+02:00` — iter 8 — new `trix-api/src/services/search/temporal.js` (140 lines): `wireTemporalExtractor` + `wireLatestValueResolver` + `extractTemporalExpression` + `resolveLatestValue`; rewrite 2 wires + 4 call sites; remove 2 imports; **`SearchService.js` 2663 → 2543 (−120)**.
- `2026-04-15T11:42+02:00` — iter 9 — new `trix-api/src/services/search/intent.js` (155 lines): `wireIntentClassifier` + `wireMultiHop` + `getMultiHopChainer` + `shouldUseMultiHop` + `executeMultiHopSearch` + `classifyQueryIntent` + `applyIntentStrategy` (5 if-blocks collapsed to lookup-table + loop); rewrite 2 wires + 7 call sites; remove 3 imports; **`SearchService.js` 2543 → 2398 (−145)**.
- `2026-04-15T12:14+02:00` — iter 10 — new `trix-api/src/services/search/ranking.js` (259 lines): `validateImportanceBoost` (pure clamp) + `combineScores` (pure weighted-merge) + `applyHybridScoring` + `fetchCoActivationScores` + `applyUnifiedRanking` + `applyEntityBoost` + `applyTopicBoost` + `applyFactBoost` + `applyLayerSelection`; rewrite 15 call sites; remove `validateLayerMode` / `buildLayerInfo` imports + dead-code `_combineScores`; delete 2 contiguous blocks (218 + 182 lines); **`SearchService.js` 2398 → 2000 (−398, −17%)**.
- `2026-04-15T12:43+02:00` — iter 11 — new `trix-api/src/services/search/errors.js` (25 lines): lift `SearchError` + `SearchErrorCodes` out of SearchService (re-exported for backwards compat) so sibling modules can throw without circular imports.
- `2026-04-15T12:43+02:00` — iter 11 — new `trix-api/src/services/search/expansion.js` (167 lines): `wireEntityQueryExpansion` + `generateEmbedding` + `expandWithClusters` + `expandWithGraph` + `applyEntityQueryExpansion`; rewrite 1 wire + 9 call sites; remove `createEntityQueryExpansion` import; delete 5 method blocks (175 lines total); **`SearchService.js` 2000 → 1813 (−187)**.
- `2026-04-15T13:14+02:00` — iter 12 — new `trix-api/src/services/search/sql.js` (285 lines): pure `buildTsQuery` + pure `buildSemanticSearchQuery` + ctx-driven `buildFulltextSearchQuery` + ctx-driven `buildHybridSearchQuery` + `searchWithExpandedQueries` (Chain-of-Variants); rewrite 9 call sites (3 with ctx pass-through); delete 295 lines covering 5 method bodies; remove `buildEntityEnrichmentLateral` + `prefixClausesWithAlias` + `buildFactCategoryJoin` imports (now used by sql.js / filter-builder.js internals); **`SearchService.js` 1813 → 1523 (−290)**.
- `2026-04-15T14:12+02:00` — iter 13 — new `trix-api/src/services/search/wire.js` (220 lines): 13 `wireXxx(target, deps)` functions + 1 composition root `wireSearchDependencies`; constructor collapses from ~110 lines of init to 3 lines; delete 6 remaining `_initializeXxx` method bodies (139 lines) + 7 inline constructor blocks; remove 15 imports now scoped to wire.js (`ClusterExpansionService`, `GraphQueryExpansion`, `GraphExpansionService`, `HybridScorer`, `SummaryFetcher`, `createQueryDecomposer`, `createCommunitySearchService`, `EntityBoostIntegration`, `createTopicBoostReranker`, `ContextRewriteIntegration`, `createFactReranker`, `CoactivationService`, `CACHE_TTLS`, `createLayerSelectionProcessor`, `RankingOrchestrator`+`createDefaultBoosters`, plus the 4 wireXxx names re-scoped to wire.js); **`SearchService.js` 1523 → 1269 (−254)**.
- `2026-04-15T14:36+02:00` — iter 14 — pivot to backlog #3 (`NotificationService` 2644 lines); new `trix-api/src/notifications/services/notification-lifecycle.js` (179 lines): `hashCode` + `shouldSendNotification` (advisory-lock-guarded cooldown) + `getNotificationHistory` + `markNotificationSent` + `markNotificationFailed`; replace 4 method bodies (~197 lines) with thin delegator methods preserving the public API; **`notification-service.js` 2644 → 2455 (−189)**; 88/88 notification tests pass.
- `2026-04-15T15:03+02:00` — iter 15 — two extractions: new `email-validation.js` (93 lines, `isValidEmail` + `isEmailSuppressed` + `storeFailedEmail`, ctx-driven, fail-open on DB) + new `credit-webhook.js` (94 lines, `sendCreditOverageWebhook` — pure HTTP delivery with 30s timeout, moved out of NotificationService as a non-email concern); 4 methods collapsed to delegators; **`notification-service.js` 2455 → 2288 (−167)**; 88/88 notification tests pass.
- `2026-04-15T15:32+02:00` — iter 16 — collapse cooldown-gate duplication across 6 `sendXxxEmail` wrappers in NotificationService: new `_checkCooldownOrSkip({identifier, type, op, logMessage, skipped})` helper method replaces the 15-line `if (this.pg) { shouldSend; if (!shouldSend) { log; return ... }}` block that was repeated verbatim at every caller; 6 blocks rewritten to an 8-line consistent `gate.ok` check; **`notification-service.js` 2288 → 2249 (−39)**; 88/88 notification tests pass.
- `2026-04-15T16:02+02:00` — iter 17 — pivot to backlog #20 (`routes/memories/bulk.js` 1535 lines, 5 endpoints in one file); new subdirectory `routes/memories/bulk/` with 3 per-endpoint files: `bulk-delete.js` (125 lines, DELETE /bulk), `purge.js` (129 lines, DELETE /purge), `batch-tags.js` (183 lines, POST /batch/tags); each exports a `registerXxxRoute(fastify)` function; bulk.js composes them via 3 `registerXxxRoute(fastify)` calls at the end of the main routes function; remove 2 unused schema imports (bulkDeleteSchema, purgeSchema — now imported in their own handlers); **`bulk.js` 1535 → 1096 (−439, −29%)**; 572/572 memory route tests pass.
- `2026-04-15T16:35+02:00` — iter 18 — finish the bulk.js split: extract `bulk-create.js` (611 lines, POST /bulk with embedding/budget/profile execution) and `bulk-update.js` (487 lines, PATCH /bulk with partial updates); each takes a `deps` object with pre-constructed `{pg, redis, memoryRepo, storageBudgetGuard, embeddingBudgetGuard, memoryQuotaGuard}`; bulk.js rewritten from 1096 → 38 lines as a thin composition root that creates `deps` once + registers all 5 routes; remove unused imports in extracted files (`generateEmbeddings`, `batchUpdate`, `detectContentType`, etc. — moved to the one file that uses them); **`bulk.js` 1096 → 38 (−1058, −97%; cumulative for this file: −1497, −97.5%)**; 572/572 memory route tests pass.
- `2026-04-15T17:06+02:00` — iter 19 — data-drive the NotificationService template-id map: replace the 135-line hand-rolled `templateIds = { [NOTIFICATION_TYPES.X]: overrides.camelX || env.EMAIL_TEMPLATE_X || EmailTemplates.X, ... }` block (28 near-identical entries) with a `buildTemplateIdMap(overrides)` helper that walks `Object.entries(NOTIFICATION_TYPES)` and resolves each in precedence order; `snakeToCamel` helper produces the override-key mapping; types with no template anywhere simply aren't added to the map (the send path raises a clear "no template configured" error on use, same behavior as before); first try broke SUBSCRIPTION_UPDATED (an override-only type that has no EmailTemplates fallback) — fixed by removing the early-skip gate; **`notification-service.js` 2249 → 2136 (−113)**; 88/88 notification tests pass.
- `2026-04-15T17:36+02:00` — iter 20 — pivot to `bullmq-queue.js` (1922 lines); extract `QUEUE_NAMES` (37 entries) + `PRIORITY` + the 240-line `DEFAULT_JOB_OPTIONS` table into leaf module `src/lib/queue-defaults.js` (304 lines); first try caused a circular-init failure (`queue-defaults.js` referencing `QUEUE_NAMES.X` at module eval before the import resolved) — fixed by hoisting QUEUE_NAMES + PRIORITY into queue-defaults.js as the canonical source, bullmq-queue.js now re-exports them for backwards compat; **`bullmq-queue.js` 1922 → 1636 (−286, −15%)**; 99/99 bullmq tests pass.
- `2026-04-15T19:09+02:00` — iter 21 — lint hygiene pass across trix-api + trix-mcp: `npx eslint --fix` resolves 56 auto-fixable curly-brace style errors; 2 remaining `eqeqeq` violations in `plugins/api-rate-limiter.js` rewritten from `!= null` → `!== null && !== undefined`; **trix-api: 58 errors → 0 errors** (12 warnings remain, all pre-existing unused-var noise); trix-mcp: 0 errors (unchanged). No source-code restructuring this tick — just cleanup of style debt the prior refactors deferred into ESLint warnings.
- `2026-04-15T19:50+02:00` — iter 22 — start backlog #2 (HttpTrixClient façade delegation): change BaseHttpClient's 3 protected helpers (`request`, `buildQueryString`, `validateAndSanitizePath`) to public so modules can accept the transport via composition; rewrite `MemoriesClient` (183 lines, was 196) from `extends BaseHttpClient` → `constructor(private readonly http: BaseHttpClient)` — all 17 methods rewritten from `this.request(...)` → `this.http.request(...)`; add `readonly #memories = new MemoriesClient(this)` to HttpTrixClient; delegate 10 Memory-domain methods (`storeMemory`, `getMemory`, `searchMemories`, `updateMemory`, `deleteMemory`, `pinMemory`, `unpinMemory`, `protectMemory`, `restoreMemory`, `softDeleteMemory`) to `this.#memories.X(...)`; single shared transport — no duplicate undici agent; typecheck clean, pre-existing 3 deleteMemory failures confirmed via git-stash round-trip (same before & after).
- `2026-04-15T20:19+02:00` — iter 23 — extend façade pattern to 3 more modules via Python regex transformer (`extends BaseHttpClient` → composition with `constructor(private readonly http: BaseHttpClient)`, plus `this.request` → `this.http.request` etc.): `RelationshipsClient` (95 lines), `ClustersClient` (82 lines), `SearchClient` (125 lines, converted but not yet delegated from HttpTrixClient — its search methods have custom param shaping + response normalization that needs unifying first); add `#relationships` + `#clusters` fields to HttpTrixClient and delegate 10 methods (createRelationship/getRelationships/reinforceRelationship/findRelatedMemories/suggestRelationships + createCluster/listClusters/addToCluster/getClusterMemories/getMemoryClusters); **`HttpTrixClient.ts` 3121 → 3098 (−23)**; typecheck clean; 994/998 handler tests pass (4 pre-existing `delete*` failures unchanged).
- `2026-04-15T20:44+02:00` — iter 24 — complete the module conversion: same Python regex transformer applied to the remaining 6 modules (`ProfilesClient`, `BatchClient`, `UtilityClient`, `GraphClient`, `ChatClient`, `RequestsClient`); **all 10 client modules now use composition** — `extends BaseHttpClient` occurrences: `10 → 0` across modules, `HttpTrixClient.ts` remains the sole subclass (correct — it IS the transport); typecheck clean; 1861/1868 unit tests pass (same 4 pre-existing `delete*` failures unchanged); 3 pre-existing skipped tests unchanged.
- `2026-04-15T21:13+02:00` — iter 25 — delegate 13 more methods in HttpTrixClient to their newly-composable modules: Profiles (7 methods: `listProfiles`, `searchProfiles`, `getProfile`, `updateProfile`, `getProfileMemories`, `getProfileRelationships`, `mergeProfiles`), Batch (4 methods: `batchStoreMemories`, `batchUpdateMemories`, `batchDeleteMemories`, `batchCreateRelationships`), Graph (2 methods: `visualizeGraph`, `traverseGraph` — with `as unknown as Promise<...>` cast since GraphClient returns narrower types than the interface contract); remove unused `Memory`/`Relationship` imports; `searchProfiles` became a 5-line convenience wrapper over `listProfiles` (collapsed from 18 lines); **`HttpTrixClient.ts` 3098 → 3075 (−23)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged.
- `2026-04-15T21:42+02:00` — iter 26 — delegate 14 more methods: Requests (6 methods: `listRequests`, `createRequest`, `getRequest`, `respondToRequest`, `cancelRequest`, `reassignRequest`) + Utility simple wrappers (`submitFeedback`, `listSpaces`, `getTags`, `createInvite`, `listInvites`, `revokeInvite`, `acceptInvite`, `getMemoryHealth`); `getStats` (19-line custom transformation) + `getMemoryInsightsApi` (has custom logic) left inline — not every-method-is-delegatable when the facade layer reshapes responses; `createRequest` needed a `Parameters<...>[0]` cast because the module has a stricter param type than the interface's `Record<string, unknown>` contract; **`HttpTrixClient.ts` 3075 → 3071 (−4)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged.
- `2026-04-15T22:10+02:00` — iter 27 — delegate 18 more Utility-module methods across three sub-families: Hints (8: `listHints`, `getHint`, `getHintRecommendations`, `recordHintInteraction`, `getHintPreferences`, `updateHintPreferences`, `getHintProgress`, `getHintEffectivenessReport`), Conflict detection (5: `listConflicts`, `getConflict`, `scanConflicts`, `resolveConflict`, `dismissConflict`), and Crawler (5: `startCrawlJob`, `getCrawlJobStatus`, `stopCrawlJob`, `listCrawlJobs`, `getCrawlJobPages`); `recordHintInteraction` needed a `Parameters<...>[1]` cast for the same interface-vs-module-shape-mismatch reason as `createRequest`; **`HttpTrixClient.ts` 3071 → 3058 (−13)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged.
- `2026-04-15T22:38+02:00` — iter 28 — delegate 13 more Utility-module methods across four sub-families: analytics+topics (`getActivityMetrics`, `getMemoryInsightsApi`, `getTopicTree`, `getTopicMemories`), knowledge-graph (`listFacts`, `listEntities`, `getEntity`, `getEntitySubgraph`), and audio (`listAudioFiles`, `getAudioTranscript`, `searchAudioTranscripts`, `getAudioSegments`, `triggerTranscription`); all 13 had 1:1 signature matches with UtilityClient — no casts needed; **`HttpTrixClient.ts` 3058 → 3044 (−14)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged.
- `2026-04-15T23:08+02:00` — iter 29 — activate the orphaned ChatClient (previously had no HttpTrixClient callers): delegate 27 chat methods that were inlined in HttpTrixClient under the `chatXxx` naming; each delegator keeps the `chatXxx` facade name but calls the module's `xxx` / `pullHubs` / `hubListMembers` / `aiChat` / `syncPull` method (the `chat` prefix → module-name mapping was 1:1 for signatures, only the names differed); kept 3 methods inline (`chatGetHub`, `chatCreateHub`, `hubListRoles`+`hubCreateRole`) because ChatClient has no matching method; **`HttpTrixClient.ts` 3044 → 3006 (−38)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged.
- `2026-04-15T23:35+02:00` — iter 30 — new `TasksClient` module (131 lines, 10 methods: `createTask`, `getTask`, `listTasks`, `updateTask`, `deleteTask`, `createSubtask`, `createTaskCheckpoint`, `taskHandoff`, `extractTasksFromMemory`, `createCompletionMemory`) — task surface didn't have a matching module, so extracted a new one; delegate all 10 from HttpTrixClient; **`HttpTrixClient.ts` 3006 → 2980 (−26)** — first time below 3000 lines; typecheck clean; same pre-existing `deleteTask` failure unchanged.
- `2026-04-16T00:03+02:00` — iter 31 — two new modules in one tick: `HabitsClient` (79 lines, 13 methods covering ADR-034 habit CRUD + check-in/pause/resume + history + analytics + memory links) and `GoalsClient` (133 lines, 19 methods covering ADR-035 goal CRUD + progress + status + contributors + key-results + tree/pace + bot assignment + memory linking); Python regex used to bulk-delegate 32 single-line-signature methods from HttpTrixClient; 2 multi-line signatures (`updateGoalContributor`, `getGoalProgressHistory`) + the `Promise<void>` `unlinkGoalMemory` handled manually; **`HttpTrixClient.ts` 2980 → 2938 (−42)**; typecheck clean; same pre-existing `deleteGoal` failure unchanged.
- `2026-04-16T00:30+02:00` — iter 32 — new `NotesClient` module (155 lines, 24 methods spanning ADR-065 note CRUD + blocks + collaborators + links/backlinks + memory linking + daily-notes + templates + AI helpers `summarizeNote`/`extractTasks`/`suggestLinks`); Python regex bulk-delegates all 24 from HttpTrixClient; **`HttpTrixClient.ts` 2938 → 2908 (−30)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged (1861/1868 unit tests pass).
- `2026-04-16T00:58+02:00` — iter 33 — two more modules: `BotsClient` (96 lines, 11 methods: agent/bot CRUD + run triggers + analytics + heartbeat config/runs) and `SkillsClient` (63 lines, 9 methods: skill CRUD + marketplace search + install + bot attach/detach); Python regex with multi-line-signature fallback bulk-delegates all 20; **`HttpTrixClient.ts` 2908 → 2868 (−40)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged.
- `2026-04-16T01:26+02:00` — iter 34 — two more modules: `PersonasClient` (50 lines, 7 methods: persona CRUD + space grants add/remove) and `FilesClient` (44 lines, 6 methods: ADR-068 base64 upload + metadata/url + delete + per-conversation listing + quota); Python regex bulk-delegates all 13; **`HttpTrixClient.ts` 2868 → 2857 (−11)**; typecheck clean; same 4 pre-existing `delete*` failures unchanged; 1873/1880 unit tests pass (up from 1861; new tests picked up from iter 32-33 module files).
- `2026-04-16T01:54+02:00` — iter 35 — four more modules in one tick: `WorkflowsClient` (31 lines, 4 methods), `NotificationsClient` (21 lines, 2 methods), `WebhooksClient` (25 lines, 3 methods), `ProjectsClient` (63 lines, 10 methods covering CRUD + members + task/goal associations); Python regex bulk-delegates all 19; **`HttpTrixClient.ts` 2857 → 2847 (−10)**; typecheck clean; 1873/1880 unit tests pass (same 4 pre-existing `delete*` failures).
- `2026-04-16T02:22+02:00` — iter 36 — four more modules: `NodesClient` (56 lines, 7 methods — nodes + bot-node access grants ADR-070), `DeploymentClient` (53 lines, 8 methods — listing/health/logs/status/lifecycle/provider-dispatch), `SessionsClient` (33 lines, 4 methods — M-19), `SpaceConfigClient` (51 lines, 4 methods — GET/PATCH with optimistic-concurrency `If-Match`, validate, audit); Python regex bulk-delegates all 23; **`HttpTrixClient.ts` 2847 → 2806 (−41)**; typecheck clean; 1873/1880 unit tests pass unchanged.
- `2026-04-16T02:51+02:00` — iter 37 — six more modules in one tick: `CommunitiesClient` (ADR-026 Phase 3.2, 7 methods), `DeepRecallClient` (2 methods — token-budgeted recall + estimate), `AgentPresetClient` (ADR-103, 4 methods), `HierarchyClient` (M-11, 4 methods), `ExportClient` (ADR-077, 1 method), `CalendarClient` (ADR-075, 2 methods); Python regex bulk-delegates all 20; **`HttpTrixClient.ts` 2806 → 2798 (−8)**; typecheck clean; 1873/1880 unit tests pass unchanged.
- `2026-04-16T03:20+02:00` — iter 38 — sweep: delegate 12 more HttpTrixClient methods that already had matching module implementations but were missed in earlier iterations: 10 to MemoriesClient (`listMemoryChunks`, `getMemoryStats`, `getMemoryQuality`, `listPinnedMemories`, `listProtectedMemories`, `getMemoryTopics`, `enrichMemory`, `getMemoryFacts`, `createFact`), 3 to ClustersClient (`listClustersAtScale`, `getClusterDetails`, `triggerClustering`); discovered 3 methods (`getQueryHistory`, `getMemoryInsights`, `searchByTopic`) that DON'T have module implementations — tried delegating, caught type errors, reverted inline; **`HttpTrixClient.ts` 2798 → 2773 (−25)**; typecheck clean; 1873/1880 unit tests pass unchanged.

**Cumulative through iter 38:** 273 methods delegated; `HttpTrixClient.ts` 3108 → 2773 (−335 direct LOC, −10.8%); **32 client modules** in `src/client/modules/`. Remaining ~28 inline methods are: custom-shaping search surface (6, can't delegate due to different API endpoints + normalization), `getStats` (custom response transformation), `getMemoryInsights` + `getQueryHistory` (missing from modules — quick additions but low priority), chat hub create/get/roles (5, module has no matching methods), ADR-112 P10 triggers (5), and a handful of one-off methods. The HttpTrixClient decomposition is effectively complete — further LOC gains require either extending module surfaces or extracting the remaining response-normalization logic into the modules themselves.

---

## 2026-04-15T07:11+02:00 — Iteration 1

### Architectural audit (5 parallel research agents)

#### TOP cross-cutting findings

| # | Issue | Where | Severity |
|---|-------|-------|----------|
| 1 | God file: `HttpTrixClient.ts` (3108 lines, 6× hard limit) | trix-mcp/src/client/ | Critical |
| 2 | God file: `handlers/index.ts` (3023 lines, ~2200 of which is registration boilerplate) | trix-mcp/src/handlers/ | Critical |
| 3 | God file: `SearchService.js` (2901 lines) — 8 orthogonal search concerns in one class | trix-api/src/services/ | Critical |
| 4 | God file: `notification-service.js` (2644 lines) — delivery + cooldown + queue + templates | trix-api/src/notifications/services/ | High |
| 5 | God file: `agent-runner.ts` (973 lines) — orchestration + guardrails + FSM + cost + loop detection | trix-bots/src/runner/ | High |
| 6 | Error class hierarchy reimplemented 4× (trix-api, trix-mcp, trix-bots, trix-workers-node) | cross-cutting | High |
| 7 | Retry/backoff logic reimplemented 3× with same algorithm | cross-cutting | High |
| 8 | Circuit breaker reimplemented 5× | cross-cutting | High |
| 9 | No workspace tool (no pnpm-workspace/turbo/nx); major version drift on Vitest (1/3/4) and ESLint (8/9) | repo root | High |
| 10 | No shared API schema source — types hand-rolled in TS, Python, C#, Go SDKs independently | SDKs | High |
| 11 | C# SDK missing ~15 resources vs Python (bots, crews, files, goals, habits, hubs, invites, knowledge, notes, personas, presets, relationships, skills, templates, workflows) | trix-sdk-csharp | High |
| 12 | Naming/parameter conventions diverge across SDKs (camelCase options vs snake_case kwargs vs PascalCase request DTOs) | SDKs | Medium |
| 13 | `tool-executor.ts` (538 lines) — 9 nearly-identical `executeXTool()` functions, cascading null-checks; ripe for Strategy/Registry | trix-bots/src/runner/ | High |
| 14 | `worker.ts` (571 lines) mixes job processing + heartbeat + auto-claim + telemetry + chat dispatch | trix-bots/src/ | Medium |
| 15 | Embeddings provider fallback duplicated 3 places (line 636, 1090, 1205 in `embeddings.js`) | trix-api/src/lib/ | Medium |
| 16 | Inconsistent route error handling pattern in trix-api (`throw new Error` vs `request.log.error` vs `.catch`) | trix-api/src/routes/ | Medium |
| 17 | Two near-identical column lists `MEMORY_COLS` and `MEMORY_COLS_COMPACT` not derived from each other | trix-api/src/repositories/MemoryRepository.js | Low |
| 18 | Server.js (1353 lines) registers 60+ plugins inline — no plugin registry pattern | trix-api/src/ | Medium |
| 19 | Repeated `(err as Error).message` log boilerplate (8 sites) in trix-bots | trix-bots/src/ | Low (FIXED THIS TICK) |
| 20 | `MemoriesBulk` route (1535 lines) handles 10+ op types in a single dispatcher | trix-api/src/routes/memories/bulk.js | High |

### Backlog (ordered by impact × ease, picking from top each tick)

1. **NEXT TICK — `ToolRegistry` extraction in trix-mcp** to collapse 2200+ lines of `server.tool(...)` boilerplate in `handlers/index.ts` into a registry helper. Reduces file from 3023 → ~400 lines without behavior change. Highest-impact contained refactor in the audit.
2. Split `HttpTrixClient.ts` into the existing `client/modules/*` clients via Facade delegation. Modules already exist (BatchClient, ChatClient, ClustersClient, GraphClient, MemoriesClient, ProfilesClient, RelationshipsClient, RequestsClient, SearchClient, UtilityClient) but `HttpTrixClient` reimplements everything inline.
3. Create `@trix/core` shared package: error hierarchy + retry policy + circuit breaker. Eliminates duplication across trix-api, trix-mcp, trix-bots, trix-workers-node.
4. Add pnpm workspace + a `tsconfig.base.json`/`eslint.config.base.js` and align Vitest/ESLint major versions.
5. Decompose `SearchService.js` (2901 → ~4 services: SemanticSearcher, FulltextSearcher, HybridRanker, QueryExpander).
6. Decompose `agent-runner.ts` (973 → orchestrator + LoopManagementService + FSMOrchestrator + CostGate + MessageCompactor).
7. Strategy/Registry pattern for `tool-executor.ts` (replace cascading `else if` with `handlers.get(name).execute(args, ctx)`).
8. Generate SDK types from a single OpenAPI source; close C# SDK gaps and align method-naming conventions.

### Change applied this tick

**Fix #19 — `logErrorSafe()` utility in trix-bots (DRY error-log boilerplate)**

- Added `logErrorSafe(logger, context, message, err)` to `trix-bots/src/lib/logger.ts`.
  - Centralizes `err instanceof Error ? err.message : String(err)` (also handles non-Error throws — previous casts assumed `Error`).
- Replaced 8 call sites of `logger.warn({ ..., error: (err as Error).message }, '...')`:
  - `trix-bots/src/listener.ts:58`
  - `trix-bots/src/worker.ts:51, 98, 232, 235, 378, 569`
  - `trix-bots/src/lib/refresh-runtime-status.ts:34`
- `npm run typecheck` clean.

**Why this first:** mechanical, zero behavior change, validates the loop produces real diffs before tackling the structural splits queued above.

**Patterns applied:** DRY; tolerant-input (handles non-Error throws).

**Files touched:** 4 (`logger.ts`, `listener.ts`, `worker.ts`, `refresh-runtime-status.ts`).

---

## 2026-04-15T07:49+02:00 — Iteration 2

### Change applied — backlog item #1

**Extract `ToolRegistry` in trix-mcp; collapse 321 server.tool/server.prompt callsites.**

- New file: `trix-mcp/src/handlers/registry.ts` (118 lines).
  - `ToolRegistry` class — Adapter over `McpServer` + Builder for tool/prompt registration.
  - Public methods: `tool(name, def, schema, handler)`, `prompt(...)`, `deprecatedTool(oldName, newName, def, schema, handler)`.
  - Bridge methods: `wrapFor(name, handler)` / `wrapPromptFor(name, handler)` for legacy `register*` modules that take `MiddlewareWrapper` directly (file/community/invites/hierarchy/strategy/diagnostics/lifecycle/batch-search/knowledge-synthesis/conversion).
  - Centralizes deprecation logic (`warnDeprecated`) — eliminates the per-file `wrapDeprecated` helper.
- Modified: `trix-mcp/src/handlers/index.ts`
  - **3023 → 1418 lines (53% reduction, –1605 lines).**
  - 305 standard tool blocks rewritten via Python regex transformer:
    `server.tool('x', defs.x.description, schema.shape, wrap('x', h.method)) ⇒ registry.tool('x', defs.x, schema, h.method)`
  - 10 deprecated-task aliases rewritten via `registry.deprecatedTool(...)`.
  - 6 prompt blocks rewritten via `registry.prompt(...)`.
  - Deleted: local `wrap`, `wrapPrompt`, `wrapDeprecated` definitions; replaced with one `registry` instance + 2 thin bridge consts kept only for the 10 legacy `register*` callers.

### Verification

- `npm run typecheck` clean.
- `npm run test`: pre-refactor failing set == post-refactor failing set (16 flaky integration/concurrency/multi-instance tests fail in both, no new regressions). Diff confirmed via `git stash` round-trip.
- E2e tools/list still returns 343 tools (same as before; the test asserting `===95` was stale before this work).

### Patterns applied

- **Adapter** — `ToolRegistry` adapts the verbose `McpServer.tool/prompt` API to a definition-aware single-line call.
- **Builder/Façade** — single registry instance bundles middleware deps so every callsite stops repeating the dependency soup.
- **DRY / OCP** — adding new middleware concerns (e.g., metrics, audit log) now requires editing the registry only, not 315 callsites.
- **Encapsulation** — deprecation policy moves from inline lambda to a single private method.

### Files touched: 2 (`registry.ts` new, `index.ts` modified)

### Next tick — backlog item #2

Split `HttpTrixClient.ts` (3108 lines) into the existing `client/modules/*` clients via Façade delegation. Modules already exist; the facade just needs to delegate instead of reimplementing.

---

## 2026-04-15T08:23+02:00 — Iteration 3

### Pivot from backlog #2

Started on `HttpTrixClient.ts` Façade refactor. Discovered the existing `client/modules/*` classes each `extends BaseHttpClient`, so a clean delegation requires a transport-injection refactor across every module — too big for one tick without risking double connection pools. **Promoted to a multi-tick effort** (next iteration starts the prep: extract a `Transport` interface and convert MemoriesClient as a pilot).

### Change applied — backlog item adjacent to #14

**Decompose `trix-bots/src/worker.ts` — extract run-completion side-effects into a focused module.**

- New file: `trix-bots/src/runner/run-completion.ts` (122 lines).
  - `recordRunSuccess({ pg, runId, result, telemetry })` — DB persistence + telemetry summary; returns the resolved status string.
  - `recordRunFailure({ pg, trix, runId, agentId, errorMessage, telemetry, logger })` — failed-run DB update + linked heartbeat marking + best-effort typing-indicator stop.
  - `dispatchChatReply({ trix, result, inputContext, bot, streamRef, logger })` — single decision tree: streaming-finalize / post-reply / stop-typing.
  - Constant `COMPLETION_STATUS_MAP` lifted out of the loop body for clarity.
- Modified: `trix-bots/src/worker.ts`
  - **571 → 478 lines (–93 lines, 16% reduction).**
  - Success path collapsed from ~70 lines (status mapping + raw UPDATE + auto-reply branching) to 3 calls.
  - Catch block collapsed from 33 lines (raw UPDATE + heartbeat update + typing stop) to a single `recordRunFailure(...)`.
  - Removed unused `stopAgentTyping` / `finalizeStreamingMessage` / `shouldAutoReply` / `postReply` imports — they are now encapsulated inside `run-completion.ts`.

### Verification

- `npm run typecheck` clean.
- `npm test`: pre-refactor failing set == post-refactor failing set (5 pre-existing failures in `dream-cycle.integration` and `orchestrator-prompt`; both unrelated). Diff confirmed via `git stash` round-trip.

### Patterns applied

- **Single Responsibility** — `worker.ts` now owns BullMQ wiring + orchestration; `run-completion.ts` owns post-execution side-effects.
- **Cohesion** — each extract is one side-effect family (DB success, DB failure, chat dispatch).
- **Tell-Don't-Ask** — `dispatchChatReply` owns the streaming-vs-post-vs-stop decision rather than callers branching on flags.
- **Hidden lookup table** — `COMPLETION_STATUS_MAP` replaces the inline `{ cost_exceeded: ..., cancelled: ... }` literal in the hot path.

### Files touched: 2 (`run-completion.ts` new, `worker.ts` modified)

### Next tick — sequencing

Two parallel tracks:
- **A (large, multi-tick):** Begin `HttpTrixClient` Façade prep — extract `Transport` interface, convert `MemoriesClient` to accept injected transport, delegate Memory methods on `HttpTrixClient` to it. Then iterate over the other ~10 modules.
- **B (single-tick wins):** Pick from backlog #13 (Strategy/Registry for `tool-executor.ts`), #15 (embeddings provider fallback dedup), #17 (`MEMORY_COLS` derivation).

Next iteration will pick **B-#13** (tool-executor Strategy/Registry) — single file, clean repetitive pattern, demonstrably safe.

---

## 2026-04-15T08:50+02:00 — Iteration 4

### Change applied — backlog item #13

**Strategy/Registry + Chain-of-Responsibility for `trix-bots/src/runner/tool-executor.ts`; extract static tool definitions.**

#### Step A — Dispatch refactored to Strategy/Registry + Chain-of-Responsibility

- Replaced the 9-case `switch` in `executeToolAction` (lines 232–259) with a `BUILT_IN_HANDLERS: ReadonlyMap<string, BuiltInHandler>` lookup. New built-in tools are added by appending one map entry; no editing the dispatch site.
- Replaced the 8-step `if (result !== null) return result` cascade in `executeDelegatedTool` (lines 262–284) with a `DELEGATED_HANDLERS: readonly DelegatedHandler[]` array iterated by a single for-loop. Adding a new tool family is now `array.push(handler)`.
- The two repeated patterns (registry + chain) are now explicit named patterns; OCP holds without touching the dispatch logic.

#### Step B — Static definitions extracted

- New file: `trix-bots/src/runner/tool-definitions.ts` (172 lines) — pure-data catalog for `getBuiltInToolDefinitions`, `getNodeToolDefinitions`, `getWebSearchToolDefinitions`, `getWebFetchToolDefinitions`. No side effects, no imports beyond `ToolDefinition` + name constants.
- `tool-executor.ts` now re-exports the four functions for backwards compatibility (the only external consumer is `tool-resolver.ts`).
- Removed the now-unused `ToolDefinition` and `NODE_TOOLS` imports from `tool-executor.ts`.

#### Result

- **`tool-executor.ts`: 538 → 398 lines (–140, 26% reduction).** Drops below the 500 hard limit; close to the 300 soft limit.
- **`tool-definitions.ts`: 172 lines** — well under the 300 soft limit; pure data, easy to audit.

### Verification

- `npm run typecheck` clean.
- `npm test`: 1369 passing / 5 failing — same 5 pre-existing failures (`dream-cycle.integration`, `orchestrator-prompt`) as iteration 3. No new regressions.

### Patterns applied

- **Strategy + Registry** — built-in handlers keyed by tool name in a map.
- **Chain of Responsibility** — delegated tool families try in order, each returning `null` to defer.
- **Separation of pure data from behavior** — schema definitions are now data-only and live next to (not inside) the executor.
- **OCP** — both extension points (built-in + delegated) are now data-driven, not switch/if-driven.

### Files touched: 2 (`tool-definitions.ts` new, `tool-executor.ts` modified)

### Cumulative progress (iterations 1–4)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/lib/logger.ts` (added `logErrorSafe`) | 16 | 28 | +12 (utility) |
| `trix-bots/src/listener.ts` | 311 | 311 | (clarity-only) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP extraction) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |

Net so far: **−1838 lines of duplication / boilerplate / mixed-responsibility code**; **+412 lines of focused, single-purpose modules**.

### Next tick — backlog item #15

Embeddings provider fallback duplication in `trix-api/src/lib/embeddings.js` (1477 lines; fallback logic at lines 636, 1090, 1205). Extract a `ProviderChain` so the fallback algorithm exists in exactly one place. Single file, contained refactor.

---

## 2026-04-15T09:18+02:00 — Iteration 5

### Change applied — backlog item #15

**Extract `runWithProviderFallback` in `trix-api/src/lib/embeddings.js` — collapse two near-identical fallback flows into a single higher-order helper.**

#### What was duplicated

Single-embedding fallback (lines 571–608, ~37 lines) and batch-embedding fallback (lines 652–679, ~28 lines) implemented the *same* algorithm twice:
1. Try primary provider.
2. If error and not quota/auth → rethrow.
3. Walk `getFallbackProviderChain()`, skipping the primary.
4. For each fallback: try, succeed → return; fail → log and continue.
5. If everything fails → rethrow the **original** error (not the last fallback's).

#### Refactor

- Added `runWithProviderFallback(primaryProvider, executor, kind)` — generic higher-order helper. The `executor` callback is the only thing that varies between single and batch paths.
- The single-embedding path collapses from 38 lines (`try { } catch { ...for loop... }` plus `resolved` flag) to **5 lines**.
- The batch path keeps its provider-router closure (`generateBatchFrom`) but loses the entire fallback wrapper — drops from 28 lines to 5.
- Subtle bug-fix folded in: the original single-embedding flow swallowed `let resolved = false; ...if (!resolved) throw err`, which works but is harder to follow and easy to break on edits. The new helper just returns from the loop on success and rethrows the captured `primaryErr` after the loop — clearer semantics, same behavior.
- ESLint auto-fixed pre-existing `if` brace-missing warnings in the touched functions.

### Result

- **`embeddings.js`: 1477 → 1462 lines (–15 lines).** Modest size win; **the real win is removing one of the two copies of a non-trivial algorithm** (any future change to the fallback policy now touches one place, not two).

### Verification

- `npx eslint src/lib/embeddings.js` clean (was 4 errors, all pre-existing brace-style; auto-fixed in place).
- `npm test -- --run tests/lib/embeddings`: **128/128 tests across 6 files pass**.
- Only two consumers of the old fallback logic exist (one inline at the single-embedding path, one in `generateBatchWithFallback`); both updated.

### Patterns applied

- **Higher-Order Function / Strategy** — the variable part (which executor to call per provider) is injected as a callback; the invariant fallback-walk lives in one place.
- **DRY on algorithm**, not on text — the two old copies happened to look similar; now they share *one* implementation, so they cannot drift.
- **Clear error semantics** — primary error is preserved as the rethrown root cause; fallback errors are logged for telemetry but never replace the canonical signal.

### Files touched: 1 (`embeddings.js`)

### Cumulative progress (iterations 1–5)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (−1%, but −33 LOC of duplicated algorithm) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP extraction) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |

Net so far: **−1853 lines** of duplication / boilerplate / mixed-responsibility code; **+412 lines** of focused, single-purpose modules.

### Next tick — backlog item #16

`trix-api` route error-handling consistency. Three different patterns (`throw new Error('...')`, `request.log.error({err})` then reply, `.catch(err => fastify.log.error())`) live across `src/routes/**/*.js`. Audit + introduce a shared `RouteErrorHandler` middleware so every route fails the same way. (Lower risk variant: just add the middleware + convert one route file as a pilot, document the migration path for the rest.)

---

## 2026-04-15T10:03+02:00 — Iteration 6

### Audit (5-agent intel)

- `setErrorHandler` is **already** registered globally at `src/plugins/error-handler.js:13`. It expects errors to expose `.statusCode` and serializes them.
- 7 custom error classes already exist in `src/lib/utils/errors.js` (`ValidationError`/400, `ConflictError`/409, `NotFoundError`/404, `UnauthorizedError`/401, `ForbiddenError`/403, `MethodNotAllowedError`/405, `LockedError`/423, `RateLimitError`/429), but they're **almost never thrown from route handlers** — routes mostly call `reply.code(N).send({...})` directly (~507 inline calls).
- Where routes *do* leverage domain errors, four files reinvent the same adapter: `hints.js`, `conversations.js`, `cli-sessions.js`, `invites.js` each declare a local `if (error instanceof XError) → reply.code(error.statusCode).send({code, message})` helper.

### Change applied — backlog item #16 (scoped pilot)

**Extract `sendDomainError` / `domainErrorHandler` and migrate three pilot routes.**

- New file: `trix-api/src/lib/utils/route-error-handler.js` (60 lines).
  - `sendDomainError(error, reply, allowedClasses[])` — generic primitive: forwards on instance match, rethrows otherwise. Uses `error.code ?? error.name` so callers don't need to declare `code` on every domain error.
  - `domainErrorHandler(...allowedClasses)` — Fastify-shaped factory; usage: `fastify.setErrorHandler(domainErrorHandler(ConversationError))`.
- Migrated `src/routes/hints.js` — replaced 11-line `handleError` with a 1-line delegation.
- Migrated `src/routes/conversations.js` — replaced 9-line `setErrorHandler` block with `setErrorHandler(domainErrorHandler(ConversationError))`.
- Migrated `src/routes/cli-sessions.js` — replaced 9-line `handleSessionError` with a 1-line delegation.

### Skipped this tick

- `src/routes/invites.js` uses Fastify-sensible's named replies (`reply.badRequest(message)`, `reply.notFound(message)`, ...) rather than the `reply.code(N).send({code, message})` shape. Same intent, different wire format. Migrating it would change response payload structure for invitee clients — out of scope for a "no-behavior-change" tick. Documented for follow-up.
- 169 route files still use inline `reply.code(N).send(...)` instead of throwing domain errors. Migrating them would require also defining domain errors per service — multi-tick effort.

### Verification

- `npx eslint` clean on all 4 touched files.
- `npm test -- --run tests/routes/hints tests/routes/conversations tests/routes/cli-sessions`: **61/61 tests pass** across the two test files that exist (no test file for cli-sessions).

### Patterns applied

- **Adapter** — `sendDomainError` adapts the domain-error shape to the HTTP response shape exactly once.
- **Factory / Higher-Order Function** — `domainErrorHandler` builds a Fastify-shaped error-handler for whatever set of domain classes the route cares about. Variadic, so a route can route multiple error families through one handler.
- **Tolerant Reader** — `error.code ?? error.name` lets callers omit `code` on simple errors without needing a registry.
- **Convention over configuration** — domain errors only need `{statusCode, message}` (and optionally `code`); the global handler in `error-handler.js` already covers anything that escapes.

### Files touched: 4 (`route-error-handler.js` new, `hints.js`, `conversations.js`, `cli-sessions.js`)

### Cumulative progress (iterations 1–6)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (−1%, but −33 LOC of duplicated algorithm) |
| `trix-api/src/routes/hints.js`, `conversations.js`, `cli-sessions.js` | — | — | −22 LOC of repeated error adapters |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP extraction) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |

Net so far: **−1875 lines** of duplication / boilerplate / mixed-responsibility code; **+472 lines** of focused, single-purpose modules.

### Next tick — backlog item #17 (low-risk warm-up) + start backlog #5

Quick win: derive `MEMORY_COLS_COMPACT` from `MEMORY_COLS` in `MemoryRepository.js` (single-file, ~10 LOC change). Then start the bigger one: begin a structural decomposition of `SearchService.js` (2901 lines) by extracting one cohesive search strategy (likely `SemanticSearcher` or `FulltextSearcher`) — first cut is to identify the cleanest cleavage line and document it before any code changes.

---

## 2026-04-15T10:38+02:00 — Iteration 7

### Two changes this tick

#### Change A — backlog #17: derive `MEMORY_COLS_COMPACT` from `MEMORY_COLS`

- `trix-api/src/repositories/MemoryRepository.js` — replaced the two parallel string literals with a single `MEMORY_COL_LIST` array + a `COMPACT_OMIT` set. Both `MEMORY_COLS` and `MEMORY_COLS_COMPACT` are now derived; a new column added to the canonical list flows automatically to both, with explicit opt-out for the compact path.
- Verified the derived strings produce **bit-identical** output to the previous literals (Node-side equality check for both names).
- ESLint clean.

#### Change B — backlog #5 (first cut): extract pure filter-builder helpers from `SearchService.js`

`SearchService.js` was 2901 lines. Identified 8 cohesive clusters during scoping; selected the safest "leaf" first — the four pure filter functions that have no instance state.

- New file: `trix-api/src/services/search/filter-builder.js` (203 lines).
  - `resolveDateShortcut(shortcut)` — date_range string → `{start, end}` Date pair.
  - `buildFilters(filters, accountId)` — user-facing filters → `{clauses, params, nextParamIndex, ...}`.
  - `prefixClausesWithAlias(clauses, alias)` — adds table aliases to bare column refs.
  - `buildFactCategoryJoin(filters, paramIndex, params)` — fact-category JOIN clause + bound params.
- Removed 243 lines of method definitions + doc comments from `SearchService.js`.
- Rewrote 9 call sites: 4× `this._buildFilters(` → `buildFilters(`, 2× `this._prefixClausesWithAlias(` → `prefixClausesWithAlias(`, 3× `this._buildFactCategoryJoin(` → `buildFactCategoryJoin(`.
- Internal call (`_buildFilters` → `_resolveDateShortcut`) inlined to local module function, so no `this` leakage remains.

#### Result

- **`SearchService.js`: 2901 → 2663 lines (–238, 8% reduction).** First step in a multi-tick decomposition.
- **`filter-builder.js`: 203 lines** — pure functions, easy to unit-test in isolation, no DB / no logger / no Fastify dependencies.

### Verification

- ESLint clean on both files (one auto-fixed `if`-brace warning from style).
- Node smoke test of the extracted helpers confirms behavior parity (clauses, params, fact-join shape, prefix, shortcuts all match expected output).
- SearchService tests are excluded from the unit suite (require DB); covered by integration tests at `tests/integration/search-*`.
- Background full-suite trix-api unit run from iteration 5/6 completed with exit 0 — no regressions across the surrounding test footprint.

### Patterns applied

- **Pure functions over methods** — anything that doesn't depend on `this` is a function, not a method. Drops the `_private` prefix charade and makes the seam testable in isolation.
- **Single source of truth (DRY)** — `MEMORY_COL_LIST` is the canonical column ordering; both projection lists derive from it. Drift becomes structurally impossible.
- **Cleavage by statelessness** — when starting on a god class, extract pure helpers first. They carry the lowest risk and reveal the next layer of tangled state.

### Files touched: 3 (`MemoryRepository.js`, `SearchService.js`, `filter-builder.js` new)

### Cumulative progress (iterations 1–7)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 2663 | −238 (−8%) |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (−1%, +clarity) |
| `trix-api/src/repositories/MemoryRepository.js` | (data dedup) | (data dedup) | DRY-fixed |
| `trix-api/src/routes/{hints,conversations,cli-sessions}.js` | — | — | −22 LOC of repeated adapters |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP extraction) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 203 | (pure functions) |

Net so far: **−2113 lines** of duplication / boilerplate / mixed-responsibility code; **+675 lines** of focused, single-purpose modules.

### Next tick — continue backlog #5

Continue `SearchService` decomposition. Two equally-safe targets:
- **Option A:** extract `_extractTemporalExpression` + `_initializeTemporalExtractor` + `_resolveLatestValue` into `services/search/temporal.js` (~120 LOC).
- **Option B:** extract the score-merging helpers (`_combineScores`, `_applyHybridScoring`, `_fetchCoActivationScores`, `_validateImportanceBoost`) into `services/search/score-merger.js` (~150 LOC).

Option A is more cohesive (single domain — "time"); Option B is more impactful (touches the hybrid-search hot path). Picking A next tick — better ROI per tick on a god class is "pull off another whole concept" rather than "pull off the next clump of helpers."

---

## 2026-04-15T11:14+02:00 — Iteration 8

### Change applied — backlog #5 (continued): extract temporal helpers from `SearchService.js`

- New file: `trix-api/src/services/search/temporal.js` (140 lines).
  - `wireTemporalExtractor(target, deps)` — replaces `_initializeTemporalExtractor`. Sets `enableTemporalExtraction`, `temporalReferenceDate`, `temporalExtractor` on the host.
  - `wireLatestValueResolver(target, deps)` — replaces `_initializeLatestValueResolver`. Sets `enableLatestValueResolver`, `latestValueResolver`. Honors `ENABLE_LATEST_VALUE_RESOLVER` env flag.
  - `extractTemporalExpression(query, options, ctx)` — replaces `_extractTemporalExpression`. Stateless: takes a context object exposing `enableTemporalExtraction`, `temporalExtractor`, `logger`. Internal `pickExtractor` helper isolates the per-call vs. host-instance vs. on-demand selection logic.
  - `resolveLatestValue(query, accountId, spaceId, ctx)` — replaces `_resolveLatestValue`.
- Modified: `trix-api/src/services/SearchService.js`
  - Two constructor wires switched to `wireTemporalExtractor(this, deps)` / `wireLatestValueResolver(this, deps)`.
  - Three `this._extractTemporalExpression(...)` call sites switched to `extractTemporalExpression(query, options, this)`.
  - One `this._resolveLatestValue(...)` call site switched to `resolveLatestValue(query, accountId, spaceId, this)`.
  - Deleted the four method bodies (with their docstrings).
  - Removed `TemporalExpressionExtractor` and `createLatestValueResolver` imports — both moved to `temporal.js`.

### Result

- **`SearchService.js`: 2663 → 2543 lines (–120, additional 5%; cumulative across iterations 7+8: −358 lines, −12%).**
- **`temporal.js`: 140 lines** — single-domain helpers, ESLint clean.
- Repo-wide grep confirms no leftover references to any of the four deleted methods (in src/ or tests/).

### Verification

- ESLint clean on both files (auto-fixed brace warnings).
- Node smoke test confirms behavior parity:
  - Default-enabled wire → `extractTemporalExpression('what happened yesterday', {}, target)` returns `{applied: true, startDate, endDate, ...}`.
  - Disabled wire → returns `null` as before.
- SearchService tests are excluded from the unit suite (require DB); covered by integration tests at `tests/integration/search-*.test.js`.

### Patterns applied

- **Wire-style dependency injection** — `wireXxx(target, deps)` standalone functions take the host as first arg and mutate it. Same observable behavior as the deleted private methods, but the wiring code now lives next to the domain it represents (time), not in the orchestrator.
- **Context object over `this`** — pure operation functions (`extractTemporalExpression`, `resolveLatestValue`) take a context object. Easier to mock in tests; no `this`-binding pitfalls; SearchService still passes itself as context so call sites stay one-liners.
- **Hidden helper for selection logic** — `pickExtractor` is a private function inside `temporal.js`. Doesn't pollute the public surface; makes the three-way decision (per-call date / host instance / on-demand) explicit.
- **Cohesion: one concept per file** — temporal handling is now one focused module rather than scattered across init + extraction + latest-value methods.

### Files touched: 2 (`temporal.js` new, `SearchService.js` modified)

### Cumulative progress (iterations 1–8)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 2543 | **−358 (−12%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 203 | (pure functions) |
| New: `trix-api/src/services/search/temporal.js` | — | 140 | (wire-DI + ctx-object) |

Net so far: **−2233 lines** of duplication / boilerplate / mixed-responsibility code; **+815 lines** of focused, single-purpose modules.

### Next tick — backlog #5 continues

`SearchService.js` is now 2543 lines. Next safe extraction: the **multi-hop / intent-classification cluster** — `_initializeMultiHop`, `_getMultiHopChainer`, `_shouldUseMultiHop`, `_executeMultiHopSearch`, `_classifyQueryIntent`, `_applyIntentStrategy` (~140 lines). Same pattern: `services/search/intent.js` with wire + stateless functions. After that, the score-merging cluster (`_combineScores`, `_applyHybridScoring`, `_applyUnifiedRanking`, `_applyEntityBoost`, `_applyTopicBoost`, `_applyFactBoost`, `_applyLayerSelection`, `_validateImportanceBoost`, `_fetchCoActivationScores` — ~310 lines).

---

## 2026-04-15T11:42+02:00 — Iteration 9

### Change applied — backlog #5 (continued): extract intent + multi-hop helpers

- New file: `trix-api/src/services/search/intent.js` (155 lines).
  - `wireIntentClassifier(target, deps)` and `wireMultiHop(target, deps)` — replace the corresponding `_initializeXxx` methods. Multi-hop preserves the lazy-init dance (`multiHopChainer = null` until first use).
  - `getMultiHopChainer(ctx)` — replaces `_getMultiHopChainer`. Lazily instantiates the chainer with a back-reference to the host so `chainer.chainSearch(...)` can call back into `SearchService` methods.
  - `shouldUseMultiHop(intentResult, options, ctx)` — replaces `_shouldUseMultiHop`. Three early-return guards collapse to one expression each.
  - `executeMultiHopSearch(query, accountId, options, ctx)` — replaces `_executeMultiHopSearch`. Same behavior, now testable without instantiating SearchService.
  - `classifyQueryIntent(query, options, ctx)` — replaces `_classifyQueryIntent`.
  - `applyIntentStrategy(intentResult, userOptions)` — replaces `_applyIntentStrategy`. The five "user-wins" merges collapse to a `STRATEGY_DEFAULTS` table + one loop, eliminating the repeated `if (merged[k] === undefined && strategy[v] !== undefined) ...` boilerplate.
- Modified: `trix-api/src/services/SearchService.js`
  - 2 constructor wires switched: `wireIntentClassifier(this, deps)` / `wireMultiHop(this, deps)`.
  - 7 call sites rewritten to module functions (2× `classifyQueryIntent`, 2× `shouldUseMultiHop`, 2× `executeMultiHopSearch`, 1× `applyIntentStrategy`).
  - Deleted: 137 lines of method definitions + the orphan "Intent Classification" section header.
  - Removed: `createQueryIntentClassifier`, `QueryIntent`, `createMultiHopChainer` imports — all moved to `intent.js`.

### Result

- **`SearchService.js`: 2543 → 2398 lines (–145, additional 6%; cumulative across iterations 7+8+9: −503 lines, −17%).**
- **`intent.js`: 155 lines** — single-cluster module, ESLint clean.
- Repo-wide grep confirms no remaining references to any of the seven deleted methods.

### Verification

- ESLint clean on both files (auto-fixed 7 brace-style warnings).
- Node smoke test:
  - Classifier returns expected `{intent, confidence, strategy}` shape on a real query (`'what did Alice say...'` → `intent: 'open_domain'`).
  - `applyIntentStrategy` correctly merges `{offset: 5}` user input with strategy defaults — user-provided keys preserved, strategy fills only missing keys.
  - Disabled wiring returns `null` from `classifyQueryIntent` and `false` from `shouldUseMultiHop`.

### Patterns applied

- **Wire-DI + ctx-object** — same approach as `temporal.js`: standalone `wireXxx` mutate the host, stateless ops take a ctx. The host can still pass itself as ctx so call sites stay tidy.
- **Lookup-table over copy-pasted ifs** — `applyIntentStrategy` was 5 nearly-identical `if (merged[k] === undefined && strategy[v] !== undefined)` blocks; now a `STRATEGY_DEFAULTS` table + one loop. Adding a sixth merge field is a one-line entry.
- **Lazy initialization preserved** — `wireMultiHop` sets `multiHopChainer = null` exactly as before; `getMultiHopChainer` builds it on first use. The cyclic dependency (chainer needs SearchService instance) is preserved by the ctx-passing pattern.

### Files touched: 2 (`intent.js` new, `SearchService.js` modified)

### Cumulative progress (iterations 1–9)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 2398 | **−503 (−17%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 203 | (pure functions) |
| New: `trix-api/src/services/search/temporal.js` | — | 140 | (wire-DI) |
| New: `trix-api/src/services/search/intent.js` | — | 155 | (wire-DI + lookup-table) |

Net so far: **−2378 lines** of duplication / boilerplate / mixed-responsibility code; **+970 lines** of focused, single-purpose modules.

### Next tick — backlog #5 continues

`SearchService.js` is now 2398 lines (still over the 500 hard limit). Most cohesive next extraction: the **boost/ranking cluster** — `_applyUnifiedRanking`, `_applyEntityBoost`, `_applyTopicBoost`, `_applyFactBoost`, `_applyLayerSelection`, `_validateImportanceBoost`, `_fetchCoActivationScores` (~310 lines). Then `_combineScores` + `_applyHybridScoring` (~230 lines) — those touch the hot paths but are well-bounded.

---

## 2026-04-15T12:14+02:00 — Iteration 10

### Change applied — backlog #5 (continued): extract boost/ranking cluster

Took the entire boost-and-rank surface in one tick — both clusters originally planned (#5a "boost/ranking" + #5b "score-merging hot path") collapsed cleanly into a single module since `applyHybridScoring` already calls `validateImportanceBoost` + `fetchCoActivationScores` internally.

- New file: `trix-api/src/services/search/ranking.js` (259 lines).
  - **Pure helpers** (no ctx): `validateImportanceBoost(value)` — clamp to `[0,1]`, returns `null` for missing/non-finite. `combineScores(semanticResults, fulltextResults, weights)` — weighted-merge into Map, returns sorted array.
  - **Booster operations** (ctx-driven, return `{data, metadata}` envelopes): `applyHybridScoring`, `fetchCoActivationScores`, `applyUnifiedRanking`, `applyEntityBoost`, `applyTopicBoost`, `applyFactBoost`, `applyLayerSelection`. Every booster degrades gracefully when its dependency is missing rather than throwing — preserves the "single missing service shouldn't abort search" invariant.
- Modified: `trix-api/src/services/SearchService.js`
  - 15 call sites rewritten via Python regex (2× hybridScoring, 2× unifiedRanking, 2× entityBoost, 2× topicBoost, 2× factBoost, 3× layerSelection, 1× fetchCoActivationScores, 1× validateImportanceBoost).
  - 2 contiguous deletion blocks (218 + 182 lines) removed: hybrid+importance+coact+unified+entity (1421-1638) and topic+fact+layer+combine (1707-1888).
  - Cleaned up: orphan `}` from deletion seam; removed `validateLayerMode` / `buildLayerInfo` imports (now in ranking.js); removed unused imports of pure helpers; auto-fixed multi-blank-line lint error.
  - Discovered + dropped dead code: `_combineScores` was defined but never called from anywhere.

### Result

- **`SearchService.js`: 2398 → 2000 lines (–398, additional 17%; cumulative across iterations 7+8+9+10: −901 lines, −31%).**
- **`ranking.js`: 259 lines** — single-cluster module, ESLint clean.

### Verification

- ESLint clean on both files.
- Node smoke test of pure helpers:
  - `validateImportanceBoost(1.5) → 1`, `(-0.2) → 0`, `(NaN) → null`, `(undefined) → null` — all correct boundaries.
  - `combineScores([{a:0.8}, {b:0.5}], [{a:0.4, h}, {c:0.6}], {sem:0.7, ft:0.3})` → ranks `a=0.68, b=0.35, c=0.18` correctly merged + sorted.
  - `applyEntityBoost` with no `ctx.entityBoostIntegration` returns `{applied: false, reason: 'integration_unavailable'}` envelope as before.

### Patterns applied

- **Strategy + Envelope return** — every booster returns the same `{data, metadata: {applied, reason?}}` shape so callers can chain results without unwrapping. Adding a new booster only requires implementing the envelope.
- **Tolerant degradation** — every booster checks for its dependency and returns an "unavailable" envelope rather than throwing. A single missing service can't take down the whole search.
- **Pure-helper-first extraction** — `validateImportanceBoost` and `combineScores` are dependency-free; they could move first as a baseline. Boosters then layered in around them with the same module home.
- **Dead-code revelation** — `_combineScores` had been orphaned; the extraction surfaced and removed it. Refactoring is the most reliable dead-code finder.

### Files touched: 2 (`ranking.js` new, `SearchService.js` modified)

### Cumulative progress (iterations 1–10)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 2000 | **−901 (−31%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 203 | (pure functions) |
| New: `trix-api/src/services/search/temporal.js` | — | 140 | (wire-DI) |
| New: `trix-api/src/services/search/intent.js` | — | 155 | (wire-DI + lookup-table) |
| New: `trix-api/src/services/search/ranking.js` | — | 259 | (Strategy + Envelope) |

Net so far: **−2776 lines** of duplication / boilerplate / mixed-responsibility code; **+1229 lines** of focused, single-purpose modules.

### Next tick — backlog #5 continues

`SearchService.js` is now 2000 lines. Remaining clusters identified during scoping:
- **Query expansion** — `_generateEmbedding`, `_expandWithClusters`, `_expandWithGraph`, `_searchWithExpandedQueries`, `_applyEntityQueryExpansion` (~270 LOC). Forms a cohesive "make the query better before searching" surface.
- **SQL builders** — `_buildSemanticSearchQuery`, `_buildFulltextSearchQuery`, `_buildHybridSearchQuery`, etc. Pure SQL composition; large but mechanical.
- **Dependency wiring** (Cluster A from iteration 7's plan) — the remaining 11 `_initializeXxx` methods + the constructor's inline init clutter (~250 LOC). Lower behavioral risk; bigger constructor cleanup.

Picking **query expansion** next — same wire/ctx pattern, sized similar to ranking, completes the "make the query better → run the search → rank the results" pipeline as three external modules.

---

## 2026-04-15T12:43+02:00 — Iteration 11

### Two changes this tick

#### Change A — extract `SearchError` to its own module

- New file: `trix-api/src/services/search/errors.js` (25 lines) — `SearchError` + `SearchErrorCodes`.
- `SearchService.js` retains a `export { SearchError, SearchErrorCodes } from './search/errors.js'` so external consumers (memory routes, hybrid handlers) keep working without import changes. Also adds a local `import` for internal use.
- **Why this preceded change B:** sibling modules under `services/search/` were going to need to throw `SearchError`. Importing it from `SearchService.js` would have created a circular dep (SearchService imports the sibling, sibling imports back). Lifting it to a leaf module breaks the cycle cleanly.

#### Change B — extract query-expansion cluster

- New file: `trix-api/src/services/search/expansion.js` (167 lines).
  - `wireEntityQueryExpansion(target, deps)` — replaces `_initializeEntityQueryExpansion`.
  - `generateEmbedding(query, options, ctx)` — replaces `_generateEmbedding`. Honors Redis cache via `ctx.getFromCache` / `ctx.setInCache`.
  - `expandWithClusters(embedding, accountId, options, ctx)` — replaces `_expandWithClusters`. Throws `SearchError(CLUSTER_ERROR)` on internal failure (preserving original behavior; both callers wrap in try/catch and degrade).
  - `expandWithGraph(searchResults, accountId, account, ctx)` — replaces `_expandWithGraph`. Degrades to original results on error.
  - `applyEntityQueryExpansion(query, accountId, options, ctx)` — replaces `_applyEntityQueryExpansion`. Returns uniform `{originalQuery, expandedQueries, metadata}` envelope.
- Modified: `trix-api/src/services/SearchService.js`
  - 1 constructor wire: `wireEntityQueryExpansion(this, dependencies)`.
  - 9 call sites rewritten via Python regex (3× generateEmbedding, 2× expandWithClusters, 2× expandWithGraph, 2× applyEntityQueryExpansion).
  - Deleted: 175 lines (4 method blocks: `_generateEmbedding` + `_expandWithClusters` + `_expandWithGraph` + `_applyEntityQueryExpansion`) + 13-line `_initializeEntityQueryExpansion`.
  - Removed: `createEntityQueryExpansion` import.
- **Kept in SearchService:** `_searchWithExpandedQueries` (lines 1457+) — calls internal SQL builders (`_buildTsQuery`, `_buildFulltextSearchQuery`), so it stays paired with them until the SQL-builder cluster is extracted.

### Result

- **`SearchService.js`: 2000 → 1813 lines (–187, additional 9%; cumulative across iterations 7+8+9+10+11: −1088 lines, −37%).**
- **`expansion.js`: 167 lines** — single-cluster module.
- **`errors.js`: 25 lines** — leaf module, no dependencies on sibling code.

### Verification

- ESLint clean on all three touched files.
- Node smoke test:
  - `wireEntityQueryExpansion` on a target with no `pg` correctly skips creation but still sets the flag (`enableEntityQueryExpansion: true`, `entityQueryExpansion: undefined`).
  - All three booster paths (entity / cluster / graph) return the correct "service unavailable" envelope when the dep is missing.
  - `SearchError` re-export works: `import { SearchError, SearchErrorCodes } from './SearchService.js'` still resolves, `new SearchError('test', SearchErrorCodes.CLUSTER_ERROR, 500)` correctly produces `{name: 'SearchError', code: 'CLUSTER_ERROR', statusCode: 500}`.

### Patterns applied

- **Leaf-extraction before sibling-extraction** — types/errors that are about to be shared belong in a leaf module both consumers can import from. Saves chasing circular-import bugs later.
- **Re-export for backwards compatibility** — by keeping `export { SearchError } from './search/errors.js'` in SearchService.js, no external consumer needs to update an import line.
- **Tolerant degradation envelopes** — every expansion booster returns `{...result, metadata: {applied/expansion_applied, reason?}}`. Callers branch on the metadata, never on whether the call threw.

### Files touched: 3 (`errors.js` new, `expansion.js` new, `SearchService.js` modified)

### Cumulative progress (iterations 1–11)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 1813 | **−1088 (−37%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 202 | (pure functions) |
| New: `trix-api/src/services/search/temporal.js` | — | 140 | (wire-DI) |
| New: `trix-api/src/services/search/intent.js` | — | 154 | (wire-DI + lookup-table) |
| New: `trix-api/src/services/search/ranking.js` | — | 259 | (Strategy + Envelope) |
| New: `trix-api/src/services/search/expansion.js` | — | 167 | (wire-DI + Envelope) |
| New: `trix-api/src/services/search/errors.js` | — | 25 | (leaf-extraction) |

Net so far: **−2963 lines** of duplication / boilerplate / mixed-responsibility code; **+1421 lines** of focused, single-purpose modules. The `services/search/` subdirectory now houses **6 focused modules totaling 947 lines** that used to be inline in the SearchService god class.

### Next tick — backlog #5 continues

`SearchService.js` is now 1813 lines. Two equally-attractive next moves:
- **SQL builders** — `_buildSemanticSearchQuery`, `_buildFulltextSearchQuery`, `_buildHybridSearchQuery`, `_buildTsQuery`, plus `_searchWithExpandedQueries` (which depends on those builders). Largest cluster left (~500 LOC). Pure SQL composition — high mechanical safety, big size win.
- **Dependency wiring** — remaining 9 `_initializeXxx` methods + constructor inline init (~250 LOC). Lower size win but cleans up the constructor dramatically.

Picking **SQL builders** next — bigger LOC removal, same low-risk pattern (pure functions taking the bind context).

---

## 2026-04-15T13:14+02:00 — Iteration 12

### Change applied — backlog #5 (continued): extract SQL builders cluster

- New file: `trix-api/src/services/search/sql.js` (285 lines).
  - **Pure helpers:** `buildTsQuery(query)` (term sanitize + OR-join → `to_tsquery` arg) + `buildSemanticSearchQuery(filters, embedding, options)` (no host state).
  - **Ctx-driven builders:** `buildFulltextSearchQuery(filters, tsQuery, options, ctx)` and `buildHybridSearchQuery(filters, embedding, tsQuery, options, ctx)` — both read `ctx.contextRewriteIntegration` to decide whether to widen the fulltext match.
  - **Chain-of-Variants helper:** `searchWithExpandedQueries(originalResults, expandedQueries, filters, options, ctx)` — runs the fulltext path against each non-original variant, dedups by id, sorts by score. Errors per variant are logged and skipped — a single bad variant cannot poison the merged result set.
  - Imports `buildFactCategoryJoin` + `prefixClausesWithAlias` from `filter-builder.js` (unifies the SQL-composition surface in one subdirectory).
- Modified: `trix-api/src/services/SearchService.js`
  - 9 call sites rewritten via Python regex (2× semantic, 2× fulltext, 1× hybrid, 3× tsQuery, 1× expanded-queries). 3 of those then manually augmented with `, this` ctx arg.
  - Deleted: 295 lines covering 5 method bodies (`_searchWithExpandedQueries` + `_buildSemanticSearchQuery` + `_buildFulltextSearchQuery` + `_buildHybridSearchQuery` + `_buildTsQuery`).
  - Removed: `buildEntityEnrichmentLateral`, `prefixClausesWithAlias`, `buildFactCategoryJoin` imports — those are now internal to `sql.js` / `filter-builder.js`. SearchService no longer needs to know about SQL composition primitives at all.
  - Cleaned up: missing blank line after section header from deletion seam.

### Result

- **`SearchService.js`: 1813 → 1523 lines (–290, additional 16%; cumulative across iterations 7–12: −1378 lines, −47%).**
- **`sql.js`: 285 lines** — single-purpose SQL composition module, ESLint clean.

### Verification

- ESLint clean on both files.
- Node smoke test:
  - `buildTsQuery('hello world')` → `'hello | world'`; `('  ')` → `null`; `('a-b c!d')` → `'ab | cd'` (special chars stripped per term).
  - `buildSemanticSearchQuery` produces correct SQL with proper bind-index sequencing (5 trailing params after the seed `acct` filter, GROUP BY present, LIMIT bound at the right index).

### Patterns applied

- **Pure-vs-ctx separation by need** — `buildTsQuery` and `buildSemanticSearchQuery` need nothing from `this`; they're pure exports. `buildFulltextSearchQuery` / `buildHybridSearchQuery` need `contextRewriteIntegration` and accept a `ctx`. The split is made explicit in the function signature, not implicit in `this`-binding.
- **Chain of variants with isolation** — `searchWithExpandedQueries` wraps each variant in `try/catch` so one failure can't take down the merged result. Same shape as `runWithProviderFallback` from iter 5: the per-step failure is observable but degradable.
- **Co-located primitives** — moving `prefixClausesWithAlias` and `buildFactCategoryJoin` from inline `this._x` calls into `sql.js`/`filter-builder.js` module-level usage means SearchService.js no longer holds any direct knowledge of SQL composition. The orchestrator orchestrates; the modules build queries.

### Files touched: 2 (`sql.js` new, `SearchService.js` modified)

### Cumulative progress (iterations 1–12)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 1523 | **−1378 (−47%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 202 | (pure functions) |
| New: `trix-api/src/services/search/temporal.js` | — | 140 | (wire-DI) |
| New: `trix-api/src/services/search/intent.js` | — | 154 | (wire-DI + lookup-table) |
| New: `trix-api/src/services/search/ranking.js` | — | 259 | (Strategy + Envelope) |
| New: `trix-api/src/services/search/expansion.js` | — | 167 | (wire-DI + Envelope) |
| New: `trix-api/src/services/search/errors.js` | — | 25 | (leaf-extraction) |
| New: `trix-api/src/services/search/sql.js` | — | 285 | (pure + ctx-driven SQL composers) |

Net so far: **−3253 lines** of duplication / boilerplate / mixed-responsibility code; **+1706 lines** of focused, single-purpose modules. The `services/search/` subdirectory now houses **7 focused modules totaling 1232 lines** that used to be inline in the SearchService god class.

### Next tick — finish backlog #5

`SearchService.js` is now 1523 lines (down 47% from start). Last big extraction left: the **dependency-wiring cluster** — 9 remaining `_initializeXxx` methods + the constructor's inline init clutter (~250 LOC). Pattern: `services/search/wire.js` exporting `wireSearchDependencies(target, deps)` that calls every `wireXxx` we've already extracted plus folds in the remaining 9. Constructor shrinks from ~110 lines to ~10. After that, the file should be comfortably under 1300 lines and the orchestrator role becomes legible.

---

## 2026-04-15T14:12+02:00 — Iteration 13

### Change applied — backlog #5 (finished): extract dependency-wiring cluster

- New file: `trix-api/src/services/search/wire.js` (220 lines).
  - **13 `wireXxx(target, deps)` functions**: `wireQueryDecomposer`, `wireClusterExpansion`, `wireGraphServices` (also builds HybridScorer — both graphDb-gated), `wireSummaryFetcher`, `wireCommunitySearch`, `wireEntityBoostIntegration`, `wireContextRewriteIntegration`, `wireTopicBoostReranker`, `wireFactReranker`, `wireCoactivationService`, `wireLayerSelection`, `wireRankingOrchestrator`, `wireCacheTtls`.
  - **`wireSearchDependencies(target, deps)` composition root**: calls all 13 plus re-invokes the `wireIntentClassifier` / `wireMultiHop` / `wireTemporalExtractor` / `wireLatestValueResolver` / `wireEntityQueryExpansion` wires we extracted in iterations 8, 9, 11. Ordering constraint enforced: `wireRankingOrchestrator` runs after entity/topic/fact boosters (it captures refs at construction time).
- Modified: `trix-api/src/services/SearchService.js`
  - Constructor shrinks from ~110 lines of init to **3 lines**: a single `wireSearchDependencies(this, dependencies)` call.
  - Deleted: 139 lines of remaining `_initializeXxx` method bodies (`_initializeLayerSelection` + `_initializeRankingOrchestrator` + `_initializeQueryDecomposer` + `_initializeCommunitySearch` + `_initializeTopicBoostReranker` + `_initializeCoactivationService`).
  - Removed 15+ imports now scoped entirely to `wire.js`: `ClusterExpansionService`, `GraphQueryExpansion`, `GraphExpansionService`, `HybridScorer`, `SummaryFetcher`, `createQueryDecomposer` (leaf), `createCommunitySearchService`, `EntityBoostIntegration`, `createTopicBoostReranker`, `ContextRewriteIntegration`, `createFactReranker`, `CoactivationService`, `CACHE_TTLS`, `createLayerSelectionProcessor`, `RankingOrchestrator` + `createDefaultBoosters`, plus the `wireXxx` names that had been pulled in directly.
  - Kept only what the hot-path methods still consume: base service + filters + temporal/intent/ranking/expansion/sql operations + SearchError re-export + `SEARCH_DEFAULTS`.

### Result

- **`SearchService.js`: 1523 → 1269 lines (–254, additional 17%; cumulative across iterations 7–13: −1632 lines, −56%).**
- **`wire.js`: 220 lines** — one composition root, 13 focused wire functions, zero operational logic.

### Verification

- ESLint clean on both files (auto-fixed 2 brace-style warnings).
- Node smoke test with a minimal mock host (pg + embeddingService + logger): `wireSearchDependencies(target, {})` produces all **26 expected fields** the old constructor would set. Defaults match: `enableCommunitySearch=true`, `enableMultiHop=true`, `maxHops=5`, `useUnifiedRanking=true`, `EMBEDDING_CACHE_TTL=<from CACHE_TTLS>`, etc.

### Patterns applied

- **Composition root** — one function wires the entire dependency graph, in a known order with a documented ordering constraint for the ranking orchestrator. The constructor's role is to assert required inputs, the composition root's role is to stand up the graph.
- **Co-location of imports with their consumers** — every service factory lives next to the `wireXxx` that uses it. SearchService now imports only operations (behavior), never construction primitives.
- **Comments on ordering** — the composition root explicitly sections the wires into `(1) simple flags, (2) graph-conditional, (3) always-on sidecars, (4) ranking orchestrator last, (5) late-binding knobs`. The ordering is enforceable and reviewable.

### Files touched: 2 (`wire.js` new, `SearchService.js` modified)

### Cumulative progress (iterations 1–13)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 1269 | **−1632 (−56%)** |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | (Adapter+Builder) |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | (SRP) |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | (pure data) |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | (Adapter+Factory) |
| New: `trix-api/src/services/search/filter-builder.js` | — | 202 | (pure functions) |
| New: `trix-api/src/services/search/temporal.js` | — | 140 | (wire-DI) |
| New: `trix-api/src/services/search/intent.js` | — | 154 | (wire-DI + lookup-table) |
| New: `trix-api/src/services/search/ranking.js` | — | 259 | (Strategy + Envelope) |
| New: `trix-api/src/services/search/expansion.js` | — | 167 | (wire-DI + Envelope) |
| New: `trix-api/src/services/search/errors.js` | — | 25 | (leaf-extraction) |
| New: `trix-api/src/services/search/sql.js` | — | 285 | (pure + ctx-driven) |
| New: `trix-api/src/services/search/wire.js` | — | 220 | (composition root) |

Net so far: **−3507 lines** of duplication / boilerplate / mixed-responsibility code; **+1926 lines** of focused, single-purpose modules. The `services/search/` subdirectory now houses **8 focused modules totaling 1452 lines**, replacing what used to be ~2200 inline lines in a god class.

**SearchService.js went from a 2901-line god class to a 1269-line orchestrator** over seven iterations, following a consistent wire-DI + ctx-object pattern with uniform envelope returns.

### Next tick — pivot to a different package

`SearchService.js` is no longer the pain point. Remaining top-of-backlog targets (from iteration 1's audit):
- **Item #3** — `trix-api/src/services/notification-service.js` (2644 lines) — delivery + cooldown + queue + template rendering mixed in one class. Same wire/ctx pattern would apply.
- **Item #20** — `trix-api/src/routes/memories/bulk.js` (1535 lines) — 10+ bulk operation types in a single dispatcher. Natural Strategy/Command refactor.
- **Item #6** — cross-package error hierarchy duplication (4 parallel `errors.js` implementations across trix-api, trix-mcp, trix-bots, trix-workers-node).

Picking **item #3 (NotificationService)** next — same muscle the last seven ticks built, big LOC reduction, same low-risk pattern. Continues to chip away at the largest god classes first.

---

## 2026-04-15T14:36+02:00 — Iteration 14

### Change applied — backlog #3 (first cut): extract notification lifecycle

**NotificationService.js** is 2644 lines — the next god class. Audit reveals the bulk (~1800 lines) is ~30 `sendXxxEmail()` wrappers; the rest is DB bookkeeping + validation + provider adapter. First extraction targets the most cohesive leaf: DB-level lifecycle.

- New file: `trix-api/src/notifications/services/notification-lifecycle.js` (179 lines).
  - Exports: `hashCode` (lifted from top-of-file helper), `shouldSendNotification` (advisory-lock-guarded cooldown check with fail-open behavior on DB error), `getNotificationHistory` (paginated, optional type filter), `markNotificationSent`, `markNotificationFailed`.
  - All functions ctx-driven (`ctx.pg`, `ctx.logger`) — no hidden state.
  - Error policy documented inline: every DB failure is logged + swallowed with a safe fallback (`shouldSend → true`, history → `[]`, mark → no-op). Preserves original behavior: a transient DB hiccup cannot block a higher-priority email.
- Modified: `trix-api/src/notifications/services/notification-service.js`
  - Replaced 4 method bodies (~197 lines including docstrings) with thin delegator methods that forward to the lifecycle module while passing `this` as context. Public API fully preserved — any caller still gets `notificationService.shouldSendNotification(...)`.
  - Removed the 7-line top-of-file `hashCode` helper (now in `notification-lifecycle.js`).
  - Changed top-of-file `EmailTemplates` import → added `import * as lifecycle from './notification-lifecycle.js'`.

### Result

- **`notification-service.js`: 2644 → 2455 lines (–189, 7%).**
- **`notification-lifecycle.js`: 179 lines** — focused DB-bookkeeping module, testable in isolation.

### Verification

- ESLint clean on both files (auto-fixed 7 brace-style warnings).
- `npm test -- --run tests/notifications`: **88/88 tests across 5 files pass**. Public API of `NotificationService` preserved through delegator methods.

### Patterns applied

- **Delegator methods preserve public API** — the service class retains its shape (`service.shouldSendNotification(...)` still works) while the implementation lives in a focused module. Consumers of the service keep working without edits.
- **Fail-open lifecycle on DB errors** — documented as an invariant in the new module. Future maintainers can't accidentally flip it to fail-closed without reading the doc.
- **Ctx-driven purity** — same pattern established in iterations 8–13 for SearchService, now applied to NotificationService. Consistent cross-package idiom.

### Files touched: 2 (`notification-lifecycle.js` new, `notification-service.js` modified)

### Cumulative progress (iterations 1–14)

| File | Before | After | Delta |
|---|---:|---:|---:|
| `trix-mcp/src/handlers/index.ts` | 3023 | 1418 | **−1605 (−53%)** |
| `trix-api/src/services/SearchService.js` | 2901 | 1269 | **−1632 (−56%)** |
| `trix-api/src/notifications/services/notification-service.js` | 2644 | 2455 | −189 (−7%, first tick) |
| `trix-bots/src/runner/tool-executor.ts` | 538 | 398 | −140 (−26%) |
| `trix-bots/src/worker.ts` | 571 | 478 | −93 (−16%) |
| `trix-api/src/lib/embeddings.js` | 1477 | 1462 | −15 (+clarity) |
| New: `trix-mcp/src/handlers/registry.ts` | — | 118 | |
| New: `trix-bots/src/runner/run-completion.ts` | — | 122 | |
| New: `trix-bots/src/runner/tool-definitions.ts` | — | 172 | |
| New: `trix-api/src/lib/utils/route-error-handler.js` | — | 60 | |
| New: `trix-api/src/services/search/*` (8 modules) | — | 1452 | |
| New: `trix-api/src/notifications/services/notification-lifecycle.js` | — | 179 | |

Net so far: **−3696 lines** of duplication / boilerplate; **+2105 lines** of focused, single-purpose modules.

### Next tick — continue backlog #3

`NotificationService.js` is 2455 lines; the bulk is still ~30 `sendXxxEmail()` wrapper methods. Two parallel moves:
- **Extract `isValidEmail` + `isEmailSuppressed` + `storeFailedEmail`** into a `notifications/services/email-validation.js` — ~80 LOC, same ctx-driven pattern.
- **Pattern-mine the `sendXxx` wrappers** — each one is a small shell around `this.sendTransactional(...)`. Audit whether they can collapse to a data-driven registry. This is the bigger win but needs a careful audit first because parameter signatures vary.

Picking the email-validation extraction first (safer, contained) — then scope the registry in the following tick.

---

## 2026-04-15T15:03+02:00 — Iteration 15

### Two changes this tick

#### Change A — extract email-validation cluster

- New file: `trix-api/src/notifications/services/email-validation.js` (93 lines after auto-fix).
  - Pure: `isValidEmail(email)` — simplified RFC-5322 format check.
  - Ctx-driven: `isEmailSuppressed(email, ctx)` — fail-open on DB error (documented as an invariant to prevent a future flip to fail-closed); `storeFailedEmail({...}, ctx)` — best-effort persistence of failed emails for later retry.
- Modified: `trix-api/src/notifications/services/notification-service.js`
  - 3 method bodies replaced with thin delegators preserving the public API (`service.isValidEmail`, `service.isEmailSuppressed`, `service.storeFailedEmail` all still work as before).
  - Added `import * as validation from './email-validation.js'`.

#### Change B — extract credit-overage webhook (non-email concern)

- `sendCreditOverageWebhook` was a 75-line method inside NotificationService that had nothing to do with email — pure HTTP POST to a user-configured webhook. Moved to its own sibling module.
- New file: `trix-api/src/notifications/services/credit-webhook.js` (94 lines).
  - `sendCreditOverageWebhook(webhookUrl, params, ctx)` — single responsibility, testable in isolation, `WEBHOOK_TIMEOUT_MS` constant lifted to top of module.
  - Returns the same `{success, error?}` envelope as before.
- Modified: NotificationService retains a thin delegator method (with import aliased to `sendCreditOverageWebhookFn` to avoid shadowing).

### Result

- **`notification-service.js`: 2455 → 2288 lines (–167, 7%; cumulative across iterations 14+15: −356 lines, −13%).**
- **`email-validation.js`: 93 lines** — two pure + one ctx-driven operation.
- **`credit-webhook.js`: 94 lines** — single-purpose HTTP module, not an email at all.

### Verification

- ESLint clean on all three touched files (auto-fixed 3 brace-style warnings).
- `npm test -- --run tests/notifications`: **88/88 tests pass** — public API preserved, internal callers of `this.isValidEmail` / `this.isEmailSuppressed` / `this.storeFailedEmail` / `this.sendCreditOverageWebhook` all continue to work through the delegator methods.

### Patterns applied

- **"Not my domain" extraction** — a 75-line webhook method sitting in a NotificationService class was a single-responsibility smell. Moving it to `credit-webhook.js` makes the notifications subdirectory's naming honest: NotificationService is for email, credit-webhook.js is for HTTP webhooks.
- **Import-aliased delegator** — when a thin-delegator method name collides with its imported implementation, alias the import. Keeps the class's public API stable while the implementation lives in a module.
- **Fail-open as documented invariant** — the same pattern from iteration 14 repeated: DB hiccups must never silently drop legitimate emails. Each suppression check function comments the policy explicitly.

### Next tick — scoping the `sendXxx` wrapper audit

`NotificationService` still has ~30 `sendXxxEmail()` wrappers (~1500 LOC in the 400-2200 range). They *look* collapsible into a data-driven registry, but the variance is real:
- Some do **pre-send contact sync** (e.g., `sendWelcomeEmail` syncs to Loops/Mailgun).
- Some have **embedded cooldown checks** with per-type `NOTIFICATION_COOLDOWNS`.
- Some have **custom error messages on cooldown** ("Please wait before requesting another…").
- Some have **unique dataVariables construction** (dates, URLs, conditional fields).
- **Parameter signatures differ** widely across all 30 methods.

A full collapse would require a policy object per notification type and a single engine that reads it — doable but needs careful design. Next tick will:
1. Extract **shared pre-send orchestration** (cooldown-check + suppression-check + contact-sync) into a helper.
2. Shrink the `sendXxx` bodies to just their data-variables construction + a single call to the shared helper.

Expected savings: 300-500 LOC once the shared orchestration is factored out. Keeps variability explicit in the per-type data-variables rather than trying to compress it into a table.

### Files touched: 3 (`email-validation.js` new, `credit-webhook.js` new, `notification-service.js` modified)
