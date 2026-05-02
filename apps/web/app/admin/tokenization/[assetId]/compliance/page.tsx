import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ComplianceModulesPanel } from '@/components/admin/compliance-modules-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { getModules, isCountryBlocked } from '@/lib/services/onchain/compliance';
import {
  requireDeploymentByAssetId,
  toDeploymentRow
} from '@/lib/services/onchain/tokenization-repo';

export const dynamic = 'force-dynamic';

/**
 * Common ISO 3166-1 numeric codes the compliance UI surfaces by default.
 * Operators can still block any other code via the form. Curated list keeps
 * page load to a bounded number of RPC reads while covering jurisdictions
 * that come up most in our deal pipeline (Korea, Japan, US, China, EU
 * majors, plus sanctioned-country examples).
 */
const COMMON_COUNTRY_CODES = [
  { code: 410, name: 'Korea, Republic of' },
  { code: 392, name: 'Japan' },
  { code: 156, name: 'China' },
  { code: 840, name: 'United States' },
  { code: 826, name: 'United Kingdom' },
  { code: 276, name: 'Germany' },
  { code: 250, name: 'France' },
  { code: 702, name: 'Singapore' },
  { code: 344, name: 'Hong Kong' },
  { code: 408, name: 'Korea, DPR' },
  { code: 643, name: 'Russian Federation' },
  { code: 364, name: 'Iran' }
];

type PageProps = { params: Promise<{ assetId: string }> };

export default async function TokenizationCompliancePage({ params }: PageProps) {
  const { assetId } = await params;

  let row;
  try {
    row = await requireDeploymentByAssetId(assetId);
  } catch {
    notFound();
  }
  const deployment = toDeploymentRow(row);

  // Mock mode skips real chain reads — show empty state with a clear note so
  // the operator knows why the modules list is empty.
  if (isTokenizationMockMode()) {
    return (
      <div className="space-y-5">
        <BackLink />
        <Card>
          <div className="text-sm text-slate-300">
            BLOCKCHAIN_MOCK_MODE is enabled. Compliance reads are skipped because there is no real
            RPC to query.
          </div>
        </Card>
      </div>
    );
  }

  const modules = await getModules(deployment).catch(() => [] as string[]);
  const blockedCountries = await Promise.all(
    COMMON_COUNTRY_CODES.map(async (entry) => ({
      code: entry.code,
      blocked: await isCountryBlocked(deployment, entry.code).catch(() => false)
    }))
  );

  return (
    <div className="space-y-5">
      <BackLink />
      <ComplianceModulesPanel
        assetId={assetId}
        assetCode={row.asset.assetCode}
        assetName={row.asset.name}
        complianceAddress={deployment.complianceAddress}
        countryRestrictModuleAddress={deployment.countryRestrictModuleAddress}
        modules={modules}
        blockedCountries={blockedCountries}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/tokenization" className="inline-block">
      <Button variant="ghost">← Back to deployments</Button>
    </Link>
  );
}
