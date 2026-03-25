export const DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const DEFAULT_ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export class UploadPolicyError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UploadPolicyError';
    this.status = status;
  }
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getDocumentUploadPolicy(env: NodeJS.ProcessEnv = process.env) {
  const maxBytes = parsePositiveNumber(env.DOCUMENT_UPLOAD_MAX_BYTES, DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES);
  const allowedTypes = (env.DOCUMENT_UPLOAD_ALLOWED_TYPES ?? DEFAULT_ALLOWED_DOCUMENT_TYPES.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    maxBytes,
    allowedTypes
  };
}

export function validateDocumentUpload(
  file: {
    size: number;
    type?: string | null;
  },
  policy = getDocumentUploadPolicy()
) {
  if (file.size <= 0) {
    throw new UploadPolicyError('File is empty', 400);
  }

  if (file.size > policy.maxBytes) {
    throw new UploadPolicyError(`File exceeds the ${policy.maxBytes}-byte upload limit`, 413);
  }

  const normalizedType = file.type?.trim();
  if (normalizedType && !policy.allowedTypes.includes(normalizedType)) {
    throw new UploadPolicyError(`Unsupported file type: ${normalizedType}`, 415);
  }
}
