# Issue 009: Implement Soft Delete for Audio Files

## Problem
audio_files uses hard delete while segments/entities use soft delete, causing inconsistency.

## Location
- `trix-api/migrations/20241001000000_initial_schema.js`
- `trix-api/src/repositories/AudioRepository.js`

## Current State
- audio_files: No deleted_at column, hard delete only
- audio_segments: Has deleted_at, soft delete supported
- audio_entities: Has deleted_at, soft delete supported
- audio_chapters: Has deleted_at, soft delete supported

## Issue
- Deleted audio files cannot be recovered
- Inconsistent with rest of system (memories use soft delete)
- No audit trail for deletions

## Solution
1. Add deleted_at column to audio_files
2. Add deleted_by column for audit trail
3. Update AudioRepository.delete() to soft delete
4. Add cascade soft delete trigger for children
5. Update queries to filter deleted_at IS NULL

## Migration
```sql
ALTER TABLE audio_files
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES users(id);

CREATE INDEX idx_audio_files_deleted_at ON audio_files(deleted_at)
  WHERE deleted_at IS NULL;
```

## Acceptance Criteria
- [ ] deleted_at column added to audio_files
- [ ] AudioRepository.delete() sets deleted_at
- [ ] Queries filter out soft-deleted records
- [ ] Cascade soft delete to children
- [ ] Unit test for soft delete behavior
- [ ] Migration test for schema change

## TDD Tasks
1. Write failing test for soft delete behavior
2. Write failing test for cascade to children
3. Write failing test for query filtering
4. Create migration for new columns
5. Update AudioRepository
6. Verify all tests pass
