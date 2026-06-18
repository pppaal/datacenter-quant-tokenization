import { AssetClass } from '@prisma/client';
import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatNumber, formatPercent } from '@/lib/utils';

type Subject = {
  capRatePct?: number | null;
  pricePerSqmKrw?: number | null;
  pricePerMwKrw?: number | null;
  rentPerSqmKrw?: number | null;
  ratePerKwKrw?: number | null;
  occupancyPct?: number | null;
};

type TransactionComp = {
  pricePerSqmKrw?: number | null;
  pricePerMwKrw?: number | null;
  capRatePct?: number | null;
};

type RentComp = {
  monthlyRentPerSqmKrw?: number | null;
  monthlyRatePerKwKrw?: number | null;
  occupancyPct?: number | null;
};

type Props = {
  assetClass: AssetClass;
  subject: Subject;
  transactionComps: TransactionComp[];
  rentComps: RentComp[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

type Format = 'currency' | 'percent' | 'number';

type RowSpec = {
  label: string;
  subject: number | null | undefined;
  compValues: Array<number | null | undefined>;
  format: Format;
  unitSuffix?: string;
};

function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function countFinite(values: Array<number | null | undefined>): number {
  return values.filter((value) => typeof value === 'number' && Number.isFinite(value)).length;
}

export function ComparablePositioning({
  assetClass,
  subject,
  transactionComps,
  rentComps,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  const isDataCenter = assetClass === AssetClass.DATA_CENTER;

  const rows: RowSpec[] = [
    {
      label: 'Cap Rate',
      subject: subject.capRatePct,
      compValues: transactionComps.map((comp) => comp.capRatePct),
      format: 'percent'
    },
    isDataCenter
      ? {
          label: 'Price / MW',
          subject: subject.pricePerMwKrw,
          compValues: transactionComps.map((comp) => comp.pricePerMwKrw),
          format: 'currency'
        }
      : {
          label: 'Price / sqm',
          subject: subject.pricePerSqmKrw,
          compValues: transactionComps.map((comp) => comp.pricePerSqmKrw),
          format: 'currency'
        },
    isDataCenter
      ? {
          label: 'Colocation / kW·mo',
          subject: subject.ratePerKwKrw,
          compValues: rentComps.map((comp) => comp.monthlyRatePerKwKrw),
          format: 'currency'
        }
      : {
          label: 'Rent / sqm·mo',
          subject: subject.rentPerSqmKrw,
          compValues: rentComps.map((comp) => comp.monthlyRentPerSqmKrw),
          format: 'currency'
        },
    {
      label: 'Occupancy',
      subject: subject.occupancyPct,
      compValues: rentComps.map((comp) => comp.occupancyPct),
      format: 'percent'
    }
  ];

  const fmt = (value: number | null, format: Format) => {
    if (value == null || !Number.isFinite(value)) return '—';
    if (format === 'currency')
      return formatCompactCurrencyFromKrwAtRate(value, displayCurrency, fxRateToKrw);
    if (format === 'percent') return formatPercent(value);
    return formatNumber(value, 1);
  };

  // Only render rows where there is at least a comp median to benchmark against.
  const usableRows = rows
    .map((row) => ({ ...row, med: median(row.compValues), n: countFinite(row.compValues) }))
    .filter((row) => row.med != null);

  if (!usableRows.length) return null;

  return (
    <Card data-testid="comparable-positioning">
      <div className="eyebrow">Comparable Positioning</div>
      <h3 className="mt-2 text-2xl font-semibold text-foreground">
        Subject benchmarked against the comp set
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
        Where this asset sits versus the transaction and rent comparables on the metrics that price
        it — the median of the comp set and the subject&apos;s spread to it.
      </p>

      <div className="mt-6 overflow-x-auto rounded-[12px] border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[hsl(var(--panel-alt))] text-left">
              {['Metric', 'Subject', 'Comp Median', 'Δ vs Median', 'Comps'].map((head, index) => (
                <th
                  key={head}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted ${
                    index === 0 ? '' : 'text-right'
                  }`}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usableRows.map((row) => {
              const subjectValue =
                typeof row.subject === 'number' && Number.isFinite(row.subject)
                  ? row.subject
                  : null;
              const deltaPct =
                subjectValue != null && row.med != null && row.med !== 0
                  ? ((subjectValue - row.med) / Math.abs(row.med)) * 100
                  : null;
              return (
                <tr key={row.label} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                    {fmt(subjectValue, row.format)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                    {fmt(row.med, row.format)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                    {deltaPct == null
                      ? '—'
                      : `${deltaPct >= 0 ? '+' : ''}${formatNumber(deltaPct, 1)}%`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{row.n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Δ is the subject&apos;s spread to the comp-set median; for cap rate a negative spread means
        the subject prices tighter (richer) than peers.
      </p>
    </Card>
  );
}
