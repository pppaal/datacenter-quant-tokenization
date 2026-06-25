import type { BuildingRecord, GeoFeature, Parcel } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatDate, formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  parcels: Parcel[];
  buildingRecords: BuildingRecord[];
  geoFeatures: GeoFeature[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

function formatFeatureValue(feature: GeoFeature) {
  if (feature.valueNumber !== null) {
    return `${formatNumber(feature.valueNumber, 1)}${feature.unit ? ` ${feature.unit}` : ''}`;
  }
  return feature.valueText ?? 'N/A';
}

export function AssetRegistryPanel({
  parcels,
  buildingRecords,
  geoFeatures,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  if (parcels.length === 0 && buildingRecords.length === 0 && geoFeatures.length === 0) {
    return null;
  }

  return (
    <Card data-testid="asset-registry-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Legal Registry &amp; Location</div>
          <h3 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Parcels, building records, and location intelligence
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[hsl(var(--muted))]">
            Title-level parcel and building-ledger records plus geospatial signals (grid, fiber,
            transit, hazard) sourced from public registries.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {parcels.length > 0 ? (
          <div className="space-y-3">
            <div className="fine-print">Parcels</div>
            {parcels.map((parcel) => (
              <div
                key={parcel.id}
                className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono text-sm text-[hsl(var(--foreground))]">
                    {parcel.parcelId}
                  </div>
                  {parcel.zoningCode ? <Badge tone="neutral">{parcel.zoningCode}</Badge> : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[hsl(var(--muted))]">
                  <div>Use: {parcel.landUseType ?? 'N/A'}</div>
                  <div>Land: {formatNumber(parcel.landAreaSqm)} sqm</div>
                  <div>
                    Official value:{' '}
                    {formatCurrencyFromKrwAtRate(
                      parcel.officialLandValueKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                  <div>Road: {parcel.roadAccess ?? 'N/A'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          {buildingRecords.length > 0 ? (
            <>
              <div className="fine-print">Building Records</div>
              {buildingRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
                >
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {record.buildingName ?? record.buildingIdentifier ?? 'Building'}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[hsl(var(--muted))]">
                    <div>Use: {record.useType ?? 'N/A'}</div>
                    <div>
                      Floors: {record.floorCount ?? 'N/A'}
                      {record.basementCount ? ` / B${record.basementCount}` : ''}
                    </div>
                    <div>GFA: {formatNumber(record.grossFloorAreaSqm)} sqm</div>
                    <div>Completed: {formatDate(record.completionDate)}</div>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {geoFeatures.length > 0 ? (
            <>
              <div className="fine-print mt-4">Location Intelligence</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {geoFeatures.map((feature) => (
                  <div
                    key={feature.id}
                    className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3"
                  >
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
                      {toSentenceCase(feature.featureType)}
                    </div>
                    <div className="mt-1 text-sm text-[hsl(var(--foreground))]">
                      {feature.featureKey.replace(/_/g, ' ')}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
                      {formatFeatureValue(feature)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
