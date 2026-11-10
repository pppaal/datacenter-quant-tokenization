/**
 * Client for the deal-document analyzer service (holdco-analyzer, Python).
 *
 * The analyzer reads a deal's documents end to end, keeps page notes with
 * machine-verified quotes, builds a fact dictionary and generates the bank's
 * pre-consultation memo and the back-leverage cash-flow model. The OS owns the
 * operator session, the deal record and the audit trail; this module only
 * forwards documents and proxies analysis calls.
 *
 * Trust model: the OS verifies the operator, then calls the analyzer with the
 * shared service token plus `X-Operator` / `X-Operator-Role`. The analyzer
 * records that operator in its own hash-chained audit log and applies its own
 * per-deal NDA gate before anything is sent to an AI model. The browser never
 * talks to the analyzer directly and never chooses `deal_id` or `operator`.
 *
 * See docs/analyzer-integration.md.
 */
import type { PrismaClient } from '@prisma/client';
import { env } from '@/lib/env';
import { reportError } from '@/lib/observability/logger';
import type { AdminAccessRole } from '@/lib/security/admin-auth';

export class AnalyzerConfigurationError extends Error {
  constructor(
    message = 'Analyzer service is not configured (ANALYZER_URL / ANALYZER_SERVICE_TOKEN).'
  ) {
    super(message);
    this.name = 'AnalyzerConfigurationError';
  }
}

export class AnalyzerRequestError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Analyzer responded ${status}: ${detail}`);
    this.name = 'AnalyzerRequestError';
    this.status = status;
    this.detail = detail;
  }
}

export type AnalyzerConfig = { url: string; token: string; timeoutMs: number };
export type AnalyzerOperator = { identifier: string; role: AdminAccessRole };
export type AnalyzerRole = 'analyst' | 'compliance' | 'admin';

const MIN_TOKEN_LENGTH = 24; // the analyzer ignores shorter tokens (it would never accept the call)
const DEFAULT_TIMEOUT_MS = 120_000;
const OUTPUT_NAME = /^[A-Za-z0-9_.-]{1,80}$/;

export function getAnalyzerConfig(): AnalyzerConfig | null {
  const e = env();
  if (!e.ANALYZER_URL || !e.ANALYZER_SERVICE_TOKEN) return null;
  if (e.ANALYZER_SERVICE_TOKEN.length < MIN_TOKEN_LENGTH) return null;
  return {
    url: e.ANALYZER_URL.replace(/\/+$/, ''),
    token: e.ANALYZER_SERVICE_TOKEN,
    timeoutMs: e.ANALYZER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  };
}

export function isAnalyzerConfigured(): boolean {
  return getAnalyzerConfig() !== null;
}

/** Analyzer deal ids are `[a-z0-9_-]`; the OS dealCode may carry case, spaces or dots. */
export function toAnalyzerDealId(dealCode: string): string {
  const slug = dealCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 60);
  return slug || 'deal';
}

/** OS roles → analyzer roles. Only ADMIN may act as the analyzer's compliance/admin. */
export function toAnalyzerRole(role: AdminAccessRole): AnalyzerRole {
  return role === 'ADMIN' ? 'admin' : 'analyst';
}

/** HTTP header values must be ASCII; Korean operator names are percent-encoded (the analyzer unquotes). */
function sanitizeOperator(identifier: string): string {
  const cleaned = identifier
    .replace(/[|\r\n]/g, ' ')
    .trim()
    .slice(0, 80);
  return encodeURIComponent(cleaned || 'os-operator');
}

export function analyzerHeaders(
  cfg: AnalyzerConfig,
  operator: AnalyzerOperator
): Record<string, string> {
  return {
    'X-Service-Token': cfg.token,
    'X-Operator': sanitizeOperator(operator.identifier),
    'X-Operator-Role': toAnalyzerRole(operator.role)
  };
}

// ---------------------------------------------------------------- proxy allow-list

export type ProxyRoute = {
  method: 'GET' | 'POST';
  path: RegExp;
  /** Analyzer path for the matched OS path. */
  target: (analyzerDealId: string, match: RegExpMatchArray) => string | null;
  mutation: boolean;
  minRole: AdminAccessRole;
};

/**
 * Only these analyzer endpoints are reachable through the OS. Everything is
 * deal-scoped: the proxy injects `deal_id` (POST body) or the deal path segment
 * (GET) and overrides anything the client sent.
 */
export const PROXY_ROUTES: ProxyRoute[] = [
  {
    method: 'GET',
    path: /^docs\/overview$/,
    target: (d) => `/api/docs/overview/${d}`,
    mutation: false,
    minRole: 'VIEWER'
  },
  {
    method: 'GET',
    path: /^docs\/facts$/,
    target: (d) => `/api/docs/facts/${d}`,
    mutation: false,
    minRole: 'VIEWER'
  },
  {
    method: 'GET',
    path: /^docs\/prememo-file$/,
    target: (d) => `/api/docs/prememo/${d}`,
    mutation: false,
    minRole: 'VIEWER'
  },
  {
    method: 'GET',
    path: /^docs\/outputs\/([^/]+)$/,
    target: (d, m) =>
      OUTPUT_NAME.test(m[1]) && !m[1].includes('..') ? `/api/docs/outputs/${d}/${m[1]}` : null,
    mutation: false,
    minRole: 'VIEWER'
  },
  {
    method: 'POST',
    path: /^docs\/(digest|review|index|gaps|prememo|model_bl|extract_pack|fullread_plan|fullread_pack|review2_pack)$/,
    target: (_d, m) => `/api/docs/${m[1]}`,
    mutation: true,
    minRole: 'ANALYST'
  },
  {
    method: 'POST',
    path: /^docs\/(fullread_apply|fullread_api|second_api|review2_api|extract_apply)$/,
    target: (_d, m) => `/api/docs/${m[1]}`,
    mutation: true,
    minRole: 'ANALYST'
  },
  {
    method: 'POST',
    path: /^compliance\/nda$/,
    target: () => '/api/compliance/nda',
    mutation: true,
    minRole: 'ADMIN'
  }
];

export function matchProxyRoute(
  method: string,
  path: string
): { route: ProxyRoute; match: RegExpMatchArray } | null {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  for (const route of PROXY_ROUTES) {
    if (route.method !== method.toUpperCase()) continue;
    const match = normalized.match(route.path);
    if (match) return { route, match };
  }
  return null;
}

// ---------------------------------------------------------------- transport

export async function analyzerFetch(
  cfg: AnalyzerConfig,
  path: string,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: BodyInit;
    timeoutMs?: number;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? cfg.timeoutMs);
  try {
    return await fetch(`${cfg.url}${path}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
      cache: 'no-store'
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
      const detail = parsed.detail ?? parsed.error;
      if (typeof detail === 'string') return detail;
      if (detail && typeof detail === 'object') return JSON.stringify(detail).slice(0, 400);
    } catch {
      /* not JSON */
    }
    return text.slice(0, 400) || response.statusText;
  } catch {
    return response.statusText;
  }
}

/** POST JSON to the analyzer (deal_id/operator must already be in `body`). Throws on non-2xx. */
export async function analyzerPostJson<T = unknown>(
  path: string,
  operator: AnalyzerOperator,
  body: Record<string, unknown>
): Promise<T> {
  const cfg = getAnalyzerConfig();
  if (!cfg) throw new AnalyzerConfigurationError();
  const response = await analyzerFetch(cfg, path, {
    method: 'POST',
    headers: { ...analyzerHeaders(cfg, operator), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok)
    throw new AnalyzerRequestError(response.status, await readErrorDetail(response));
  return (await response.json()) as T;
}

export type AnalyzerOverview = {
  deal_id: string;
  exists: boolean;
  files: number;
  file_names?: string[];
  index?: { files?: number; pages?: number; chunks?: number; error?: string };
  outputs: Record<string, { bytes: number; updated_at: string }>;
  fullread_pages?: number;
  gate: Record<string, { allowed: boolean; label: string; reasons: string[] }> | null;
  nda_registered?: boolean;
  provider_ok?: boolean;
  local_allowed?: boolean;
};

export async function getAnalyzerOverview(
  dealCode: string,
  operator: AnalyzerOperator
): Promise<AnalyzerOverview> {
  const cfg = getAnalyzerConfig();
  if (!cfg) throw new AnalyzerConfigurationError();
  const dealId = toAnalyzerDealId(dealCode);
  const response = await analyzerFetch(cfg, `/api/docs/overview/${dealId}`, {
    method: 'GET',
    headers: analyzerHeaders(cfg, operator),
    timeoutMs: 15_000
  });
  if (!response.ok)
    throw new AnalyzerRequestError(response.status, await readErrorDetail(response));
  return (await response.json()) as AnalyzerOverview;
}

// ---------------------------------------------------------------- document forwarding

export type ForwardDocumentInput = {
  dealCode: string;
  operator: AnalyzerOperator;
  fileName: string;
  contentType?: string | null;
  bytes: Uint8Array;
};

export type ForwardDocumentResult = {
  ok: boolean;
  status?: number;
  error?: string;
  skipped?: boolean;
};

/**
 * Push one stored document to the analyzer's data room for a deal. Never throws:
 * the OS upload has already succeeded, so a forwarding failure is reported out of
 * band and the operator can re-run indexing from the Deal page.
 */
export async function forwardDocumentToAnalyzer(
  input: ForwardDocumentInput
): Promise<ForwardDocumentResult> {
  const cfg = getAnalyzerConfig();
  if (!cfg) return { ok: false, skipped: true, error: 'not configured' };
  try {
    const form = new FormData();
    form.set('deal_id', toAnalyzerDealId(input.dealCode));
    form.set('operator', sanitizeOperator(input.operator.identifier));
    const copy = new Uint8Array(input.bytes.byteLength);
    copy.set(input.bytes); // own ArrayBuffer (never SharedArrayBuffer) so Blob accepts it
    const blob = new Blob([copy], { type: input.contentType || 'application/octet-stream' });
    form.set('files', blob, input.fileName);
    const response = await analyzerFetch(cfg, '/api/docs/upload', {
      method: 'POST',
      headers: analyzerHeaders(cfg, input.operator),
      body: form
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      void reportError(new AnalyzerRequestError(response.status, detail), {
        scope: 'analyzer.forwardDocument',
        dealCode: input.dealCode,
        fileName: input.fileName
      });
      return { ok: false, status: response.status, error: detail };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    void reportError(error, {
      scope: 'analyzer.forwardDocument',
      dealCode: input.dealCode,
      fileName: input.fileName
    });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

type DealLookupDb = Pick<PrismaClient, 'deal'>;

/** Forward to the deal the upload belongs to. */
export async function forwardDocumentForDeal(
  db: DealLookupDb,
  input: Omit<ForwardDocumentInput, 'dealCode'> & { dealId: string }
): Promise<ForwardDocumentResult> {
  if (!isAnalyzerConfigured()) return { ok: false, skipped: true, error: 'not configured' };
  const deal = await db.deal.findUnique({
    where: { id: input.dealId },
    select: { dealCode: true }
  });
  if (!deal) return { ok: false, skipped: true, error: 'deal not found' };
  return forwardDocumentToAnalyzer({ ...input, dealCode: deal.dealCode });
}

/** Asset-level upload: forward to every open deal on that asset (usually one). */
export async function forwardDocumentForAsset(
  db: DealLookupDb,
  input: Omit<ForwardDocumentInput, 'dealCode'> & { assetId: string }
): Promise<ForwardDocumentResult[]> {
  if (!isAnalyzerConfigured()) return [];
  const deals = await db.deal.findMany({
    where: { assetId: input.assetId, archivedAt: null },
    select: { dealCode: true }
  });
  const results: ForwardDocumentResult[] = [];
  for (const deal of deals) {
    results.push(await forwardDocumentToAnalyzer({ ...input, dealCode: deal.dealCode }));
  }
  return results;
}
