'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LeaseStatus } from '@prisma/client';
import { type SupportedCurrency } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type LeaseDraft = {
  id?: string;
  localId: string;
  tenantName: string;
  leaseStatus: string;
  leasedKw: string;
  startYear: string;
  termYears: string;
  baseRatePerKwKrw: string;
  annualEscalationPct: string;
  probabilityPct: string;
  renewProbabilityPct: string;
  downtimeMonths: string;
  rentFreeMonths: string;
  tenantImprovementKrw: string;
  leasingCommissionKrw: string;
  recoverableOpexRatioPct: string;
  fixedRecoveriesKrw: string;
  expenseStopKrwPerKwMonth: string;
  utilityPassThroughPct: string;
  fitOutCostKrw: string;
  leaseNotes: string;
  steps: LeaseStepDraft[];
};

type LeaseStepDraft = {
  localId: string;
  startYear: string;
  endYear: string;
  ratePerKwKrw: string;
  leasedKw: string;
  annualEscalationPct: string;
  occupancyPct: string;
  rentFreeMonths: string;
  tenantImprovementKrw: string;
  leasingCommissionKrw: string;
  recoverableOpexRatioPct: string;
  fixedRecoveriesKrw: string;
  expenseStopKrwPerKwMonth: string;
  utilityPassThroughPct: string;
  notes: string;
};

type LeaseDefaultValue = {
  id: string;
  tenantName: string;
  leaseStatus: LeaseStatus;
  leasedKw?: number;
  startYear?: number;
  termYears?: number;
  baseRatePerKwKrw?: number;
  annualEscalationPct?: number | null;
  probabilityPct?: number | null;
  renewProbabilityPct?: number | null;
  downtimeMonths?: number | null;
  rentFreeMonths?: number | null;
  tenantImprovementKrw?: number | null;
  leasingCommissionKrw?: number | null;
  recoverableOpexRatioPct?: number | null;
  fixedRecoveriesKrw?: number | null;
  expenseStopKrwPerKwMonth?: number | null;
  utilityPassThroughPct?: number | null;
  fitOutCostKrw?: number | null;
  leaseNotes?: string | null;
  steps?: Array<{
    startYear?: number | null;
    endYear?: number | null;
    ratePerKwKrw?: number | null;
    leasedKw?: number | null;
    annualEscalationPct?: number | null;
    occupancyPct?: number | null;
    rentFreeMonths?: number | null;
    tenantImprovementKrw?: number | null;
    leasingCommissionKrw?: number | null;
    recoverableOpexRatioPct?: number | null;
    fixedRecoveriesKrw?: number | null;
    expenseStopKrwPerKwMonth?: number | null;
    utilityPassThroughPct?: number | null;
    notes?: string | null;
  }>;
};

function stringifyValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildDraft(lease?: LeaseDefaultValue): LeaseDraft {
  return {
    id: lease?.id,
    localId: lease?.id ?? `draft_${Math.random().toString(36).slice(2, 10)}`,
    tenantName: lease?.tenantName ?? '',
    leaseStatus: lease?.leaseStatus ?? '',
    leasedKw: stringifyValue(lease?.leasedKw),
    startYear: stringifyValue(lease?.startYear),
    termYears: stringifyValue(lease?.termYears),
    baseRatePerKwKrw: stringifyValue(lease?.baseRatePerKwKrw),
    annualEscalationPct: stringifyValue(lease?.annualEscalationPct),
    probabilityPct: stringifyValue(lease?.probabilityPct),
    renewProbabilityPct: stringifyValue(lease?.renewProbabilityPct),
    downtimeMonths: stringifyValue(lease?.downtimeMonths),
    rentFreeMonths: stringifyValue(lease?.rentFreeMonths),
    tenantImprovementKrw: stringifyValue(lease?.tenantImprovementKrw),
    leasingCommissionKrw: stringifyValue(lease?.leasingCommissionKrw),
    recoverableOpexRatioPct: stringifyValue(lease?.recoverableOpexRatioPct),
    fixedRecoveriesKrw: stringifyValue(lease?.fixedRecoveriesKrw),
    expenseStopKrwPerKwMonth: stringifyValue(lease?.expenseStopKrwPerKwMonth),
    utilityPassThroughPct: stringifyValue(lease?.utilityPassThroughPct),
    fitOutCostKrw: stringifyValue(lease?.fitOutCostKrw),
    leaseNotes: lease?.leaseNotes ?? '',
    steps:
      lease?.steps?.map((step) => ({
        localId: `step_${Math.random().toString(36).slice(2, 10)}`,
        startYear: stringifyValue(step.startYear),
        endYear: stringifyValue(step.endYear),
        ratePerKwKrw: stringifyValue(step.ratePerKwKrw),
        leasedKw: stringifyValue(step.leasedKw),
        annualEscalationPct: stringifyValue(step.annualEscalationPct),
        occupancyPct: stringifyValue(step.occupancyPct),
        rentFreeMonths: stringifyValue(step.rentFreeMonths),
        tenantImprovementKrw: stringifyValue(step.tenantImprovementKrw),
        leasingCommissionKrw: stringifyValue(step.leasingCommissionKrw),
        recoverableOpexRatioPct: stringifyValue(step.recoverableOpexRatioPct),
        fixedRecoveriesKrw: stringifyValue(step.fixedRecoveriesKrw),
        expenseStopKrwPerKwMonth: stringifyValue(step.expenseStopKrwPerKwMonth),
        utilityPassThroughPct: stringifyValue(step.utilityPassThroughPct),
        notes: step.notes ?? ''
      })) ?? []
  };
}

function moneyLabel(label: string, currency: SupportedCurrency) {
  return label.replace(/\(KRW\)/g, `(${currency})`);
}

export function LeaseBookForm({
  assetId,
  inputCurrency = 'KRW',
  defaultLeases
}: {
  assetId: string;
  inputCurrency?: SupportedCurrency;
  defaultLeases: LeaseDefaultValue[];
}) {
  const router = useRouter();
  const [leases, setLeases] = useState<LeaseDraft[]>(() =>
    defaultLeases.length > 0 ? defaultLeases.map((lease) => buildDraft(lease)) : [buildDraft()]
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateLease = (localId: string, key: keyof LeaseDraft, value: string) => {
    setLeases((current) =>
      current.map((lease) => (lease.localId === localId ? { ...lease, [key]: value } : lease))
    );
  };

  const updateStep = (
    leaseLocalId: string,
    stepLocalId: string,
    key: keyof LeaseStepDraft,
    value: string
  ) => {
    setLeases((current) =>
      current.map((lease) =>
        lease.localId === leaseLocalId
          ? {
              ...lease,
              steps: lease.steps.map((step) =>
                step.localId === stepLocalId ? { ...step, [key]: value } : step
              )
            }
          : lease
      )
    );
  };

  const addStep = (leaseLocalId: string) => {
    setLeases((current) =>
      current.map((lease) =>
        lease.localId === leaseLocalId
          ? {
              ...lease,
              steps: [
                ...lease.steps,
                {
                  localId: `step_${Math.random().toString(36).slice(2, 10)}`,
                  startYear: '',
                  endYear: '',
                  ratePerKwKrw: '',
                  leasedKw: '',
                  annualEscalationPct: '',
                  occupancyPct: '',
                  rentFreeMonths: '',
                  tenantImprovementKrw: '',
                  leasingCommissionKrw: '',
                  recoverableOpexRatioPct: '',
                  fixedRecoveriesKrw: '',
                  expenseStopKrwPerKwMonth: '',
                  utilityPassThroughPct: '',
                  notes: ''
                }
              ]
            }
          : lease
      )
    );
  };

  const removeStep = (leaseLocalId: string, stepLocalId: string) => {
    setLeases((current) =>
      current.map((lease) =>
        lease.localId === leaseLocalId
          ? {
              ...lease,
              steps: lease.steps.filter((step) => step.localId !== stepLocalId)
            }
          : lease
      )
    );
  };

  const handleSave = async (lease: LeaseDraft) => {
    setSubmittingId(lease.localId);
    setErrorMessage(null);

    try {
      const payload = {
        tenantName: lease.tenantName,
        leaseStatus: lease.leaseStatus || undefined,
        leasedKw: lease.leasedKw,
        startYear: lease.startYear,
        termYears: lease.termYears,
        baseRatePerKwKrw: lease.baseRatePerKwKrw,
        annualEscalationPct: lease.annualEscalationPct,
        probabilityPct: lease.probabilityPct,
        renewProbabilityPct: lease.renewProbabilityPct,
        downtimeMonths: lease.downtimeMonths,
        rentFreeMonths: lease.rentFreeMonths,
        tenantImprovementKrw: lease.tenantImprovementKrw,
        leasingCommissionKrw: lease.leasingCommissionKrw,
        recoverableOpexRatioPct: lease.recoverableOpexRatioPct,
        fixedRecoveriesKrw: lease.fixedRecoveriesKrw,
        expenseStopKrwPerKwMonth: lease.expenseStopKrwPerKwMonth,
        utilityPassThroughPct: lease.utilityPassThroughPct,
        fitOutCostKrw: lease.fitOutCostKrw,
        leaseNotes: lease.leaseNotes,
        steps: lease.steps.map((step) => ({
          startYear: step.startYear,
          endYear: step.endYear,
          ratePerKwKrw: step.ratePerKwKrw,
          leasedKw: step.leasedKw,
          annualEscalationPct: step.annualEscalationPct,
          occupancyPct: step.occupancyPct,
          rentFreeMonths: step.rentFreeMonths,
          tenantImprovementKrw: step.tenantImprovementKrw,
          leasingCommissionKrw: step.leasingCommissionKrw,
          recoverableOpexRatioPct: step.recoverableOpexRatioPct,
          fixedRecoveriesKrw: step.fixedRecoveriesKrw,
          expenseStopKrwPerKwMonth: step.expenseStopKrwPerKwMonth,
          utilityPassThroughPct: step.utilityPassThroughPct,
          notes: step.notes
        })),
        inputCurrency
      };
      const response = await fetch(
        lease.id ? `/api/assets/${assetId}/leases/${lease.id}` : `/api/assets/${assetId}/leases`,
        {
          method: lease.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to save lease');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save lease');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDelete = async (lease: LeaseDraft) => {
    if (!lease.id) {
      setLeases((current) => {
        const next = current.filter((entry) => entry.localId !== lease.localId);
        return next.length > 0 ? next : [buildDraft()];
      });
      return;
    }

    setDeletingId(lease.localId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/leases/${lease.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? 'Failed to delete lease');
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete lease');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4">
        {leases.map((lease, index) => (
          <div key={lease.localId} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Lease {index + 1}</div>
                <h4 className="mt-2 text-xl font-semibold text-white">
                  {lease.tenantName || `Contracted load tranche ${index + 1}`}
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submittingId === lease.localId || deletingId === lease.localId}
                  onClick={() => handleDelete(lease)}
                >
                  {deletingId === lease.localId ? 'Deleting...' : 'Delete'}
                </Button>
                <Button
                  type="button"
                  disabled={submittingId === lease.localId || deletingId === lease.localId}
                  onClick={() => handleSave(lease)}
                >
                  {submittingId === lease.localId ? 'Saving...' : lease.id ? 'Update Lease' : 'Add Lease'}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="fine-print">Tenant</span>
                <Input value={lease.tenantName} onChange={(event) => updateLease(lease.localId, 'tenantName', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Lease Status</span>
                <Select value={lease.leaseStatus} onChange={(event) => updateLease(lease.localId, 'leaseStatus', event.target.value)}>
                  <option value="">Select status</option>
                  {Object.values(LeaseStatus).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="fine-print">Leased kW</span>
                <Input type="number" step="any" value={lease.leasedKw} onChange={(event) => updateLease(lease.localId, 'leasedKw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Start Year</span>
                <Input type="number" step="1" value={lease.startYear} onChange={(event) => updateLease(lease.localId, 'startYear', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Term (Years)</span>
                <Input type="number" step="1" value={lease.termYears} onChange={(event) => updateLease(lease.localId, 'termYears', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Base Rate / kW (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={lease.baseRatePerKwKrw} onChange={(event) => updateLease(lease.localId, 'baseRatePerKwKrw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Annual Escalation (%)</span>
                <Input type="number" step="any" value={lease.annualEscalationPct} onChange={(event) => updateLease(lease.localId, 'annualEscalationPct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Execution Probability (%)</span>
                <Input type="number" step="any" value={lease.probabilityPct} onChange={(event) => updateLease(lease.localId, 'probabilityPct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Renewal Probability (%)</span>
                <Input type="number" step="any" value={lease.renewProbabilityPct} onChange={(event) => updateLease(lease.localId, 'renewProbabilityPct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Downtime (Months)</span>
                <Input type="number" step="1" value={lease.downtimeMonths} onChange={(event) => updateLease(lease.localId, 'downtimeMonths', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Rent-Free (Months)</span>
                <Input type="number" step="1" value={lease.rentFreeMonths} onChange={(event) => updateLease(lease.localId, 'rentFreeMonths', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Tenant Improvement (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={lease.tenantImprovementKrw} onChange={(event) => updateLease(lease.localId, 'tenantImprovementKrw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Leasing Commission (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={lease.leasingCommissionKrw} onChange={(event) => updateLease(lease.localId, 'leasingCommissionKrw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Recoverable OpEx Ratio (%)</span>
                <Input type="number" step="any" value={lease.recoverableOpexRatioPct} onChange={(event) => updateLease(lease.localId, 'recoverableOpexRatioPct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Fixed Recoveries / Year (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={lease.fixedRecoveriesKrw} onChange={(event) => updateLease(lease.localId, 'fixedRecoveriesKrw', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Expense Stop / kW / Month (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={lease.expenseStopKrwPerKwMonth} onChange={(event) => updateLease(lease.localId, 'expenseStopKrwPerKwMonth', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Utility Pass-Through (%)</span>
                <Input type="number" step="any" value={lease.utilityPassThroughPct} onChange={(event) => updateLease(lease.localId, 'utilityPassThroughPct', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">{moneyLabel('Fit-Out Cost (KRW)', inputCurrency)}</span>
                <Input type="number" step="any" value={lease.fitOutCostKrw} onChange={(event) => updateLease(lease.localId, 'fitOutCostKrw', event.target.value)} />
              </label>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400">
                Each lease row feeds the DCF directly. Save signed, active, and pipeline tranches separately so the
                revenue stack stops leaning on synthetic residual ramp assumptions.
              </div>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="fine-print">Lease Notes</span>
              <Textarea
                className="min-h-[124px]"
                value={lease.leaseNotes}
                placeholder="Credit context, rent-free period, staged ramp, fit-out detail, or downtime comments."
                onChange={(event) => updateLease(lease.localId, 'leaseNotes', event.target.value)}
              />
            </label>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-slate-950/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Step Schedule</div>
                  <div className="mt-2 text-sm text-slate-300">
                    Use steps for staged rent, phased ramp, or occupancy-specific contract periods.
                  </div>
                </div>
                <Button type="button" variant="secondary" onClick={() => addStep(lease.localId)}>
                  Add Step
                </Button>
              </div>

              {lease.steps.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                  No lease steps yet. If rent, load, or occupancy changes over time, add staged steps here.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {lease.steps.map((step, stepIndex) => (
                    <div key={step.localId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Step {stepIndex + 1}</div>
                        <Button type="button" variant="secondary" onClick={() => removeStep(lease.localId, step.localId)}>
                          Remove Step
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <label className="space-y-2">
                          <span className="fine-print">Start Year</span>
                          <Input type="number" step="1" value={step.startYear} onChange={(event) => updateStep(lease.localId, step.localId, 'startYear', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">End Year</span>
                          <Input type="number" step="1" value={step.endYear} onChange={(event) => updateStep(lease.localId, step.localId, 'endYear', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">{moneyLabel('Rate / kW (KRW)', inputCurrency)}</span>
                          <Input type="number" step="any" value={step.ratePerKwKrw} onChange={(event) => updateStep(lease.localId, step.localId, 'ratePerKwKrw', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">Leased kW</span>
                          <Input type="number" step="any" value={step.leasedKw} onChange={(event) => updateStep(lease.localId, step.localId, 'leasedKw', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">Annual Escalation (%)</span>
                          <Input type="number" step="any" value={step.annualEscalationPct} onChange={(event) => updateStep(lease.localId, step.localId, 'annualEscalationPct', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">Occupancy (%)</span>
                          <Input type="number" step="any" value={step.occupancyPct} onChange={(event) => updateStep(lease.localId, step.localId, 'occupancyPct', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">Rent-Free (Months)</span>
                          <Input type="number" step="1" value={step.rentFreeMonths} onChange={(event) => updateStep(lease.localId, step.localId, 'rentFreeMonths', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">{moneyLabel('Step TI (KRW)', inputCurrency)}</span>
                          <Input type="number" step="any" value={step.tenantImprovementKrw} onChange={(event) => updateStep(lease.localId, step.localId, 'tenantImprovementKrw', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">{moneyLabel('Step LC (KRW)', inputCurrency)}</span>
                          <Input type="number" step="any" value={step.leasingCommissionKrw} onChange={(event) => updateStep(lease.localId, step.localId, 'leasingCommissionKrw', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">Recoverable OpEx (%)</span>
                          <Input type="number" step="any" value={step.recoverableOpexRatioPct} onChange={(event) => updateStep(lease.localId, step.localId, 'recoverableOpexRatioPct', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">{moneyLabel('Fixed Recoveries / Year (KRW)', inputCurrency)}</span>
                          <Input type="number" step="any" value={step.fixedRecoveriesKrw} onChange={(event) => updateStep(lease.localId, step.localId, 'fixedRecoveriesKrw', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">{moneyLabel('Expense Stop / kW / Month (KRW)', inputCurrency)}</span>
                          <Input type="number" step="any" value={step.expenseStopKrwPerKwMonth} onChange={(event) => updateStep(lease.localId, step.localId, 'expenseStopKrwPerKwMonth', event.target.value)} />
                        </label>
                        <label className="space-y-2">
                          <span className="fine-print">Utility Pass-Through (%)</span>
                          <Input type="number" step="any" value={step.utilityPassThroughPct} onChange={(event) => updateStep(lease.localId, step.localId, 'utilityPassThroughPct', event.target.value)} />
                        </label>
                        <label className="space-y-2 xl:col-span-2">
                          <span className="fine-print">Step Notes</span>
                          <Input value={step.notes} onChange={(event) => updateStep(lease.localId, step.localId, 'notes', event.target.value)} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-3xl text-sm text-slate-400">
          Capture each tenant or capacity tranche separately. Monetary inputs are entered in {inputCurrency} and
          normalized to KRW internally before the valuation engine rebuilds revenue micro snapshots.
        </p>
        <div className="flex items-center gap-3">
          {errorMessage ? <span className="text-sm text-rose-300">{errorMessage}</span> : null}
          <Button type="button" variant="secondary" onClick={() => setLeases((current) => [...current, buildDraft()])}>
            Add Lease Row
          </Button>
        </div>
      </div>
    </div>
  );
}
