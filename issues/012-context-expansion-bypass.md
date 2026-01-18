# Issue 012: Fix Context Expansion Bypass for Minimum Clip Duration

## Problem
MIN_CLIP_DURATION check can be bypassed using context expansion parameter.

## Location
- `trix-api/src/routes/audio/clip.js:28, 203-228`

## Current Code
```javascript
const MIN_CLIP_DURATION = 0.5; // 500ms

// Context applied BEFORE duration check
const effectiveStart = Math.max(0, start - context);
const effectiveEnd = Math.min(audioFile.duration, end + context);

// Check happens on EFFECTIVE duration, not original
if ((effectiveEnd - effectiveStart) < MIN_CLIP_DURATION) {
  return reply.badRequest('Clip duration too short');
}
```

## Issue
- Request: `/clip?start=0.5&end=0.6&context=60` (0.1s original clip)
- Effective: 0-120.6s (120.6s clip served!)
- Minimum duration check passes because effective duration is large
- Violates intent of MIN_CLIP_DURATION

## Solution
1. Check original clip duration BEFORE context expansion
2. Apply minimum to requested clip, not effective clip
3. Keep context expansion for playback convenience

## Proposed Fix
```javascript
// Check ORIGINAL duration first
const requestedDuration = end - start;
if (requestedDuration < MIN_CLIP_DURATION) {
  return reply.badRequest(
    `Requested clip duration ${requestedDuration}s is below minimum ${MIN_CLIP_DURATION}s`
  );
}

// Then apply context expansion
const effectiveStart = Math.max(0, start - context);
const effectiveEnd = Math.min(audioFile.duration, end + context);
```

## Acceptance Criteria
- [ ] Original duration validated before context expansion
- [ ] Short clips rejected even with large context
- [ ] Context expansion still works for valid clips
- [ ] Unit test for bypass prevention
- [ ] Integration test for validation order

## TDD Tasks
1. Write failing test for bypass attempt
2. Write failing test for valid clip with context
3. Reorder validation in clip handler
4. Update error messages
5. Verify all tests pass
