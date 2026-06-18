'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import {
  assetRiskRegisterEntrySchema,
  riskSeverityValues,
  riskStatusValues,
  type AssetRiskRegisterEntryInput
} from '@/lib/validations/asset-risk-register';

type Severity = (typeof riskSeverityValues)[number];

export type RiskRegisterEntry = {
  id: string;
  title: string;
  category?: string | null;
  description?: string | null;
  likelihood: Severity;
  impact: Severity;
  irrImpactBps?: number | null;
  valueImpactKrw?: number | null;
  mitigant?: string | null;
  residualLikelihood?: Severity | null;
  residualImpact?: Severity | null;
  status: string;
  ownerName?: string | null;
};

type Props = {
  assetId: string;
  entries: RiskRegisterEntry[];
  inputCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

const severityChip: Record<Severity, string> = {
  LOW: 'bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]',
  MEDIUM: 'bg-[hsl(var(--warning-tint))] text-[hsl(var(--warning))]',
  HIGH: 'bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]',
  CRITICAL: 'bg-[hsl(var(--danger))] text-[hsl(var(--on-accent))]'
};

function SeverityTag({ value }: { value?: Severity | null }) {
  if (!value) return <span className="text-muted">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${severityChip[value]}`}
    >
      {value}
    </span>
  );
}

export function RiskRegisterForm({ assetId, entries, inputCurrency = 'KRW', fxRateToKrw }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(entries.length === 0);

  const form = useForm<AssetRiskRegisterEntryInput>({
    resolver: zodResolver(assetRiskRegisterEntrySchema),
    defaultValues: { likelihood: 'MEDIUM', impact: 'MEDIUM', status: 'OPEN', inputCurrency }
  });

  const money = (krw?: number | null) =>
    krw == null ? '—' : formatCompactCurrencyFromKrwAtRate(krw, inputCurrency, fxRateToKrw);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/risk-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to save risk');
      }
      form.reset({ likelihood: 'MEDIUM', impact: 'MEDIUM', status: 'OPEN', inputCurrency });
      startTransition(() => router.refresh());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save risk');
    } finally {
      setSubmitting(false);
    }
  });

  const onDelete = async (entryId: string) => {
    setBusyId(entryId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/risk-register/${entryId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete risk');
      startTransition(() => router.refresh());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete risk');
    } finally {
      setBusyId(null);
    }
  };

  const selectClass =
    'w-full rounded-[8px] border border-border bg-panel px-3 py-2 text-sm text-foreground';

  return (
    <Card data-testid="risk-register-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Risk Register</div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Quantified risks, mitigants, and residual exposure
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            A committee-grade risk table — each risk scored on likelihood × impact, with its
            quantified IRR / value effect, the mitigant, and the residual posture after mitigation.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Close' : 'Add Risk'}
        </Button>
      </div>

      {entries.length ? (
        <div className="mt-6 overflow-x-auto rounded-[12px] border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--panel-alt))] text-left">
                {[
                  'Risk',
                  'Likelihood',
                  'Impact',
                  'IRR Δ',
                  'Value Δ',
                  'Mitigant',
                  'Residual',
                  'Status',
                  ''
                ].map((head) => (
                  <th
                    key={head}
                    className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-foreground">{entry.title}</div>
                    {entry.category ? (
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-muted">
                        {entry.category}
                      </div>
                    ) : null}
                    {entry.description ? (
                      <div className="mt-1 max-w-sm text-xs leading-5 text-muted">
                        {entry.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <SeverityTag value={entry.likelihood} />
                  </td>
                  <td className="px-3 py-3">
                    <SeverityTag value={entry.impact} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foregroundMuted">
                    {entry.irrImpactBps != null
                      ? `${entry.irrImpactBps > 0 ? '+' : ''}${entry.irrImpactBps} bps`
                      : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foregroundMuted">
                    {money(entry.valueImpactKrw)}
                  </td>
                  <td className="px-3 py-3 max-w-xs text-xs leading-5 text-foregroundMuted">
                    {entry.mitigant ?? '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {entry.residualLikelihood || entry.residualImpact ? (
                      <span className="inline-flex items-center gap-1">
                        <SeverityTag value={entry.residualLikelihood} />
                        <span className="text-muted">/</span>
                        <SeverityTag value={entry.residualImpact} />
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[11px] uppercase tracking-[0.08em] text-foregroundMuted">
                    {entry.status}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      disabled={busyId === entry.id}
                      className="text-xs text-[hsl(var(--danger))] hover:underline disabled:opacity-50"
                    >
                      {busyId === entry.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-[12px] border border-dashed border-border bg-[hsl(var(--panel-alt))] p-5 text-sm text-muted">
          No risks captured yet. Add the key risks with their likelihood, impact, quantified effect,
          and mitigant to build the committee risk table.
        </div>
      )}

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-4 rounded-[12px] border border-border bg-[hsl(var(--panel-alt))] p-5"
        >
          <input type="hidden" {...form.register('inputCurrency')} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="fine-print">Risk title</span>
              <Input
                placeholder="e.g. KEPCO power confirmation slips past Py1"
                {...form.register('title')}
              />
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Category</span>
              <Input
                placeholder="Regulatory / Construction / Market…"
                {...form.register('category')}
              />
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Likelihood</span>
              <select className={selectClass} {...form.register('likelihood')}>
                {riskSeverityValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Impact</span>
              <select className={selectClass} {...form.register('impact')}>
                {riskSeverityValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Status</span>
              <select className={selectClass} {...form.register('status')}>
                {riskStatusValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">IRR impact (bps, signed)</span>
              <Input type="number" step="1" placeholder="-150" {...form.register('irrImpactBps')} />
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Value impact ({inputCurrency}, signed)</span>
              <Input
                type="number"
                step="1"
                placeholder="-5000000000"
                {...form.register('valueImpactKrw')}
              />
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Owner</span>
              <Input placeholder="Deal lead" {...form.register('ownerName')} />
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Residual likelihood</span>
              <select className={selectClass} {...form.register('residualLikelihood')}>
                <option value="">—</option>
                {riskSeverityValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="fine-print">Residual impact</span>
              <select className={selectClass} {...form.register('residualImpact')}>
                <option value="">—</option>
                {riskSeverityValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="fine-print">Description</span>
            <Textarea
              className="min-h-[70px]"
              placeholder="What is the risk and why does it matter?"
              {...form.register('description')}
            />
          </label>
          <label className="space-y-1.5">
            <span className="fine-print">Mitigant</span>
            <Textarea
              className="min-h-[70px]"
              placeholder="What reduces this risk, and to what residual level?"
              {...form.register('mitigant')}
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {errorMessage ? (
              <span className="text-sm text-[hsl(var(--danger))]">{errorMessage}</span>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Risk'}
            </Button>
          </div>
        </form>
      ) : errorMessage ? (
        <p className="mt-3 text-sm text-[hsl(var(--danger))]">{errorMessage}</p>
      ) : null}
    </Card>
  );
}
