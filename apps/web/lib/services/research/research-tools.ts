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

async function httpFetchPage(url: string): Promise<ResearchFetchedPage> {
  // SSRF guard: rejects non-http(s) schemes, hostnames that resolve to
  // private/loopback/link-local/IMDS IPs, and bounds the redirect chain.
  // Content-Type whitelist: the agent surfaces arbitrary URLs from search
  // results, and a 20MB binary or PDF previously decoded into garbage
  // text that the LLM treated as legitimate context. The whitelist plus
  // retry-on-transient-error handle the network reliability gap.
  const response = await safeFetch(url, {
    timeoutMs: HTTP_TIMEOUT_MS,
    retries: 2,
    retryBackoffMs: 300,
    acceptedContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain'],
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
  const html = decodeWithFallback(buffer, response.headers.get('content-type'));
  return {
    url,
    title: extractTitle(html) || url,
    publishedAt: extractPublishedAt(html),
    text: stripHtml(html).slice(0, 20_000)
  };
}

export function createHttpToolset(): ResearchToolset {
  return {
    async searchNews(_query: string): Promise<ResearchSource[]> {
      // No vendor search API wired yet. Agent should use the DB toolset for
      // discovery and come here only for fetch_page.
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
    }
  };
}
