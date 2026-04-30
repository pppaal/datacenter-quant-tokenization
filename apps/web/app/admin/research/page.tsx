import { Suspense } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelSkeleton } from '@/components/ui/skeleton';
import { MacroDashboardPanel } from '@/components/admin/macro-dashboard-panel';
import { ResearchRefreshButton } from '@/components/admin/research-refresh-button';
import { ResearchWorkspacePanel } from '@/components/admin/research-workspace-panel';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { getAdminActorFromHeaders } from '@/lib/security/admin-request';
import { buildMacroDashboard } from '@/lib/services/macro-dashboard';
import {
  getResearchWorkspaceData,
  type ResearchWorkspaceTab
} from '@/lib/services/research/workspace';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const validTabs: ResearchWorkspaceTab[] = [
  'macro',
  'markets',
  'submarkets',
  'assets',
  'optimization',
  'coverage'
];

async function ResearchContent({
  activeTab,
  canApproveHouseView
}: {
  activeTab: ResearchWorkspaceTab;
  canApproveHouseView: boolean;
}) {
  const [data, macroDashboard] = await Promise.all([
    getResearchWorkspaceData(),
    activeTab === 'macro' ? buildMacroDashboard() : Promise.resolve(null)
  ]);
  return (
    <>
      <ResearchWorkspacePanel
        data={data}
        activeTab={activeTab}
        canApproveHouseView={canApproveHouseView}
      />
      {activeTab === 'macro' && macroDashboard ? (
        <MacroDashboardPanel data={macroDashboard} />
      ) : null}
    </>
  );
}

export default async function AdminResearchPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const actor = getAdminActorFromHeaders(await headers());
  const canRefreshResearch = actor ? hasRequiredAdminRole(actor.role, 'ANALYST') : false;
  const canApproveHouseView = actor ? hasRequiredAdminRole(actor.role, 'ADMIN') : false;
  const activeTab = validTabs.includes(resolvedSearchParams.tab as ResearchWorkspaceTab)
    ? (resolvedSearchParams.tab as ResearchWorkspaceTab)
    : 'macro';

  return (
    <div className="space-y-6">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">Research OS</div>
          <Badge>Macro</Badge>
          <Badge>Markets</Badge>
          <Badge>Submarkets</Badge>
          <Badge>Asset Dossiers</Badge>
          <Badge>Optimization Lab</Badge>
          <Badge>Coverage Queue</Badge>
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Official-source research fabric for underwriting, deals, portfolio, and capital workflows.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          This workspace turns Korean public-source coverage, approved micro evidence, and
          market/submarket research into a shared operating layer. Every thesis and metric is
          surfaced with freshness, provenance, and a coverage queue that can be worked before
          underwriting, sourcing, hold monitoring, or investor reporting relies on it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {canRefreshResearch ? <ResearchRefreshButton /> : null}
          <Link href="/admin/research/comps">
            <Button variant="ghost">Cap-rate matrix · comps</Button>
          </Link>
          <Link href="/admin/research/quarterly">
            <Button variant="ghost">Quarterly publication</Button>
          </Link>
          <Link href="/admin/research/tenant-demand">
            <Button variant="ghost">Tenant in the market</Button>
          </Link>
          <Link href="/admin/research/timeseries-import">
            <Button variant="ghost">Time-series import</Button>
          </Link>
        </div>
      </section>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <ResearchContent activeTab={activeTab} canApproveHouseView={canApproveHouseView} />
      </Suspense>
    </div>
  );
}
