'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Banner = { tone: 'good' | 'warn'; text: string } | null;

const STATUSES = ['ACTIVE', 'SIGNED', 'WITHDRAWN', 'STALLED'] as const;

export function TenantDemandForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [form, setForm] = useState({
    tenantName: '',
    market: 'KR',
    region: '',
    assetClass: '',
    assetTier: '',
    targetSizeSqm: '',
    targetMoveInDate: '',
    status: 'ACTIVE',
    notes: '',
    source: ''
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (!form.tenantName.trim()) {
      setBanner({ tone: 'warn', text: 'Tenant name is required.' });
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        tenantName: form.tenantName.trim(),
        market: form.market.trim() || 'KR',
        region: form.region.trim() || null,
        assetClass: form.assetClass || null,
        assetTier: form.assetTier.trim() || null,
        targetSizeSqm: form.targetSizeSqm ? Number(form.targetSizeSqm) : null,
        targetMoveInDate: form.targetMoveInDate
          ? new Date(form.targetMoveInDate).toISOString()
          : null,
        status: form.status,
        notes: form.notes.trim() || null,
        source: form.source.trim() || null
      };
      const res = await fetch('/api/research/tenant-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: 'warn', text: body.error ?? `Create failed (HTTP ${res.status})` });
        return;
      }
      setBanner({ tone: 'good', text: `Recorded ${form.tenantName}.` });
      setForm((prev) => ({ ...prev, tenantName: '', region: '', notes: '', source: '' }));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Record requirement</div>
          <p className="mt-1 text-sm text-slate-400">
            Capture a named tenant requirement from a leasing-broker call. Status defaults to
            ACTIVE; flip to SIGNED when the lease closes (kept on file as historical demand).
          </p>
        </div>
        {banner ? <Badge tone={banner.tone}>{banner.text}</Badge> : null}
      </div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="md:col-span-2">
          <Label>Tenant name</Label>
          <Input
            value={form.tenantName}
            onChange={(e) => setForm((p) => ({ ...p, tenantName: e.target.value }))}
            placeholder="Samsung Electronics"
            required
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
            placeholder="GANGNAM"
          />
        </div>
        <div>
          <Label>Asset class</Label>
          <select
            value={form.assetClass}
            onChange={(e) => setForm((p) => ({ ...p, assetClass: e.target.value }))}
            className="w-full rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
          >
            <option value="">—</option>
            {Object.values(AssetClass).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Tier</Label>
          <Input
            value={form.assetTier}
            onChange={(e) => setForm((p) => ({ ...p, assetTier: e.target.value }))}
            placeholder="PRIME / GRADE_A / GRADE_B"
          />
        </div>
        <div>
          <Label>Target size (sqm)</Label>
          <Input
            type="number"
            value={form.targetSizeSqm}
            onChange={(e) => setForm((p) => ({ ...p, targetSizeSqm: e.target.value }))}
            placeholder="5000"
          />
        </div>
        <div>
          <Label>Target move-in</Label>
          <Input
            type="date"
            value={form.targetMoveInDate}
            onChange={(e) => setForm((p) => ({ ...p, targetMoveInDate: e.target.value }))}
          />
        </div>
        <div>
          <Label>Status</Label>
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Source</Label>
          <Input
            value={form.source}
            onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
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
            placeholder="Currently in 강남 GFC 4F, lease ends 2026Q4. Wants 5,000 sqm for AI training pod, prefers single-tenant floor."
          />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? 'Recording…' : 'Record requirement'}
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
