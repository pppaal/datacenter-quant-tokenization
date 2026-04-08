'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type InitiativeRecord = {
  id: string;
  title: string;
  category: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  ownerName: string | null;
  targetDate: Date | null;
  summary: string | null;
  blockerSummary: string | null;
  nextStep: string | null;
};

type AssetManagementInitiativePanelProps = {
  portfolioAssetId: string;
  assetName: string;
  initiatives: InitiativeRecord[];
};

const statusOptions: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
const priorityOptions: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function toneForStatus(status: TaskStatus) {
  if (status === 'DONE') return 'good' as const;
  if (status === 'BLOCKED') return 'danger' as const;
  if (status === 'IN_PROGRESS') return 'warn' as const;
  return 'neutral' as const;
}

function formatDateValue(value: Date | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function InitiativeRow({
  portfolioAssetId,
  initiative
}: {
  portfolioAssetId: string;
  initiative: InitiativeRecord;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatus>(initiative.status);
  const [priority, setPriority] = useState<TaskPriority>(initiative.priority);
  const [ownerName, setOwnerName] = useState(initiative.ownerName ?? '');
  const [targetDate, setTargetDate] = useState(formatDateValue(initiative.targetDate));
  const [blockerSummary, setBlockerSummary] = useState(initiative.blockerSummary ?? '');
  const [nextStep, setNextStep] = useState(initiative.nextStep ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/portfolio-assets/${portfolioAssetId}/initiatives/${initiative.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status,
          priority,
          ownerName,
          targetDate: targetDate || null,
          blockerSummary,
          nextStep
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update initiative');
      }

      setFeedback('Initiative updated.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to update initiative');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4" data-testid="initiative-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">{initiative.title}</div>
            <Badge tone={toneForStatus(status)}>{status.toLowerCase().replaceAll('_', ' ')}</Badge>
            <Badge tone={priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warn' : 'neutral'}>
              {priority.toLowerCase()}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {(initiative.category ?? 'general').replaceAll('_', ' ')} / {initiative.summary ?? 'Execution workflow item'}
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={save} disabled={submitting} data-testid="initiative-save">
          {submitting ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} data-testid="initiative-status">
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} data-testid="initiative-priority">
          {priorityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Input
          value={ownerName}
          onChange={(event) => setOwnerName(event.target.value)}
          placeholder="Owner"
          data-testid="initiative-owner"
        />
        <Input
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          data-testid="initiative-target-date"
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Textarea
          value={nextStep}
          onChange={(event) => setNextStep(event.target.value)}
          placeholder="Next step"
          className="min-h-[96px]"
          data-testid="initiative-next-step"
        />
        <Textarea
          value={blockerSummary}
          onChange={(event) => setBlockerSummary(event.target.value)}
          placeholder="Blocker summary"
          className="min-h-[96px]"
          data-testid="initiative-blocker-summary"
        />
      </div>

      {feedback ? <div className="mt-2 text-sm text-emerald-300">{feedback}</div> : null}
      {error ? <div className="mt-2 text-sm text-rose-300">{error}</div> : null}
    </div>
  );
}

export function AssetManagementInitiativePanel({
  portfolioAssetId,
  assetName,
  initiatives
}: AssetManagementInitiativePanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [ownerName, setOwnerName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [summary, setSummary] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createInitiative() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/portfolio-assets/${portfolioAssetId}/initiatives`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          category,
          priority,
          ownerName,
          targetDate: targetDate || null,
          summary,
          nextStep
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create initiative');
      }

      setTitle('');
      setCategory('');
      setPriority('MEDIUM');
      setOwnerName('');
      setTargetDate('');
      setSummary('');
      setNextStep('');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to create initiative');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="eyebrow">Asset Management Initiatives</div>
      <p className="mt-3 text-sm leading-7 text-slate-400">
        Track leasing, capex, refinance, and disposition initiatives for {assetName}. Blocked items should move into the
        firm-wide action center before the next committee or investor-reporting cycle.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Initiative title" data-testid="initiative-create-title" />
        <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
        <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
          {priorityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Owner" />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        <Input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary" />
        <Button type="button" onClick={createInitiative} disabled={submitting} data-testid="initiative-create-submit">
          {submitting ? 'Adding...' : 'Add Initiative'}
        </Button>
      </div>
      <div className="mt-3">
        <Textarea
          value={nextStep}
          onChange={(event) => setNextStep(event.target.value)}
          placeholder="Immediate next step"
          className="min-h-[96px]"
        />
      </div>
      {error ? <div className="mt-2 text-sm text-rose-300">{error}</div> : null}

      <div className="mt-6 space-y-3">
        {initiatives.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
            No active asset-management initiative is staged for this hold asset yet.
          </div>
        ) : (
          initiatives.map((initiative) => (
            <InitiativeRow key={initiative.id} portfolioAssetId={portfolioAssetId} initiative={initiative} />
          ))
        )}
      </div>
    </Card>
  );
}
