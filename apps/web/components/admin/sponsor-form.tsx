'use client';

import { useState } from 'react';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type Sponsor = { id: string; name: string };

const STATUSES = ['LIVE', 'EXITED', 'WRITE_DOWN', 'WORKING_OUT'] as const;

export function SponsorForms({ sponsors }: { sponsors: Sponsor[] }) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [busy, setBusy] = useState(false);
  const pending = busy || isRefreshing;
  const [banner, setBanner] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);

  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    shortName: '',
    hqMarket: 'KR',
    aumKrw: '',
    fundCount: '',
    yearFounded: '',
    websiteUrl: '',
    notes: ''
  });

  const [dealForm, setDealForm] = useState({
    sponsorId: sponsors[0]?.id ?? '',
    dealName: '',
    vintageYear: '2020',
    exitYear: '',
    assetClass: '',
    market: 'KR',
    equityKrw: '',
    equityMultiple: '',
    grossIrrPct: '',
    status: 'EXITED'
  });

  async function submitSponsor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/sponsors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sponsorForm.name.trim(),
          shortName: sponsorForm.shortName.trim() || null,
          hqMarket: sponsorForm.hqMarket.trim() || null,
          aumKrw: sponsorForm.aumKrw ? Number(sponsorForm.aumKrw) : null,
          fundCount: sponsorForm.fundCount ? Number(sponsorForm.fundCount) : null,
          yearFounded: sponsorForm.yearFounded ? Number(sponsorForm.yearFounded) : null,
          websiteUrl: sponsorForm.websiteUrl.trim() || null,
          notes: sponsorForm.notes.trim() || null
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: 'warn', text: body.error ?? `Create failed (HTTP ${res.status})` });
        return;
      }
      setBanner({ tone: 'good', text: `Sponsor ${sponsorForm.name} created.` });
      setSponsorForm((p) => ({ ...p, name: '', shortName: '', notes: '' }));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitDeal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/sponsors/prior-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorId: dealForm.sponsorId,
          dealName: dealForm.dealName.trim(),
          vintageYear: Number(dealForm.vintageYear),
          exitYear: dealForm.exitYear ? Number(dealForm.exitYear) : null,
          assetClass: dealForm.assetClass || null,
          market: dealForm.market.trim() || null,
          equityKrw: dealForm.equityKrw ? Number(dealForm.equityKrw) : null,
          equityMultiple: dealForm.equityMultiple ? Number(dealForm.equityMultiple) : null,
          grossIrrPct: dealForm.grossIrrPct ? Number(dealForm.grossIrrPct) : null,
          status: dealForm.status
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: 'warn', text: body.error ?? `Create failed (HTTP ${res.status})` });
        return;
      }
      setBanner({ tone: 'good', text: `Prior deal ${dealForm.dealName} added.` });
      setDealForm((p) => ({
        ...p,
        dealName: '',
        equityKrw: '',
        equityMultiple: '',
        grossIrrPct: ''
      }));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {banner ? (
        <div className="flex justify-end">
          <Badge tone={banner.tone}>{banner.text}</Badge>
        </div>
      ) : null}

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Add sponsor</div>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Top-of-funnel: capture the manager identity. Prior-deal entries below build the track
            record the IM card aggregates (avg multiple, avg IRR, vintage range).
          </p>
        </div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submitSponsor}>
          <Field label="Name (must match Asset.sponsorName for IM auto-link)">
            <Input
              value={sponsorForm.name}
              onChange={(e) => setSponsorForm((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="KIS Korea"
            />
          </Field>
          <Field label="Short name">
            <Input
              value={sponsorForm.shortName}
              onChange={(e) => setSponsorForm((p) => ({ ...p, shortName: e.target.value }))}
              placeholder="KIS"
            />
          </Field>
          <Field label="HQ market">
            <Input
              value={sponsorForm.hqMarket}
              onChange={(e) => setSponsorForm((p) => ({ ...p, hqMarket: e.target.value }))}
              placeholder="KR"
            />
          </Field>
          <Field label="AUM (KRW)">
            <Input
              type="number"
              value={sponsorForm.aumKrw}
              onChange={(e) => setSponsorForm((p) => ({ ...p, aumKrw: e.target.value }))}
              placeholder="3000000000000"
            />
          </Field>
          <Field label="Fund count">
            <Input
              type="number"
              value={sponsorForm.fundCount}
              onChange={(e) => setSponsorForm((p) => ({ ...p, fundCount: e.target.value }))}
              placeholder="6"
            />
          </Field>
          <Field label="Year founded">
            <Input
              type="number"
              value={sponsorForm.yearFounded}
              onChange={(e) => setSponsorForm((p) => ({ ...p, yearFounded: e.target.value }))}
              placeholder="2008"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Website">
              <Input
                type="url"
                value={sponsorForm.websiteUrl}
                onChange={(e) => setSponsorForm((p) => ({ ...p, websiteUrl: e.target.value }))}
                placeholder="https://kiskorea.com"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Notes">
              <textarea
                value={sponsorForm.notes}
                onChange={(e) => setSponsorForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              />
            </Field>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Add sponsor'}
            </Button>
          </div>
        </form>
      </Card>

      {sponsors.length > 0 ? (
        <Card className="space-y-4">
          <div>
            <div className="eyebrow">Add prior deal</div>
            <p className="mt-1 text-sm text-[hsl(var(--muted))]">
              One row per realized or active deal. EXITED deals with disclosed equity multiple +
              gross IRR are what the IM averages — LIVE deals show on the timeline but don't skew
              the track record.
            </p>
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submitDeal}>
            <Field label="Sponsor">
              <select
                value={dealForm.sponsorId}
                onChange={(e) => setDealForm((p) => ({ ...p, sponsorId: e.target.value }))}
                className="w-full rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              >
                {sponsors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Deal name">
              <Input
                value={dealForm.dealName}
                onChange={(e) => setDealForm((p) => ({ ...p, dealName: e.target.value }))}
                required
                placeholder="Yeouido Office Tower 2018"
              />
            </Field>
            <Field label="Vintage year">
              <Input
                type="number"
                value={dealForm.vintageYear}
                onChange={(e) => setDealForm((p) => ({ ...p, vintageYear: e.target.value }))}
                required
              />
            </Field>
            <Field label="Exit year">
              <Input
                type="number"
                value={dealForm.exitYear}
                onChange={(e) => setDealForm((p) => ({ ...p, exitYear: e.target.value }))}
                placeholder="2024"
              />
            </Field>
            <Field label="Asset class">
              <select
                value={dealForm.assetClass}
                onChange={(e) => setDealForm((p) => ({ ...p, assetClass: e.target.value }))}
                className="w-full rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              >
                <option value="">—</option>
                {Object.values(AssetClass).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Market">
              <Input
                value={dealForm.market}
                onChange={(e) => setDealForm((p) => ({ ...p, market: e.target.value }))}
              />
            </Field>
            <Field label="Equity invested (KRW)">
              <Input
                type="number"
                value={dealForm.equityKrw}
                onChange={(e) => setDealForm((p) => ({ ...p, equityKrw: e.target.value }))}
                placeholder="80000000000"
              />
            </Field>
            <Field label="Equity multiple">
              <Input
                type="number"
                step="0.01"
                value={dealForm.equityMultiple}
                onChange={(e) => setDealForm((p) => ({ ...p, equityMultiple: e.target.value }))}
                placeholder="1.85"
              />
            </Field>
            <Field label="Gross IRR %">
              <Input
                type="number"
                step="0.1"
                value={dealForm.grossIrrPct}
                onChange={(e) => setDealForm((p) => ({ ...p, grossIrrPct: e.target.value }))}
                placeholder="14.5"
              />
            </Field>
            <Field label="Status">
              <select
                value={dealForm.status}
                onChange={(e) => setDealForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Add prior deal'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
        {label}
      </label>
      {children}
    </div>
  );
}
