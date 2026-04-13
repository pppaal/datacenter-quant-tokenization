import { Suspense } from 'react';
import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PanelSkeleton } from '@/components/ui/skeleton';
import { FundWaterfallPanel } from '@/components/admin/fund-waterfall-panel';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { getAdminActorFromHeaders } from '@/lib/security/admin-request';
import { buildFundWaterfall } from '@/lib/services/fund-waterfall';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

async function WaterfallContent({ fundId }: { fundId: string }) {
  const data = await buildFundWaterfall(fundId);
  return <FundWaterfallPanel data={data} />;
}

export default async function FundWaterfallPage({ params }: Props) {
  const { id } = await params;
  const actor = getAdminActorFromHeaders(await headers());
  const canView = actor ? hasRequiredAdminRole(actor.role, 'ADMIN') : false;

  if (!canView) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="eyebrow">Restricted</div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Insufficient permissions</h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            The distribution waterfall view requires ADMIN role access. Contact your workspace administrator to
            request elevation.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">Capital OS</div>
          <Badge>Waterfall</Badge>
          <Badge tone="neutral">LP Distributions</Badge>
          <Badge tone="neutral">Carry Split</Badge>
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Distribution waterfall, hurdles, and LP-by-LP commitment ledger in a single operator view.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          The waterfall view reconciles total commitments against called and distributed capital, then projects a
          four-tier split across return of capital, preferred return, GP catch-up, and carried interest on residual
          proceeds. Use it to brief LPs, align GP economics, and stage the next capital call.
        </p>
      </section>

      <Suspense fallback={<PanelSkeleton rows={5} />}>
        <WaterfallContent fundId={id} />
      </Suspense>
    </div>
  );
}
