import { Badge } from '@/components/ui/badge';
import { ResearchWorkspacePanel } from '@/components/admin/research-workspace-panel';
import { getResearchWorkspaceData, type ResearchWorkspaceTab } from '@/lib/services/research/workspace';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const validTabs: ResearchWorkspaceTab[] = ['macro', 'markets', 'submarkets', 'assets', 'coverage'];

export default async function AdminResearchPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeTab = validTabs.includes(resolvedSearchParams.tab as ResearchWorkspaceTab)
    ? (resolvedSearchParams.tab as ResearchWorkspaceTab)
    : 'macro';
  const data = await getResearchWorkspaceData();

  return (
    <div className="space-y-6">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">Research OS</div>
          <Badge>Macro</Badge>
          <Badge>Markets</Badge>
          <Badge>Submarkets</Badge>
          <Badge>Asset Dossiers</Badge>
          <Badge>Coverage Queue</Badge>
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Official-source research fabric for underwriting, deals, portfolio, and capital workflows.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          This workspace turns Korean public-source coverage, approved micro evidence, and market/submarket research
          into a shared operating layer. Every thesis and metric is surfaced with freshness, provenance, and a coverage
          queue that can be worked before underwriting, sourcing, hold monitoring, or investor reporting relies on it.
        </p>
      </section>

      <ResearchWorkspacePanel data={data} activeTab={activeTab} />
    </div>
  );
}
