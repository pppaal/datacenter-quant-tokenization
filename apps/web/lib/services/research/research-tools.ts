/**
 * Real connectors for the research agent toolset.
 *
 *   Database toolset: searches ResearchSnapshot (internal curated record).
 *                     Always available offline-safe primary source.
 *
 *   HTTP fetch tool:  plain fetch()+HTML→text for any URL surfaced by the
 *                     search half. No vendor lock-in.
 *
 *   Combine:          chains toolsets — primary first, fallback second —
 *                     so callers can layer DB → HTTP → future vendor APIs
 *                     without touching the agent loop.
 *
 * No external search API is wired here yet. The agent calls search_news,
 * which is served by the database connector; when the user seeds news
 * rows into ResearchSnapshot (or we introduce a NewsArticle table in
 * phase C), the LLM gets richer recall automatically.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  ResearchFetchedPage,
  ResearchSource,
  ResearchToolset
} from '@/lib/services/research/research-agent';
import { semanticSearch } from '@/lib/services/research/document-indexer';
import { safeFetch } from '@/lib/security/safe-fetch';

// ---------------------------------------------------------------------------
// Database toolset — queries curated snapshots
// ---------------------------------------------------------------------------

type Snapshot = {
  id: string;
  title: string;
  summary: string | null;
  snapshotDate: Date;
  sourceSystem: string | null;
  provenance: unknown;
};

// Extract a best-effort URL from the provenance JSON blob. We store
// provenance loosely (Json field) so different ingestion paths stash
// different shapes — most common keys seen in practice: `sourceUrl`,
// `url`, `link`.
function urlFromProvenance(prov: unknown): string | null {
  if (!prov || typeof prov !== 'object') return null;
  const p = prov as Record<string, unknown>;
  for (const k of ['sourceUrl', 'url', 'link', 'canonicalUrl']) {
    const v = p[k];
    if (typeof v === 'string' && v.trim().startsWith('http')) return v.trim();
  }
  return null;
}

function snapshotToSource(s: Snapshot): ResearchSource {
  const url = urlFromProvenance(s.provenance) ?? `internal://snapshot/${s.id}`;
  return {
    id: s.id,
    url,
    title: s.title,
    publisher: s.sourceSystem ?? 'Internal Research',
    publishedAt: s.snapshotDate,
    snippet: (s.summary ?? '').slice(0, 500)
  };
}

// Score a snapshot against the query on crude term overlap. Keeps us off
// any extra FTS dependency — fine for the current snapshot volume (~hundreds).
// When the corpus grows, swap this for Prisma full-text-search or Postgres
// tsvector without touching callers.
function scoreSnapshot(query: string, s: Snapshot): number {
  const q = query.toLowerCase();
  const hay = `${s.title} ${s.summary ?? ''}`.toLowerCase();
  let score = 0;
  if (hay.includes(q)) score += 10;
  const terms = q.split(/\s+/).filter((t) => t.length >= 2);
  for (const t of terms) {
    if (hay.includes(t)) score += 1;
  }
  return score;
}

export function createDatabaseToolset(
  prisma: PrismaClient,
  opts: { limit?: number; maxCandidates?: number } = {}
): ResearchToolset {
  const limit = opts.limit ?? 8;
  const maxCandidates = opts.maxCandidates ?? 200;

  return {
    async searchNews(query: string): Promise<ResearchSource[]> {
      if (!query.trim()) return [];
      const candidates = (await prisma.researchSnapshot.findMany({
        where: { approvalStatus: 'APPROVED' },
        orderBy: { snapshotDate: 'desc' },
        take: maxCandidates,
        select: {
          id: true,
          title: true,
          summary: true,
          snapshotDate: true,
          sourceSystem: true,
          provenance: true
        }
      })) as Snapshot[];

      const scored = candidates
        .map((s) => ({ s, score: scoreSnapshot(query, s) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored.map((x) => snapshotToSource(x.s));
    },

    async fetchPage(url: string): Promise<ResearchFetchedPage> {
      const internalMatch = /^internal:\/\/snapshot\/(.+)$/.exec(url);
      if (internalMatch) {
        const id = internalMatch[1]!;
        const snap = (await prisma.researchSnapshot.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            summary: true,
            snapshotDate: true,
            sourceSystem: true
          }
        })) as Pick<Snapshot, 'id' | 'title' | 'summary' | 'snapshotDate' | 'sourceSystem'> | null;
        if (!snap) throw new Error(`snapshot not found: ${id}`);
        return {
          url,
          title: snap.title,
          publishedAt: snap.snapshotDate,
          text: snap.summary ?? ''
        };
      }
      throw new Error(`database toolset cannot fetch external URL: ${url}`);
    },

    /**
     * Semantic-search adapter over DocumentEmbedding. Each hit becomes a
     * ResearchSource so the agent can dedupe corpus passages alongside
     * web sources via the same `seen` set. Title is rebuilt from the
     * Document.title to give the agent a meaningful hint when it later
     * references the result by sourceId.
     */
    async searchCorpus(query: string): Promise<ResearchSource[]> {
      if (!query.trim()) return [];
      const hits = await semanticSearch({ queryText: query, limit }, prisma);
      if (hits.length === 0) return [];

      // Lookup the Document.title for each unique DocumentVersion.id so
      // the source.title field shows something meaningful. The semantic
      // search returned passage text, not the parent file name.
      const versionIds = [...new Set(hits.map((h) => h.documentId))];
      const versions = await prisma.documentVersion.findMany({
        where: { id: { in: versionIds } },
        select: { id: true, document: { select: { title: true } }, createdAt: true }
      });
      const versionLookup = new Map(versions.map((v) => [v.id, v]));

      return hits.map((hit) => {
        const meta = versionLookup.get(hit.documentId);
        return {
          id: `corpus:${hit.documentId}:${hit.chunkIndex}`,
          url: `internal://document/${hit.documentId}#chunk=${hit.chunkIndex}`,
          title: meta?.document?.title ?? `Document ${hit.documentId.slice(0, 8)}`,
          publisher: 'internal-corpus',
          publishedAt: meta?.createdAt ?? null,
          snippet: hit.text.slice(0, 600)
        };
      });
    }
  };
}

// ---------------------------------------------------------------------------
// HTTP fetch — strips tags for an arbitrary URL.
// Tight fetch budget: 8s timeout, 1MB response cap, <meta> publishedAt probe.
// ---------------------------------------------------------------------------

const HTTP_TIMEOUT_MS = 8_000;
const HTTP_MAX_BYTES = 1_000_000;

// Rudimentary HTML→text. Replace with `cheerio`/`jsdom` when the fidelity
// pain of poorly rendered news pages outweighs the dependency weight.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pick a TextDecoder label for the response body. Prefer the charset from
 * Content-Type, then look for a meta http-equiv / meta charset tag in the
 * first 4 KiB of bytes (decoded as latin-1 since charset tags are ASCII).
 * Falls back to UTF-8. Korean government / KOSPI listed-company sites
 * still serve a meaningful number of pages as EUC-KR or CP949; without
 * this they decoded into corrupted bytes that the LLM treated as garbage.
 */
export function pickEncoding(contentType: string | null, head: Uint8Array): string {
  const labelFromHeader = contentType?.toLowerCase().match(/charset=([^;\s]+)/);
  if (labelFromHeader) return labelFromHeader[1]!.trim().toLowerCase();
  const sniffed = new TextDecoder('latin1').decode(head);
  const metaCharset =
    /<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i.exec(sniffed) ??
    /<meta[^>]+http-equiv=["']?content-type["'][^>]+content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i.exec(
      sniffed
    );
  if (metaCharset) {
    const label = metaCharset[1]!.toLowerCase();
    // CP949 is a Microsoft superset of EUC-KR; Node's TextDecoder labels
    // both via "euc-kr". ks_c_5601-1987 is the IANA name for the same.
    if (label === 'cp949' || label === 'ksc5601' || label === 'ks_c_5601-1987') return 'euc-kr';
    return label;
  }
  return 'utf-8';
}

export function decodeWithFallback(buffer: ArrayBuffer, contentType: string | null): string {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096));
  const label = pickEncoding(contentType, head);
  try {
    return new TextDecoder(label, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
}

function extractTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og) return og[1]!.trim();
  const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return t ? t[1]!.trim() : '';
}

function extractPublishedAt(html: string): Date | null {
  const candidates = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i
  ];
  for (const re of candidates) {
    const m = re.exec(html);
    if (m) {
      const d = new Date(m[1]!);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

async function extractPdfText(buffer: ArrayBuffer): Promise<{ text: string; title: string | null }> {
  // pdf-parse is loaded dynamically so the (relatively heavy) pdfjs-dist
  // dependency isn't pulled into routes that never touch PDFs. PDFParse
  // accepts a Uint8Array and exposes getText() / getInfo() methods.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const [text, info] = await Promise.all([parser.getText(), parser.getInfo()]);
    const meta = info.info as { Title?: unknown } | undefined;
    const title = meta && typeof meta.Title === 'string' ? meta.Title : null;
    return { text: text.text, title };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function httpFetchPage(url: string): Promise<ResearchFetchedPage> {
  // SSRF guard: rejects non-http(s) schemes, hostnames that resolve to
  // private/loopback/link-local/IMDS IPs, and bounds the redirect chain.
  // Content-Type whitelist: the agent surfaces arbitrary URLs from search
  // results. HTML and PDF are both accepted; binary / image payloads are
  // rejected here so the LLM doesn't receive UTF-decoded garbage as
  // "context". The whitelist plus retry-on-transient-error handle the
  // network reliability gap.
  const response = await safeFetch(url, {
    timeoutMs: HTTP_TIMEOUT_MS,
    retries: 2,
    retryBackoffMs: 300,
    acceptedContentTypes: [
      'text/html',
      'application/xhtml+xml',
      'text/plain',
      'application/pdf'
    ],
    headers: {
      'user-agent': 'DatacenterQuant-ResearchAgent/1.0 (+https://example.internal/bot)'
    }
  });
  if (!response.ok) {
    throw new Error(`http ${response.status} for ${url}`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > HTTP_MAX_BYTES) {
    throw new Error(`response too large (${buffer.byteLength} > ${HTTP_MAX_BYTES})`);
  }
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.startsWith('application/pdf')) {
    const { text, title } = await extractPdfText(buffer);
    return {
      url,
      title: title ?? url,
      publishedAt: null,
      text: text.replace(/\s+/g, ' ').slice(0, 20_000)
    };
  }
  const html = decodeWithFallback(buffer, contentType);
  return {
    url,
    title: extractTitle(html) || url,
    publishedAt: extractPublishedAt(html),
    text: stripHtml(html).slice(0, 20_000)
  };
}

// ---------------------------------------------------------------------------
// Vendor web search — Tavily / Serper. Both expose a "give me search results
// for a query" endpoint and return enough structure (url + title + snippet
// + published time) to map onto ResearchSource without HTML scraping.
//
// Selection rule: TAVILY_API_KEY is preferred when both are set (Tavily's
// /search endpoint surfaces published_date directly so the agent has real
// freshness signals). Fall back to SERPER_API_KEY otherwise. With no key
// at all the toolset returns []; the agent then degrades to its DB-only
// discovery path, which is still useful for curated snapshots.
// ---------------------------------------------------------------------------

type VendorSearchResult = ResearchSource;

async function tavilySearchNews(query: string, apiKey: string): Promise<VendorSearchResult[]> {
  const response = await safeFetch('https://api.tavily.com/search', {
    method: 'POST',
    timeoutMs: HTTP_TIMEOUT_MS,
    retries: 1,
    retryBackoffMs: 200,
    acceptedContentTypes: ['application/json'],
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 8,
      include_answer: false
    })
  });
  if (!response.ok) {
    throw new Error(`tavily search ${response.status}`);
  }
  const body = (await response.json()) as {
    results?: Array<{
      url?: unknown;
      title?: unknown;
      content?: unknown;
      published_date?: unknown;
    }>;
  };
  const out: VendorSearchResult[] = [];
  for (const item of body.results ?? []) {
    if (typeof item.url !== 'string' || typeof item.title !== 'string') continue;
    const publishedAt =
      typeof item.published_date === 'string' ? new Date(item.published_date) : null;
    out.push({
      id: item.url,
      url: item.url,
      title: item.title,
      publisher: tryHostname(item.url) ?? 'unknown',
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      snippet: typeof item.content === 'string' ? item.content : ''
    });
  }
  return out;
}

async function serperSearchNews(query: string, apiKey: string): Promise<VendorSearchResult[]> {
  const response = await safeFetch('https://google.serper.dev/search', {
    method: 'POST',
    timeoutMs: HTTP_TIMEOUT_MS,
    retries: 1,
    retryBackoffMs: 200,
    acceptedContentTypes: ['application/json'],
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({ q: query, num: 8 })
  });
  if (!response.ok) {
    throw new Error(`serper search ${response.status}`);
  }
  const body = (await response.json()) as {
    organic?: Array<{ link?: unknown; title?: unknown; snippet?: unknown; date?: unknown }>;
  };
  const out: VendorSearchResult[] = [];
  for (const item of body.organic ?? []) {
    if (typeof item.link !== 'string' || typeof item.title !== 'string') continue;
    const publishedAt = typeof item.date === 'string' ? new Date(item.date) : null;
    out.push({
      id: item.link,
      url: item.link,
      title: item.title,
      publisher: tryHostname(item.link) ?? 'unknown',
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      snippet: typeof item.snippet === 'string' ? item.snippet : ''
    });
  }
  return out;
}

function tryHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function createHttpToolset(): ResearchToolset {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const serperKey = process.env.SERPER_API_KEY?.trim();
  return {
    async searchNews(query: string): Promise<ResearchSource[]> {
      const trimmed = query.trim();
      if (!trimmed) return [];
      try {
        if (tavilyKey) return await tavilySearchNews(trimmed, tavilyKey);
        if (serperKey) return await serperSearchNews(trimmed, serperKey);
      } catch {
        // Vendor search is best-effort; the agent has the DB toolset as a
        // fallback discovery path. Returning [] degrades gracefully and
        // surfaces the failure via the audit log when the agent tries the
        // empty result and re-issues a different query.
        return [];
      }
      return [];
    },
    fetchPage: httpFetchPage
  };
}

// ---------------------------------------------------------------------------
// Combine — run primary toolset first, append non-overlapping results from
// fallbacks. Fetch dispatches to the first toolset that handles the URL
// without throwing.
// ---------------------------------------------------------------------------

function normalizedUrlKey(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

export function combineToolsets(...toolsets: ResearchToolset[]): ResearchToolset {
  if (toolsets.length === 0) {
    throw new Error('combineToolsets requires at least one toolset');
  }
  return {
    async searchNews(query: string): Promise<ResearchSource[]> {
      const seen = new Set<string>();
      const out: ResearchSource[] = [];
      for (const t of toolsets) {
        try {
          const results = await t.searchNews(query);
          for (const r of results) {
            const key = normalizedUrlKey(r.url);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(r);
          }
        } catch {
          // individual toolset failure shouldn't kill the overall search
        }
      }
      return out;
    },
    async fetchPage(url: string): Promise<ResearchFetchedPage> {
      let lastError: unknown = null;
      for (const t of toolsets) {
        try {
          return await t.fetchPage(url);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(`no toolset fetched ${url}`);
    },
    async searchCorpus(query: string): Promise<ResearchSource[]> {
      const seen = new Set<string>();
      const out: ResearchSource[] = [];
      for (const t of toolsets) {
        if (!t.searchCorpus) continue;
        try {
          const results = await t.searchCorpus(query);
          for (const r of results) {
            const key = normalizedUrlKey(r.url);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(r);
          }
        } catch {
          // individual toolset failure shouldn't kill the overall search
        }
      }
      return out;
    }
  };
}
