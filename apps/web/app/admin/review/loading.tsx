import { Card } from '@/components/ui/card';

export default function ReviewLoading() {
  return (
    <Card className="space-y-4">
      <div className="eyebrow">Review Queue</div>
      <h2 className="text-2xl font-semibold text-white">
        Loading underwriting evidence pending review
      </h2>
      <p className="text-sm leading-7 text-slate-400">
        Pulling normalized power, legal, and lease evidence into the operator review queue.
      </p>
    </Card>
  );
}
