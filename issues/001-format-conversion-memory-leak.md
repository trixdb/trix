# Issue 001: Memory Leak in Format Conversion

## Problem
PassThrough stream not properly cleaned up when client disconnects early during format conversion.

## Location
- `trix-api/src/lib/audio/format-conversion.js:306-318`

## Current Code
```javascript
let responseStream = outputStream;
if (this.enableCache && this.s3) {
  const teeStream = new PassThrough();
  outputStream.pipe(teeStream);
  this.cacheConversionAsync(outputStream, cacheKey, mimeType).catch(...)
  responseStream = teeStream;
}
return { stream: responseStream, ... }
```

## Issue
- `outputStream` is piped to `teeStream` AND passed to `cacheConversionAsync()`
- If client closes connection early, `outputStream` listeners remain active but `teeStream` is destroyed
- Memory leak accumulates over time

## Solution
1. Create proper stream cleanup on client disconnect
2. Use single tee pattern with proper error propagation
3. Add stream lifecycle management with cleanup handlers

## Acceptance Criteria
- [ ] Stream cleanup on client disconnect
- [ ] No memory leak after 1000 conversions with early disconnects
- [ ] Unit tests for stream lifecycle
- [ ] Integration test for early disconnect scenario

## TDD Tasks
1. Write failing test for memory leak detection
2. Write failing test for early disconnect cleanup
3. Implement StreamTee utility with proper cleanup
4. Refactor format-conversion.js to use new utility
5. Verify all tests pass
