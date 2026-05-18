'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const TYPES = ['SALE', 'REFINANCE', 'JV', 'RECAP', 'CAPEX_LOAN', 'DEVELOPMENT'] as const;
const STATUSES = ['LIVE', 'CLOSED', 'WITHDRAWN', 'LOST'] as const;

export function DealFlowForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const [form, setForm] = useState({
    market: 'KR',
    region: '',
    assetClass: '',
    assetTier: '',
    dealType: 'SALE',
    status: 'LIVE',
    assetName: '',
    estimatedSizeKrw: '',
    estimatedCapPct: '',
    sponsor: '',
    brokerSource: '',
    notes: ''
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        market: form.market.trim() || 'KR',
        region: form.region.trim() || null,
        assetClass: form.assetClass || null,
        assetTier: form.assetTier.trim() || null,
        dealType: form.dealType,
        status: form.status,
        assetName: form.assetName.trim() || null,
        estimatedSizeKrw: form.estimatedSizeKrw ? Number(form.estimatedSizeKrw) : null,
        estimatedCapPct: form.estimatedCapPct ? Number(form.estimatedCapPct) : null,
        sponsor: form.sponsor.trim() || null,
        brokerSource: form.brokerSource.trim() || null,
        notes: form.notes.trim() || null
      };
      const res = await fetch('/api/research/deal-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: 'warn', text: body.error ?? `Create failed (HTTP ${res.status})` });
        return;
      }
      setBanner({
        tone: 'good',
        text: `Logged ${form.dealType} · ${form.assetName || form.region || form.market}.`
      });
      setForm((p) => ({ ...p, assetName: '', notes: '', estimatedSizeKrw: '', estimatedCapPct: '' }));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Log a deal</div>
          <p className="mt-1 text-sm text-slate-400">
            Capture a deal you saw in the market — sale process, refi, JV, or development. Status
            defaults to LIVE; flip to LOST if a third party closed it (still useful as comp once
            the cap rate is disclosed).
          </p>
        </div>
        {banner ? <Badge tone={banner.tone}>{banner.text}</Badge> : null}
      </div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="md:col-span-2">
          <Label>Asset name</Label>
          <Input
            value={form.assetName}
            onChange={(e) => setForm((p) => ({ ...p, assetName: e.target.value }))}
            placeholder="Yeouido KFC Tower"
          />
        </div>
        <div>
          <Label>Market</Label>
          <Input
            value={form.market}
            onChange={(e) => setForm((p) => ({ ...p, market: e.target.value }))}
          />
        </div>
        <div>
          <Label>Submarket</Label>
          <Input
            value={form.region}
            onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
            placeholder="YEOUIDO"
          />
        </div>
        <div>
          <Label>Asset class</Label>
          <Select
            value={form.assetClass}
            onChange={(v) => setForm((p) => ({ ...p, assetClass: v }))}
            options={[['', '—'], ...Object.values(AssetClass).map((v) => [v, v] as [string, string])]}
          />
        </div>
        <div>
          <Label>Tier</Label>
          <Input
            value={form.assetTier}
            onChange={(e) => setForm((p) => ({ ...p, assetTier: e.target.value }))}
            placeholder="PRIME / GRADE_A"
          />
        </div>
        <div>
          <Label>Deal type</Label>
          <Select
            value={form.dealType}
            onChange={(v) => setForm((p) => ({ ...p, dealType: v }))}
            options={TYPES.map((v) => [v, v] as [string, string])}
          />
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={form.status}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
            options={STATUSES.map((v) => [v, v] as [string, string])}
          />
        </div>
        <div>
          <Label>Estimated size (KRW)</Label>
          <Input
            type="number"
            value={form.estimatedSizeKrw}
            onChange={(e) => setForm((p) => ({ ...p, estimatedSizeKrw: e.target.value }))}
            placeholder="500000000000"
          />
        </div>
        <div>
          <Label>Cap rate (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.estimatedCapPct}
            onChange={(e) => setForm((p) => ({ ...p, estimatedCapPct: e.target.value }))}
            placeholder="4.7"
          />
        </div>
        <div>
          <Label>Sponsor</Label>
          <Input
            value={form.sponsor}
            onChange={(e) => setForm((p) => ({ ...p, sponsor: e.target.value }))}
            placeholder="KIS Korea"
          />
        </div>
        <div>
          <Label>Broker source</Label>
          <Input
            value={form.brokerSource}
            onChange={(e) => setForm((p) => ({ ...p, brokerSource: e.target.value }))}
            placeholder="CBRE Kim · 2026-04-15 call"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            className="w-full rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
            rows={3}
            placeholder="Final-round bidding closes mid-Q3. KIS open to a JV partner up to 30%."
          />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? 'Logging…' : 'Log deal'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{children}</label>
  );
}

function Select({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
