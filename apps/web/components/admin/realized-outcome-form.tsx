'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { SupportedCurrency } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { realizedOutcomeSchema, type RealizedOutcomeInput } from '@/lib/validations/realized-outcome';

const numericFields: Array<keyof RealizedOutcomeInput> = [
  'occupancyPct',
  'noiKrw',
  'rentGrowthPct',
  'valuationKrw',
  'debtServiceCoverage',
  'exitCapRatePct'
];

const moneyFields = new Set<keyof RealizedOutcomeInput>(['noiKrw', 'valuationKrw']);

function getLabel(key: keyof RealizedOutcomeInput, currency: SupportedCurrency) {
  const labels: Record<keyof RealizedOutcomeInput, string> = {
    observationDate: 'Observation Date',
    occupancyPct: 'Actual Occupancy (%)',
    noiKrw: `Actual NOI (${currency})`,
    rentGrowthPct: 'Rent Growth (%)',
    valuationKrw: `Realized Value (${currency})`,
    debtServiceCoverage: 'Actual DSCR',
    exitCapRatePct: 'Exit Cap Rate (%)',
    notes: 'Notes',
    inputCurrency: 'Input Currency'
  };

  return labels[key];
}

function getStep(key: keyof RealizedOutcomeInput) {
  if (!numericFields.includes(key)) return undefined;
  return moneyFields.has(key) ? '1' : 'any';
}

export function RealizedOutcomeForm({
  assetId,
  inputCurrency = 'KRW'
}: {
  assetId: string;
  inputCurrency?: SupportedCurrency;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<RealizedOutcomeInput>({
    resolver: zodResolver(realizedOutcomeSchema),
    defaultValues: {
      inputCurrency
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/realized-outcomes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to save realized outcome');
      }

      form.reset({
        inputCurrency,
        observationDate: undefined,
        occupancyPct: undefined,
        noiKrw: undefined,
        rentGrowthPct: undefined,
        valuationKrw: undefined,
        debtServiceCoverage: undefined,
        exitCapRatePct: undefined,
        notes: undefined
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save realized outcome');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <input type="hidden" {...form.register('inputCurrency')} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          'observationDate',
          'occupancyPct',
          'noiKrw',
          'rentGrowthPct',
          'valuationKrw',
          'debtServiceCoverage',
          'exitCapRatePct'
        ] as Array<keyof RealizedOutcomeInput>).map((key) => (
          <label key={key} className="space-y-2">
            <span className="fine-print">{getLabel(key, inputCurrency)}</span>
            <Input
              type={key === 'observationDate' ? 'date' : numericFields.includes(key) ? 'number' : 'text'}
              step={getStep(key)}
              {...form.register(key)}
            />
          </label>
        ))}
      </div>

      <label className="space-y-2">
        <span className="fine-print">{getLabel('notes', inputCurrency)}</span>
        <Textarea
          className="min-h-[110px]"
          placeholder="Observed rent roll outcome, actual mark-to-market, covenant test result, or asset-management note."
          {...form.register('notes')}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-2xl text-sm text-slate-400">
          Capture actual post-underwriting outcomes so the macro and forecast layers can be checked against realized
          occupancy, value, and DSCR. Monetary inputs are entered in {inputCurrency} and normalized to KRW internally.
        </p>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Realized Outcome'}
          </Button>
        </div>
      </div>
    </form>
  );
}
