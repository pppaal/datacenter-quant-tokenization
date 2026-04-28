'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssetStage } from '@prisma/client';
import { type SupportedCurrency } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type ComparableDraft = {
  id?: string;
  localId: string;
  label: string;
  location: string;
  assetType: string;
  stage: string;
  sourceLink: string;
  powerCapacityMw: string;
  grossFloorAreaSqm: string;
  occupancyPct: string;
  valuationKrw: string;
  pricePerMwKrw: string;
  monthlyRatePerKwKrw: string;
  capRatePct: string;
  discountRatePct: string;
  weightPct: string;
  notes: string;
};

type ComparableDefaultValue = {
  id: string;
  label: string;
  location: string;
  assetType: string;
  stage?: AssetStage | null;
  sourceLink?: string | null;
  powerCapacityMw?: number | null;
  grossFloorAreaSqm?: number | null;
  occupancyPct?: number | null;
  valuationKrw?: number | null;
  pricePerMwKrw?: number | null;
  monthlyRatePerKwKrw?: number | null;
  capRatePct?: number | null;
  discountRatePct?: number | null;
  weightPct?: number | null;
  notes?: string | null;
};

function stringifyValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildDraft(entry?: ComparableDefaultValue): ComparableDraft {
  return {
    id: entry?.id,
    localId: entry?.id ?? `comp_${Math.random().toString(36).slice(2, 10)}`,
    label: entry?.label ?? '',
    location: entry?.location ?? '',
    assetType: entry?.assetType ?? '',
    stage: entry?.stage ?? '',
    sourceLink: entry?.sourceLink ?? '',
    powerCapacityMw: stringifyValue(entry?.powerCapacityMw),
    grossFloorAreaSqm: stringifyValue(entry?.grossFloorAreaSqm),
    occupancyPct: stringifyValue(entry?.occupancyPct),
    valuationKrw: stringifyValue(entry?.valuationKrw),
    pricePerMwKrw: stringifyValue(entry?.pricePerMwKrw),
    monthlyRatePerKwKrw: stringifyValue(entry?.monthlyRatePerKwKrw),
    capRatePct: stringifyValue(entry?.capRatePct),
    discountRatePct: stringifyValue(entry?.discountRatePct),
    weightPct: stringifyValue(entry?.weightPct),
    notes: entry?.notes ?? ''
  };
}

function moneyLabel(label: string, currency: SupportedCurrency) {
  return label.replace(/\(KRW\)/g, `(${currency})`);
}

export function ComparableBookForm({
  assetId,
  inputCurrency = 'KRW',
  defaultSetName,
  defaultSetNotes,
  defaultEntries
}: {
  assetId: string;
  inputCurrency?: SupportedCurrency;
  defaultSetName?: string | null;
  defaultSetNotes?: string | null;
  defaultEntries: ComparableDefaultValue[];
}) {
  const router = useRouter();
  const [setName, setSetName] = useState(defaultSetName ?? '');
  const [setNotes, setSetNotes] = useState(defaultSetNotes ?? '');
  const [entries, setEntries] = useState<ComparableDraft[]>(() =>
    defaultEntries.length > 0 ? defaultEntries.map((entry) => buildDraft(entry)) : [buildDraft()]
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateEntry = (localId: string, key: keyof ComparableDraft, value: string) => {
    setEntries((current) =>
      current.map((entry) => (entry.localId === localId ? { ...entry, [key]: value } : entry))
    );
  };

  const handleSave = async (entry: ComparableDraft) => {
    setSubmittingId(entry.localId);
    setErrorMessage(null);

    try {
      const payload = {
        setName,
        setNotes,
        label: entry.label,
        location: entry.location,
        assetType: entry.assetType,
        stage: entry.stage || undefined,
        sourceLink: entry.sourceLink,
        powerCapacityMw: entry.powerCapacityMw,
        grossFloorAreaSqm: entry.grossFloorAreaSqm,
        occupancyPct: entry.occupancyPct,
        valuationKrw: entry.valuationKrw,
        pricePerMwKrw: entry.pricePerMwKrw,
        monthlyRatePerKwKrw: entry.monthlyRatePerKwKrw,
        capRatePct: entry.capRatePct,
        discountRatePct: entry.discountRatePct,
        weightPct: entry.weightPct,
        notes: entry.notes,
        inputCurrency
      };
      const response = await fetch(
        entry.id
          ? `/api/assets/${assetId}/comparables/${entry.id}`
          : `/api/assets/${assetId}/comparables`,
        {
          method: entry.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to save comparable');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save comparable');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDelete = async (entry: ComparableDraft) => {
    if (!entry.id) {
      setEntries((current) => {
        const next = current.filter((candidate) => candidate.localId !== entry.localId);
        return next.length > 0 ? next : [buildDraft()];
      });
      return;
    }

    setDeletingId(entry.localId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/comparables/${entry.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to delete comparable');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete comparable');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
        <label className="space-y-2">
          <span className="fine-print">Comparable Set Name</span>
          <Input
            value={setName}
            onChange={(event) => setSetName(event.target.value)}
            placeholder="Greater Seoul screening set"
          />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Set Notes</span>
          <Textarea
            className="min-h-[96px]"
            value={setNotes}
            onChange={(event) => setSetNotes(event.target.value)}
            placeholder="Broker refresh date, market slice, inclusion policy, or weighting notes."
          />
        </label>
      </div>

      <div className="grid gap-4">
        {entries.map((entry, index) => (
          <div
            key={entry.localId}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Comparable {index + 1}</div>
                <h4 className="mt-2 text-xl font-semibold text-white">
                  {entry.label || `Peer ${index + 1}`}
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submittingId === entry.localId || deletingId === entry.localId}
                  onClick={() => handleDelete(entry)}
                >
                  {deletingId === entry.localId ? 'Deleting...' : 'Delete'}
                </Button>
                <Button
                  type="button"
                  disabled={submittingId === entry.localId || deletingId === entry.localId}
                  onClick={() => handleSave(entry)}
                >
                  {submittingId === entry.localId
                    ? 'Saving...'
                    : entry.id
                      ? 'Update Comparable'
                      : 'Add Comparable'}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="fine-print">Label</span>
                <Input
                  value={entry.label}
                  onChange={(event) => updateEntry(entry.localId, 'label', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Location</span>
                <Input
                  value={entry.location}
                  onChange={(event) => updateEntry(entry.localId, 'location', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Asset Type</span>
                <Input
                  value={entry.assetType}
                  onChange={(event) => updateEntry(entry.localId, 'assetType', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Stage</span>
                <Select
                  value={entry.stage}
                  onChange={(event) => updateEntry(entry.localId, 'stage', event.target.value)}
                >
                  <option value="">Select stage</option>
                  {Object.values(AssetStage).map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="fine-print">Power Capacity (MW)</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.powerCapacityMw}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'powerCapacityMw', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Gross Floor Area (sqm)</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.grossFloorAreaSqm}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'grossFloorAreaSqm', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Occupancy (%)</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.occupancyPct}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'occupancyPct', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Weight (%)</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.weightPct}
                  onChange={(event) => updateEntry(entry.localId, 'weightPct', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Valuation (KRW)', inputCurrency)}</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.valuationKrw}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'valuationKrw', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Price / MW (KRW)', inputCurrency)}</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.pricePerMwKrw}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'pricePerMwKrw', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">
                  {moneyLabel('Monthly Rate / kW (KRW)', inputCurrency)}
                </span>
                <Input
                  type="number"
                  step="any"
                  value={entry.monthlyRatePerKwKrw}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'monthlyRatePerKwKrw', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Cap Rate (%)</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.capRatePct}
                  onChange={(event) => updateEntry(entry.localId, 'capRatePct', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Discount Rate (%)</span>
                <Input
                  type="number"
                  step="any"
                  value={entry.discountRatePct}
                  onChange={(event) =>
                    updateEntry(entry.localId, 'discountRatePct', event.target.value)
                  }
                />
              </label>
              <label className="space-y-2 xl:col-span-3">
                <span className="fine-print">Source Link</span>
                <Input
                  value={entry.sourceLink}
                  onChange={(event) => updateEntry(entry.localId, 'sourceLink', event.target.value)}
                  placeholder="https://broker-memo-or-transaction-source"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="fine-print">Notes</span>
              <Textarea
                className="min-h-[124px]"
                value={entry.notes}
                placeholder="Why this comp belongs in the set, pricing caveats, or why weight differs from peers."
                onChange={(event) => updateEntry(entry.localId, 'notes', event.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-3xl text-sm text-slate-400">
          Add at least three comparables with usable pricing signals. Valuation, price per MW, and
          monthly rate inputs are entered in {inputCurrency} and normalized to KRW internally.
        </p>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEntries((current) => [...current, buildDraft()])}
          >
            Add Comparable
          </Button>
        </div>
      </div>
    </div>
  );
}
