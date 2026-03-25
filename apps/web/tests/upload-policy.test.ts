import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES,
  UploadPolicyError,
  getDocumentUploadPolicy,
  validateDocumentUpload
} from '@/lib/security/upload-policy';

test('upload policy uses defaults when env is missing', () => {
  const policy = getDocumentUploadPolicy({ NODE_ENV: 'test' });
  assert.equal(policy.maxBytes, DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES);
  assert.ok(policy.allowedTypes.includes('application/pdf'));
});

test('upload policy rejects oversized files', () => {
  assert.throws(
    () =>
      validateDocumentUpload(
        { size: DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES + 1, type: 'application/pdf' },
        getDocumentUploadPolicy({ NODE_ENV: 'test' })
      ),
    (error) => error instanceof UploadPolicyError && error.status === 413
  );
});

test('upload policy rejects unsupported mime types', () => {
  assert.throws(
    () =>
      validateDocumentUpload(
        { size: 1024, type: 'application/x-msdownload' },
        getDocumentUploadPolicy({ NODE_ENV: 'test' })
      ),
    (error) => error instanceof UploadPolicyError && error.status === 415
  );
});
