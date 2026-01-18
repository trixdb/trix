# Issue 013: Implement S3 Bucket Backup/Replication

## Problem
Audio files in S3 are not backed up - if bucket is lost, all audio files are gone permanently.

## Location
- `trix-api/src/plugins/s3.js`
- `trix-api/src/lib/pipeline/backup-service.js`

## Current State
- BackupService tracks backup metadata in database
- Database backups exist
- S3 audio files have NO backup mechanism
- If S3 bucket deleted/corrupted, all audio lost

## Solution
1. Implement S3 cross-region replication (preferred)
2. Or implement backup job to copy to secondary bucket
3. Add backup status tracking per audio file
4. Implement recovery procedure

## Option 1: Cross-Region Replication (AWS/R2 native)
```javascript
// Configure via S3 bucket settings, not code
// Document in deployment guide
```

## Option 2: Application-Level Backup
```javascript
class S3BackupService {
  constructor(primaryS3, backupS3, logger) {
    this.primary = primaryS3;
    this.backup = backupS3;
    this.logger = logger;
  }

  async backupFile(s3Key) {
    const { body, contentType } = await this.primary.get(s3Key);
    await this.backup.upload(s3Key, body, { contentType });
    return { backed_up_at: new Date() };
  }

  async restoreFile(s3Key) {
    const { body, contentType } = await this.backup.get(s3Key);
    await this.primary.upload(s3Key, body, { contentType });
    return { restored_at: new Date() };
  }
}
```

## Acceptance Criteria
- [ ] Backup mechanism for S3 audio files
- [ ] Backup status tracked per file
- [ ] Recovery procedure documented and tested
- [ ] Unit tests for backup/restore operations
- [ ] Integration test for disaster recovery

## TDD Tasks
1. Write failing test for backup operation
2. Write failing test for restore operation
3. Write failing test for status tracking
4. Implement S3BackupService
5. Create backup job
6. Verify all tests pass
