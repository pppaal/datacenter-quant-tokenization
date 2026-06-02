import Link from 'next/link';
import type { TokenizedAsset } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import { shortenHash } from '@/lib/blockchain/registry';

type Props = {
  tokenization: TokenizedAsset | null;
  assetId: string;
};

export function AssetTokenizationPanel({ tokenization, assetId }: Props) {
  if (!tokenization) return null;

  const modules = [
    tokenization.maxHoldersModuleAddress ? 'Max holders' : null,
    tokenization.countryRestrictModuleAddress ? 'Country restrict' : null,
    tokenization.lockupModuleAddress ? 'Lockup' : null
  ].filter(Boolean) as string[];

  return (
    <Card data-testid="asset-tokenization-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Tokenization</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">On-chain ERC-3643 deployment</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Deployed permissioned-token registry, identity, and compliance contracts for this asset.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Chain {tokenization.chainId}</Badge>
          <Badge tone={tokenization.paused ? 'warn' : 'good'}>
            {tokenization.paused ? 'Paused' : 'Active'}
          </Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <KeyValueRow variant="panel" mono label="Token (ERC-3643)">
          {shortenHash(tokenization.tokenAddress, 12)}
        </KeyValueRow>
        <KeyValueRow variant="panel" mono label="Registry Asset Id">
          {tokenization.registryAssetId}
        </KeyValueRow>
        <KeyValueRow variant="panel" mono label="Identity Registry">
          {shortenHash(tokenization.identityRegistryAddress, 12)}
        </KeyValueRow>
        <KeyValueRow variant="panel" mono label="Compliance">
          {shortenHash(tokenization.complianceAddress, 12)}
        </KeyValueRow>
        <KeyValueRow variant="panel" label="Deployment Block">
          {String(tokenization.deploymentBlock)}
        </KeyValueRow>
        <KeyValueRow variant="panel" mono label="Deployment Tx">
          {tokenization.deploymentTxHash
            ? shortenHash(tokenization.deploymentTxHash, 12)
            : 'No transaction'}
        </KeyValueRow>
      </div>

      {modules.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="fine-print self-center">Compliance modules</span>
          {modules.map((module) => (
            <Badge key={module} tone="neutral">
              {module}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`/admin/tokenization/${assetId}/compliance`}>
          <Button variant="secondary">Manage Compliance</Button>
        </Link>
        <Link href="/admin/tokenization">
          <Button variant="ghost">Open Tokenization Registry</Button>
        </Link>
      </div>
    </Card>
  );
}
