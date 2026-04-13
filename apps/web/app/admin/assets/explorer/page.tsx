import { Suspense } from 'react';
import { PropertyExplorerPanel } from '@/components/admin/property-explorer-panel';
import { Card } from '@/components/ui/card';
import { PanelSkeleton } from '@/components/ui/skeleton';
import { buildPropertyExplorerData } from '@/lib/services/property-explorer';

export const dynamic = 'force-dynamic';

async function PropertyExplorerContent() {
  const data = await buildPropertyExplorerData();
  return <PropertyExplorerPanel data={data} />;
}

export default function PropertyExplorerPage() {
  return (
    <div className="space-y-6">
      <Card className="hero-mesh">
        <div className="eyebrow">Universal Property Intake</div>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
          Click a Korean property screen, run a first-pass investment view, and bootstrap the dossier into underwriting.
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-400">
          This surface sits one layer ahead of manual intake. Operators can scan a mapped property universe, review parcel
          context and official-source signals, then open a full asset dossier without rebuilding the screen in a separate
          workflow.
        </p>
      </Card>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <PropertyExplorerContent />
      </Suspense>
    </div>
  );
}
