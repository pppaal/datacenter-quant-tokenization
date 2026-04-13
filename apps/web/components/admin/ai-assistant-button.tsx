'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Kind = 'research' | 'deal';

type Props = {
  kind: Kind;
  entityId: string;
};

type ResearchSummaryResult = {
  summary: string;
  bullets: string[];
  cached: boolean;
};

type DealScoreResult = {
  score: number;
  reasoning: string;
  redFlags: string[];
  greenFlags: string[];
};

type ResultState =
  | { kind: 'research'; data: ResearchSummaryResult }
  | { kind: 'deal'; data: DealScoreResult };

function scoreRingTone(score: number): { ring: string; text: string; label: string } {
  if (score >= 70) {
    return { ring: 'border-emerald-400/70', text: 'text-emerald-300', label: 'Strong' };
  }
  if (score >= 40) {
    return { ring: 'border-amber-400/70', text: 'text-amber-300', label: 'Watch' };
  }
  return { ring: 'border-rose-400/70', text: 'text-rose-300', label: 'Caution' };
}

export function AiAssistantButton({ kind, entityId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const endpoint =
        kind === 'research'
          ? '/api/admin/ai/research-summary'
          : '/api/admin/ai/deal-score';
      const payload =
        kind === 'research' ? { snapshotId: entityId } : { dealId: entityId };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error : 'AI assistant request failed.';
        throw new Error(message);
      }

      if (kind === 'research') {
        setResult({
          kind: 'research',
          data: {
            summary: typeof data.summary === 'string' ? data.summary : '',
            bullets: Array.isArray(data.bullets)
              ? data.bullets.filter((b): b is string => typeof b === 'string')
              : [],
            cached: Boolean(data.cached)
          }
        });
      } else {
        setResult({
          kind: 'deal',
          data: {
            score: typeof data.score === 'number' ? data.score : 0,
            reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
            redFlags: Array.isArray(data.redFlags)
              ? data.redFlags.filter((b): b is string => typeof b === 'string')
              : [],
            greenFlags: Array.isArray(data.greenFlags)
              ? data.greenFlags.filter((b): b is string => typeof b === 'string')
              : []
          }
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assistant request failed.');
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = kind === 'research' ? 'Summarize with AI' : 'Score deal with AI';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={loading}>
          {loading ? 'Thinking...' : buttonLabel}
        </Button>
        {result?.kind === 'research' && result.data.cached ? (
          <span className="text-xs uppercase tracking-wide text-slate-400">Cached</span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {result?.kind === 'research' ? (
        <div className="rounded-md border border-slate-700/60 bg-slate-900/60 p-5 space-y-4">
          <p className="text-sm leading-relaxed text-slate-100">{result.data.summary}</p>
          {result.data.bullets.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
              {result.data.bullets.map((bullet, index) => (
                <li key={`${index}-${bullet.slice(0, 12)}`}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {result?.kind === 'deal' ? (
        <DealScorePanel data={result.data} />
      ) : null}
    </div>
  );
}

function DealScorePanel({ data }: { data: DealScoreResult }) {
  const tone = scoreRingTone(data.score);

  return (
    <div className="rounded-md border border-slate-700/60 bg-slate-900/60 p-5 space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full border-4 ${tone.ring} bg-slate-950/60`}
        >
          <div className="text-center">
            <div className={`text-3xl font-semibold ${tone.text}`}>{data.score}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">of 100</div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className={`text-xs uppercase tracking-wide ${tone.text}`}>{tone.label}</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-100">{data.reasoning}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Green flags
          </div>
          {data.greenFlags.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-emerald-100">
              {data.greenFlags.map((flag, index) => (
                <li key={`green-${index}-${flag.slice(0, 12)}`}>{flag}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-200/70">None identified.</p>
          )}
        </div>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-300">
            Red flags
          </div>
          {data.redFlags.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-100">
              {data.redFlags.map((flag, index) => (
                <li key={`red-${index}-${flag.slice(0, 12)}`}>{flag}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-rose-200/70">None identified.</p>
          )}
        </div>
      </div>
    </div>
  );
}
