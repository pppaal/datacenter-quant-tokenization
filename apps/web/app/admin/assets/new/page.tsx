import { AssetIntakeForm } from '@/components/admin/asset-intake-form';
import { Card } from '@/components/ui/card';

export default function NewAssetPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <Card className="hero-mesh h-fit">
        <div className="eyebrow">New Asset Intake</div>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
          Create a beautiful front door for a real backend workflow.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          This intake page now looks like a product surface, but it still feeds the existing service layer for assets, valuation readiness, document workflows, and review preparation.
        </p>
        <div className="mt-6 grid gap-3">
          {[
            'Structured project identity and sponsor details',
            'Site address, parcel context, and coordinates',
            'Power, land, CAPEX, OPEX, and financing assumptions',
            'Narrative notes for downstream diligence and memos'
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
