# Unfinished Features Tracker

> Last updated: 2026-01-23 (17 [XS] + 32 [S] items fixed)

## Progress Overview

```
Overall Progress: [███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 17% (93/556 items)

By Component:
├── trix-api        [███████████░░░░░░░░░] 57%  (17/30)
├── trix-cli-go     [████████░░░░░░░░░░░░] 37%  (11/30)
├── trix-mcp        [██████░░░░░░░░░░░░░░] 30%  (3/10)
├── SDKs            [██████████░░░░░░░░░░] 50%  (2/4)
├── trix-research   [████░░░░░░░░░░░░░░░░] 20%  (41/129)
├── Tests           [░░░░░░░░░░░░░░░░░░░░]  0%  (0/180)
├── Migrations      [░░░░░░░░░░░░░░░░░░░░]  0%  (0/6)
├── Deprecated      [█████████████░░░░░░░] 67%  (10/15)
├── Security        [██░░░░░░░░░░░░░░░░░░]  8%  (1/13)
├── Configuration   [████░░░░░░░░░░░░░░░░] 17%  (9/52)
├── Documentation   [████░░░░░░░░░░░░░░░░] 20%  (2/10)
├── Error Handling  [████████░░░░░░░░░░░░] 40%  (4/10)
├── Accessibility   [████████░░░░░░░░░░░░] 43%  (6/14)
└── Integrations    [██░░░░░░░░░░░░░░░░░░]  8%  (1/13)

Estimated Total Effort: ~133 developer-days (3 days completed)
```

### Effort Legend

| Tag | Time | Description |
|-----|------|-------------|
| `[XS]` | < 1 hour | Trivial change, config tweak, small fix |
| `[S]` | 1-4 hours | Simple feature, single file change |
| `[M]` | 4-8 hours | Moderate complexity, multiple files |
| `[L]` | 1-3 days | Significant feature, testing required |
| `[XL]` | 3-5 days | Major feature, cross-cutting concerns |
| `[XXL]` | 1-2 weeks | Epic-level work, architectural changes |

---

## Table of Contents

1. [trix-api (Backend)](#trix-api-backend)
2. [trix-cli-go (CLI)](#trix-cli-go-cli)
3. [trix-mcp (MCP Server)](#trix-mcp-mcp-server)
4. [SDKs](#sdks)
5. [trix-research (Documentation & Research)](#trix-research-documentation--research)
6. [Test Coverage Gaps](#test-coverage-gaps)
7. [Blocked Migrations & Schema Work](#blocked-migrations--schema-work)
8. [Deprecated & Legacy Code](#deprecated--legacy-code)
9. [Security Issues](#security-issues)
10. [Configuration & Setup Gaps](#configuration--setup-gaps)
11. [Documentation Gaps](#documentation-gaps) *(NEW)*
12. [Error Handling Gaps](#error-handling-gaps) *(NEW)*
13. [Accessibility & UX Gaps](#accessibility--ux-gaps) *(NEW)*
14. [Integration & Webhook Gaps](#integration--webhook-gaps) *(NEW)*

---

## trix-api (Backend)

### Critical Priority

- [ ] `[L]` **Transcription soft delete refactoring** - Migration done, code changes pending
  - File: `src/jobs/transcription-job.js` (lines 239-249)
  - Replace DELETE with UPDATE for soft delete
  - Add version increment logic
  - Create SegmentRepository class
  - Add cleanup job for old deleted data

- [ ] `[M]` **Credit alert notifications** - Trigger not implemented
  - File: `src/billing/middleware/credit-guard.js` (line 73)
  - Low credit detection works but doesn't send notifications

### High Priority

- [ ] `[XL]` **Community Summarization (Phase 2)** - Not started
  - File: `src/jobs/summarization-job.js` (lines 90-107)
  - Job registration commented out
  - Hierarchical community summaries across clusters

- [ ] `[XXL]` **Visual Search (CLIP-based)** - Feature flagged, incomplete
  - Flag: `ENABLE_VISUAL_SEARCH` in `src/lib/features/feature-flags.js`
  - Image similarity search not implemented
  - Requires SigLIP infrastructure

- [ ] `[XL]` **Advanced Retrieval (CRAG)** - Feature flagged, incomplete
  - Flag: `ENABLE_ADVANCED_RETRIEVAL`
  - Query expansion, reranking, CRAG validation pending

- [ ] `[L]` **Graph Expansion** - Feature flagged, incomplete
  - Flag: `ENABLE_GRAPH_EXPANSION`
  - Graph-based query expansion not implemented

### Medium Priority

- [ ] `[M]` **Auto Fact Extraction** - Partial implementation
  - Flag: `ENABLE_AUTO_FACT_EXTRACTION`
  - Used in `src/routes/memories/handlers/content-handlers.js`
  - Used in `src/lib/ingestion/ingestion-service.js`

- [ ] `[S]` **Batch resource fetching** - TODO in code
  - File: `src/services/MemoryService.js` (line 442)
  - Implement when ResourceService is integrated

- [ ] `[M]` **Session consolidation job** - TODO in code
  - File: `src/services/SessionService.js` (lines 456-457)
  - Trigger consolidation and apply retention policy

- [x] `[S]` **Session space filtering** - ✅ FIXED 2026-01-23
  - File: `src/services/SessionService.js` (line 288)
  - Added `_getAccessibleSpaceIds()` helper and space filtering in `listSessions()`

- [x] `[S]` **CLI session space permission check** - ✅ FIXED 2026-01-23
  - File: `src/routes/cli-sessions.js` (line 102)
  - Added space permission validation when creating sessions with space_id

### Low Priority

- [ ] `[L]` **Async backup processing** - TODO in code
  - File: `src/routes/admin/backups.js` (line 70)
  - Implement via BullMQ when backup workers available

- [x] `[XS]` **Guide view analytics storage** - ✅ FIXED 2026-01-23
  - File: `src/routes/changelog-guides.js` (line 51)
  - Store in analytics database instead of console.log
  - Commit: `6394312` - Added hashIP() helper and guide_views migration

- [ ] `[S]` **Email template IDs** - Placeholder values
  - File: `src/notifications/services/email-service.js` (lines 127-145)
  - Replace placeholder IDs with actual Loops transactional IDs

- [ ] `[XL]` **Apple Calendar webhooks** - Not supported
  - File: `src/integrations/providers/apple/index.js`
  - CalDAV polling only (15-minute intervals)
  - Requires Apple push notification service integration

- [ ] `[L]` **Google Calendar webhooks** - Not implemented
  - File: `src/integrations/providers/google/services/calendar-service.js`
  - Polling only, no webhook support

---

## trix-cli-go (CLI)

### Critical Priority

- [ ] `[M]` **MCP connection testing in setup** - Skipped
  - File: `cmd/setup_claude_code.go` (line 144)
  - TODO: "Test MCP connection here"

- [ ] `[M]` **MCP connection testing in tests** - Skipped
  - File: `cmd/test_claude_code.go` (line 144)
  - Shows "SKIPPED (needs MCP client)"

- [ ] `[XL]` **Semantic contradiction detection** - Stub implementation
  - File: `cmd/contradictions.go` (lines 143-181)
  - Returns empty results, needs LLM-powered analysis

### High Priority

- [ ] `[L]` **Relationship health analytics** - Returns hardcoded data
  - File: `internal/api/analytics.go` (lines 600-627)
  - TotalRelationships, OrphanMemories, etc. all return 0
  - HealthScore hardcoded to 0.75
  - Requires new API endpoint

- [ ] `[M]` **Memory insights cluster membership** - Missing data
  - File: `internal/api/analytics.go` (line 336)
  - Returns empty ClusterMembership struct

- [ ] `[S]` **Memory insights recent access** - Missing data
  - File: `internal/api/analytics.go` (line 323)
  - RecentAccesses hardcoded to 0

### Sprint 3: Code Quality & Architecture

- [ ] `[L]` Refactor billing.go (2,154 lines)
- [ ] `[L]` Refactor shortcuts.go (1,977 lines)
- [ ] `[M]` Refactor daemon.go (1,171 lines)
- [ ] `[L]` Implement API Client Interface for mocking
- [ ] `[XL]` Add Command Package Tests (13.1% → 40% coverage)
- [x] `[S]` Fix panic usage in jq.go - ✅ FIXED 2026-01-23
- [x] `[S]` Fix panic usage in account_members.go - ✅ FIXED 2026-01-23
- [ ] `[M]` Add dependency vulnerability scanning

### Sprint 4: Performance & Features

- [ ] `[L]` Response caching (100-500ms speedup)
- [ ] `[M]` Replace clipboard process spawning with native library
- [ ] `[L]` Dynamic autocomplete
- [ ] `[M]` Bulk edit command
- [ ] `[M]` Template variables enhancement

### Sprint 5: Offline Support

- [ ] `[XL]` Local cache implementation (SQLite-based)
- [ ] `[L]` Sync mechanism (manual and auto-sync)
- [ ] `[L]` Conflict resolution (last-write-wins, manual merge, server-wins)

### Sprint 6: Polish & Observability

- [ ] `[L]` Opt-in telemetry system
- [ ] `[M]` Error tracking (Sentry integration)
- [ ] `[M]` Screen reader support
- [x] `[S]` Color-blind support - ✅ FIXED 2026-01-23
  - Added --color-blind flag, TRIX_COLOR_BLIND env var, blue/orange palette

### Future Backlog

- [ ] `[XXL]` Interactive memory browser (TUI)
- [ ] `[L]` Export to PDF/HTML/Notion/Obsidian
- [ ] `[M]` Alias management system
- [ ] `[M]` JSON marshaling optimization
- [ ] `[XXL]` Internationalization (i18n)

---

## trix-mcp (MCP Server)

### Critical Priority

- [ ] `[M]` **Private IP validation** - Security gap
  - File: `tests/unit/security/security-hardening.test.ts` (lines 261-265)
  - Private IPs (192.168.x.x, 10.0.0.x, 172.16.x.x) should be blocked

- [ ] `[M]` **Health endpoints integration** - Code ready, not integrated
  - Documentation: `monitoring/INTEGRATION.md`
  - `/health/liveness`, `/health/readiness`, `/health` endpoints needed

### High Priority

- [ ] `[M]` **Restore memory endpoint** - Client ready, backend missing
  - File: `src/client/modules/MemoriesClient.ts` (lines 76-82)
  - POST `/v1/memories/:id/restore` not implemented in trix-api

- [ ] `[M]` **Soft delete memory endpoint** - Client ready, backend missing
  - File: `src/client/modules/MemoriesClient.ts` (lines 84-90)
  - DELETE `/v1/memories/:id?soft=true` not handled in trix-api

### Medium Priority

- [ ] `[XL]` **OpenTelemetry integration** - Not implemented
  - Distributed tracing across instances
  - Request correlation IDs
  - Trace Redis operations

- [ ] `[L]` **Kubernetes deployment manifests** - Not created
  - Deployment YAML with multiple replicas
  - Service definition
  - Ingress with sticky sessions
  - HorizontalPodAutoscaler

- [ ] `[L]` **Observability stack deployment** - Not deployed
  - Grafana dashboard deployment
  - Prometheus scraping configuration
  - Alerting rules setup

### Low Priority

- [ ] `[M]` **Resources capability** - Not fully implemented
  - File: `tests/e2e/mcp-protocol.test.ts` (lines 188, 548)
  - resources/list handling skipped

- [ ] `[S]` **Redis connection error handling test** - Skipped
  - File: `tests/unit/storage/RedisSessionStore.test.ts` (line 346)

---

## SDKs

### Python SDK - Critical Gaps

- [ ] `[XL]` **Billing resource** - Not implemented
  - TypeScript SDK has full billing support
  - Need: subscriptions, credits, usage, invoices management

- [ ] `[L]` **Invites resource** - Not implemented
  - TypeScript SDK has full invites support
  - Need: create, list, accept, revoke invitations

### Python SDK - Medium Priority

- [ ] `[M]` **Telemetry implementation** - Stub methods only
  - File: `src/trix/utils/telemetry.py` (lines 172-202)
  - RequestSpan methods are pass statements

- [ ] `[M]` **Metrics implementation** - Abstract interface only
  - File: `src/trix/utils/metrics.py` (lines 70, 84, 103)
  - MetricsCollector needs concrete implementation

---

## trix-research (Documentation & Research)

### Email Security - 11 Items Remaining

#### High Priority
- [ ] `[XL]` Move full email bodies from PostgreSQL to S3
- [ ] `[L]` Optimize webhook handler (5 queries before response)
- [ ] `[XL]` Implement virus/malware scanning for attachments

#### Medium Priority
- [ ] `[M]` Add metrics for key operations
- [ ] `[S]` Complete structured logging fields
- [ ] `[M]` Add audit trail for email address operations
- [ ] `[L]` Implement email address verification/warmup
- [ ] `[M]` Complete input validation on metadata extraction

#### Low Priority
- [ ] `[M]` Implement email template versioning
- [x] `[S]` Add email preview/dry-run mode - ✅ FIXED 2026-01-23
  - Added dryRun option to email services, logs preview without sending
- [ ] `[M]` Add email template versioning system

### Graph Database - Phase 2 & 3 (61 Tasks)

#### Phase 2C: Monitoring & Observability
- [ ] `[M]` Sync lag monitoring
- [ ] `[M]` Error rate tracking
- [ ] `[M]` Throughput metrics
- [ ] `[L]` Grafana dashboard

#### Phase 2A: Additional Security
- [ ] `[M]` Input validation hardening
- [x] `[S]` Relationship type enum validation - ✅ FIXED 2026-01-23
  - Added RELATIONSHIP_TYPES to lib/constants.js, used enum in schema validation
- [ ] `[M]` Rate limiting
- [ ] `[L]` Audit logging

#### Phase 2B: Integration Tests
- [ ] `[M]` Graph expansion tests
- [ ] `[M]` Search integration tests
- [ ] `[M]` Worker/job tests
- [ ] `[L]` Memgraph integration tests
- [ ] `[M]` Error handling tests

#### Phase 3: Performance & Features
- [ ] `[L]` Performance optimization (3 tasks)
- [ ] `[L]` Complete features (3 tasks)
- [ ] `[M]` Performance testing (2 tasks)

### Audio Transcription Audit - 34 Issues

#### Critical (Must Fix)
- [ ] `[L]` Replace N+1 INSERT queries with batch operations (segments, entities, chapters)
- [x] `[S]` Add JSONB index for webhook lookups - ✅ FIXED 2026-01-23
- [x] `[XS]` Fix division by zero in confidence calculation - ✅ FIXED 2026-01-23
- [ ] `[M]` Add buffer size limits for S3 downloads (100MB max)
- [x] `[S]` Fix circular reference handling in JSON.stringify - ✅ FIXED 2026-01-23
  - Created shared `safeJsonStringify` utility in `src/lib/json-utils.js`
  - Updated transcription-job.js and transcription-processor.js to use it

#### High Priority
- [ ] `[M]` Add webhook idempotency tracking
- [ ] `[M]` Add row-level locking in saveTranscript
- [x] `[S]` Add unique constraints to prevent duplicate segments - ✅ FIXED 2026-01-23
  - Added migration for unique index on (audio_file_id, start_time, end_time)
- [x] `[S]` Fix AbortController timer leaks - FIXED 2026-01-23
  - Removed unused `createTimeoutSignal` method from assemblyai-provider.js
  - All active AbortController patterns use proper `clearTimeout()` in finally blocks
- [x] `[S]` Fix webhook service timer leak - FIXED (already implemented)
  - File: `src/lib/webhook-service.js` line 280 has `clearTimeout(timeout)` in finally block
- [x] `[S]` Fix embeddings service timer leak - FIXED (already implemented)
  - Uses `fetchWithTimeout` utility which has proper cleanup in finally block

#### Medium Priority - Database
- [ ] `[M]` Add partial indexes
- [ ] `[S]` Convert to JSONB where appropriate
- [ ] `[M]` Add content deduplication caching

#### Medium Priority - Error Handling
- [ ] `[M]` Enforce timeouts consistently
- [x] `[S]` Validate malformed JSON - ✅ FIXED 2026-01-23
  - Enhanced `safeJsonParse` in `src/lib/json-utils.js` with logging support
  - Updated `AudioRepository.js` to use `safeJsonParse` for metadata and words fields
- [ ] `[M]` Add polling fallback

#### Medium Priority - Input Validation
- [x] `[XS]` Validate language codes - ✅ FIXED 2026-01-23
- [x] `[XS]` Validate speakersExpected range - ✅ FIXED 2026-01-23
- [x] `[XS]` Validate timestamps - ✅ FIXED 2026-01-23

### Support System - Full Roadmap Not Started

#### Phase 1: User CLI - Ticket Creation
- [ ] `[M]` Create support command structure
- [ ] `[L]` Implement interactive ticket wizard
- [ ] `[M]` Implement non-interactive mode with flags
- [ ] `[M]` Add API client methods

#### Phase 2-5
- [ ] `[XL]` Backend API endpoints
- [ ] `[XXL]` Admin dashboard
- [ ] `[L]` Notification system
- [ ] `[L]` Knowledge base integration

### Hierarchical Summarization

- [ ] `[M]` Connect summarization services to enrichment system
- [ ] `[M]` Add periodic jobs for summary regeneration
- [x] `[S]` Expose summarization endpoints - FIXED 2026-01-23
  - Added GET /v1/memories/:id/summary - Get or generate memory summary
  - Added POST /v1/memories/summarize - Summarize multiple memories together
- [ ] `[M]` Measure current retrieval performance
- [ ] `[L]` Update retrieval pipeline to use summaries
- [ ] `[XL]` Implement GraphRAG approach
- [ ] `[L]` Implement Anthropic approach

### Scenario Testing Scripts

- [ ] `[M]` `compare-baseline.ts` - Compare results against baseline
- [ ] `[M]` `generate-report.ts` - Generate test reports
- [x] `[S]` `update-baseline.ts` - Update baseline metrics - FIXED 2026-01-23
- [ ] `[M]` `validate-scenarios.ts` - Validate scenario definitions
- [ ] `[L]` Parallel execution support (`executor.ts:251`)

### AI CLI Integration

- [ ] `[L]` Stage 2: Fingerprint (SimHash/MinHash) - Not implemented

### RAG Frameworks Analysis

- [ ] `[M]` Cross-encoder reranking analysis
- [ ] `[M]` Metadata filtering analysis
- [ ] `[M]` Query decomposition analysis

### Pending ADRs

- [x] `[S]` ADR: Forecast Algorithm Selection - ✅ FIXED 2026-01-23
  - Created ADR-012-forecast-algorithm-selection.md with tiered algorithm approach
- [x] `[S]` ADR: Forecast Data Retention Policy - ✅ FIXED 2026-01-23
  - Created ADR-013-forecast-data-retention-policy.md with GDPR-compliant retention
- [x] `[S]` ADR: Deep retrieval implementation - ✅ FIXED 2026-01-23
  - Created ADR-014-deep-retrieval-implementation.md with model tiering strategy

### Paper Ingestion (Low Priority)

- [ ] `[XXL]` 324/331 papers pending analysis (97.9% remaining)
  - Survey Papers: 9 pending
  - Long Term Memory: 93 pending
  - Long Context Memory: 77 pending
  - Parametric Memory: 56 pending
  - Multi-source Memory: 41 pending
  - Foundational Deep Learning: 48 pending

---

## Test Coverage Gaps

> **Total: 180+ incomplete/skipped tests**

### trix-api - Skipped Test Suites (Critical)

- [ ] `[L]` **Transcription Rate Limiting** - describe.skip
  - File: `tests/security/rate-limiting.test.js:12`
  - Issue: Multipart form-data handling (415 error)

- [ ] `[L]` **Embedding Fallback Security** - describe.skip (TDD RED)
  - File: `tests/lib/embedding/embedding-fallback-security.test.js:15`
  - Issue: Silent fallback to mock embeddings breaks similarity search

- [ ] `[M]` **Search Auto Co-Activation** - describe.skip
  - File: `tests/routes/search-coactivation.test.js:19`

- [ ] `[L]` **Account Deletion** - describe.skip
  - File: `tests/routes/account-delete.test.js:9`

- [ ] `[L]` **User Invitation System** - describe.skip
  - File: `tests/routes/invites.test.js:19`

- [ ] `[M]` **Memory Metadata Fields** - describe.skip
  - File: `tests/routes/enhanced-features.test.js:45`

### trix-api - Billing Test Suites (3 Complete Suites)

- [ ] `[L]` **Grace Period API** - describe.skip
  - File: `tests/billing/integration/grace-period-api.test.js:15`

- [ ] `[L]` **Pause Subscription API** - describe.skip
  - File: `tests/billing/integration/pause-subscription-api.test.js:15`

- [ ] `[L]` **Refund API** - describe.skip
  - File: `tests/billing/integration/refund-api.test.js:15`

### trix-api - TODO Tests (45+)

#### CSRF Protection Tests (13 incomplete)
- [ ] `[M]` CSRF endpoint implementation
- [ ] `[S]` Token generation tests
- [ ] `[S]` Request validation tests
- [ ] `[S]` File: `tests/security/csrf-protection.test.js`

#### Transcription Job Tests (11 incomplete)
- [ ] `[M]` Segment embeddings storage
- [ ] `[M]` Embedding failure handling
- [ ] `[S]` Speaker labels
- [ ] `[M]` Transaction rollback scenarios
- [ ] `[S]` Partial data cleanup

#### Billing Race Condition Tests (4 incomplete)
- [ ] `[M]` Concurrent identical requests
- [ ] `[M]` Double consumption prevention
- [ ] `[M]` Idempotency handling
- [ ] `[M]` Payment webhook retry scenarios

#### LLM Provider Resource Leak Tests (10 incomplete)
- [ ] `[M]` OpenAI stream cleanup on timeout
- [ ] `[S]` OpenAI abort signals
- [ ] `[M]` OpenAI concurrent resource cleanup
- [ ] `[M]` Gemini stream cleanup on timeout
- [ ] `[S]` Gemini abort signals

#### Job Queue Dual Storage Tests (8 incomplete)
- [ ] `[M]` PostgreSQL sync functionality
- [ ] `[S]` Status tracking
- [ ] `[M]` Retry handling

### trix-api - Webhook Tests (5 skipped)

- [ ] `[S]` Webhook auth test 1 - `tests/routes/webhooks-assemblyai.test.js:146`
- [ ] `[S]` Webhook auth test 2 - `tests/routes/webhooks-assemblyai.test.js:172`
- [ ] `[S]` Webhook auth test 3 - `tests/routes/webhooks-assemblyai.test.js:198`
- [ ] `[S]` Webhook auth test 4 - `tests/routes/webhooks-assemblyai.test.js:330`
- [ ] `[S]` Webhook auth test 5 - `tests/routes/webhooks-assemblyai.test.js:373`

### trix-landing - Critical Coverage Gap

- [ ] `[XXL]` **98% untested** - Only 2 test files for 209 source files
  - 207 files lack any test coverage

### trix-sdk-typescript - Major Coverage Gap

- [ ] `[XL]` **76% untested** - Only 15 test files for 64 source files
  - Missing tests for: errors.ts, index.ts, most resource files
  - Untested resources: feedback, invites, graph, agent, spaces, highlights

---

## Blocked Migrations & Schema Work

### Critical - Blocked Migrations

- [ ] `[L]` **Job Queue Persistence** - Entire migration commented out
  - File: `migrations/20260107100000_job_queue_persistence.js`
  - Issue: Uses Knex syntax instead of node-pg-migrate
  - TODO: Rewrite using pgm.sql() or pgm.createTable()

- [ ] `[XL]` **Foreign Key Cascades** - Entire migration commented out
  - File: `migrations/20260106000000_add_update_cascade_to_foreign_keys.js`
  - Issue: References tables that may not exist in test environments
  - TODO: Make all table modifications conditional on table existence
  - Impact: ON UPDATE CASCADE not applied to 40+ tables, 100+ foreign keys

### Medium - Incomplete Features

- [ ] `[M]` **Sessions Full-Text Search** - Index commented out
  - File: `migrations/20260107000000_cli_sessions.js` (lines 119-123)
  - Issue: Template literal issues with || operator
  - TODO: Re-enable with proper escaping or generated column approach

---

## Deprecated & Legacy Code

> **Removal deadline: 2026-01-01 (PAST DUE)**

### Legacy Compatibility Module (741 lines)

- [ ] `[L]` **Remove legacy-compat.js** - Full module scheduled for removal
  - File: `src/routes/legacy-compat.js`
  - Deprecated routes:
    - `POST /ingest/text` → Use `POST /memories`
    - `POST /ingest/markdown` → Use `POST /memories`
    - `POST /ingest/url` → Use `POST /memories`
    - `POST /ingest/batch` → Use `POST /memories`
    - `POST /search/semantic` → Use `GET /memories?mode=semantic`
    - `POST /search/fulltext` → Use `GET /memories?mode=fulltext`
    - `POST /search/hybrid` → Use `GET /memories?mode=hybrid`

### Deprecated Functions (11+)

- [x] `[S]` `createOrphanedFilesCleanupJob()` - ✅ DEPRECATED 2026-01-23
  - File: `src/jobs/cleanup-job.js:333`
  - Added runtime deprecation warning; use createFindOrphanedS3Job instead

- [x] `[S]` `createTranscriptionJob()` - ✅ DEPRECATED 2026-01-23
  - File: `src/jobs/transcription-job.js:470`
  - Added runtime deprecation warning; use job queue's enqueue method

- [x] `[XS]` `generateAudioKey()` - Use generateRawKey() - ✅ ALREADY REMOVED
  - File: `src/plugins/s3.js` - Function no longer exists

- [x] `[XS]` `generateRawContentKey()` - Use generateRawKey() - ✅ ALREADY REMOVED
  - File: `src/plugins/s3.js` - Function no longer exists

- [x] `[XS]` `createTimeoutSignal()` - Use fetchWithTimeout() - ✅ FIXED 2026-01-23
  - File: `src/lib/embeddings.js` - Function removed (was unused)

- [x] `[S]` `verifyWebhookAuth()` - ✅ DEPRECATED 2026-01-23
  - File: `src/routes/webhooks-assemblyai.js:12`
  - Added runtime deprecation warning; use verifyWebhookSignature for HMAC-SHA256

- [x] `[S]` `_getGraphScore()` - ✅ DEPRECATED 2026-01-23
  - File: `src/lib/graph/services/HybridScorer.js:174`
  - Added runtime deprecation warning; use _getGraphScoreBatch to avoid N+1

- [x] `[S]` `getDefaultTranscriptionProvider()` - ✅ DEPRECATED 2026-01-23
  - File: `src/lib/audio/providers/index.js:62`
  - Added runtime deprecation warning; use getTranscriptionFailover()

- [x] `[S]` `getDefaultVisionProvider()` - ✅ DEPRECATED 2026-01-23
  - File: `src/lib/images/providers/index.js:35`
  - Added runtime deprecation warning; use getVisionFailover()

### Deprecated API Routes

- [ ] `[M]` **Unversioned routes** - Should use /v1 prefix
  - File: `src/server.js:456`
  - Routes: `/auth`, `/users`, `/admin`, `/files`, `/accounts`, `/spaces`, `/memories`

### CLI Deprecated Flags

- [x] `[S]` `--limit` and `--offset` - Use `--page` and `--per-page` - ✅ FIXED 2026-01-23
  - File: `trix-cli-go/internal/pagination/pagination.go:31-36 - Added MarkDeprecated() calls`

- [x] `[XS]` `--debug` - Use `-vv` for verbosity - ✅ FIXED 2026-01-23
  - File: `trix-cli-go/cmd/root.go` - Added MarkDeprecated("debug", "use -vv...")

### MCP Migration

- [ ] `[M]` `startServer()` function - Use TrixMcpServer class
  - File: `trix-mcp/docs/MIGRATION.md`
  - Will be removed in v1.0.0

---

## Security Issues

> **5 Critical issues documented in /issues folder**

### Critical Security Issues

- [ ] `[M]` **Issue 004: Authorization Information Disclosure**
  - File: `issues/004-authorization-info-leak.md`
  - Location: `src/routes/audio/clip.js:214-216`
  - Problem: Auth checked AFTER file metadata fetch, allows existence inference
  - Risk: CWE-200 Information Disclosure

- [ ] `[L]` **Issue 005: Missing Webhook HMAC Signature Verification**
  - File: `issues/005-webhook-signature-verification.md`
  - Location: `src/routes/webhooks-assemblyai.js:17-31`
  - Problem: Only validates custom header, not HMAC-SHA256 signature
  - Risk: CWE-347 Webhook Spoofing

- [ ] `[M]` **Issue 006: Transcription Rate Limit Bypass**
  - File: `issues/006-transcription-rate-limit-bypass.md`
  - Location: `src/routes/memories/bulk.js`
  - Problem: Bulk API (20/min) bypasses transcription limit (20/hour)
  - Risk: CWE-770 DoS/Resource Exhaustion

- [ ] `[M]` **Issue 012: Context Expansion Validation Bypass**
  - File: `issues/012-context-expansion-bypass.md`
  - Location: `src/routes/audio/clip.js:28, 203-228`
  - Problem: MIN_CLIP_DURATION check on effective duration, not requested
  - Attack: 0.1s clip with 60s context → 120.6s clip served
  - Risk: CWE-636 Policy Bypass

- [ ] `[L]` **Issue 015: Buffer Exhaustion in Transcription Download**
  - File: `issues/015-buffer-exhaustion-fix.md`
  - Location: `src/lib/audio/transcription-processor.js:50-70`
  - Problem: Size check after chunks collected, stream not closed on error
  - Risk: CWE-770 DoS/Memory Exhaustion

### High Priority Security Items

- [ ] `[M]` **CSP unsafe-inline stylesheet**
  - File: `src/plugins/helmet.js:34`
  - Issue: `styleSrc: ["'self'", 'https:', "'unsafe-inline'"]`

- [ ] `[S]` **Password change token invalidation incomplete**
  - File: `src/routes/users.js:115-130`
  - Comment: "needs token blacklist" (though implemented elsewhere)

- [x] `[S]` **Development insecure encryption key fallback** - ✅ FIXED 2026-01-23
  - File: `src/integrations/encryption-service.js:40-44`
  - Added [SECURITY] warning prefix, production already throws error

---

## Configuration & Setup Gaps

### Environment Variables - Undocumented

- [ ] `[S]` **SigLIP endpoints** - Documented but no docker setup
  - `SIGLIP_ENDPOINT`, `SIGLIP_TEXT_ENDPOINT`
  - Requires self-hosted inference server not in docker-compose

- [x] `[XS]` **Graph DB config** - ✅ FIXED 2026-01-23
  - `GRAPH_DB_TYPE`, `MEMGRAPH_HOST`, `MEMGRAPH_PORT` - Added to .env.example

- [x] `[XS]` **Anthropic API key** - ✅ FIXED 2026-01-23
  - Added to trix-workers-node/.env.example

- [x] `[XS]` **Integrations encryption key** - ✅ FIXED 2026-01-23
  - `INTEGRATION_ENCRYPTION_KEY` - Added to trix-api/.env.example

### Docker/Container Setup

- [ ] `[XL]` **SigLIP container** - Not provided
  - Visual search requires external service
  - No docker-compose setup

- [x] `[S]` **Health checks** - ✅ FIXED 2026-01-23
  - Files: `trix-workers-node/Dockerfile`, `docker-compose.yml`
  - Replaced wget with Node.js HTTP health check

- [ ] `[M]` **Password validation** - Placeholder not enforced
  - `POSTGRES_PASSWORD=CHANGE_ME_TO_STRONG_PASSWORD_MIN_12_CHARS`
  - No validation before docker-compose up

### Monitoring & Alerting

- [ ] `[L]` **Sentry integration** - Partially configured
  - `VITE_SENTRY_ENABLED=false` by default
  - No backend error tracking

- [ ] `[XL]` **Distributed tracing** - Not implemented
  - No correlation IDs across services

- [ ] `[L]` **Metrics collection** - Incomplete in workers
  - Python SDK telemetry only stubs
  - No documented Prometheus endpoint

### Logging Configuration

- [ ] `[L]` **No log aggregation** - Logs to files/stdout only
- [x] `[S]` **No log level validation** - ✅ FIXED 2026-01-23
  - Added validation in trix-api/src/lib/logger.js and trix-workers-node/src/lib/logger.js
  - Invalid log levels now warn and default to 'info'
- [ ] `[M]` **No log rotation policy** - Retention not specified
- [ ] `[M]` **Structured logging inconsistent** - Some JSON, some pino

### CI/CD Pipeline

- [ ] `[M]` **Pre-deployment validation** - Not automated
  - `scripts/validate-config.js` exists but not in CI/CD

- [ ] `[S]` **Migration validation** - Not enforced in releases

### Feature Flags Cleanup

- [x] `[XS]` **ENABLE_ADVANCED_RETRIEVAL** - ✅ DOCUMENTED 2026-01-23 (in .env.example)
- [x] `[XS]` **ENABLE_GRAPH_EXPANSION** - ✅ DOCUMENTED 2026-01-23 (in .env.example)
- [x] `[XS]` **ENABLE_VISUAL_SEARCH** - ✅ DOCUMENTED 2026-01-23 (in .env.example)

### Default Values Needing Configuration

- [ ] `[M]` **Database pool sizing** - Hard-coded, no guidance
  - `DB_POOL_MIN=2`, `DB_POOL_MAX=20`

- [ ] `[L]` **Worker concurrency** - Not auto-tuned
  - All hardcoded values, should scale with CPU/memory

- [ ] `[M]` **Timeouts** - No unified strategy
  - `LLM_TIMEOUT=30000`, `EMBEDDING_TIMEOUT=10000`
  - No escalation on retries

- [ ] `[M]` **Rate limits** - No tiering by subscription
  - `RATE_LIMIT_ACCOUNT_MAX_REQUESTS=1000` for all

### Deployment Configuration

- [ ] `[M]` **Railway migration drift** - Manual resolution needed
  - Mentioned in CLAUDE.md but not automated

- [ ] `[S]` **Production readiness checklist** - Incomplete
  - `.env.docker.example` has partial checklist

- [ ] `[L]` **Kubernetes ConfigMap/Secret templates** - Not created
  - No templates for trix-api or trix-workers

### trix-workers-node Incomplete

- [ ] `[L]` **Calendar event scheduler** - Mock integrations service
  - File: `src/processors/calendar-event-scheduler.js:24`
  - Integration service stubbed to return empty arrays

- [ ] `[L]` **Integration sync** - Logic not implemented
  - File: `src/processors/integration-sync.js`
  - TODO: "Implement actual sync logic"

---

## Documentation Gaps

> **773+ incomplete JSDoc comments, 3 "coming soon" API docs**

### Missing API Documentation

- [ ] `[L]` **Memories API documentation** - Coming soon
  - File: `trix-api/docs/api/memories.md` (not created)
  - Referenced in README.md line 864

- [ ] `[L]` **Clusters API documentation** - Coming soon
  - File: `trix-api/docs/api/clusters.md` (not created)
  - Referenced in README.md line 865

- [ ] `[M]` **Testing Guide** - Coming soon
  - File: `trix-api/docs/development/testing.md` (not created)
  - Referenced in README.md line 877

- [ ] `[M]` **Microsoft OAuth documentation** - Coming soon
  - File: `trix-api/docs/api/authentication.md` line 271

- [ ] `[M]` **Apple OAuth documentation** - Coming soon
  - File: `trix-api/docs/api/authentication.md` line 272

- [ ] `[M]` **Graph API OpenAPI spec** - TODO
  - File: `trix-research/product/graph/GRAPH_IMPLEMENTATION_SUMMARY.md` line 329

### Code Documentation Gaps

- [ ] `[XXL]` **JSDoc comments incomplete** - 773 empty blocks
  - Location: `trix-api/src/routes/` (all route handlers)
  - Many route handlers lack proper documentation

- [x] `[XS]` **Changelog project owners** - ✅ FIXED 2026-01-23
  - File: `trix-api/CHANGELOG_PROJECT_README.md`
  - Changed TBD to "_Unassigned - assign before project kickoff_"

- [x] `[XS]` **trix-landing release date** - ✅ FIXED 2026-01-23
  - File: `trix-landing/CHANGELOG.md` line 11
  - Changed `## [1.0.0] - TBD` to `## [1.0.0] - Unreleased`

---

## Error Handling Gaps

> **624 raw fmt.Errorf() calls, silent error swallowing, no React ErrorBoundary**

### Silent Error Swallowing

- [x] `[S]` **S3 backup status recording** - ✅ FIXED 2026-01-23
  - File: `trix-api/src/lib/pipeline/s3-backup-service.js` (lines 90-92)
  - Added error logging while preserving graceful degradation

- [x] `[S]` **Cache service errors** - ✅ FIXED 2026-01-23
  - File: `trix-api/src/lib/cache/cache-service.js` (lines 436-438)
  - Added logger option and warning logs for cache failures

- [x] `[S]` **Feedback table check** - ✅ FIXED 2026-01-23
  - File: `trix-api/src/routes/feedback.js` (lines 228-230)
  - Added warning log when table check fails

### Unhandled Promise Rejections

- [ ] `[M]` **Worker unhandled rejection** - Logs but doesn't shutdown
  - File: `trix-workers-node/src/worker.js` (lines 609-611)
  - Should trigger graceful shutdown like server.js does

### Missing Error Infrastructure

- [ ] `[L]` **React ErrorBoundary** - Not implemented
  - Location: `trix-landing/src/`
  - No error boundary components for graceful degradation

- [ ] `[L]` **CLI rich error usage** - 624 raw fmt.Errorf calls
  - Location: `trix-cli-go/cmd/*.go`
  - Rich CLIError struct exists but not used consistently

- [ ] `[M]` **Error code documentation** - Not documented
  - Files: `trix-api/src/routes/temporal-relationships.js`, `auth.js`
  - HTTP status codes used without documented meanings

### Panic/Fatal Improvements

- [x] `[S]` **Panic with context** - ai_cli_process_session.go - ✅ Already has context
  - File: `trix-cli-go/cmd/ai_cli_process_session.go` (lines 74, 78)
  - Panic messages already include full context: `panic(fmt.Sprintf("failed to mark 'X' flag as required: %v", err))`

- [x] `[S]` **Panic with context** - auth.go - ✅ Already has context
  - File: `trix-cli-go/cmd/auth.go` (lines 101, 107)
  - Panic messages already include full context: `panic(fmt.Sprintf("failed to mark 'X' flag as required: %v", err))`

- [x] `[S]` **Panic with context** - jq.go - ✅ FIXED (commit f48063d)
  - File: `trix-cli-go/internal/jq/jq.go`
  - Panics replaced with proper error handling

---

## Accessibility & UX Gaps

> **332 CLI commands missing examples, 10+ web components missing keyboard support**

### CLI Help Text Gaps

- [ ] `[XL]` **CLI command examples** - 332/345 commands missing
  - Location: `trix-cli-go/cmd/*.go`
  - Only 13 commands have `.Example` sections

- [ ] `[L]` **trix-cli-admin help** - Commands only in README
  - File: `trix-cli-admin/README.md`
  - No inline CLI help using Commander.js

- [x] `[S]` **Daemon logs/doctor help** - ✅ FIXED 2026-01-23 - Enhanced help text with examples
  - Files: `trix-daemon/cmd/trixd/logs.go`, `doctor.go`

### Web Component Accessibility

- [ ] `[M]` **APIComponents keyboard support** - Missing onKeyDown
  - File: `trix-landing/src/docs/components/APIComponents.tsx`
  - setIsOpen, setActiveTab, copy() lack keyboard handlers

- [ ] `[M]` **CodeBlock keyboard support** - Copy and tabs
  - File: `trix-landing/src/docs/components/CodeBlock.tsx`
  - Copy button and tab switching lack keyboard support

- [ ] `[M]` **DocsSidebar keyboard support** - Section toggle
  - File: `trix-landing/src/docs/components/DocsSidebar.tsx`
  - onClick without onKeyDown for Enter/Space

- [ ] `[M]` **DocsSearch keyboard support** - Result navigation
  - File: `trix-landing/src/docs/components/DocsSearch.tsx`
  - Result navigation uses onClick only

- [x] `[S]` **Missing ARIA roles** - APIComponents tabs - ✅ FIXED 2026-01-23
  - File: `trix-landing/src/docs/components/APIComponents.tsx`
  - Added role="tablist", role="tab", aria-selected, aria-controls, role="tabpanel"

- [x] `[S]` **Missing ARIA roles** - DocsSidebar regions - ✅ FIXED 2026-01-23
  - File: `trix-landing/src/docs/components/DocsSidebar.tsx`
  - Added role="region", aria-controls, aria-label for collapsible sections

### Confirmation & Feedback

- [x] `[S]` **Generic confirmation messages** - ✅ FIXED 2026-01-23
  - Files: `trix-cli-admin/src/commands/memories.ts`, `clusters.ts`
  - Updated 5 prompts to include specific action and resource details

- [x] `[S]` **Keyboard shortcuts documentation** - ✅ FIXED 2026-01-23
  - File: `trix-landing/src/docs/pages/DocsSettings.tsx`
  - Documented global, search, and code block shortcuts with sections

---

## Integration & Webhook Gaps

> **Hardcoded API versions, missing rate limiting, incomplete retry logic**

### Hardcoded API Versions

- [ ] `[M]` **Google API versions** - Not configurable
  - File: `trix-api/src/integrations/providers/google/utils/constants.js` (lines 11-13)
  - Gmail v1, Calendar v3, Drive v3 hardcoded

- [ ] `[M]` **Microsoft Graph API version** - Not configurable
  - File: `trix-api/src/integrations/providers/microsoft/index.js` (line 26)
  - v1.0 hardcoded

- [x] `[S]` **Notion API version** - ✅ FIXED 2026-01-23
  - File: `trix-api/src/integrations/providers/notion/index.js`
  - Made configurable via NOTION_OAUTH_API_VERSION env var (default: v1)

### Missing Rate Limiting (Outbound)

- [ ] `[M]` **N8N provider rate limiting** - Not implemented
  - File: `trix-api/src/integrations/providers/n8n/index.js`
  - No throttling for outbound N8N webhook calls

- [ ] `[M]` **Zapier provider rate limiting** - Not implemented
  - File: `trix-api/src/integrations/providers/zapier/index.js`
  - No throttling for outbound Zapier calls

### Missing Retry Logic

- [ ] `[M]` **Google OAuth token refresh retry** - No exponential backoff
  - File: `trix-api/src/integrations/providers/google/services/oauth-service.js` (lines 33-99)
  - Transient errors cause immediate failure

- [ ] `[M]` **Microsoft OAuth token refresh retry** - No retry
  - File: `trix-api/src/integrations/providers/microsoft/index.js`
  - Same pattern as Google

- [ ] `[M]` **Paddle webhook retry** - Incomplete
  - File: `trix-api/src/billing/webhooks/paddle-webhook-handler.js`
  - getPendingWebhookEvents exists but incomplete

### Missing Fallback Strategies

- [ ] `[L]` **Notion API fallback** - No fallback when unavailable
  - File: `trix-api/src/integrations/providers/notion/index.js`
  - Single point of failure

- [ ] `[L]` **Circuit breaker fallback** - Fails instead of stale data
  - Files: `trix-api/src/integrations/lib/circuit-breaker.js`, `circuit-breaker-registry.js`
  - When circuit opens, could return cached data

- [ ] `[M]` **Webhook delivery fallback** - No alternative delivery
  - File: `trix-api/src/lib/webhook-service.js`
  - Only retries same endpoint

### Missing Integration Tests

- [ ] `[L]` **Zapier integration tests** - Not implemented
  - No E2E tests for Zapier webhook validation

- [ ] `[L]` **N8N integration tests** - Not implemented
  - No E2E tests for N8N workflow triggers

- [ ] `[M]` **Microsoft webhook validation tests** - Incomplete
  - File: `trix-api/src/routes/webhooks-microsoft.js`
  - No rate limiting, batch limits, or timeout tests

---

## Effort Summary by Category

| Category | XS | S | M | L | XL | XXL | Total Days |
|----------|----|----|----|----|-----|------|------------|
| trix-api | 1 | 3 | 4 | 3 | 2 | 1 | ~12 days |
| trix-cli-go | 0 | 5 | 9 | 10 | 3 | 2 | ~22 days |
| trix-mcp | 0 | 1 | 5 | 2 | 1 | 0 | ~8 days |
| SDKs | 0 | 0 | 2 | 1 | 1 | 0 | ~5 days |
| trix-research | 4 | 8 | 22 | 14 | 5 | 2 | ~25 days |
| Tests | 0 | 12 | 18 | 12 | 1 | 1 | ~18 days |
| Migrations | 0 | 0 | 1 | 1 | 1 | 0 | ~4 days |
| Deprecated | 4 | 7 | 2 | 1 | 0 | 0 | ~3 days |
| Security | 0 | 3 | 4 | 2 | 0 | 0 | ~4 days |
| Configuration | 7 | 6 | 10 | 6 | 2 | 0 | ~10 days |
| Documentation | 0 | 3 | 4 | 2 | 0 | 1 | ~8 days |
| Error Handling | 0 | 6 | 2 | 2 | 0 | 0 | ~4 days |
| Accessibility | 0 | 5 | 5 | 1 | 1 | 0 | ~6 days |
| Integrations | 0 | 1 | 8 | 3 | 0 | 0 | ~7 days |
| **TOTAL** | **16** | **60** | **96** | **60** | **17** | **7** | **~136 days** |

---

## How to Update This Document

When completing an item:
1. Change `- [ ]` to `- [x]`
2. Add completion date: `- [x] `[M]` **Item** - Completed 2026-01-XX`
3. Update the progress bar percentages at the top
4. Commit with message: `docs: mark [feature] as complete in UNFINISHED_FEATURES.md`

When adding new items:
1. Add under the appropriate component and priority section
2. Include file path and line number if applicable
3. Add effort estimate tag: `[XS]`, `[S]`, `[M]`, `[L]`, `[XL]`, or `[XXL]`
4. Update the total count in the progress bar

### Priority Guide

| Priority | Description |
|----------|-------------|
| **Critical** | Security issues, data loss risks, blocking features |
| **High** | Core functionality gaps, major UX issues |
| **Medium** | Nice-to-have features, optimization opportunities |
| **Low** | Documentation, cleanup, research tasks |

### Effort Guide

| Tag | Time | When to Use |
|-----|------|-------------|
| `[XS]` | < 1 hour | Config change, typo fix, add validation |
| `[S]` | 1-4 hours | Single function, simple test, small refactor |
| `[M]` | 4-8 hours | Feature endpoint, integration test, module |
| `[L]` | 1-3 days | Multi-file feature, comprehensive tests |
| `[XL]` | 3-5 days | Cross-service feature, new integration |
| `[XXL]` | 1-2 weeks | New system, architectural change, major feature |
