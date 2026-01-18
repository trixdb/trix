# Issue 003: Version Race Condition in Transcription

## Problem
Concurrent transcriptions can write the same version number due to race condition in version incrementing.

## Location
- `trix-api/src/repositories/AudioTranscriptRepository.js:149-156`

## Current Code
```javascript
const versionResult = await client.query(
  `SELECT COALESCE(MAX(transcription_version), 0) as version
   FROM audio_segments
   WHERE audio_file_id = $1`,
  [audioFileId]
);
const newVersion = versionResult.rows[0].version + 1;  // Race condition here
```

## Issue
- Thread A: reads version = 1, increments to 2
- Thread B: reads version = 1, increments to 2
- Both write version 2, causing duplicate/overwritten segments

## Solution
1. Use row-level lock on audio_files during version increment
2. Or use PostgreSQL sequence for version numbers
3. Ensure version increment is atomic within transaction

## Proposed Fix
```javascript
// Option 1: Use FOR UPDATE lock
const versionResult = await client.query(
  `SELECT COALESCE(MAX(transcription_version), 0) as version
   FROM audio_segments
   WHERE audio_file_id = $1
   FOR UPDATE`,  // Lock rows during read
  [audioFileId]
);

// Option 2: Use atomic increment in audio_files table
await client.query(
  `UPDATE audio_files
   SET current_transcription_version = current_transcription_version + 1
   WHERE id = $1
   RETURNING current_transcription_version`,
  [audioFileId]
);
```

## Acceptance Criteria
- [ ] Concurrent transcriptions get unique version numbers
- [ ] No duplicate segments from race conditions
- [ ] Unit test for concurrent version increment
- [ ] Integration test with parallel transcription requests

## TDD Tasks
1. Write failing test for concurrent version uniqueness
2. Write failing test for segment deduplication
3. Implement atomic version increment
4. Add version column to audio_files if needed
5. Verify all tests pass under concurrent load
