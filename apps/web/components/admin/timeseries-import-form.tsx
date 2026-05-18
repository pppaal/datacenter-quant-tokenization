'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const SAMPLE_CSV = `target,market,region,assetClass,assetTier,indicatorKey,observationDate,value,unit,sourceSystem,label,frequency
macro,KR,,,,kr.cpi_yoy_pct,2024-01-01,3.2,pct,kosis-historical,CPI YoY,monthly
macro,KR,,,,kr.cpi_yoy_pct,2024-04-01,2.9,pct,kosis-historical,CPI YoY,monthly
market,KR,Yeouido,OFFICE,PRIME,office.cap_rate_pct,2024-01-01,4.5,pct,reb-historical,,
market,KR,Yeouido,OFFICE,GRADE_A,office.cap_rate_pct,2024-01-01,5.0,pct,reb-historical,,`;

type Summary = {
  macroInserted: number;
  macroUpdated: number;
  marketInserted: number;
  marketUpdated: number;
  skippedInvalid: number;
};

export function TimeseriesImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const [errors, setErrors] = useState<Array<{ line: number; reason: string }>>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function submit(dryRun: boolean) {
    setBusy(true);
    setBanner(null);
    setErrors([]);
    setSummary(null);
    try {
      const res = await fetch('/api/research/timeseries-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, dryRun })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: 'warn', text: body.error ?? `Import failed (HTTP ${res.status}).` });
        setErrors(body.errors ?? []);
        return;
      }
      setErrors(body.errors ?? []);
      if (body.dryRun) {
        setBanner({ tone: 'good', text: `Dry run OK · ${body.rowCount} valid rows.` });
      } else {
        setSummary(body.summary as Summary);
        setBanner({
          tone: 'good',
          text: `Imported · ${body.summary.macroInserted + body.summary.marketInserted} new · ${body.summary.macroUpdated + body.summary.marketUpdated} updated`
        });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Time-series import</div>
          <p className="mt-1 text-sm text-slate-400">
            Paste CSV from a REB / MOLIT historical Excel, an internally-tracked rate sheet, or a
            cross-market vendor pull. Header row required: target / market / indicatorKey /
            observationDate / value (rest optional). Re-import is safe — rows upsert on
            (market, region, indicatorKey, observationDate).
          </p>
        </div>
        {banner ? <Badge tone={banner.tone}>{banner.text}</Badge> : null}
      </div>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={14}
        className="w-full rounded-[16px] border border-white/10 bg-slate-950/60 p-3 font-mono text-xs text-slate-100"
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => submit(true)}>
          {busy ? 'Validating…' : 'Validate (dry run)'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => submit(false)}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </div>
      {errors.length > 0 ? (
        <div className="rounded-[16px] border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="mb-1 font-semibold text-amber-200">{errors.length} parse errors</div>
          <ul className="space-y-1 text-slate-300">
            {errors.slice(0, 8).map((e) => (
              <li key={`${e.line}:${e.reason}`}>
                line {e.line}: {e.reason}
              </li>
            ))}
            {errors.length > 8 ? (
              <li className="text-slate-500">… +{errors.length - 8} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {summary ? (
        <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-3 text-xs md:grid-cols-5">
          <Stat label="Macro inserted" value={summary.macroInserted} />
          <Stat label="Macro updated" value={summary.macroUpdated} />
          <Stat label="Market inserted" value={summary.marketInserted} />
          <Stat label="Market updated" value={summary.marketUpdated} />
          <Stat label="Skipped" value={summary.skippedInvalid} />
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
