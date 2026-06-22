import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Card } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function TitleSection({ data }: { data: SampleReportData }) {
  const { asset, displayCurrency, fxRateToKrw } = data;
  if (
    !(
      (asset.ownershipRecords && asset.ownershipRecords.length > 0) ||
      (asset.parcels && asset.parcels.length > 0) ||
      (asset.buildingRecords && asset.buildingRecords.length > 0) ||
      (asset.planningConstraints && asset.planningConstraints.length > 0) ||
      (asset.encumbranceRecords && asset.encumbranceRecords.length > 0)
    )
  ) {
    return null;
  }
  return (
    <section id="im-title" className="app-shell py-4">
      <Card>
        <div className="eyebrow">Title, parcel &amp; planning diligence</div>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
          Legal diligence anchors. Ownership establishes title; parcels carry zoning and official
          land valuation; encumbrances list liens and pledges; planning constraints capture zoning
          overlays and use restrictions.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {asset.ownershipRecords && asset.ownershipRecords.length > 0 ? (
            <div>
              <div className="fine-print">Ownership chain</div>
              <ul className="mt-3 space-y-2">
                {asset.ownershipRecords.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[hsl(var(--foreground))]">
                        {o.ownerName}
                      </span>
                      <span className="font-mono text-xs text-[hsl(var(--foreground-muted))]">
                        {typeof o.ownershipPct === 'number' ? `${o.ownershipPct.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                      {o.entityType ?? 'entity'} ·
                      {o.effectiveDate ? ` from ${formatDate(o.effectiveDate)}` : ' open-ended'}
                      {' · '}
                      {o.sourceSystem}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {asset.encumbranceRecords && asset.encumbranceRecords.length > 0 ? (
            <div>
              <div className="fine-print">Encumbrances</div>
              <ul className="mt-3 space-y-2">
                {asset.encumbranceRecords.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-[14px] border border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[hsl(var(--foreground))]">
                        {e.encumbranceType}
                        {e.holderName ? ` · ${e.holderName}` : ''}
                      </span>
                      <span className="font-mono text-xs text-[hsl(var(--foreground-muted))]">
                        {typeof e.securedAmountKrw === 'number'
                          ? formatCompactCurrencyFromKrwAtRate(
                              e.securedAmountKrw,
                              displayCurrency,
                              fxRateToKrw
                            )
                          : '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                      rank {e.priorityRank ?? '—'}
                      {e.statusLabel ? ` · ${e.statusLabel}` : ''}
                      {e.effectiveDate ? ` · from ${formatDate(e.effectiveDate)}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {asset.parcels && asset.parcels.length > 0 ? (
            <div>
              <div className="fine-print">Parcels</div>
              <ul className="mt-3 space-y-2">
                {asset.parcels.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[hsl(var(--foreground))]">{p.parcelId}</span>
                      <span className="text-[11px] text-[hsl(var(--foreground-muted))]">
                        {typeof p.landAreaSqm === 'number'
                          ? `${formatNumber(p.landAreaSqm, 0)} sqm`
                          : '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                      {p.zoningCode ?? p.landUseType ?? 'zoning n/a'} ·
                      {typeof p.officialLandValueKrw === 'number'
                        ? ` ${formatCompactCurrencyFromKrwAtRate(p.officialLandValueKrw, displayCurrency, fxRateToKrw)} official`
                        : ' no land value'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {asset.planningConstraints && asset.planningConstraints.length > 0 ? (
            <div>
              <div className="fine-print">Planning constraints</div>
              <ul className="mt-3 space-y-2">
                {asset.planningConstraints.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-[14px] border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[hsl(var(--foreground))]">{c.title}</span>
                      {c.severity ? (
                        <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--warning))]">
                          {c.severity}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--foreground-muted))]">
                      {c.constraintType}
                      {c.description ? ` · ${c.description}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {asset.buildingRecords && asset.buildingRecords.length > 0 ? (
            <div>
              <div className="fine-print">Building records</div>
              <ul className="mt-3 space-y-2">
                {asset.buildingRecords.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[hsl(var(--foreground))]">
                        {b.buildingName ?? b.buildingIdentifier ?? 'Unnamed building'}
                      </span>
                      <span className="text-[11px] text-[hsl(var(--foreground-muted))]">
                        {b.completionDate ? formatDate(b.completionDate) : '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                      {b.useType ?? 'use n/a'} · {b.floorCount ?? '–'}F / {b.basementCount ?? '–'}B
                      ·
                      {typeof b.grossFloorAreaSqm === 'number'
                        ? ` ${formatNumber(b.grossFloorAreaSqm, 0)} sqm GFA`
                        : ' GFA n/a'}
                      {b.structureType ? ` · ${b.structureType}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
