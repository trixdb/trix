# Issue 011: Fix VBR Seek Edge Cases

## Problem
VBR (Variable Bit Rate) byte offset calculation has edge case bugs at file boundaries.

## Location
- `trix-api/src/lib/audio/clip-streaming.js:82-147`

## Current Code Issues

### Issue 1: Before First Index Point (lines 93-102)
```javascript
// Extrapolates using first two index points
const avgBytesPerSec = (vbrIndex[1].byte - vbrIndex[0].byte) /
                       (vbrIndex[1].time - vbrIndex[0].time);
return Math.max(0, vbrIndex[0].byte - (vbrIndex[0].time - timeSeconds) * avgBytesPerSec);
```
- If file has header metadata, first byte offset may be inaccurate
- Could calculate negative offset (mitigated by Math.max but still wrong)

### Issue 2: After Last Index Point (lines 105-121)
```javascript
// Uses last two points' ratio for extrapolation
```
- May not reflect final bitrate variation
- Progressively encoded files with silence padding cause overshoot

### Issue 3: No Seek Index Validation
- No check that packet positions are monotonically increasing
- Corrupted files could produce invalid byte positions

## Solution
1. Add header offset detection and compensation
2. Improve extrapolation with weighted averaging
3. Add seek index validation on creation
4. Add bounds checking with file size

## Acceptance Criteria
- [ ] Accurate seeking for times before first index point
- [ ] Accurate seeking for times after last index point
- [ ] Invalid seek index rejected during creation
- [ ] Bounds checking against actual file size
- [ ] Unit tests for all edge cases

## TDD Tasks
1. Write failing test for pre-index seeking
2. Write failing test for post-index seeking
3. Write failing test for index validation
4. Write failing test for bounds checking
5. Implement fixes in clip-streaming.js
6. Verify all tests pass
