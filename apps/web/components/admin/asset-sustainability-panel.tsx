import type { CarbonEmissionRecord, InsurancePolicy, SideLetter } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatDate, formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  insurancePolicies: InsurancePolicy[];
  carbonRecords: CarbonEmissionRecord[];
  sideLetters: SideLetter[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

function policyTone(status: string): 'good' | 'warn' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'good';
  if (status === 'PENDING_RENEWAL') return 'warn';
  if (status === 'EXPIRED') return 'danger';
  return 'neutral';
}

export function AssetSustainabilityPanel({
  insurancePolicies,
  carbonRecords,
  sideLetters,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  if (insurancePolicies.length === 0 && carbonRecords.length === 0 && sideLetters.length === 0) {
    return null;
  }

  const money = (value: number | null | undefined) =>
    formatCurrencyFromKrwAtRate(value ?? null, displayCurrency, fxRateToKrw);
  const totalEmissions = carbonRecords.reduce((sum, record) => sum + record.tco2e, 0);

  return (
    <Card data-testid="asset-sustainability-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">ESG, Insurance &amp; LP Terms</div>
          <h3 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Risk transfer, carbon footprint, and side-letter obligations
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[hsl(var(--muted))]">
            Insurance program limits, Scope 1-3 carbon footprint, and LP side-letter terms that bind
            this asset.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {insurancePolicies.length > 0 ? <Badge>{insurancePolicies.length} policies</Badge> : null}
          {carbonRecords.length > 0 ? (
            <Badge tone="neutral">{formatNumber(totalEmissions, 0)} tCO2e</Badge>
          ) : null}
          {sideLetters.length > 0 ? (
            <Badge tone="neutral">{sideLetters.length} side letters</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {insurancePolicies.length > 0 ? (
          <div className="space-y-3">
            <div className="fine-print">Insurance Program</div>
            {insurancePolicies.map((policy) => (
              <div
                key={policy.id}
                className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {toSentenceCase(policy.policyType)} / {policy.insurer}
                  </div>
                  <Badge tone={policyTone(policy.status)}>{toSentenceCase(policy.status)}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[hsl(var(--muted))]">
                  <div>Limit: {money(policy.coverageKrw)}</div>
                  <div>Premium: {money(policy.premiumKrw)}</div>
                  <div>Deductible: {money(policy.deductibleKrw)}</div>
                  <div>Expires: {formatDate(policy.expiresOn)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          {carbonRecords.length > 0 ? (
            <>
              <div className="fine-print">Carbon Footprint</div>
              {carbonRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      Scope {record.scope} / {toSentenceCase(record.category)}
                    </div>
                    <Badge tone="neutral">FY{record.vintageYear}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-[hsl(var(--muted))]">
                    {formatNumber(record.tco2e, 1)} tCO2e
                    {record.methodology ? ` / ${record.methodology}` : ''}
                    {record.verifiedBy ? ` / verified ${record.verifiedBy}` : ''}
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {sideLetters.length > 0 ? (
            <>
              <div className="fine-print mt-4">LP Side Letters</div>
              {sideLetters.map((letter) => (
                <div
                  key={letter.id}
                  className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      {letter.lpName}
                    </div>
                    <div className="flex gap-2">
                      <Badge tone="neutral">{toSentenceCase(letter.termCategory)}</Badge>
                      {letter.mfnEligible ? <Badge tone="warn">MFN</Badge> : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-[hsl(var(--muted))]">
                    {letter.termSummary}
                  </p>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
