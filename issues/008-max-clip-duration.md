# Issue 008: Add Maximum Clip Duration Limit

## Problem
No maximum clip duration allows users to request multi-hour clips, causing bandwidth exhaustion.

## Location
- `trix-api/src/routes/audio/clip.js`

## Current State
```javascript
const MIN_CLIP_DURATION = 0.5; // 500ms minimum
// No maximum defined
```

## Issue
- User can request 4-hour clip from 4-hour audio
- Combined with 60s context: 4h2m clip possible
- At 128kbps: 230MB streaming per request
- No rate limiting on bandwidth

## Solution
1. Add MAX_CLIP_DURATION constant (1 hour = 3600 seconds)
2. Validate clip duration before processing
3. Return 400 Bad Request if exceeded
4. Add configuration option for limit adjustment

## Proposed Fix
```javascript
const MAX_CLIP_DURATION = 3600; // 1 hour

// In clip handler
const clipDuration = end - start;
if (clipDuration > MAX_CLIP_DURATION) {
  return reply.badRequest(
    `Clip duration ${clipDuration}s exceeds maximum ${MAX_CLIP_DURATION}s`
  );
}
```

## Acceptance Criteria
- [ ] MAX_CLIP_DURATION constant defined (3600s)
- [ ] Clips exceeding limit rejected with 400
- [ ] Clear error message with limit value
- [ ] Unit test for duration validation
- [ ] Integration test for limit enforcement

## TDD Tasks
1. Write failing test for max duration rejection
2. Write failing test for boundary conditions (3599s, 3600s, 3601s)
3. Add MAX_CLIP_DURATION constant
4. Implement duration validation in clip handler
5. Verify all tests pass
