'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ReviewStatus } from '@prisma/client';
import { type SupportedCurrency } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { microDataSchema, type MicroDataInput } from '@/lib/validations/micro-data';

const numericFields: Array<keyof MicroDataInput> = [
  'substationDistanceKm',
  'tariffKrwPerKwh',
  'renewableAvailabilityPct',
  'pueTarget',
  'backupFuelHours',
  'ownershipPct',
  'securedAmountKrw',
  'priorityRank'
];

const powerFields: Array<readonly [keyof MicroDataInput, string]> = [
  ['utilityName', 'Utility Name'],
  ['substationDistanceKm', 'Substation Distance (km)'],
  ['tariffKrwPerKwh', 'Tariff (KRW / kWh)'],
  ['renewableAvailabilityPct', 'Renewable Availability (%)'],
  ['pueTarget', 'PUE Target'],
  ['backupFuelHours', 'Backup Fuel Hours']
] as const;

const permitFields: Array<readonly [keyof MicroDataInput, string]> = [
  ['permitStage', 'Permit Stage'],
  ['zoningApprovalStatus', 'Zoning Approval Status'],
  ['environmentalReviewStatus', 'Environmental Review Status'],
  ['powerApprovalStatus', 'Power Approval Status']
] as const;

const ownershipFields: Array<readonly [keyof MicroDataInput, string]> = [
  ['legalOwnerName', 'Legal Owner'],
  ['legalOwnerEntityType', 'Entity Type'],
  ['ownershipPct', 'Ownership (%)']
] as const;

const encumbranceFields: Array<readonly [keyof MicroDataInput, string]> = [
  ['encumbranceType', 'Encumbrance Type'],
  ['encumbranceHolderName', 'Holder Name'],
  ['securedAmountKrw', 'Secured Amount (KRW)'],
  ['priorityRank', 'Priority Rank'],
  ['encumbranceStatus', 'Encumbrance Status']
] as const;

const planningFields: Array<readonly [keyof MicroDataInput, string]> = [
  ['planningConstraintType', 'Constraint Type'],
  ['planningConstraintTitle', 'Constraint Title'],
  ['planningConstraintSeverity', 'Severity']
] as const;

const currencyMoneyFields = new Set<keyof MicroDataInput>([
  'tariffKrwPerKwh',
  'securedAmountKrw'
]);

function withCurrencyLabel(label: string, currency: SupportedCurrency, key: keyof MicroDataInput) {
  if (!currencyMoneyFields.has(key)) return label;
  return `${label
    .replace(/\s*\(KRW\s*\/\s*kWh\)/g, ' / kWh')
    .replace(/\s*\(KRW\)/g, '')} (${currency})`;
}

function hasNumberField(key: keyof MicroDataInput) {
  return numericFields.includes(key);
}

export function MicroDataForm({
  assetId,
  defaultValues,
  inputCurrency = 'KRW',
  reviewStatuses = []
}: {
  assetId: string;
  defaultValues?: Partial<MicroDataInput>;
  inputCurrency?: SupportedCurrency;
  reviewStatuses?: Array<{
    label: string;
    status: ReviewStatus;
    note?: string | null;
  }>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<MicroDataInput>({
    resolver: zodResolver(microDataSchema),
    defaultValues: {
      inputCurrency,
      ...defaultValues
    }
  });

  const renderField = ([key, label]: readonly [keyof MicroDataInput, string]) => (
    <label key={key} className="space-y-2">
      <span className="fine-print">{withCurrencyLabel(label, inputCurrency, key)}</span>
      <Input type={hasNumberField(key) ? 'number' : 'text'} step={hasNumberField(key) ? 'any' : undefined} {...form.register(key)} />
    </label>
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/micro`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to save micro data');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save micro data');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <input type="hidden" {...form.register('inputCurrency')} />
      <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
        Saved micro updates now land in the normalized record layer as <span className="font-semibold">PENDING</span>.
        Only approved evidence is promoted into curated feature snapshots used by committee outputs.
        {reviewStatuses.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {reviewStatuses.map((item) => (
              <Badge
                key={item.label}
                tone={
                  item.status === ReviewStatus.APPROVED
                    ? 'good'
                    : item.status === ReviewStatus.REJECTED
                      ? 'danger'
                      : 'warn'
                }
              >
                {item.label}: {item.status}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          <div>
            <div className="eyebrow">Power Micro</div>
            <h4 className="mt-2 text-xl font-semibold text-white">Utility and energy certainty</h4>
          </div>
          <div className="grid gap-4 md:grid-cols-2">{powerFields.map(renderField)}</div>
        </section>

        <section className="space-y-4">
          <div>
            <div className="eyebrow">Permit Micro</div>
            <h4 className="mt-2 text-xl font-semibold text-white">Approval timing and blocker tracking</h4>
          </div>
          <div className="grid gap-4 md:grid-cols-2">{permitFields.map(renderField)}</div>
          <label className="space-y-2">
            <span className="fine-print">Timeline Notes</span>
            <Textarea
              className="min-h-[124px]"
              placeholder="Utility committee slotting, zoning blocker, expected approval cadence, or manual diligence note."
              {...form.register('timelineNotes')}
            />
          </label>
        </section>
      </div>

      <section className="space-y-4">
        <div>
          <div className="eyebrow">Legal Micro</div>
          <h4 className="mt-2 text-xl font-semibold text-white">Ownership, liens, and planning constraints</h4>
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-4">
            <div className="fine-print">Ownership</div>
            <div className="grid gap-4">{ownershipFields.map(renderField)}</div>
          </div>
          <div className="space-y-4">
            <div className="fine-print">Encumbrance</div>
            <div className="grid gap-4">{encumbranceFields.map(renderField)}</div>
          </div>
          <div className="space-y-4">
            <div className="fine-print">Planning Constraint</div>
            <div className="grid gap-4">{planningFields.map(renderField)}</div>
            <label className="space-y-2">
              <span className="fine-print">Constraint Notes</span>
              <Textarea
                className="min-h-[124px]"
                placeholder="Land-use restriction, title issue, right-of-way, or other legal/planning blocker."
                {...form.register('planningConstraintDescription')}
              />
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-2xl text-sm text-slate-400">
          This panel captures the non-lease micro layer for power, permit, and title/legal cleanliness without
          changing the broader intake form. Monetary inputs are entered in {inputCurrency} and normalized to KRW
          internally. Editing any row sends it back to the review queue.
        </p>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Micro Data'}
          </Button>
        </div>
      </div>
    </form>
  );
}
