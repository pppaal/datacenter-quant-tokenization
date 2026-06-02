import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import { listTokenizedAssets } from '@/lib/services/onchain/tokenization-repo';
import { shortenHash } from '@/lib/blockchain/registry';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TokenizationPage() {
  const deployments = await listTokenizedAssets();

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Tokenization</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">AssetToken deployments</h2>
        <p className="mt-2 text-sm text-slate-400">
          Institutional RWA layer: per-asset ERC-3643 style deployments with identity registry,
          modular compliance, and attached policy modules. Ops actions (mint, forced transfer, block
          country) are audited via the API routes under
          <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">/api/tokenization</code>.
        </p>
      </div>

      {deployments.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-300">
            No tokenization deployments have been recorded yet. Run
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">
              npm --workspace @dcqt/contracts run deploy:tokenization:local
            </code>
            and POST the resulting manifest to
            <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">
              /api/tokenization/deployments
            </code>
            .
          </div>
        </Card>
      ) : (
        <div className="grid gap-5">
          {deployments.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold text-white">
                    {d.asset.name}{' '}
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      {d.asset.assetCode}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    chain {d.chainId} / registryAssetId {shortenHash(d.registryAssetId, 8)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={d.paused ? 'warn' : 'good'}>{d.paused ? 'PAUSED' : 'LIVE'}</Badge>
                  <Link href={`/admin/tokenization/${d.assetId}/compliance`}>
                    <Button variant="ghost">Manage compliance</Button>
                  </Link>
                </div>
              </div>

              <dl className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                <KeyValueRow className="rounded-[20px] p-4" fallback="Not attached" label="Token">
                  {shortenHash(d.tokenAddress)}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="Identity registry"
                >
                  {shortenHash(d.identityRegistryAddress)}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="Compliance"
                >
                  {shortenHash(d.complianceAddress)}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="MaxHolders module"
                >
                  {shortenHash(d.maxHoldersModuleAddress)}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="CountryRestrict module"
                >
                  {shortenHash(d.countryRestrictModuleAddress)}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="Lockup module"
                >
                  {shortenHash(d.lockupModuleAddress)}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="Deployed at block"
                >
                  {d.deploymentBlock.toLocaleString()}
                </KeyValueRow>
                <KeyValueRow
                  className="rounded-[20px] p-4"
                  fallback="Not attached"
                  label="Recorded"
                >
                  {formatDate(d.createdAt)}
                </KeyValueRow>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
