import Link from 'next/link';
import type { TokenizedAsset } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { shortenHash } from '@/lib/blockchain/registry';

type Props = {
  tokenization: TokenizedAsset | null;
  assetId: string;
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="fine-print">{label}</div>
      <div className={`mt-2 text-sm text-white ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

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
        <Row label="Token (ERC-3643)" value={shortenHash(tokenization.tokenAddress, 12)} mono />
        <Row label="Registry Asset Id" value={tokenization.registryAssetId} mono />
        <Row
          label="Identity Registry"
          value={shortenHash(tokenization.identityRegistryAddress, 12)}
          mono
        />
        <Row label="Compliance" value={shortenHash(tokenization.complianceAddress, 12)} mono />
        <Row label="Deployment Block" value={String(tokenization.deploymentBlock)} />
        <Row
          label="Deployment Tx"
          value={
            tokenization.deploymentTxHash
              ? shortenHash(tokenization.deploymentTxHash, 12)
              : 'No transaction'
          }
          mono
        />
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
