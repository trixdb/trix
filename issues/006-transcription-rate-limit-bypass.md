# Issue 006: Transcription Rate Limit Bypass via Bulk API

## Problem
Bulk API applies bulk rate limit (20/minute) instead of transcription rate limit (20/hour), allowing bypass.

## Location
- `trix-api/src/routes/memories/bulk.js`
- `trix-api/src/lib/constants.js:32-73`

## Current Limits
```
transcriptionUploads: 10 req/hour per API key
transcriptionRequests: 20 req/hour per API key
bulk: 20 req/minute per API key
```

## Issue
- User can bulk-create 20 audio memories with auto-transcription
- Each triggers transcription without checking transcription rate limit
- Attack: 20 bulk requests × 100 items = 2000 transcriptions/minute

## Solution
1. Count audio items in bulk request against transcription limit
2. Or disable auto-transcription in bulk operations
3. Apply transcription rate limit per audio item, not per request

## Proposed Fix
```javascript
// In bulk.js before processing
const audioItems = items.filter(item => isAudioMimeType(item.mimeType));
if (audioItems.length > 0) {
  const allowed = await rateLimiters.transcriptionRequests.check(
    request.apiKey,
    audioItems.length
  );
  if (!allowed) {
    return reply.tooManyRequests('Transcription rate limit exceeded');
  }
}
```

## Acceptance Criteria
- [ ] Bulk audio uploads count against transcription limit
- [ ] Rate limit error returned when limit exceeded
- [ ] Unit test for rate limit enforcement in bulk
- [ ] Integration test for limit bypass prevention

## TDD Tasks
1. Write failing test for bulk transcription rate limiting
2. Write failing test for bypass prevention
3. Implement audio item counting in bulk handler
4. Apply transcription rate limit check
5. Verify all tests pass
