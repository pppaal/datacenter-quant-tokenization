'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { shortenHash } from '@/lib/blockchain/registry';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type Props = {
  assetId: string;
  assetCode: string;
  assetName: string;
  complianceAddress: string;
  countryRestrictModuleAddress: string | null;
  modules: string[];
  blockedCountries: Array<{ code: number; blocked: boolean }>;
};

type Banner = { tone: 'good' | 'warn'; text: string } | null;

export function ComplianceModulesPanel({
  assetId,
  assetCode,
  assetName,
  complianceAddress,
  countryRestrictModuleAddress,
  modules,
  blockedCountries
}: Props) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [banner, setBanner] = useState<Banner>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // A mutation control is busy while its own request is in flight OR while the
  // post-mutation router refresh is still settling (so the screen isn't stale).
  const isBusy = (key: string) => busyKey === key || isRefreshing;
  const [moduleAddress, setModuleAddress] = useState('');
  const [countryCode, setCountryCode] = useState<number | ''>('');
  const [previewFrom, setPreviewFrom] = useState('');
  const [previewTo, setPreviewTo] = useState('');
  const [previewAmount, setPreviewAmount] = useState('');
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  async function callCompliance(payload: Record<string, unknown>, key: string, label: string) {
    setBusyKey(key);
    setBanner(null);
    try {
      const res = await fetch('/api/tokenization/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: 'warn', text: body.error ?? `${label} failed (HTTP ${res.status}).` });
        return;
      }
      setBanner({
        tone: 'good',
        text: `${label} submitted. txHash ${shortenHash(body.txHash, 6)}`
      });
      refresh();
    } finally {
      setBusyKey(null);
    }
  }

  async function runPreflight() {
    setBusyKey('preflight');
    setPreviewResult(null);
    try {
      const params = new URLSearchParams({
        assetId,
        from: previewFrom.trim(),
        to: previewTo.trim(),
        amount: previewAmount.trim()
      });
      const res = await fetch(`/api/tokenization/compliance?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewResult(body.error ?? `Preflight failed (HTTP ${res.status}).`);
        return;
      }
      setPreviewResult(body.canTransfer === true ? 'canTransfer = true' : 'canTransfer = false');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Compliance modules</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {assetName}{' '}
            <span className="ml-2 text-sm font-normal text-[hsl(var(--muted))]">{assetCode}</span>
          </h2>
          <div className="mt-1 font-mono text-xs text-[hsl(var(--muted))]">
            ModularCompliance {shortenHash(complianceAddress, 6)}
          </div>
        </div>
        {banner ? <Badge tone={banner.tone}>{banner.text}</Badge> : null}
      </div>

      <section className="space-y-3">
        <div className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Attached modules ({modules.length})
        </div>
        {modules.length === 0 ? (
          <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-sm text-[hsl(var(--muted))]">
            No compliance modules attached. Add one below to enforce holder, country, or lockup
            rules.
          </div>
        ) : (
          <ul className="space-y-2">
            {modules.map((address) => (
              <li
                key={address}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3"
              >
                <div className="font-mono text-sm text-[hsl(var(--foreground))]">{address}</div>
                <Button
                  variant="ghost"
                  disabled={isBusy(`remove:${address}`)}
                  onClick={() =>
                    callCompliance(
                      { action: 'removeModule', assetId, moduleAddress: address },
                      `remove:${address}`,
                      'removeModule'
                    )
                  }
                >
                  {busyKey === `remove:${address}` ? '...' : 'Remove'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = moduleAddress.trim();
            if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
              setBanner({ tone: 'warn', text: 'Module address must be a 20-byte 0x address.' });
              return;
            }
            void callCompliance(
              { action: 'addModule', assetId, moduleAddress: trimmed },
              'add',
              'addModule'
            ).then(() => setModuleAddress(''));
          }}
        >
          <div className="grow">
            <label className="mb-1 block text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
              Add module address
            </label>
            <Input
              value={moduleAddress}
              onChange={(e) => setModuleAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <Button type="submit" disabled={isBusy('add')}>
            {busyKey === 'add' ? 'Adding...' : 'Attach module'}
          </Button>
        </form>
      </section>

      <section className="space-y-3 border-t border-[hsl(var(--border))] pt-5">
        <div className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Country restrictions
        </div>
        {countryRestrictModuleAddress === null ? (
          <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-sm text-[hsl(var(--muted))]">
            CountryRestrictModule is not attached to this deployment. Attach a module first to
            manage country-level blocks.
          </div>
        ) : (
          <>
            <div className="font-mono text-xs text-[hsl(var(--muted))]">
              CountryRestrictModule {shortenHash(countryRestrictModuleAddress, 6)}
            </div>
            <ul className="space-y-2">
              {blockedCountries.map((row) => (
                <li
                  key={row.code}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3"
                >
                  <div className="text-sm text-[hsl(var(--foreground))]">
                    ISO numeric <span className="font-mono">{row.code}</span> —{' '}
                    <span
                      className={
                        row.blocked ? 'text-[hsl(var(--warning))]' : 'text-[hsl(var(--success))]'
                      }
                    >
                      {row.blocked ? 'BLOCKED' : 'allowed'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={isBusy(`country:${row.code}`)}
                    onClick={() =>
                      callCompliance(
                        {
                          action: row.blocked ? 'unblockCountry' : 'blockCountry',
                          assetId,
                          countryCode: row.code
                        },
                        `country:${row.code}`,
                        row.blocked ? 'unblockCountry' : 'blockCountry'
                      )
                    }
                  >
                    {busyKey === `country:${row.code}` ? '...' : row.blocked ? 'Unblock' : 'Block'}
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (typeof countryCode !== 'number' || !Number.isInteger(countryCode)) {
                  setBanner({
                    tone: 'warn',
                    text: 'Country code must be a positive ISO 3166-1 numeric.'
                  });
                  return;
                }
                void callCompliance(
                  { action: 'blockCountry', assetId, countryCode },
                  'block-new',
                  'blockCountry'
                ).then(() => setCountryCode(''));
              }}
            >
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
                  Block new country (ISO numeric)
                </label>
                <Input
                  type="number"
                  value={countryCode}
                  onChange={(e) =>
                    setCountryCode(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="410"
                  min={1}
                  max={65535}
                />
              </div>
              <Button type="submit" disabled={isBusy('block-new')}>
                {busyKey === 'block-new' ? 'Blocking...' : 'Block country'}
              </Button>
            </form>
          </>
        )}
      </section>

      <section className="space-y-3 border-t border-[hsl(var(--border))] pt-5">
        <div className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Transfer preflight
        </div>
        <p className="text-sm text-[hsl(var(--muted))]">
          Read-only check: would the configured module stack permit a transfer from{' '}
          <span className="font-mono">from</span> to <span className="font-mono">to</span> for{' '}
          <span className="font-mono">amount</span> base units?
        </p>
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void runPreflight();
          }}
        >
          <Input
            value={previewFrom}
            onChange={(e) => setPreviewFrom(e.target.value)}
            placeholder="from 0x..."
          />
          <Input
            value={previewTo}
            onChange={(e) => setPreviewTo(e.target.value)}
            placeholder="to 0x..."
          />
          <Input
            value={previewAmount}
            onChange={(e) => setPreviewAmount(e.target.value)}
            placeholder="amount (base units)"
          />
          <Button type="submit" disabled={busyKey === 'preflight'}>
            {busyKey === 'preflight' ? 'Checking...' : 'Run preflight'}
          </Button>
        </form>
        {previewResult ? (
          <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-sm text-[hsl(var(--foreground))]">
            {previewResult}
          </div>
        ) : null}
      </section>
    </Card>
  );
}
