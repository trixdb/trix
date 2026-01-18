# Issue 002: Base64 Buffer in Redis Causing Memory Exhaustion

## Problem
Large audio files (up to 100MB) are being base64 encoded and stored in Redis job queue, causing memory exhaustion.

## Location
- `trix-api/src/routes/memories/audio.js:289`

## Current Code
```javascript
jobQueue.enqueue('transcription', {
  audioFileId,
  memoryId: id,
  fileBuffer: fileBuffer.toString('base64'),  // 100MB → 133MB in Redis
  filename: audioFile.original_filename,
  ...transcriptionOptions,
})
```

## Correct Pattern (already exists elsewhere)
```javascript
// From file-upload-handler.js line 334
jobQueue.enqueue('transcription', {
  audioFileId: audioFile.id,
  memoryId: memoryResult.rows[0].id,
  s3Key: s3Key,  // Reference, not buffer
  filename: sanitizedFilename,
  language,
})
```

## Solution
1. Replace base64 buffer with S3 key reference
2. Update transcription processor to fetch from S3
3. Remove file buffer from job payload entirely

## Acceptance Criteria
- [ ] Job payload contains s3Key, not fileBuffer
- [ ] Transcription processor fetches file from S3
- [ ] Redis memory usage reduced by ~95% for large files
- [ ] Unit tests for job payload structure
- [ ] Integration test for S3-based transcription flow

## TDD Tasks
1. Write failing test asserting job payload has s3Key not fileBuffer
2. Write failing test for transcription processor S3 fetch
3. Update audio.js to pass s3Key instead of buffer
4. Update transcription processor to handle s3Key
5. Verify all tests pass
