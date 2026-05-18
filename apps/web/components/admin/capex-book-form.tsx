'use client';

import { useState } from 'react';
import { CapexCategory } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { type SupportedCurrency } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type CapexDraft = {
  id?: string;
  localId: string;
  category: string;
  label: string;
  amountKrw: string;
  spendYear: string;
  isEmbedded: boolean;
  notes: string;
};

type CapexDefaultValue = {
  id: string;
  category: CapexCategory;
  label: string;
  amountKrw?: number;
  spendYear?: number;
  isEmbedded?: boolean;
  notes?: string | null;
};

function stringifyValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildDraft(item?: CapexDefaultValue): CapexDraft {
  return {
    id: item?.id,
    localId: item?.id ?? `capex_${Math.random().toString(36).slice(2, 10)}`,
    category: item?.category ?? '',
    label: item?.label ?? '',
    amountKrw: stringifyValue(item?.amountKrw),
    spendYear: stringifyValue(item?.spendYear),
    isEmbedded: item?.isEmbedded ?? false,
    notes: item?.notes ?? ''
  };
}

function moneyLabel(label: string, currency: SupportedCurrency) {
  return label.replace(/\(KRW\)/g, `(${currency})`);
}

export function CapexBookForm({
  assetId,
  inputCurrency = 'KRW',
  defaultItems
}: {
  assetId: string;
  inputCurrency?: SupportedCurrency;
  defaultItems: CapexDefaultValue[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CapexDraft[]>(() =>
    defaultItems.length > 0 ? defaultItems.map((item) => buildDraft(item)) : [buildDraft()]
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateItem = (localId: string, key: keyof CapexDraft, value: string | boolean) => {
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, [key]: value } : item))
    );
  };

  const handleSave = async (item: CapexDraft) => {
    setSubmittingId(item.localId);
    setErrorMessage(null);

    try {
      const payload = {
        category: item.category || undefined,
        label: item.label,
        amountKrw: item.amountKrw,
        spendYear: item.spendYear,
        isEmbedded: item.isEmbedded,
        notes: item.notes,
        inputCurrency
      };
      const response = await fetch(
        item.id ? `/api/assets/${assetId}/capex/${item.id}` : `/api/assets/${assetId}/capex`,
        {
          method: item.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to save CAPEX line item');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save CAPEX line item');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDelete = async (item: CapexDraft) => {
    if (!item.id) {
      setItems((current) => {
        const next = current.filter((candidate) => candidate.localId !== item.localId);
        return next.length > 0 ? next : [buildDraft()];
      });
      return;
    }

    setDeletingId(item.localId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/capex/${item.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to delete CAPEX line item');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete CAPEX line item');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4">
        {items.map((item, index) => (
          <div
            key={item.localId}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">CAPEX Item {index + 1}</div>
                <h4 className="mt-2 text-xl font-semibold text-white">
                  {item.label || `CAPEX tranche ${index + 1}`}
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submittingId === item.localId || deletingId === item.localId}
                  onClick={() => handleDelete(item)}
                >
                  {deletingId === item.localId ? 'Deleting...' : 'Delete'}
                </Button>
                <Button
                  type="button"
                  disabled={submittingId === item.localId || deletingId === item.localId}
                  onClick={() => handleSave(item)}
                >
                  {submittingId === item.localId
                    ? 'Saving...'
                    : item.id
                      ? 'Update Item'
                      : 'Add Item'}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="fine-print">Category</span>
                <Select
                  value={item.category}
                  onChange={(event) => updateItem(item.localId, 'category', event.target.value)}
                >
                  <option value="">Select category</option>
                  {Object.values(CapexCategory).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="fine-print">Label</span>
                <Input
                  value={item.label}
                  onChange={(event) => updateItem(item.localId, 'label', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Amount (KRW)', inputCurrency)}</span>
                <Input
                  type="number"
                  step="any"
                  value={item.amountKrw}
                  onChange={(event) => updateItem(item.localId, 'amountKrw', event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Spend Year</span>
                <Input
                  type="number"
                  step="1"
                  value={item.spendYear}
                  onChange={(event) => updateItem(item.localId, 'spendYear', event.target.value)}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={item.isEmbedded}
                  onChange={(event) => updateItem(item.localId, 'isEmbedded', event.target.checked)}
                />
                Embedded cost
              </label>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400 xl:col-span-3">
                Land and contingency directly affect the downside floor. Electrical, mechanical,
                shell/core, and IT fit-out drive retained hard cost and replacement value.
              </div>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="fine-print">Notes</span>
              <Textarea
                className="min-h-[112px]"
                value={item.notes}
                placeholder="Vendor package, EPC assumption, embedded basis, or spend timing note."
                onChange={(event) => updateItem(item.localId, 'notes', event.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-3xl text-sm text-slate-400">
          Split development cost into land, shell/core, electrical, mechanical, IT fit-out, soft
          cost, and contingency so the replacement floor reflects real spend structure instead of
          fallback allocation.
        </p>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setItems((current) => [...current, buildDraft()])}
          >
            Add CAPEX Item
          </Button>
        </div>
      </div>
    </div>
  );
}
