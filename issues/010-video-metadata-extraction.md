# Issue 010: Add Video Metadata Extraction via FFprobe

## Problem
Video files are accepted but no metadata extracted (resolution, FPS, codec, duration).

## Location
- `trix-api/src/lib/audio/file-upload-handler.js`
- `trix-api/src/lib/audio/transcription-processor.js`

## Current State
- Video MIME types accepted (video/mp4, video/webm, etc.)
- Only audio track extracted for transcription
- No video-specific metadata stored
- No thumbnail generation

## Solution
1. Create VideoMetadataExtractor service using ffprobe
2. Extract: resolution, FPS, codec, bitrate, duration, color space
3. Store in audio_files.metadata JSONB
4. Generate thumbnail from first frame (optional)

## Proposed Implementation
```javascript
class VideoMetadataExtractor {
  async extract(filePath) {
    const probe = await ffprobe(filePath);
    const videoStream = probe.streams.find(s => s.codec_type === 'video');
    const audioStream = probe.streams.find(s => s.codec_type === 'audio');

    return {
      video: {
        width: videoStream?.width,
        height: videoStream?.height,
        fps: eval(videoStream?.r_frame_rate),
        codec: videoStream?.codec_name,
        bitrate: videoStream?.bit_rate,
        duration: parseFloat(videoStream?.duration),
      },
      audio: {
        codec: audioStream?.codec_name,
        sampleRate: audioStream?.sample_rate,
        channels: audioStream?.channels,
        bitrate: audioStream?.bit_rate,
      }
    };
  }
}
```

## Acceptance Criteria
- [ ] FFprobe integration for metadata extraction
- [ ] Video metadata stored in audio_files.metadata
- [ ] Graceful fallback if ffprobe unavailable
- [ ] Unit tests for metadata extraction
- [ ] Integration test for upload flow

## TDD Tasks
1. Write failing test for metadata extraction
2. Write failing test for storage in database
3. Write failing test for ffprobe unavailable fallback
4. Implement VideoMetadataExtractor
5. Integrate into upload handler
6. Verify all tests pass
