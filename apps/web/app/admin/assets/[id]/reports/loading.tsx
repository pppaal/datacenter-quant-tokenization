import { Card } from '@/components/ui/card';

export default function AssetReportsLoading() {
  return (
    <Card className="hero-mesh">
      <div className="eyebrow">Underwriting Reports</div>
      <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white">
        Loading report pack and traceability bundle
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
        Preparing the latest valuation reference, approved evidence coverage, review packet state,
        and document hash record.
      </p>
    </Card>
  );
}
