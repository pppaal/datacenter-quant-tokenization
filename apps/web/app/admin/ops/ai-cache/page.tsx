import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  getAiCacheSummary,
  getEmbeddingCorpusSummary
} from '@/lib/services/ai/admin-stats';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function shortenHash(hash: string) {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export default async function AiCacheConsolePage() {
  const [cache, embeddings] = await Promise.all([
    getAiCacheSummary(),
    getEmbeddingCorpusSummary()
  ]);

  const totalSavedTokens = cache.estimatedSavedInputTokens + cache.estimatedSavedOutputTokens;
  const hitRatePct =
    cache.totalEntries === 0
      ? 0
      : Math.round((cache.totalHits / Math.max(1, cache.totalEntries + cache.totalHits)) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Ops</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">AI cache + embedding backlog</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Read-only dashboard for the AI infrastructure layer. Cache rows live in
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">AiResponseCache</code>; embedded
            corpus chunks live in
            <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">DocumentEmbedding</code>. Drain
            the backlog by triggering
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">/api/ops/index-documents</code>.
          </p>
        </div>
        <Link href="/admin">
          <Button variant="ghost">← Admin overview</Button>
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Cache entries"
          primary={formatNumber(cache.totalEntries, 0)}
          detail={`${formatNumber(cache.freshEntries, 0)} fresh / ${formatNumber(cache.expiredEntries, 0)} expired`}
        />
        <StatCard
          label="Cumulative hits"
          primary={formatNumber(cache.totalHits, 0)}
          detail={`hit rate ${hitRatePct}%`}
        />
        <StatCard
          label="Tokens saved (est.)"
          primary={formatNumber(totalSavedTokens, 0)}
          detail={`in ${formatNumber(cache.estimatedSavedInputTokens, 0)} / out ${formatNumber(
            cache.estimatedSavedOutputTokens,
            0
          )}`}
        />
        <StatCard
          label="Embedded chunks"
          primary={formatNumber(embeddings.embeddedChunks, 0)}
          detail={`${formatNumber(embeddings.embeddedDocuments, 0)} documents indexed`}
        />
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">AI cache · per model</div>
            <p className="mt-1 text-sm text-slate-400">
              Token savings = (inputTokens + outputTokens) × hitCount summed across rows.
            </p>
          </div>
          <Badge tone={cache.expiredEntries > cache.freshEntries ? 'warn' : 'good'}>
            {cache.expiredEntries > cache.freshEntries ? 'eviction overdue' : 'healthy'}
          </Badge>
        </div>
        {cache.perModel.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No cache entries yet. The cache populates lazily as the OpenAI call sites
            (extractFinancialStatementWithAi, generateUnderwritingMemo, ...) record responses.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">Entries</th>
                  <th className="px-4 py-3 font-semibold">Fresh / expired</th>
                  <th className="px-4 py-3 font-semibold">Hits</th>
                  <th className="px-4 py-3 font-semibold">Tokens saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {cache.perModel.map((row) => (
                  <tr key={row.model}>
                    <td className="px-4 py-3 font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-3">{formatNumber(row.entries, 0)}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatNumber(row.freshEntries, 0)} / {formatNumber(row.expiredEntries, 0)}
                    </td>
                    <td className="px-4 py-3">{formatNumber(row.totalHits, 0)}</td>
                    <td className="px-4 py-3">
                      {formatNumber(row.inputTokensSum + row.outputTokensSum, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">AI cache · most recent hits</div>
          <p className="mt-1 text-sm text-slate-400">
            Top 12 entries by lastHitAt. Empty until a request actually hits the cache.
          </p>
        </div>
        {cache.recentHits.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No cache hits yet — every recent call has been a miss.
          </div>
        ) : (
          <ul className="space-y-2">
            {cache.recentHits.map((hit) => (
              <li
                key={`${hit.promptHash}:${hit.model}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-slate-300">
                    {shortenHash(hit.promptHash)}
                  </span>
                  <span className="text-slate-400">{hit.model}</span>
                  <Badge tone="good">{hit.hitCount} hit</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  last {hit.lastHitAt ? formatDate(hit.lastHitAt) : 'never'} · expires{' '}
                  {formatDate(hit.expiresAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Embedding corpus</div>
            <p className="mt-1 text-sm text-slate-400">
              DocumentEmbedding rows by model + indexing backlog (DocumentVersion rows with
              extracted text but no embedding rows yet).
            </p>
          </div>
          <Badge tone={embeddings.unembeddedDocumentVersions === 0 ? 'good' : 'warn'}>
            {embeddings.unembeddedDocumentVersions === 0
              ? 'all indexed'
              : `${embeddings.unembeddedDocumentVersions} pending`}
          </Badge>
        </div>
        {embeddings.perModel.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No embeddings yet. Trigger
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">
              POST /api/ops/index-documents
            </code>
            with an
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">x-ops-cron-token</code> header.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">Chunks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {embeddings.perModel.map((row) => (
                  <tr key={row.model}>
                    <td className="px-4 py-3 font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-3">{formatNumber(row.chunks, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Embedding corpus · most recently indexed</div>
          <p className="mt-1 text-sm text-slate-400">
            Top 12 documents by latest indexedAt. Sampled from the most recent 200 chunk rows; for
            scale beyond a few thousand documents this needs a per-document GROUP BY.
          </p>
        </div>
        {embeddings.recentDocuments.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No documents indexed yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {embeddings.recentDocuments.map((doc) => (
              <li
                key={doc.documentVersionId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-white">{doc.title}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {doc.documentVersionId.slice(0, 8)}
                  </span>
                  <Badge tone="good">{doc.chunkCount} chunks</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  {doc.indexedAt ? formatDate(doc.indexedAt) : 'never'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label,
  primary,
  detail
}: {
  label: string;
  primary: string;
  detail: string;
}) {
  return (
    <Card className="space-y-2">
      <div className="fine-print">{label}</div>
      <div className="text-2xl font-semibold text-white">{primary}</div>
      <div className="text-xs text-slate-500">{detail}</div>
    </Card>
  );
}
