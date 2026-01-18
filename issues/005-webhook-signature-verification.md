# Issue 005: Missing Webhook HMAC Signature Verification

## Problem
AssemblyAI webhook only validates custom header, not the cryptographic HMAC signature.

## Location
- `trix-api/src/routes/webhooks-assemblyai.js:17-31`

## Current Code
```javascript
function verifyWebhookAuth(headerValue, expectedSecret) {
  if (!headerValue || !expectedSecret) return false;
  return crypto.timingSafeEqual(Buffer.from(headerValue), Buffer.from(expectedSecret));
}
```

## Issue
- Only validates a custom header (fragile, non-standard)
- AssemblyAI sends `x-assemblyai-signature` with HMAC-SHA256
- Signature not validated, allowing potential webhook spoofing

## Solution
1. Implement proper HMAC-SHA256 signature verification
2. Validate `x-assemblyai-signature` header
3. Keep timing-safe comparison for security

## Proposed Fix
```javascript
function verifyWebhookSignature(payload, signature, secret) {
  if (!payload || !signature || !secret) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
```

## Acceptance Criteria
- [ ] HMAC-SHA256 signature verified for all webhooks
- [ ] Invalid signatures rejected with 401
- [ ] Timing-safe comparison prevents timing attacks
- [ ] Unit tests for signature verification
- [ ] Integration test for webhook flow

## TDD Tasks
1. Write failing test for valid signature acceptance
2. Write failing test for invalid signature rejection
3. Write failing test for timing-safe comparison
4. Implement verifyWebhookSignature function
5. Update webhook handler to use new verification
6. Verify all tests pass
