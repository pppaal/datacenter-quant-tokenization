import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';
import { isRealProduction } from '@/lib/runtime-env';

export type UploadableFile = {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
};

export type StorageSaveInput = {
  assetId: string;
  title: string;
  versionNumber: number;
  file: UploadableFile;
};

export type StorageSaveResult = {
  storagePath: string;
};

export interface DocumentStorageAdapter {
  save(input: StorageSaveInput): Promise<StorageSaveResult>;
  /**
   * Read the bytes for a previously saved document. The `storagePath` value
   * is whatever the matching `save` call returned (cwd-relative for local
   * storage, `s3://bucket/key` for S3).
   */
  read(storagePath: string): Promise<Buffer>;
  /**
   * Delete a previously saved document. Idempotent: deleting a missing
   * object is treated as success.
   */
  delete(storagePath: string): Promise<void>;
  /**
   * Issue a short-lived URL the browser can fetch directly. Local-FS
   * storage returns a path-style URL anchored at `localFileBaseUrl` (defaults
   * to `file://`); S3 storage returns a real presigned GET URL.
   */
  presignedUrl(storagePath: string, ttlSeconds?: number): Promise<string>;
}

const S3_URI_PREFIX = 's3://';

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith(S3_URI_PREFIX)) return null;
  const rest = uri.slice(S3_URI_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

const DEFAULT_LOCAL_ROOT = path.join(process.cwd(), 'storage', 'documents');

function sanitizeSegment(input: string, fallback: string): string {
  const trimmed = input.trim().replace(/[^\w.\-]+/g, '_');
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildObjectKey(input: StorageSaveInput): string {
  const asset = sanitizeSegment(input.assetId, 'asset');
  const title = sanitizeSegment(input.title, 'document');
  const fileName = sanitizeSegment(input.file.name, `v${input.versionNumber}.bin`);
  return path.posix.join(asset, title, `v${input.versionNumber}`, fileName);
}

/**
 * Local-filesystem document storage. Returns the saved file path as a
 * cwd-relative path so callers can rebuild the absolute path with
 * `path.join(process.cwd(), storagePath)` regardless of where rootDir lives.
 *
 * Use this adapter for local development and the test suite. Production
 * deployments on Vercel must use `createS3DocumentStorage` instead because
 * the serverless filesystem is non-durable outside `/tmp`.
 */
export function createLocalDocumentStorage(
  rootDir: string = env().DOCUMENT_STORAGE_DIR || DEFAULT_LOCAL_ROOT
): DocumentStorageAdapter {
  const absoluteRoot = path.isAbsolute(rootDir) ? rootDir : path.resolve(process.cwd(), rootDir);

  function resolveAbsolute(storagePath: string): string {
    return path.isAbsolute(storagePath) ? storagePath : path.resolve(process.cwd(), storagePath);
  }

  return {
    async save(input) {
      const objectKey = buildObjectKey(input);
      const absolutePath = path.join(absoluteRoot, objectKey);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, input.file.buffer);
      const relative = path.relative(process.cwd(), absolutePath);
      return { storagePath: relative };
    },
    async read(storagePath) {
      return readFile(resolveAbsolute(storagePath));
    },
    async delete(storagePath) {
      try {
        await unlink(resolveAbsolute(storagePath));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },
    async presignedUrl(storagePath) {
      return `file://${resolveAbsolute(storagePath)}`;
    }
  };
}

export type S3StorageConfig = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
};

/**
 * S3-compatible document storage (AWS S3, Cloudflare R2, MinIO, Wasabi, ...).
 *
 * Credentials are sourced from the explicit config or fall back to the
 * standard AWS credential chain (env vars, instance profile, etc.).
 *
 * The returned `storagePath` is the canonical `s3://<bucket>/<key>` URI so
 * callers can later resolve a presigned URL or re-fetch the object.
 */
export function createS3DocumentStorage(config: S3StorageConfig): DocumentStorageAdapter {
  const clientConfig: S3ClientConfig = {
    region: config.region ?? env().AWS_REGION ?? 'us-east-1',
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint)
  };
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    };
  }
  const client = new S3Client(clientConfig);
  const prefix = config.prefix?.replace(/^\/+|\/+$/g, '');

  function resolveBucketAndKey(storagePath: string): { bucket: string; key: string } {
    const parsed = parseS3Uri(storagePath);
    if (parsed) return parsed;
    // Treat raw paths as keys inside the configured bucket so callers can
    // pass either an absolute s3:// URI or a stored object key.
    return { bucket: config.bucket, key: storagePath };
  }

  return {
    async save(input) {
      const objectKey = buildObjectKey(input);
      const key = prefix ? `${prefix}/${objectKey}` : objectKey;
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: input.file.buffer,
          ContentType: input.file.type || 'application/octet-stream',
          ContentLength: input.file.size
        })
      );
      return { storagePath: `s3://${config.bucket}/${key}` };
    },
    async read(storagePath) {
      const { bucket, key } = resolveBucketAndKey(storagePath);
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = response.Body;
      if (!body) {
        throw new Error(`S3 object ${storagePath} returned an empty body.`);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async delete(storagePath) {
      const { bucket, key } = resolveBucketAndKey(storagePath);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async presignedUrl(storagePath, ttlSeconds = 300) {
      const { bucket, key } = resolveBucketAndKey(storagePath);
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ttlSeconds
      });
    }
  };
}

/**
 * Auto-select a storage adapter from environment variables. Prefers S3
 * (`DOCUMENT_STORAGE_BUCKET`) over the local filesystem; falls back to
 * `createLocalDocumentStorage()` when no bucket is configured.
 *
 * In a real production runtime this throws if no S3 bucket is configured, since
 * the local filesystem is not durable on Vercel. The production-mode browser
 * E2E (which runs `next start` but has no S3) opts out via the
 * `E2E_PRODUCTION_BUILD` flag — see `isRealProduction`. The production preflight
 * rejects that flag, so local storage can never ship to real prod.
 */
export function createDocumentStorageFromEnv(): DocumentStorageAdapter {
  const config = env();
  const bucket = config.DOCUMENT_STORAGE_BUCKET;
  if (bucket) {
    return createS3DocumentStorage({
      bucket,
      region: config.DOCUMENT_STORAGE_REGION || config.AWS_REGION,
      endpoint: config.DOCUMENT_STORAGE_ENDPOINT || undefined,
      accessKeyId: config.DOCUMENT_STORAGE_ACCESS_KEY_ID || undefined,
      secretAccessKey: config.DOCUMENT_STORAGE_SECRET_ACCESS_KEY || undefined,
      prefix: config.DOCUMENT_STORAGE_PREFIX || undefined,
      forcePathStyle: config.DOCUMENT_STORAGE_FORCE_PATH_STYLE
    });
  }
  if (isRealProduction()) {
    throw new Error(
      'DOCUMENT_STORAGE_BUCKET is required in production. Configure S3-compatible storage or set NODE_ENV != production.'
    );
  }
  return createLocalDocumentStorage();
}
