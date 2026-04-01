import { AssetIntakeForm } from '@/components/admin/asset-intake-form';
import { Card } from '@/components/ui/card';

export default function NewAssetPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <Card className="hero-mesh h-fit">
        <div className="eyebrow">New Asset Intake</div>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
          Open a new Korean data-center underwriting dossier.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          Capture the institutional intake record first, then move the asset through enrichment, evidence review,
          valuation, IC material, and registry-ready packaging.
        </p>
        <div className="mt-6 grid gap-3">
          {[
            'Project identity, sponsor, and execution ownership',
            'Site address, parcel context, and Korean market location fields',
            'Power, land, CAPEX, OPEX, and financing assumptions for initial underwriting',
            'Narrative context that feeds diligence, IC memos, and readiness packaging'
          ].map((item) => (
            <div key={item} className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
              {item}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <AssetIntakeForm />
      </Card>
    </div>
  );
}
