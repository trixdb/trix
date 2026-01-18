# Issue 014: Add Full Transcript Search Index

## Problem
Only segments are indexed for full-text search, not complete transcripts.

## Location
- `trix-api/migrations/20241001000000_initial_schema.js`
- `trix-api/src/lib/audio/audio-utils.js`

## Current State
- `audio_files.full_transcript` exists but has NO tsvector
- `audio_segments.search_vector` is indexed (GIN)
- Searching full transcripts requires segment-by-segment scan
- Cannot search for multi-sentence concepts spanning segments

## Solution
1. Add full_transcript_search_vector column to audio_files
2. Create GIN index on the new column
3. Update transcription processor to generate tsvector
4. Add search query for full transcripts

## Migration
```sql
ALTER TABLE audio_files
  ADD COLUMN full_transcript_search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', COALESCE(full_transcript, ''))) STORED;

CREATE INDEX idx_audio_files_full_transcript_search
  ON audio_files USING GIN(full_transcript_search_vector);
```

## Acceptance Criteria
- [ ] full_transcript_search_vector column added
- [ ] GIN index created for fast search
- [ ] Search queries can target full transcript
- [ ] Migration handles existing data
- [ ] Unit tests for transcript search
- [ ] Performance test for large transcripts

## TDD Tasks
1. Write failing test for full transcript search
2. Write failing test for multi-sentence query
3. Create migration for new column and index
4. Update search queries to use new index
5. Verify all tests pass
