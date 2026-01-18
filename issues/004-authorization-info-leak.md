# Issue 004: Authorization Check After File Fetch (Information Disclosure)

## Problem
Authorization is checked AFTER file metadata is fetched, leaking information about file existence to unauthorized users.

## Location
- `trix-api/src/routes/audio/clip.js:214-216`

## Current Code
```javascript
// File fetched first
const audioFile = await audioRepo.findById(id, accountId);

// Then authorization checked
if (audioFile.spaceId && !fastify.canAccessSpace(request, audioFile.spaceId, 'read')) {
  return reply.forbidden('Access denied to this space');
}
```

## Issue
- Attacker can determine if file exists by checking response timing/error type
- 404 vs 403 distinction reveals file existence
- Should fail with same error regardless of existence or permission

## Solution
1. Check authorization BEFORE or WITH file fetch
2. Use single query that joins authorization check
3. Return consistent error for both "not found" and "not authorized"

## Proposed Fix
```javascript
// Option 1: Single query with authorization
const audioFile = await audioRepo.findByIdWithAuth(id, accountId, request.user);
if (!audioFile) {
  return reply.notFound('Audio file not found');  // Same error for both cases
}

// Option 2: Check space access first if space_id known
const hasAccess = await fastify.canAccessSpace(request, spaceId, 'read');
if (!hasAccess) {
  return reply.notFound('Audio file not found');  // Intentionally vague
}
```

## Acceptance Criteria
- [ ] Same error returned for non-existent and unauthorized files
- [ ] No timing difference between scenarios
- [ ] Unit test for authorization before fetch
- [ ] Security test for information disclosure

## TDD Tasks
1. Write failing test asserting same error for both cases
2. Write failing test for timing consistency
3. Implement findByIdWithAuth method in repository
4. Update clip.js to use new method
5. Verify all security tests pass
