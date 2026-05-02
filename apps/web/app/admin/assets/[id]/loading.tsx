import { Card } from '@/components/ui/card';

export default function AssetDossierLoading() {
  return (
    <div className="space-y-6">
      <Card className="hero-mesh">
        <div className="eyebrow">Asset Dossier</div>
        <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white">
          Loading institutional underwriting dossier
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Pulling the asset record, approved feature layer, valuation, reports, and registry-ready
          evidence status.
        </p>
      </Card>
    </div>
  );
}
