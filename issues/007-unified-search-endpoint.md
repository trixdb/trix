# Issue 007: Create Unified Search Endpoint with RRF

## Problem
Audio search is completely isolated from memory search. Different ranking algorithms, no cross-modal discovery.

## Location
- Memory search: `trix-api/src/routes/memories/index.js`
- Audio search: `trix-api/src/lib/audio/audio-utils.js`

## Current State
- Memory search uses RRF (Reciprocal Rank Fusion)
- Audio search uses fixed 0.7/0.3 weights
- No unified endpoint to search both
- Results incomparable due to different scoring

## Solution
1. Create `/search` unified endpoint
2. Apply RRF to audio segment search
3. Merge results from memories and audio with consistent scoring
4. Add `include` parameter: `?include=memories,audio,clusters`

## API Design
```
GET /search?q=budget+discussion&include=memories,audio
Response:
{
  "results": [
    { "type": "memory", "id": "...", "score": 0.92, ... },
    { "type": "audio_segment", "id": "...", "score": 0.89, "clip_url": "...", ... },
    ...
  ],
  "facets": {
    "memories": 15,
    "audio_segments": 8
  }
}
```

## Acceptance Criteria
- [ ] Unified /search endpoint exists
- [ ] RRF applied to audio segment ranking
- [ ] Results merged and sorted by unified score
- [ ] Include parameter filters result types
- [ ] Unit tests for RRF on audio segments
- [ ] Integration test for cross-modal search

## TDD Tasks
1. Write failing test for unified endpoint
2. Write failing test for RRF audio ranking
3. Write failing test for result merging
4. Implement UnifiedSearchService
5. Create /search route
6. Verify all tests pass
