import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import type { SampleReportData } from './types';

export function TokenizationSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!asset.tokenization) {
    return null;
  }
  return (
    <section id="im-tokenization" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Tokenization &amp; on-chain</div>
          <Badge tone={asset.tokenization.paused ? 'warn' : 'good'}>
            {asset.tokenization.paused ? 'PAUSED' : 'ACTIVE'}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
          On-chain registration. The identity registry gates KYC; the compliance contract enforces
          transfer rules; lockup, max-holders, and country-restriction modules deploy where
          configured.
        </p>
        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <KeyValueRow variant="inline" label="Chain ID">
            {asset.tokenization.chainId}
          </KeyValueRow>
          <KeyValueRow variant="inline" label="Registry asset ID">
            <span className="break-all">{asset.tokenization.registryAssetId}</span>
          </KeyValueRow>
          <KeyValueRow variant="inline" label="Token address">
            <span className="break-all font-mono text-xs">{asset.tokenization.tokenAddress}</span>
          </KeyValueRow>
          <KeyValueRow variant="inline" label="Identity registry">
            <span className="break-all font-mono text-xs">
              {asset.tokenization.identityRegistryAddress}
            </span>
          </KeyValueRow>
          <KeyValueRow variant="inline" label="Compliance">
            <span className="break-all font-mono text-xs">
              {asset.tokenization.complianceAddress}
            </span>
          </KeyValueRow>
          <KeyValueRow variant="inline" label="Deployment block">
            <span className="font-mono">{asset.tokenization.deploymentBlock}</span>
          </KeyValueRow>
        </dl>
      </Card>
    </section>
  );
}
