'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetClass, AssetStage, AssetStatus } from '@prisma/client';
import { resolveInputCurrency, supportedCurrencies, type SupportedCurrency } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { assetIntakeSchema, type AssetIntakeInput } from '@/lib/validations/asset';

type Props = {
  defaultValues?: Partial<AssetIntakeInput>;
  assetId?: string;
};

const numericFields = new Set<keyof AssetIntakeInput>([
  'targetItLoadMw',
  'powerCapacityMw',
  'landAreaSqm',
  'grossFloorAreaSqm',
  'rentableAreaSqm',
  'purchasePriceKrw',
  'stabilizedRentPerSqmMonthKrw',
  'otherIncomeKrw',
  'vacancyAllowancePct',
  'creditLossPct',
  'tenantImprovementReserveKrw',
  'leasingCommissionReserveKrw',
  'annualCapexReserveKrw',
  'weightedAverageLeaseTermYears',
  'occupancyAssumptionPct',
  'stabilizedOccupancyPct',
  'capexAssumptionKrw',
  'opexAssumptionKrw',
  'financingLtvPct',
  'financingRatePct',
  'holdingPeriodYears',
  'exitCapRatePct',
  'latitude',
  'longitude'
]);

const profileFields = [
  ['assetCode', 'Asset Code'],
  ['name', 'Asset Name'],
  ['assetType', 'Asset Type'],
  ['ownerName', 'Owner'],
  ['sponsorName', 'Sponsor']
] as const;

const locationFields = [
  ['line1', 'Address Line 1'],
  ['line2', 'Address Line 2'],
  ['district', 'District'],
  ['city', 'City'],
  ['province', 'Province'],
  ['postalCode', 'Postal Code'],
  ['country', 'Country'],
  ['parcelId', 'Parcel / Lot ID'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude']
] as const;

const underwritingFields = [
  ['targetItLoadMw', 'Target IT Load (MW)'],
  ['powerCapacityMw', 'Power Capacity (MW)'],
  ['landAreaSqm', 'Land Area (sqm)'],
  ['grossFloorAreaSqm', 'Gross Floor Area (sqm)'],
  ['occupancyAssumptionPct', 'Occupancy Assumption (%)'],
  ['capexAssumptionKrw', 'CAPEX Assumption (KRW)'],
  ['opexAssumptionKrw', 'OPEX Assumption (KRW)'],
  ['financingLtvPct', 'Financing LTV (%)'],
  ['financingRatePct', 'Financing Rate (%)']
] as const;

const officeFields = [
  ['rentableAreaSqm', 'Rentable Area (sqm)'],
  ['purchasePriceKrw', 'Purchase Price (KRW)'],
  ['stabilizedRentPerSqmMonthKrw', 'Base Rent / sqm / month (KRW)'],
  ['otherIncomeKrw', 'Other Income (Annual KRW)'],
  ['stabilizedOccupancyPct', 'Stabilized Occupancy (%)'],
  ['vacancyAllowancePct', 'Vacancy Allowance (%)'],
  ['creditLossPct', 'Credit Loss (%)'],
  ['tenantImprovementReserveKrw', 'TI Reserve (Annual KRW)'],
  ['leasingCommissionReserveKrw', 'LC Reserve (Annual KRW)'],
  ['annualCapexReserveKrw', 'Capex Reserve (Annual KRW)'],
  ['weightedAverageLeaseTermYears', 'WALT (Years)'],
  ['holdingPeriodYears', 'Holding Period (Years)'],
  ['exitCapRatePct', 'Exit Cap Rate (%)'],
  ['landAreaSqm', 'Land Area (sqm)'],
  ['grossFloorAreaSqm', 'Gross Floor Area (sqm)'],
  ['capexAssumptionKrw', 'CAPEX Assumption (KRW)'],
  ['opexAssumptionKrw', 'OPEX Assumption (KRW)'],
  ['financingLtvPct', 'Financing LTV (%)'],
  ['financingRatePct', 'Financing Rate (%)']
] as const;

const industrialFields = [
  ['rentableAreaSqm', 'Rentable Area (sqm)'],
  ['purchasePriceKrw', 'Purchase Price (KRW)'],
  ['stabilizedOccupancyPct', 'Stabilized Occupancy (%)'],
  ['holdingPeriodYears', 'Holding Period (Years)'],
  ['exitCapRatePct', 'Exit Cap Rate (%)'],
  ['landAreaSqm', 'Land Area (sqm)'],
  ['grossFloorAreaSqm', 'Gross Floor Area (sqm)'],
  ['capexAssumptionKrw', 'Capex / Repair Budget (KRW)'],
  ['opexAssumptionKrw', 'OPEX Assumption (KRW)'],
  ['financingLtvPct', 'Financing LTV (%)'],
  ['financingRatePct', 'Financing Rate (%)']
] as const;

const retailFields = [
  ['rentableAreaSqm', 'Rentable Area (sqm)'],
  ['purchasePriceKrw', 'Purchase Price (KRW)'],
  ['stabilizedOccupancyPct', 'Stabilized Occupancy (%)'],
  ['holdingPeriodYears', 'Holding Period (Years)'],
  ['exitCapRatePct', 'Exit Cap Rate (%)'],
  ['landAreaSqm', 'Land Area (sqm)'],
  ['grossFloorAreaSqm', 'Gross Floor Area (sqm)'],
  ['capexAssumptionKrw', 'Re-tenanting / Capex Budget (KRW)'],
  ['opexAssumptionKrw', 'OPEX Assumption (KRW)'],
  ['financingLtvPct', 'Financing LTV (%)'],
  ['financingRatePct', 'Financing Rate (%)']
] as const;

const multifamilyFields = [
  ['rentableAreaSqm', 'Net Rentable Area (sqm)'],
  ['purchasePriceKrw', 'Purchase Price (KRW)'],
  ['stabilizedOccupancyPct', 'Stabilized Occupancy (%)'],
  ['holdingPeriodYears', 'Holding Period (Years)'],
  ['exitCapRatePct', 'Exit Cap Rate (%)'],
  ['landAreaSqm', 'Land Area (sqm)'],
  ['grossFloorAreaSqm', 'Gross Floor Area (sqm)'],
  ['capexAssumptionKrw', 'Unit Turn / Capex Budget (KRW)'],
  ['opexAssumptionKrw', 'OPEX Assumption (KRW)'],
  ['financingLtvPct', 'Financing LTV (%)'],
  ['financingRatePct', 'Financing Rate (%)']
] as const;

const currencyMoneyFields = new Set<keyof AssetIntakeInput>([
  'purchasePriceKrw',
  'stabilizedRentPerSqmMonthKrw',
  'otherIncomeKrw',
  'tenantImprovementReserveKrw',
  'leasingCommissionReserveKrw',
  'annualCapexReserveKrw',
  'capexAssumptionKrw',
  'opexAssumptionKrw'
]);

function withCurrencyLabel(label: string, currency: SupportedCurrency, key: keyof AssetIntakeInput) {
  if (!currencyMoneyFields.has(key)) return label;
  return `${label.replace(/\s*\(KRW\)/g, '').replace(/\s*\(Annual KRW\)/g, ' (Annual)').replace(/\s*\/ month \(KRW\)/g, ' / month')} (${currency})`;
}

export function AssetIntakeForm({ defaultValues, assetId }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<AssetIntakeInput>({
    resolver: zodResolver(assetIntakeSchema),
    defaultValues: {
      assetClass: AssetClass.OFFICE,
      assetType: 'Office',
      status: AssetStatus.INTAKE,
      stage: AssetStage.SCREENING,
      country: 'KR',
      inputCurrency: 'KRW',
      ...defaultValues
    }
  });
  const assetClass = form.watch('assetClass');
  const country = form.watch('country');
  const inputCurrency = form.watch('inputCurrency');
  const displayCurrency = resolveInputCurrency(country, inputCurrency);

  useEffect(() => {
    const currentAssetType = form.getValues('assetType');
    const nextAssetType =
      assetClass === AssetClass.OFFICE
        ? 'Office'
        : assetClass === AssetClass.INDUSTRIAL
          ? 'Industrial'
        : assetClass === AssetClass.RETAIL
          ? 'Retail'
        : assetClass === AssetClass.MULTIFAMILY
          ? 'Multifamily'
          : 'Data Center';

    if (
      !currentAssetType ||
      currentAssetType === 'Office' ||
      currentAssetType === 'Industrial' ||
      currentAssetType === 'Retail' ||
      currentAssetType === 'Multifamily' ||
      currentAssetType === 'Data Center'
    ) {
      form.setValue('assetType', nextAssetType, { shouldDirty: true });
    }
  }, [assetClass, form]);

  useEffect(() => {
    const resolved = resolveInputCurrency(country, inputCurrency);
    if (!inputCurrency || inputCurrency !== resolved) {
      form.setValue('inputCurrency', resolved, { shouldDirty: !inputCurrency });
    }
  }, [country, inputCurrency, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const response = await fetch(assetId ? `/api/assets/${assetId}` : '/api/assets', {
        method: assetId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        throw new Error('Failed to save asset');
      }

      const result = await response.json();
      router.push(`/admin/assets/${result.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  });

  const renderField = ([key, label]: readonly [keyof AssetIntakeInput, string]) => (
    <label key={key} className="space-y-2">
      <span className="fine-print">{withCurrencyLabel(label, displayCurrency, key)}</span>
      <Input
        type={numericFields.has(key) ? 'number' : 'text'}
        step={numericFields.has(key) ? 'any' : undefined}
        {...form.register(key)}
      />
    </label>
  );

  return (
    <form className="space-y-8" onSubmit={onSubmit}>
      <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="eyebrow">{assetId ? 'Update Intake' : 'New Intake'}</div>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            {assetId ? 'Refine assumptions and rerun diligence' : 'Open a new underwriting case'}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            This form writes directly into the underwriting OS and seeds the asset, address, research, and review
            workflow in one path.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <div className="metric-card">
            <div className="fine-print">1. Intake</div>
            <div className="mt-2 text-base font-semibold text-white">Structured project record</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">2. Enrich</div>
            <div className="mt-2 text-base font-semibold text-white">Source overlays and permits</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">3. Value</div>
            <div className="mt-2 text-base font-semibold text-white">Scenario engine and memo</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">4. Review</div>
            <div className="mt-2 text-base font-semibold text-white">Memo and evidence readiness</div>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <div className="eyebrow">Identity</div>
          <h4 className="mt-2 text-xl font-semibold text-white">Core project profile</h4>
        </div>
        <div className="grid gap-4 md:grid-cols-2">{profileFields.map(renderField)}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="fine-print">Asset Class</span>
            <Select {...form.register('assetClass')}>
              <option value={AssetClass.DATA_CENTER}>DATA_CENTER</option>
              <option value={AssetClass.OFFICE}>OFFICE</option>
              <option value={AssetClass.INDUSTRIAL}>INDUSTRIAL</option>
              <option value={AssetClass.RETAIL}>RETAIL</option>
              <option value={AssetClass.MULTIFAMILY}>MULTIFAMILY</option>
            </Select>
          </label>
          <label className="space-y-2">
            <span className="fine-print">Status</span>
            <Select {...form.register('status')}>
              {Object.values(AssetStatus).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="fine-print">Stage</span>
            <Select {...form.register('stage')}>
              {Object.values(AssetStage).map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="fine-print">Input Currency</span>
            <Select {...form.register('inputCurrency')}>
              {supportedCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="text-sm text-slate-400">
          Monetary inputs are entered in {displayCurrency} and normalized to KRW internally for the current valuation,
          sensitivity, and memo engine.
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <div className="eyebrow">Location</div>
          <h4 className="mt-2 text-xl font-semibold text-white">Site and parcel context</h4>
        </div>
        <div className="grid gap-4 md:grid-cols-2">{locationFields.map(renderField)}</div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="eyebrow">Economics</div>
          <h4 className="mt-2 text-xl font-semibold text-white">
            {assetClass === AssetClass.DATA_CENTER ? 'Capacity and financing assumptions' : 'Income and exit assumptions'}
          </h4>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(assetClass === AssetClass.OFFICE
            ? officeFields
            : assetClass === AssetClass.INDUSTRIAL
              ? industrialFields
              : assetClass === AssetClass.RETAIL
                ? retailFields
                : assetClass === AssetClass.MULTIFAMILY
                  ? multifamilyFields
              : underwritingFields
          ).map(renderField)}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="eyebrow">Narrative</div>
          <h4 className="mt-2 text-xl font-semibold text-white">Analyst context</h4>
        </div>
        <label className="space-y-2">
          <span className="fine-print">Description</span>
          <Textarea className="min-h-[160px]" {...form.register('description')} />
        </label>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="fine-print">Tenant / Occupancy Notes</span>
            <Textarea className="min-h-[140px]" {...form.register('tenantAssumption')} />
          </label>
          <label className="space-y-2">
            <span className="fine-print">Development Summary</span>
            <Textarea className="min-h-[140px]" {...form.register('developmentSummary')} />
          </label>
          <label className="space-y-2">
            <span className="fine-print">Site Notes</span>
            <Textarea className="min-h-[140px]" {...form.register('siteNotes')} />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
        <p className="max-w-2xl text-sm text-slate-400">
          Saving this record updates the shared asset profile used by enrichment adapters, valuation runs, document uploads, and the downstream review layer.
        </p>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : assetId ? 'Update Asset' : 'Create Asset'}
        </Button>
      </div>
    </form>
  );
}
