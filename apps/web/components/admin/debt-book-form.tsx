'use client';

import { useState } from 'react';
import { AmortizationProfile, DebtFacilityType } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { type SupportedCurrency } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type DebtDrawDraft = {
  localId: string;
  drawYear: string;
  drawMonth: string;
  amountKrw: string;
  notes: string;
};

type DebtFacilityDraft = {
  id?: string;
  localId: string;
  facilityType: string;
  lenderName: string;
  commitmentKrw: string;
  drawnAmountKrw: string;
  interestRatePct: string;
  upfrontFeePct: string;
  commitmentFeePct: string;
  gracePeriodMonths: string;
  amortizationTermMonths: string;
  amortizationProfile: string;
  sculptedTargetDscr: string;
  balloonPct: string;
  reserveMonths: string;
  notes: string;
  draws: DebtDrawDraft[];
};

type DebtDrawDefaultValue = {
  drawYear?: number | null;
  drawMonth?: number | null;
  amountKrw?: number | null;
  notes?: string | null;
};

type DebtFacilityDefaultValue = {
  id: string;
  facilityType: DebtFacilityType;
  lenderName?: string | null;
  commitmentKrw?: number | null;
  drawnAmountKrw?: number | null;
  interestRatePct?: number | null;
  upfrontFeePct?: number | null;
  commitmentFeePct?: number | null;
  gracePeriodMonths?: number | null;
  amortizationTermMonths?: number | null;
  amortizationProfile: AmortizationProfile;
  sculptedTargetDscr?: number | null;
  balloonPct?: number | null;
  reserveMonths?: number | null;
  notes?: string | null;
  draws: DebtDrawDefaultValue[];
};

function stringifyValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildDrawDraft(draw?: DebtDrawDefaultValue): DebtDrawDraft {
  return {
    localId: `draw_${Math.random().toString(36).slice(2, 10)}`,
    drawYear: stringifyValue(draw?.drawYear),
    drawMonth: stringifyValue(draw?.drawMonth),
    amountKrw: stringifyValue(draw?.amountKrw),
    notes: draw?.notes ?? ''
  };
}

function buildFacilityDraft(facility?: DebtFacilityDefaultValue): DebtFacilityDraft {
  return {
    id: facility?.id,
    localId: facility?.id ?? `debt_${Math.random().toString(36).slice(2, 10)}`,
    facilityType: facility?.facilityType ?? '',
    lenderName: facility?.lenderName ?? '',
    commitmentKrw: stringifyValue(facility?.commitmentKrw),
    drawnAmountKrw: stringifyValue(facility?.drawnAmountKrw),
    interestRatePct: stringifyValue(facility?.interestRatePct),
    upfrontFeePct: stringifyValue(facility?.upfrontFeePct),
    commitmentFeePct: stringifyValue(facility?.commitmentFeePct),
    gracePeriodMonths: stringifyValue(facility?.gracePeriodMonths),
    amortizationTermMonths: stringifyValue(facility?.amortizationTermMonths),
    amortizationProfile: facility?.amortizationProfile ?? AmortizationProfile.INTEREST_ONLY,
    sculptedTargetDscr: stringifyValue(facility?.sculptedTargetDscr),
    balloonPct: stringifyValue(facility?.balloonPct),
    reserveMonths: stringifyValue(facility?.reserveMonths),
    notes: facility?.notes ?? '',
    draws: facility?.draws.length ? facility.draws.map((draw) => buildDrawDraft(draw)) : [buildDrawDraft()]
  };
}

function moneyLabel(label: string, currency: SupportedCurrency) {
  return label.replace(/\(KRW\)/g, `(${currency})`);
}

export function DebtBookForm({
  assetId,
  inputCurrency = 'KRW',
  defaultFacilities
}: {
  assetId: string;
  inputCurrency?: SupportedCurrency;
  defaultFacilities: DebtFacilityDefaultValue[];
}) {
  const router = useRouter();
  const [facilities, setFacilities] = useState<DebtFacilityDraft[]>(() =>
    defaultFacilities.length > 0 ? defaultFacilities.map((facility) => buildFacilityDraft(facility)) : [buildFacilityDraft()]
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateFacility = (localId: string, key: keyof DebtFacilityDraft, value: string | DebtDrawDraft[]) => {
    setFacilities((current) =>
      current.map((facility) => (facility.localId === localId ? { ...facility, [key]: value } : facility))
    );
  };

  const updateDraw = (facilityLocalId: string, drawLocalId: string, key: keyof DebtDrawDraft, value: string) => {
    setFacilities((current) =>
      current.map((facility) =>
        facility.localId !== facilityLocalId
          ? facility
          : {
              ...facility,
              draws: facility.draws.map((draw) => (draw.localId === drawLocalId ? { ...draw, [key]: value } : draw))
            }
      )
    );
  };

  const addDraw = (facilityLocalId: string) => {
    setFacilities((current) =>
      current.map((facility) =>
        facility.localId === facilityLocalId ? { ...facility, draws: [...facility.draws, buildDrawDraft()] } : facility
      )
    );
  };

  const deleteDraw = (facilityLocalId: string, drawLocalId: string) => {
    setFacilities((current) =>
      current.map((facility) => {
        if (facility.localId !== facilityLocalId) return facility;
        const nextDraws = facility.draws.filter((draw) => draw.localId !== drawLocalId);
        return {
          ...facility,
          draws: nextDraws.length > 0 ? nextDraws : [buildDrawDraft()]
        };
      })
    );
  };

  const handleSave = async (facility: DebtFacilityDraft) => {
    setSubmittingId(facility.localId);
    setErrorMessage(null);

    try {
      const payload = {
        facilityType: facility.facilityType || undefined,
        lenderName: facility.lenderName,
        commitmentKrw: facility.commitmentKrw,
        drawnAmountKrw: facility.drawnAmountKrw,
        interestRatePct: facility.interestRatePct,
        upfrontFeePct: facility.upfrontFeePct,
        commitmentFeePct: facility.commitmentFeePct,
        gracePeriodMonths: facility.gracePeriodMonths,
        amortizationTermMonths: facility.amortizationTermMonths,
        amortizationProfile: facility.amortizationProfile || undefined,
        sculptedTargetDscr: facility.sculptedTargetDscr,
        balloonPct: facility.balloonPct,
        reserveMonths: facility.reserveMonths,
        notes: facility.notes,
        draws: facility.draws.map((draw) => ({
          drawYear: draw.drawYear,
          drawMonth: draw.drawMonth,
          amountKrw: draw.amountKrw,
          notes: draw.notes
        })),
        inputCurrency
      };

      const response = await fetch(
        facility.id ? `/api/assets/${assetId}/debt/${facility.id}` : `/api/assets/${assetId}/debt`,
        {
          method: facility.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to save debt facility');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save debt facility');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDelete = async (facility: DebtFacilityDraft) => {
    if (!facility.id) {
      setFacilities((current) => {
        const next = current.filter((candidate) => candidate.localId !== facility.localId);
        return next.length > 0 ? next : [buildFacilityDraft()];
      });
      return;
    }

    setDeletingId(facility.localId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/debt/${facility.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to delete debt facility');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete debt facility');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4">
        {facilities.map((facility, index) => (
          <div key={facility.localId} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Debt Facility {index + 1}</div>
                <h4 className="mt-2 text-xl font-semibold text-white">
                  {facility.lenderName || facility.facilityType || `Facility ${index + 1}`}
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submittingId === facility.localId || deletingId === facility.localId}
                  onClick={() => handleDelete(facility)}
                >
                  {deletingId === facility.localId ? 'Deleting...' : 'Delete'}
                </Button>
                <Button
                  type="button"
                  disabled={submittingId === facility.localId || deletingId === facility.localId}
                  onClick={() => handleSave(facility)}
                >
                  {submittingId === facility.localId ? 'Saving...' : facility.id ? 'Update Facility' : 'Add Facility'}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="fine-print">Facility Type</span>
                <Select
                  value={facility.facilityType}
                  onChange={(event) => updateFacility(facility.localId, 'facilityType', event.target.value)}
                >
                  <option value="">Select facility type</option>
                  {Object.values(DebtFacilityType).map((facilityType) => (
                    <option key={facilityType} value={facilityType}>
                      {facilityType}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="fine-print">Lender</span>
                <Input value={facility.lenderName} onChange={(event) => updateFacility(facility.localId, 'lenderName', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Commitment (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={facility.commitmentKrw} onChange={(event) => updateFacility(facility.localId, 'commitmentKrw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Drawn Amount (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={facility.drawnAmountKrw} onChange={(event) => updateFacility(facility.localId, 'drawnAmountKrw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Interest Rate (%)</span>
                <Input type="number" step="any" value={facility.interestRatePct} onChange={(event) => updateFacility(facility.localId, 'interestRatePct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Upfront Fee (%)</span>
                <Input type="number" step="any" value={facility.upfrontFeePct} onChange={(event) => updateFacility(facility.localId, 'upfrontFeePct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Commitment Fee (%)</span>
                <Input type="number" step="any" value={facility.commitmentFeePct} onChange={(event) => updateFacility(facility.localId, 'commitmentFeePct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Reserve Months</span>
                <Input type="number" step="any" value={facility.reserveMonths} onChange={(event) => updateFacility(facility.localId, 'reserveMonths', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Grace Period (months)</span>
                <Input type="number" step="1" value={facility.gracePeriodMonths} onChange={(event) => updateFacility(facility.localId, 'gracePeriodMonths', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Amortization Term (months)</span>
                <Input type="number" step="1" value={facility.amortizationTermMonths} onChange={(event) => updateFacility(facility.localId, 'amortizationTermMonths', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Amortization Profile</span>
                <Select
                  value={facility.amortizationProfile}
                  onChange={(event) => updateFacility(facility.localId, 'amortizationProfile', event.target.value)}
                >
                  {Object.values(AmortizationProfile).map((profile) => (
                    <option key={profile} value={profile}>
                      {profile}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="fine-print">Balloon (%)</span>
                <Input type="number" step="any" value={facility.balloonPct} onChange={(event) => updateFacility(facility.localId, 'balloonPct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Target DSCR</span>
                <Input type="number" step="any" value={facility.sculptedTargetDscr} onChange={(event) => updateFacility(facility.localId, 'sculptedTargetDscr', event.target.value)} />
              </label>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400 md:col-span-2 xl:col-span-3">
                Add explicit draws if construction funding does not follow a generic two-draw pattern. If no facility is
                entered, valuation falls back to the synthetic underwriting debt package.
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-slate-950/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Debt Draw Schedule</div>
                  <div className="mt-1 text-sm text-slate-400">Year and month timing for each debt draw.</div>
                </div>
                <Button type="button" variant="secondary" onClick={() => addDraw(facility.localId)}>
                  Add Draw
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {facility.draws.map((draw, drawIndex) => (
                  <div key={draw.localId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-sm font-medium text-white">Draw {drawIndex + 1}</div>
                      <Button type="button" variant="secondary" onClick={() => deleteDraw(facility.localId, draw.localId)}>
                        Remove Draw
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-2">
                        <span className="fine-print">Draw Year</span>
                        <Input type="number" step="1" value={draw.drawYear} onChange={(event) => updateDraw(facility.localId, draw.localId, 'drawYear', event.target.value)} />
                      </label>
                      <label className="space-y-2">
                        <span className="fine-print">Draw Month</span>
                        <Input type="number" step="1" value={draw.drawMonth} onChange={(event) => updateDraw(facility.localId, draw.localId, 'drawMonth', event.target.value)} />
                      </label>
                      <label className="space-y-2 xl:col-span-2">
                        <span className="fine-print">{moneyLabel('Draw Amount (KRW)', inputCurrency)}</span>
                        <Input type="number" step="any" value={draw.amountKrw} onChange={(event) => updateDraw(facility.localId, draw.localId, 'amountKrw', event.target.value)} />
                      </label>
                    </div>
                    <label className="mt-3 block space-y-2">
                      <span className="fine-print">Notes</span>
                      <Textarea
                        value={draw.notes}
                        placeholder="Milestone, EPC invoice timing, lender condition, or staged funding note."
                        onChange={(event) => updateDraw(facility.localId, draw.localId, 'notes', event.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="fine-print">Notes</span>
              <Textarea
                className="min-h-[112px]"
                value={facility.notes}
                placeholder="Security package, covenant note, construction-to-term rollover, or lender assumptions."
                onChange={(event) => updateFacility(facility.localId, 'notes', event.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-3xl text-sm text-slate-400">
          Capture actual debt terms so DSCR, reserve requirement, and ending balance stop leaning on the synthetic
          facility fallback.
        </p>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button type="button" variant="secondary" onClick={() => setFacilities((current) => [...current, buildFacilityDraft()])}>
            Add Debt Facility
          </Button>
        </div>
      </div>
    </div>
  );
}
