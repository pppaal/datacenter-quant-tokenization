import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TimeseriesImportForm } from '@/components/admin/timeseries-import-form';

export const dynamic = 'force-dynamic';

export default function TimeseriesImportPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Research</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">Time-series import</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Manual backfill path for the 5-year history that CBRE-style cap-rate matrices need.
            The KOSIS / BOK / REB / MOLIT adapters cover ongoing collection, but historical depth
            usually arrives as REB quarterly Excels or operator-tracked rate sheets — paste those
            here as CSV. Dry-run validates the parse before any DB writes.
          </p>
        </div>
        <Link href="/admin/research">
          <Button variant="ghost">← Research workspace</Button>
        </Link>
      </div>

      <Card className="space-y-3">
        <div>
          <div className="eyebrow">CSV format</div>
          <p className="mt-1 text-sm text-slate-400">
            One row per observation. Two target types:
            <span className="font-mono"> target=macro</span> writes
            <span className="font-mono"> MacroSeries</span>;
            <span className="font-mono"> target=market</span> writes
            <span className="font-mono"> MarketIndicatorSeries</span> with optional
            assetClass + assetTier.
          </p>
        </div>
        <ul className="grid gap-2 text-xs text-slate-400 md:grid-cols-2">
          <li>
            <span className="font-mono text-white">target</span> · macro | market
          </li>
          <li>
            <span className="font-mono text-white">market</span> · KR / JP / HK / US
          </li>
          <li>
            <span className="font-mono text-white">indicatorKey</span> · canonical key (kr.cpi_yoy_pct, office.cap_rate_pct)
          </li>
          <li>
            <span className="font-mono text-white">observationDate</span> · YYYY-MM-DD
          </li>
          <li>
            <span className="font-mono text-white">value</span> · finite number
          </li>
          <li>
            <span className="font-mono text-white">region / assetClass / assetTier / unit / sourceSystem / label</span> · optional
          </li>
        </ul>
        <p className="text-xs text-slate-500">
          Re-import is safe — rows upsert on (market, region, indicatorKey, observationDate),
          so re-running a corrected CSV updates in place rather than duplicating.
        </p>
      </Card>

      <TimeseriesImportForm />
    </div>
  );
}
