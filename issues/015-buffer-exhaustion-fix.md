# Issue 015: Fix Buffer Exhaustion in Transcription Download

**STATUS: RESOLVED** (2026-01-23)

## Problem
Buffer exhaustion occurs because size check happens after chunks are already collected.

## Location
- `trix-api/src/lib/audio/transcription-processor.js:50-70`

## Current Code
```javascript
for await (const chunk of s3Response.body) {
  totalSize += chunk.length;
  if (totalSize > MAX_BUFFER_SIZE) {  // 100MB limit
    throw new Error(`Audio file exceeds maximum...`);
  }
  chunks.push(chunk);  // Already pushed before check!
}
fileBuffer = Buffer.concat(chunks);
```

## Issue
- Chunks pushed to array BEFORE size check
- If file is 150MB, first 100MB already in memory when error thrown
- Memory wasted, error thrown too late
- Stream not properly closed on error

## Solution
1. Check size BEFORE pushing to chunks array
2. Close stream immediately on size exceeded
3. Clear chunks array on error to free memory
4. Add early termination for oversized files

## Proposed Fix
```javascript
for await (const chunk of s3Response.body) {
  totalSize += chunk.length;
  if (totalSize > MAX_BUFFER_SIZE) {
    // Clean up before throwing
    chunks.length = 0;  // Clear collected chunks
    s3Response.body.destroy();  // Close stream
    throw new Error(`Audio file exceeds maximum buffer size of ${MAX_BUFFER_SIZE} bytes`);
  }
  chunks.push(chunk);
}
```

## Acceptance Criteria
- [x] Size checked before chunk added to array
- [x] Stream closed on size exceeded
- [x] Memory freed on error
- [x] Clear error message with limit value
- [x] Unit test for oversized file handling
- [x] Memory usage test during error
- [x] Pre-download size check via S3 HEAD request (bonus - most efficient)

## TDD Tasks
1. Write failing test for early termination
2. Write failing test for stream cleanup
3. Write failing test for memory cleanup
4. Implement fix in transcription-processor.js
5. Verify all tests pass
