'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export type MacroProfileOverrideView = {
  id: string;
  assetClass: AssetClass | null;
  country: string | null;
  submarketPattern: string | null;
  label: string;
  capitalRateMultiplier: number | null;
  liquidityMultiplier: number | null;
  leasingMultiplier: number | null;
  constructionMultiplier: number | null;
  priority: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type OverrideDraft = {
  label: string;
  assetClass: string;
  country: string;
  submarketPattern: string;
  capitalRateMultiplier: string;
  liquidityMultiplier: string;
  leasingMultiplier: string;
  constructionMultiplier: string;
  priority: string;
  isActive: 'true' | 'false';
  notes: string;
};

const assetClassOptions = Object.values(AssetClass);

function emptyDraft(): OverrideDraft {
  return {
    label: '',
    assetClass: '',
    country: '',
    submarketPattern: '',
    capitalRateMultiplier: '',
    liquidityMultiplier: '',
    leasingMultiplier: '',
    constructionMultiplier: '',
    priority: '100',
    isActive: 'true',
    notes: ''
  };
}

function draftFromOverride(override: MacroProfileOverrideView): OverrideDraft {
  return {
    label: override.label,
    assetClass: override.assetClass ?? '',
    country: override.country ?? '',
    submarketPattern: override.submarketPattern ?? '',
    capitalRateMultiplier:
      override.capitalRateMultiplier != null ? String(override.capitalRateMultiplier) : '',
    liquidityMultiplier: override.liquidityMultiplier != null ? String(override.liquidityMultiplier) : '',
    leasingMultiplier: override.leasingMultiplier != null ? String(override.leasingMultiplier) : '',
    constructionMultiplier:
      override.constructionMultiplier != null ? String(override.constructionMultiplier) : '',
    priority: String(override.priority),
    isActive: override.isActive ? 'true' : 'false',
    notes: override.notes ?? ''
  };
}

function toPayload(draft: OverrideDraft) {
  return {
    label: draft.label,
    assetClass: draft.assetClass || null,
    country: draft.country || null,
    submarketPattern: draft.submarketPattern || null,
    capitalRateMultiplier: draft.capitalRateMultiplier || null,
    liquidityMultiplier: draft.liquidityMultiplier || null,
    leasingMultiplier: draft.leasingMultiplier || null,
    constructionMultiplier: draft.constructionMultiplier || null,
    priority: draft.priority || 100,
    isActive: draft.isActive === 'true',
    notes: draft.notes || null
  };
}

function formatScope(override: MacroProfileOverrideView) {
  return [
    override.assetClass ?? 'ALL_ASSETS',
    override.country ?? 'GLOBAL',
    override.submarketPattern ? `/${override.submarketPattern}/i` : null
  ]
    .filter(Boolean)
    .join(' · ');
}

function normalizeRecord(record: Record<string, unknown>): MacroProfileOverrideView {
  return {
    id: String(record.id),
    assetClass: (record.assetClass as AssetClass | null) ?? null,
    country: (record.country as string | null) ?? null,
    submarketPattern: (record.submarketPattern as string | null) ?? null,
    label: String(record.label),
    capitalRateMultiplier:
      typeof record.capitalRateMultiplier === 'number' ? record.capitalRateMultiplier : null,
    liquidityMultiplier: typeof record.liquidityMultiplier === 'number' ? record.liquidityMultiplier : null,
    leasingMultiplier: typeof record.leasingMultiplier === 'number' ? record.leasingMultiplier : null,
    constructionMultiplier:
      typeof record.constructionMultiplier === 'number' ? record.constructionMultiplier : null,
    priority: Number(record.priority),
    isActive: Boolean(record.isActive),
    notes: (record.notes as string | null) ?? null,
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt)
  };
}

function OverrideEditorCard({
  override,
  onSaved
}: {
  override: MacroProfileOverrideView;
  onSaved: (next: MacroProfileOverrideView) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<OverrideDraft>(() => draftFromOverride(override));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/macro/profile-overrides/${override.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toPayload(draft))
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) throw new Error((payload?.error as string | undefined) ?? 'Failed to update override');

      onSaved(normalizeRecord(payload ?? {}));
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update override');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="fine-print">Existing Override</div>
          <h4 className="mt-2 text-lg font-semibold text-white">{override.label}</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{formatScope(override)}</Badge>
            <Badge tone={override.isActive ? 'good' : 'neutral'}>
              {override.isActive ? 'active' : 'inactive'}
            </Badge>
          </div>
        </div>
        <div className="text-right text-xs uppercase tracking-[0.18em] text-slate-500">
          Updated {new Date(override.updatedAt).toLocaleDateString()}
        </div>
      </div>

      <OverrideDraftFields draft={draft} onChange={setDraft} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="text-sm text-slate-400">
          Change this rule to rebalance capital, liquidity, leasing, and construction transmission without redeploying.
        </div>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button type="button" onClick={save} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Override'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverrideDraftFields({
  draft,
  onChange
}: {
  draft: OverrideDraft;
  onChange: (next: OverrideDraft) => void;
}) {
  const setField = (key: keyof OverrideDraft, value: string) => {
    onChange({
      ...draft,
      [key]: value
    });
  };

  return (
    <div className="mt-5 grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2 xl:col-span-2">
          <span className="fine-print">Label</span>
          <Input value={draft.label} onChange={(event) => setField('label', event.target.value)} />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Asset Class</span>
          <Select value={draft.assetClass} onChange={(event) => setField('assetClass', event.target.value)}>
            <option value="">All Asset Classes</option>
            {assetClassOptions.map((assetClass) => (
              <option key={assetClass} value={assetClass}>
                {assetClass}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-2">
          <span className="fine-print">Country</span>
          <Input
            placeholder="US"
            value={draft.country}
            onChange={(event) => setField('country', event.target.value.toUpperCase())}
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2 xl:col-span-2">
          <span className="fine-print">Submarket Pattern</span>
          <Input
            placeholder="northern virginia|ashburn"
            value={draft.submarketPattern}
            onChange={(event) => setField('submarketPattern', event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Priority</span>
          <Input
            type="number"
            step="1"
            value={draft.priority}
            onChange={(event) => setField('priority', event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Status</span>
          <Select value={draft.isActive} onChange={(event) => setField('isActive', event.target.value)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="fine-print">Capital Multiplier</span>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="1.75"
            value={draft.capitalRateMultiplier}
            onChange={(event) => setField('capitalRateMultiplier', event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Liquidity Multiplier</span>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="1.75"
            value={draft.liquidityMultiplier}
            onChange={(event) => setField('liquidityMultiplier', event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Leasing Multiplier</span>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="1.75"
            value={draft.leasingMultiplier}
            onChange={(event) => setField('leasingMultiplier', event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Construction Multiplier</span>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="1.75"
            value={draft.constructionMultiplier}
            onChange={(event) => setField('constructionMultiplier', event.target.value)}
          />
        </label>
      </div>

      <label className="space-y-2">
        <span className="fine-print">Notes</span>
        <Textarea
          className="min-h-[108px]"
          placeholder="Why this market should carry more rate sensitivity, tighter liquidity beta, or higher construction pass-through."
          value={draft.notes}
          onChange={(event) => setField('notes', event.target.value)}
        />
      </label>
    </div>
  );
}

export function MacroProfileOverrideForm({
  initialOverrides
}: {
  initialOverrides: MacroProfileOverrideView[];
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState(initialOverrides);
  const [draft, setDraft] = useState<OverrideDraft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createOverride = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/macro/profile-overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toPayload(draft))
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) throw new Error((payload?.error as string | undefined) ?? 'Failed to create override');

      const created = normalizeRecord(payload ?? {});
      setOverrides((current) =>
        [...current, created].sort((left, right) =>
          left.priority === right.priority
            ? right.createdAt.localeCompare(left.createdAt)
            : left.priority - right.priority
        )
      );
      setDraft(emptyDraft());
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create override');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">New Override</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Add market-specific transmission logic</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              Use this layer to override the default macro sensitivity template for a country, asset class, or regex
              matched submarket without changing code.
            </p>
          </div>
          <div className="metric-card min-w-[220px]">
            <div className="fine-print">Live Rules</div>
            <div className="mt-3 text-2xl font-semibold text-white">{overrides.filter((row) => row.isActive).length}</div>
            <p className="mt-2 text-sm text-slate-400">Active rules merge on top of the static registry at valuation time.</p>
          </div>
        </div>

        <OverrideDraftFields draft={draft} onChange={setDraft} />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="text-sm text-slate-400">
            Scope by asset class, country, submarket regex, or any combination. Lower priority numbers apply first.
          </div>
          <div className="flex items-center gap-3">
            {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
            <Button type="button" onClick={createOverride} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Override'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {overrides.map((override) => (
          <OverrideEditorCard
            key={override.id}
            override={override}
            onSaved={(next) =>
              setOverrides((current) => current.map((item) => (item.id === next.id ? next : item)))
            }
          />
        ))}
      </div>
    </div>
  );
}
