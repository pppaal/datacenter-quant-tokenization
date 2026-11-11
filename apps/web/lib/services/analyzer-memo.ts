/**
 * Save an analyzer memo draft (사전협의서 / 투자심의 메모 docx) as a document
 * on the deal's asset, so it travels with the deal's documents into the IC
 * packet review.
 *
 * The docx is fetched from the analyzer's allow-listed outputs endpoint and
 * stored through the normal document pipeline (versioned, hashed, storage
 * adapter from env). No extracted text is passed, so the OS never sends the
 * memo body to its own AI summarizer or extraction sidecar: the analyzer's
 * per-deal NDA gate stays the only place that decides AI reads.
 */
import crypto from 'node:crypto';
import { DocumentType, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  AnalyzerConfigurationError,
  AnalyzerRequestError,
  analyzerFetch,
  analyzerHeaders,
  getAnalyzerConfig,
  readErrorDetail,
  toAnalyzerDealId,
  type AnalyzerOperator
} from '@/lib/services/analyzer';
import { uploadDocumentVersion } from '@/lib/services/documents';

export const ANALYZER_MEMO_SPECS = {
  prememo: { prefix: 'prememo', title: '사전협의서 초안' },
  icmemo: { prefix: 'icmemo', title: '투자심의 메모 초안' }
} as const;

export type AnalyzerMemoSpec = keyof typeof ANALYZER_MEMO_SPECS;

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_MEMO_BYTES = 25 * 1024 * 1024;

export function isAnalyzerMemoSpec(value: unknown): value is AnalyzerMemoSpec {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(ANALYZER_MEMO_SPECS, value)
  );
}

export function analyzerMemoFileName(spec: AnalyzerMemoSpec, analyzerDealId: string): string {
  return `${ANALYZER_MEMO_SPECS[spec].prefix}_${analyzerDealId}_draft.docx`;
}

export function analyzerMemoTitle(spec: AnalyzerMemoSpec, dealCode: string): string {
  return `${ANALYZER_MEMO_SPECS[spec].title} (분석기) - ${dealCode}`.slice(0, 140);
}

export class AnalyzerMemoError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AnalyzerMemoError';
    this.status = status;
  }
}

export type SaveAnalyzerMemoInput = {
  dealId: string;
  spec: AnalyzerMemoSpec;
  operator: AnalyzerOperator;
  uploadedById?: string | null;
};

export type SaveAnalyzerMemoResult = {
  documentId: string;
  title: string;
  version: number;
  fileName: string;
  sha256: string;
  bytes: number;
};

export async function saveAnalyzerMemoAsDocument(
  input: SaveAnalyzerMemoInput,
  deps: {
    db?: PrismaClient;
    fetchImpl?: typeof fetch;
    upload?: typeof uploadDocumentVersion;
  } = {}
): Promise<SaveAnalyzerMemoResult> {
  const cfg = getAnalyzerConfig();
  if (!cfg) throw new AnalyzerConfigurationError();
  const db = deps.db ?? prisma;
  const upload = deps.upload ?? uploadDocumentVersion;

  const deal = await db.deal.findUnique({
    where: { id: input.dealId },
    select: { dealCode: true, assetId: true }
  });
  if (!deal) throw new AnalyzerMemoError(404, 'Deal not found.');
  if (!deal.assetId) {
    throw new AnalyzerMemoError(
      409,
      '이 딜에 연결된 자산이 없어 문서로 저장할 수 없습니다. 딜에 자산을 먼저 연결하세요.'
    );
  }

  const analyzerDealId = toAnalyzerDealId(deal.dealCode);
  const fileName = analyzerMemoFileName(input.spec, analyzerDealId);
  const response = await analyzerFetch(
    cfg,
    `/api/docs/outputs/${analyzerDealId}/${fileName}?operator=${encodeURIComponent(input.operator.identifier)}`,
    { method: 'GET', headers: analyzerHeaders(cfg, input.operator), fetchImpl: deps.fetchImpl }
  );
  if (response.status === 404) {
    throw new AnalyzerMemoError(
      404,
      '분석기에 아직 이 메모 초안이 없습니다. 먼저 초안을 만드세요.'
    );
  }
  if (!response.ok)
    throw new AnalyzerRequestError(response.status, await readErrorDetail(response));

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_MEMO_BYTES) {
    throw new AnalyzerMemoError(502, '분석기가 돌려준 메모 파일 크기가 올바르지 않습니다.');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new AnalyzerMemoError(502, '분석기가 docx가 아닌 파일을 돌려줬습니다.');
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const title = analyzerMemoTitle(input.spec, deal.dealCode);
  const existing = await db.document.findFirst({
    where: { assetId: deal.assetId, title },
    select: { id: true }
  });
  const summary =
    `분석기가 만든 ${ANALYZER_MEMO_SPECS[input.spec].title}. 숫자마다 [D# p#] 원문 출처가 붙어 있고, ` +
    "'미확인'은 원문에서 찾지 못한 값, '(초안)' 문장은 심사역 검토가 필요한 서술입니다.";

  const document = await upload(
    {
      assetId: deal.assetId,
      dealId: input.dealId,
      documentId: existing?.id,
      title,
      documentType: DocumentType.REPORT,
      uploadedById: input.uploadedById ?? undefined
    },
    { name: fileName, type: DOCX_MIME, size: buffer.length, buffer },
    { db, summarizer: async () => summary }
  );

  return {
    documentId: document.id,
    title: document.title,
    version: document.currentVersion,
    fileName,
    sha256,
    bytes: buffer.length
  };
}
