# Unfinished Integrations - Investigation Report

**Date:** 2026-01-23
**Status:** Issues identified across 5 integration components

---

## Executive Summary

A comprehensive investigation of the Trix integration components revealed **5 critical issues**, **7 high-priority issues**, and **10 files violating coding standards**. The most severe finding is an account isolation bug in the API that could allow cross-account data access.

---

## Critical Issues

### 1. Account Isolation Bug (trix-api) - SECURITY

**File:** `trix-api/src/routes/integrations/unified-calendar.js:433`

**Issue:** Inconsistent authentication context usage. The `/integrations/calendar/upcoming` endpoint uses `request.account.id` while other routes correctly use `request.user.accountId`.

```javascript
// Line 433 - INCORRECT
const accountId = request.account.id;

// Lines 62, 146, 220, 302 - CORRECT
const connections = await fastify.integrations.listConnections(request.user.accountId, ...);
```

**Impact:** Potential cross-account data access if `request.account` is populated from a different source than `request.user`.

**Fix:** Change line 433 to use `request.user.accountId`.

---

### 2. Async/Await Anti-Pattern (trix-mcp)

**Files:**

- `trix-mcp/src/server/auth.ts:145, 155, 164`
- `trix-mcp/src/server/http.ts:550, 599, 774`

**Issue:** Using `void reply.code(401).send()` without awaiting the async `.send()` operation.

```typescript
// PROBLEMATIC
void reply.code(401).send({
  error: 'Unauthorized',
  message: 'Missing Authorization header...',
});
return;

// CORRECT
await reply.code(401).send({...});
return;
```

**Impact:** While Fastify queues responses, this violates async best practices and could cause issues in edge cases.

---

### 3. Test Import Errors (trix-sdk-python)

**Files:**

- `trix-sdk-python/tests/test_errors.py:88, 98, 108, 118, 128, 140, 150, 159, 181, 189, 200, 208`
- `trix-sdk-python/tests/test_origin_context.py:20`

**Issue:** Tests import non-existent functions and classes:

- `_handle_response` and `_check_api_version` don't exist in `trix.client`
- `TrixClient` class doesn't exist (actual class is `Trix`)

**Impact:** 12+ test methods cannot run, reducing test coverage.

**Fix:** Update imports to use `trix.client_base.handle_response` or add re-exports to `client.py`.

---

### 4. Sync Lock Held During API Calls (trix-daemon)

**File:** `trix-daemon/internal/sync/syncer.go:184-212`

**Issue:** The `syncMu` mutex is held for the entire sync operation, including API calls.

**Impact:** If the API call hangs, user-triggered `SyncNow()` commands are blocked indefinitely.

**Fix:** Release lock before API calls, re-acquire for state updates.

---

### 5. Config Reload Incomplete (trix-daemon)

**File:** `trix-daemon/internal/daemon/daemon.go:383-413`

**Issue:** SIGHUP config reload only updates log level. Sync interval and other settings require daemon restart.

**Impact:** Users believe config is reloaded but changes don't take effect.

**Fix:** Implement full config reload with syncer restart or document limitations.

---

## High Priority Issues

### 6. Missing Rate Limiting (trix-api)

**Files:** All routes in `trix-api/src/routes/integrations/`

**Issue:** No rate limiting on critical endpoints:

- OAuth initiation (unlimited state creation)
- Connection sync (unlimited sync triggers)
- Automation API key creation

**Impact:** Potential DoS through resource exhaustion.

---

### 7. Console.log in Production (trix-api)

**File:** `trix-api/src/integrations/lib/circuit-breaker.js:193`

```javascript
console.log(`Circuit breaker '${this.name}': ${oldState} → ${newState}`);
```

**Fix:** Replace with structured logging via `this.logger?.info()`.

---

### 8. Missing Space Access Validation (trix-api)

**File:** `trix-api/src/routes/integrations/gmail-labels.js:100-105`

**Issue:** `validateSpaceAccess()` is imported but never called when `space_id` is provided.

**Impact:** Users could associate integrations with spaces they don't have access to.

---

### 9. Duplicate Code (trix-sdk-typescript)

**Files:**

- `trix-sdk-typescript/src/resources/memories.ts:817-835`
- `trix-sdk-typescript/src/resources/memories/memories.image.ts:991-1009, 1121-1139`

**Issue:** Base64-to-blob conversion code duplicated 3+ times. Helper `normalizeImageInput()` exists in `memories.helpers.ts` but isn't used.

**Fix:** Refactor to use the existing helper function.

---

### 10. Missing File Size Validation (trix-sdk-typescript)

**File:** `trix-sdk-typescript/src/resources/memories.ts:105-137`

**Issue:** No file size validation before FormData upload. Large files sent to API only to be rejected.

**Fix:** Add client-side size validation before upload.

---

### 11. TLS Config Unused (trix-daemon)

**File:** `trix-daemon/internal/api/security.go:33-45`

**Issue:** `TLSConfig` struct defined with client cert support but never used in `NewClient()`.

**Fix:** Wire up TLS configuration or remove dead code.

---

### 12. HMAC Signing Optional (trix-daemon)

**File:** `trix-daemon/internal/api/client.go:511-517`

**Issue:** Request signing silently disabled when `signingKey` is empty. No warning in production.

**Fix:** Log warning when signing is disabled, or require it in production mode.

---

## Medium Priority Issues

### 13. Stream Reader Lock Not Released (trix-sdk-typescript)

**Files:**

- `trix-sdk-typescript/src/resources/memories.ts:908-923, 948-963`
- `trix-sdk-typescript/src/resources/memories/memories.image.ts:84-90, 98-104`

**Issue:** `reader.releaseLock()` not called in finally block for image getters.

**Impact:** Potential resource leaks if stream reading fails.

---

### 14. Test Path Mismatch (trix-sdk-python)

**File:** `trix-sdk-python/tests/test_entities.py:73`

**Issue:** Test expects `/entities/ent_123` but implementation uses `/knowledge/entities/ent_123`.

**Fix:** Update test assertions to match actual API paths.

---

### 15. Error Counter Never Decreases (trix-daemon)

**File:** `trix-daemon/internal/sync/syncer.go:278`

**Issue:** `consecutiveErrors` only resets to 0 on success. Intermittent errors keep backoff multiplier high.

---

### 16. 429 Rate Limit Handling (trix-daemon)

**File:** `trix-daemon/internal/api/client.go:622-627`

**Issue:** 429 responses use same retry config as network errors. Should have longer backoff to respect rate limits.

---

### 17. Notification Manager Race Condition (trix-daemon)

**File:** `trix-daemon/internal/sync/syncer.go:165-169, 248-254`

**Issue:** `SetNotificationManager()` has no nil check or locking. Potential race condition.

---

### 18. Circuit Breaker State Not Logged (trix-mcp)

**File:** `trix-mcp/src/server/http.ts:189-194`

**Issue:** When circuit opens, users get cryptic "Invalid API key" message. No logging of circuit breaker state transitions.

---

## File Size Violations

Per `CODING_STANDARDS.md`: soft limit 300 lines, hard limit 500 lines.

| Component | File | Lines | Over By |
|-----------|------|-------|---------|
| trix-sdk-typescript | `src/resources/memories.ts` | 1302 | +802 |
| trix-mcp | `src/server/http.ts` | 1085 | +585 |
| trix-daemon | `internal/config/config.go` | 1051 | +551 |
| trix-mcp | `src/handlers/index.ts` | 1051 | +551 |
| trix-mcp | `src/handlers/analytics.ts` | 1043 | +543 |
| trix-mcp | `src/client/HttpTrixClient.ts` | 964 | +464 |
| trix-daemon | `internal/daemon/daemon.go` | 914 | +414 |
| trix-daemon | `internal/watcher/watcher.go` | 902 | +402 |
| trix-sdk-typescript | `src/client.ts` | 762 | +262 |
| trix-api | `src/integrations/sync-service.js` | 758 | +258 |
| trix-daemon | `internal/cache/cache.go` | 753 | +253 |
| trix-daemon | `internal/ipc/server.go` | 716 | +216 |
| trix-mcp | `src/resources/index.ts` | 687 | +187 |
| trix-api | `src/routes/integrations/unified-calendar.js` | 631 | +131 |
| trix-mcp | `src/prompts/index.ts` | 600 | +100 |

---

## Test Coverage Gaps

### trix-api

- No test for account isolation in `/calendar/upcoming` route
- No rate limiting tests
- No OAuth state cleanup/expiration tests

### trix-sdk-python

- 12+ tests failing due to import errors
- Limited pagination edge case tests

### trix-sdk-typescript

- No visual/image operation tests
- Limited integration tests with actual API

### trix-daemon

- No integration tests for daemon components together
- API client tests don't verify authentication headers
- Cache concurrency tests need `-race` flag verification

### trix-mcp

- Missing handler implementation tests
- No load/stress tests for session management
- No Redis failover scenario tests

---

## Positive Findings

Despite the issues, the integrations demonstrate strong engineering in several areas:

- **Security:** Constant-time string comparison, API key validation, credential masking in logs
- **Error Handling:** Comprehensive error hierarchies with proper HTTP status mapping
- **Resilience:** Retry logic with exponential backoff and jitter, circuit breaker patterns
- **Performance:** Connection pooling, request timeout protection
- **Testing:** Extensive unit test coverage (trix-daemon has 15 test files totaling 7000+ lines)

---

## Recommended Fix Order

### Immediate (Security)

1. Fix account isolation bug in `unified-calendar.js:433`
2. Add rate limiting to OAuth endpoints

### This Week

3. Fix async/await patterns in trix-mcp auth
2. Fix test imports in Python SDK
3. Replace console.log with structured logging

### This Sprint

6. Add space access validation to gmail-labels
2. Fix sync lock issue in daemon
3. Refactor oversized files (start with 1000+ line files)

### Backlog

9. Add missing test coverage
2. Implement full config reload in daemon
3. Wire up TLS configuration
4. Add file size validation to TypeScript SDK

---

## Notes

- Investigation performed by 5 parallel agents on 2026-01-23
- Each component has its own `CLAUDE.md` with specific guidelines
- Some issues marked with "Issue H1", "Issue P1" etc. indicate previously identified and partially addressed problems
