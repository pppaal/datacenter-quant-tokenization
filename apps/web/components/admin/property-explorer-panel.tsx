'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { PropertyExplorerData } from '@/lib/services/property-explorer';
import { formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  data: PropertyExplorerData;
};

function getMarkerTone(assetClass: AssetClass, hasLiveDossier: boolean) {
  if (hasLiveDossier) return 'border-emerald-400 bg-emerald-500/20 text-emerald-100';
  if (assetClass === AssetClass.DATA_CENTER) return 'border-sky-400 bg-sky-500/15 text-sky-100';
  return 'border-amber-300 bg-amber-400/15 text-amber-100';
}

export function PropertyExplorerPanel({ data }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.candidates[0]?.id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () =>
      data.candidates.find((candidate) => candidate.id === selectedId) ??
      data.candidates[0] ??
      null,
    [data.candidates, selectedId]
  );

  async function bootstrapCandidate(candidateId: string) {
    setBusyId(candidateId);
    setError(null);
    try {
      const response = await fetch(`/api/property-candidates/${candidateId}/bootstrap`, {
        method: 'POST'
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.id) {
        throw new Error(payload?.error ?? 'Failed to bootstrap property candidate');
      }

      router.push(`/admin/assets/${payload.id}`);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to bootstrap property candidate'
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!selected) {
    return (
      <Card className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
        No property candidates are staged yet.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {[
          [
            'Tracked candidates',
            formatNumber(data.stats.candidateCount, 0),
            'seeded universe rows'
          ],
          ['Live dossiers', formatNumber(data.stats.linkedAssetCount, 0), 'already inside the OS'],
          [
            'Ready to bootstrap',
            formatNumber(data.stats.untrackedCount, 0),
            'one click into intake'
          ],
          [
            'Office screens',
            formatNumber(data.stats.officeCount, 0),
            'CBD and innovation corridors'
          ],
          [
            'Data-center screens',
            formatNumber(data.stats.dataCenterCount, 0),
            'power-first infra screens'
          ]
        ].map(([label, value, detail]) => (
          <div key={label} className="metric-card">
            <div className="fine-print">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
            <p className="mt-2 text-xs leading-6 text-slate-400">{detail}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-[20px] border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Property Explorer</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Map-like intake surface for universal property screens
              </h2>
            </div>
            <Badge tone="neutral">Preliminary screen</Badge>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative min-h-[480px] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(180deg,rgba(8,47,73,0.65),rgba(15,23,42,0.92))] p-6">
              <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:54px_54px]" />
              <div className="pointer-events-none absolute left-6 top-6 rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-300">
                Seoul / Incheon / Pangyo screen
              </div>
              {data.candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedId(candidate.id)}
                  className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_8px_rgba(15,23,42,0.28)] transition ${getMarkerTone(
                    candidate.assetClass,
                    candidate.hasLiveDossier
                  )} ${candidate.id === selected.id ? 'scale-125' : 'hover:scale-110'}`}
                  style={{
                    left: `${candidate.mapPosition.leftPct}%`,
                    top: `${candidate.mapPosition.topPct}%`
                  }}
                  aria-label={candidate.name}
                  data-testid="property-explorer-marker"
                />
              ))}
              <div className="absolute bottom-6 left-6 right-6 grid gap-3 rounded-[24px] border border-white/10 bg-slate-950/78 p-4 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="fine-print">Selected candidate</div>
                    <div className="mt-2 text-xl font-semibold text-white">{selected.name}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{toSentenceCase(selected.assetClass)}</Badge>
                    <Badge tone={selected.hasLiveDossier ? 'good' : 'warn'}>
                      {selected.hasLiveDossier ? 'Live dossier' : 'Bootstrap ready'}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm leading-7 text-slate-300">{selected.screenSummary}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="fine-print">{selected.assetCode}</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selected.name}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {selected.addressLine1}, {selected.district}, {selected.city}, {selected.province}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="neutral">Parcel {selected.parcelId}</Badge>
                  <Badge tone="neutral">
                    {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="eyebrow">Investment screen</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    {selected.investmentAngle}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="eyebrow">DD posture</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{selected.diligenceAngle}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="eyebrow">Official-source screen</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {selected.officialSignals.map((signal) => (
                    <div
                      key={signal.label}
                      className="rounded-[18px] border border-white/10 bg-slate-950/55 p-3"
                    >
                      <div className="fine-print">{signal.label}</div>
                      <div className="mt-2 text-sm font-semibold text-white">{signal.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="eyebrow">Current blockers</div>
                <div className="mt-4 space-y-2">
                  {selected.blockers.map((blocker) => (
                    <div
                      key={blocker}
                      className="rounded-[18px] border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100"
                    >
                      {blocker}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {selected.linkedAssetId ? (
                  <Link href={`/admin/assets/${selected.linkedAssetId}`}>
                    <Button data-testid="property-explorer-open-linked">Open Live Dossier</Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => bootstrapCandidate(selected.id)}
                    disabled={busyId === selected.id}
                    data-testid="property-explorer-bootstrap"
                  >
                    {busyId === selected.id ? 'Bootstrapping...' : 'Bootstrap Asset Dossier'}
                  </Button>
                )}
                <Link href="/admin/assets/new">
                  <Button variant="secondary">Open Manual Intake</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Coverage Queue</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Universal screens ready to convert into full underwriting files
          </h2>
          <div className="mt-5 grid gap-3">
            {data.candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setSelectedId(candidate.id)}
                aria-label={`Select ${candidate.name}`}
                className={`rounded-[22px] border p-4 text-left transition ${
                  candidate.id === selected.id
                    ? 'border-accent bg-accent/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                }`}
                data-testid="property-explorer-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-white">{candidate.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {candidate.district}, {candidate.city} /{' '}
                      {toSentenceCase(candidate.assetClass)}
                    </div>
                  </div>
                  <Badge tone={candidate.hasLiveDossier ? 'good' : 'warn'}>
                    {candidate.hasLiveDossier ? 'Tracked' : 'Untracked'}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
