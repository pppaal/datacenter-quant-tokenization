'use client';

import { Card } from '@/components/ui/card';

export default function AssetReportsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="space-y-4">
      <div className="eyebrow">Underwriting Reports</div>
      <h2 className="text-2xl font-semibold text-white">Could not load the report library</h2>
      <p className="text-sm leading-7 text-slate-400">
        {error.message || 'The report pack failed to load. Retry the page after confirming the asset dossier and valuation bundle are available.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:border-accent/40 hover:bg-white/[0.08]"
      >
        Retry Report Library
      </button>
    </Card>
  );
}
