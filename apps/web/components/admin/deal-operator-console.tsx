'use client';

import { useEffect, useState } from 'react';
import { ActivityType, DealBidStatus, DealLenderQuoteStatus, DealNegotiationEventType, DealRequestStatus, DealStage, RiskSeverity, TaskPriority, TaskStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import type { DealDetailRecord, DealExecutionSnapshot } from '@/lib/services/deals';
import {
  dealBidStatusOptions,
  dealCounterpartyRoleOptions,
  dealLenderQuoteStatusOptions,
  dealNegotiationEventTypeOptions,
  dealStageOptions,
  formatDealStage,
  getDealBidStatusTone,
  getDealLenderQuoteStatusTone,
  getDealNegotiationEventTone,
  getDealStageTone,
  getRiskSeverityTone,
  getTaskStatusTone,
  riskSeverityOptions,
  taskPriorityOptions,
  taskStatusOptions
} from '@/lib/deals/config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDate, formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  deal: DealDetailRecord;
  snapshot: DealExecutionSnapshot;
};

function toDateValue(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

async function request(url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Request failed');
  }
}

export function DealOperatorConsole({ deal, snapshot }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<DealStage>(deal.stage);
  const [stageNote, setStageNote] = useState('');
  const [headline, setHeadline] = useState(deal.headline ?? '');
  const [nextAction, setNextAction] = useState(deal.nextAction ?? '');
  const [nextActionAt, setNextActionAt] = useState(toDateValue(deal.nextActionAt));
  const [targetCloseDate, setTargetCloseDate] = useState(toDateValue(deal.targetCloseDate));
  const [sellerGuidanceKrw, setSellerGuidanceKrw] = useState(deal.sellerGuidanceKrw != null ? String(deal.sellerGuidanceKrw) : '');
  const [bidGuidanceKrw, setBidGuidanceKrw] = useState(deal.bidGuidanceKrw != null ? String(deal.bidGuidanceKrw) : '');
  const [counterpartyRole, setCounterpartyRole] = useState('BROKER');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyCompany, setCounterpartyCompany] = useState('');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [counterpartyPhone, setCounterpartyPhone] = useState('');
  const [counterpartyNotes, setCounterpartyNotes] = useState('');
  const [noteRole, setNoteRole] = useState<'BROKER' | 'SELLER' | 'BUYER'>('BROKER');
  const [noteCounterpartyId, setNoteCounterpartyId] = useState('');
  const [noteTitle, setNoteTitle] = useState('Broker note');
  const [noteBody, setNoteBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>(TaskPriority.HIGH);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [requestTitle, setRequestTitle] = useState('');
  const [requestCategory, setRequestCategory] = useState('');
  const [requestCounterpartyId, setRequestCounterpartyId] = useState('');
  const [requestDocumentId, setRequestDocumentId] = useState('');
  const [requestPriority, setRequestPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [requestDueDate, setRequestDueDate] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [bidLabel, setBidLabel] = useState('');
  const [bidCounterpartyId, setBidCounterpartyId] = useState('');
  const [bidStatus, setBidStatus] = useState<DealBidStatus>(DealBidStatus.DRAFT);
  const [bidPriceKrw, setBidPriceKrw] = useState('');
  const [bidDepositKrw, setBidDepositKrw] = useState('');
  const [bidExclusivityDays, setBidExclusivityDays] = useState('');
  const [bidDiligenceDays, setBidDiligenceDays] = useState('');
  const [bidCloseTimelineDays, setBidCloseTimelineDays] = useState('');
  const [bidSubmittedAt, setBidSubmittedAt] = useState('');
  const [bidNotes, setBidNotes] = useState('');
  const [lenderCounterpartyId, setLenderCounterpartyId] = useState('');
  const [lenderFacilityLabel, setLenderFacilityLabel] = useState('');
  const [lenderStatus, setLenderStatus] = useState<DealLenderQuoteStatus>(DealLenderQuoteStatus.INDICATED);
  const [lenderAmountKrw, setLenderAmountKrw] = useState('');
  const [lenderLtvPct, setLenderLtvPct] = useState('');
  const [lenderSpreadBps, setLenderSpreadBps] = useState('');
  const [lenderAllInRatePct, setLenderAllInRatePct] = useState('');
  const [lenderDscrFloor, setLenderDscrFloor] = useState('');
  const [lenderTermMonths, setLenderTermMonths] = useState('');
  const [lenderIoMonths, setLenderIoMonths] = useState('');
  const [lenderQuotedAt, setLenderQuotedAt] = useState('');
  const [lenderNotes, setLenderNotes] = useState('');
  const [negotiationCounterpartyId, setNegotiationCounterpartyId] = useState('');
  const [negotiationBidRevisionId, setNegotiationBidRevisionId] = useState('');
  const [negotiationEventType, setNegotiationEventType] = useState<DealNegotiationEventType>(DealNegotiationEventType.SELLER_COUNTER);
  const [negotiationTitle, setNegotiationTitle] = useState('');
  const [negotiationEffectiveAt, setNegotiationEffectiveAt] = useState('');
  const [negotiationExpiresAt, setNegotiationExpiresAt] = useState('');
  const [negotiationSummary, setNegotiationSummary] = useState('');
  const [riskTitle, setRiskTitle] = useState('');
  const [riskDetail, setRiskDetail] = useState('');
  const [riskSeverity, setRiskSeverity] = useState<RiskSeverity>(RiskSeverity.HIGH);
  const [closeOutcome, setCloseOutcome] = useState<'CLOSED_WON' | 'CLOSED_LOST'>('CLOSED_WON');
  const [closeSummary, setCloseSummary] = useState(deal.closeSummary ?? '');

  useEffect(() => {
    const available = deal.counterparties.filter((counterparty) => counterparty.role === noteRole);
    setNoteTitle(`${toSentenceCase(noteRole)} note`);
    if (available.length === 0) {
      setNoteCounterpartyId('');
      return;
    }
    if (!available.some((counterparty) => counterparty.id === noteCounterpartyId)) {
      setNoteCounterpartyId(available[0].id);
    }
  }, [deal.counterparties, noteCounterpartyId, noteRole]);

  const noteCounterparties = deal.counterparties.filter((counterparty) => counterparty.role === noteRole);
  const lenderCounterparties = deal.counterparties.filter((counterparty) => counterparty.role === 'LENDER');
  const openTasks = deal.tasks.filter((task) => task.status !== TaskStatus.DONE);
  const openRequests = deal.documentRequests.filter((request) => request.status === DealRequestStatus.REQUESTED);
  const liveBidRevisions = deal.bidRevisions.filter(
    (bidRevision) => bidRevision.status !== DealBidStatus.DECLINED && bidRevision.status !== DealBidStatus.WITHDRAWN
  );
  const liveLenderQuotes = deal.lenderQuotes.filter(
    (lenderQuote) =>
      lenderQuote.status !== DealLenderQuoteStatus.DECLINED &&
      lenderQuote.status !== DealLenderQuoteStatus.WITHDRAWN
  );
  const liveNegotiationEvents = deal.negotiationEvents.filter((event) => {
    if (!event.expiresAt) return true;
    return event.expiresAt.getTime() >= Date.now();
  });
  const openRisks = deal.riskFlags.filter((risk) => !risk.isResolved);

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await work();
      router.refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Pipeline</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Stage, timing, and next move</h2>
            </div>
            <Badge tone={getDealStageTone(deal.stage)}>{formatDealStage(deal.stage)}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {snapshot.stageTrack.map((item) => (
              <div
                key={item.value}
                className={[
                  'rounded-[22px] border p-4 text-sm',
                  item.isCurrent
                    ? 'border-accent/40 bg-accent/10 text-white'
                    : item.isCompleted
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-400'
                ].join(' ')}
              >
                <div className="fine-print">{item.isCurrent ? 'Current' : item.isCompleted ? 'Done' : 'Next'}</div>
                <div className="mt-2 font-semibold">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="metric-card">
              <div className="fine-print">Open Tasks</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(snapshot.openTaskCount, 0)}</div>
            </div>
            <div className="metric-card">
              <div className="fine-print">Urgent Tasks</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(snapshot.urgentTaskCount, 0)}</div>
            </div>
            <div className="metric-card">
              <div className="fine-print">Open Risks</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(snapshot.openRiskCount, 0)}</div>
            </div>
            <div className="metric-card">
              <div className="fine-print">Target Close</div>
              <div className="mt-3 text-base font-semibold text-white">{formatDate(deal.targetCloseDate)}</div>
            </div>
          </div>

          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('stage', async () => {
                await request(`/api/deals/${deal.id}/stage`, 'PATCH', { stage, note: stageNote });
                setStageNote('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
              <label className="space-y-2">
                <span className="fine-print">Move To Stage</span>
                <Select value={stage} onChange={(event) => setStage(event.target.value as DealStage)}>
                  {dealStageOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatDealStage(value)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="fine-print">Transition Note</span>
                <Input value={stageNote} onChange={(event) => setStageNote(event.target.value)} placeholder="Why the stage changed now?" />
              </label>
              <div className="flex items-end">
                <Button type="submit" disabled={busy === 'stage'}>
                  {busy === 'stage' ? 'Updating...' : 'Update Stage'}
                </Button>
              </div>
            </div>
          </form>

          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('control', async () => {
                await request(`/api/deals/${deal.id}`, 'PATCH', {
                  headline,
                  nextAction,
                  nextActionAt: nextActionAt || null,
                  targetCloseDate: targetCloseDate || null,
                  sellerGuidanceKrw: sellerGuidanceKrw === '' ? null : Number(sellerGuidanceKrw),
                  bidGuidanceKrw: bidGuidanceKrw === '' ? null : Number(bidGuidanceKrw)
                });
              });
            }}
          >
            <label className="space-y-2">
              <span className="fine-print">Headline</span>
              <Input value={headline} onChange={(event) => setHeadline(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="fine-print">Next Action</span>
              <Textarea className="min-h-[110px]" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
            </label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="fine-print">Next Action Date</span>
                <Input type="date" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Target Close</span>
                <Input type="date" value={targetCloseDate} onChange={(event) => setTargetCloseDate(event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Seller Guidance</span>
                <Input type="number" step="any" value={sellerGuidanceKrw} onChange={(event) => setSellerGuidanceKrw(event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="fine-print">Bid Guidance</span>
                <Input type="number" step="any" value={bidGuidanceKrw} onChange={(event) => setBidGuidanceKrw(event.target.value)} />
              </label>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-slate-400">
                {snapshot.nextTask ? `Next queued task: ${snapshot.nextTask.title}` : 'No task queued yet.'}
              </div>
              <Button type="submit" disabled={busy === 'control'}>
                {busy === 'control' ? 'Saving...' : 'Save Deal Control'}
              </Button>
            </div>
          </form>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="fine-print">Required Checklist</div>
                <div className="mt-2 text-base font-semibold text-white">What must be true in this stage</div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy === 'seed-checklist'}
                onClick={() => {
                  void run('seed-checklist', async () => {
                    await request(`/api/deals/${deal.id}/checklist/seed`, 'POST', {});
                  });
                }}
              >
                {busy === 'seed-checklist' ? 'Seeding...' : 'Seed Required Tasks'}
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {snapshot.stageChecklist.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{item.description}</p>
                  </div>
                  <Badge
                    tone={
                      item.status === 'done' ? 'good' : item.status === 'open' ? 'warn' : 'neutral'
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Tasks</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Operator checklist</h2>
            </div>
            <Badge tone={snapshot.urgentTaskCount > 0 ? 'warn' : 'neutral'}>{snapshot.urgentTaskCount > 0 ? `${snapshot.urgentTaskCount} urgent` : 'in flight'}</Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('task-create', async () => {
                await request(`/api/deals/${deal.id}/tasks`, 'POST', {
                  title: taskTitle,
                  description: taskDescription,
                  priority: taskPriority,
                  dueDate: taskDueDate || null,
                  ownerLabel: 'solo_operator'
                });
                setTaskTitle('');
                setTaskDescription('');
                setTaskDueDate('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task" />
              <Select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}>
                {taskPriorityOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
              <Input value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="What exactly needs to happen?" />
              <Input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              <Button type="submit" disabled={busy === 'task-create'}>
                {busy === 'task-create' ? 'Adding...' : 'Add Task'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.tasks.map((task) => (
              <div key={task.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{task.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{task.description ?? 'No detail yet.'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone={getTaskStatusTone(task.status)}>{toSentenceCase(task.status)}</Badge>
                    <Badge tone={task.priority === TaskPriority.URGENT || task.priority === TaskPriority.HIGH ? 'warn' : 'neutral'}>
                      {toSentenceCase(task.priority)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-slate-400">{task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}</div>
                  <div className="flex flex-wrap gap-2">
                    {taskStatusOptions.filter((value) => value !== task.status).map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant="secondary"
                        disabled={busy === task.id}
                        onClick={() => {
                          void run(task.id, async () => {
                            await request(`/api/deals/${deal.id}/tasks/${task.id}`, 'PATCH', { status: value });
                          });
                        }}
                      >
                        {toSentenceCase(value)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">DD Requests</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Requested diligence materials</h2>
            </div>
            <Badge tone={openRequests.length > 0 ? 'warn' : 'good'}>
              {openRequests.length > 0 ? `${openRequests.length} open` : 'current'}
            </Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('request-create', async () => {
                await request(`/api/deals/${deal.id}/document-requests`, 'POST', {
                  title: requestTitle,
                  category: requestCategory || null,
                  counterpartyId: requestCounterpartyId || null,
                  documentId: requestDocumentId || null,
                  priority: requestPriority,
                  dueDate: requestDueDate || null,
                  notes: requestNotes || null
                });
                setRequestTitle('');
                setRequestCategory('');
                setRequestCounterpartyId('');
                setRequestDocumentId('');
                setRequestDueDate('');
                setRequestNotes('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <Input value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} placeholder="Requested item" />
              <Input value={requestCategory} onChange={(event) => setRequestCategory(event.target.value)} placeholder="Category (leases, title, utility, etc.)" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Select value={requestCounterpartyId} onChange={(event) => setRequestCounterpartyId(event.target.value)}>
                <option value="">Select counterparty</option>
                {deal.counterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name} / {counterparty.role}
                  </option>
                ))}
              </Select>
              <Select value={requestDocumentId} onChange={(event) => setRequestDocumentId(event.target.value)}>
                <option value="">Link received document later</option>
                {(deal.asset?.documents ?? []).map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title}
                  </option>
                ))}
              </Select>
              <Select value={requestPriority} onChange={(event) => setRequestPriority(event.target.value as TaskPriority)}>
                {taskPriorityOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
              <Input type="date" value={requestDueDate} onChange={(event) => setRequestDueDate(event.target.value)} />
            </div>
            <Textarea className="min-h-[90px]" value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} placeholder="Why this item matters, who owes it, and how it will be used." />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === 'request-create'}>
                {busy === 'request-create' ? 'Logging...' : 'Add DD Request'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.documentRequests.map((requestItem) => (
              <div key={requestItem.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{requestItem.title}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {requestItem.category ?? 'General DD'}{requestItem.counterparty ? ` / ${requestItem.counterparty.name}` : ''}
                    </div>
                    {requestItem.notes ? <p className="mt-3 text-sm leading-7 text-slate-400">{requestItem.notes}</p> : null}
                    <div className="mt-3 text-sm text-slate-500">
                      Requested {formatDate(requestItem.requestedAt)} / Due {formatDate(requestItem.dueDate)} / Received {formatDate(requestItem.receivedAt)}
                    </div>
                    {requestItem.document ? (
                      <div className="mt-2 text-sm text-slate-300">Linked document: {requestItem.document.title}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={requestItem.status === DealRequestStatus.RECEIVED ? 'good' : requestItem.status === DealRequestStatus.WAIVED ? 'neutral' : 'warn'}>
                      {toSentenceCase(requestItem.status)}
                    </Badge>
                    <Badge tone={requestItem.priority === TaskPriority.URGENT || requestItem.priority === TaskPriority.HIGH ? 'warn' : 'neutral'}>
                      {toSentenceCase(requestItem.priority)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {requestItem.status !== DealRequestStatus.RECEIVED ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy === requestItem.id}
                      onClick={() => {
                        void run(requestItem.id, async () => {
                          await request(`/api/deals/${deal.id}/document-requests/${requestItem.id}`, 'PATCH', {
                            status: 'RECEIVED',
                            receivedAt: new Date().toISOString(),
                            documentId: (requestItem.documentId ?? requestDocumentId) || null
                          });
                        });
                      }}
                    >
                      Mark Received
                    </Button>
                  ) : null}
                  {requestItem.status !== DealRequestStatus.WAIVED ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy === `${requestItem.id}-waive`}
                      onClick={() => {
                        void run(`${requestItem.id}-waive`, async () => {
                          await request(`/api/deals/${deal.id}/document-requests/${requestItem.id}`, 'PATCH', {
                            status: 'WAIVED'
                          });
                        });
                      }}
                    >
                      Waive
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Risk Flags</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Closing blockers</h2>
            </div>
            <Badge tone={openRisks.length > 0 ? 'warn' : 'good'}>{openRisks.length > 0 ? `${openRisks.length} open` : 'clear'}</Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('risk-create', async () => {
                await request(`/api/deals/${deal.id}/risk-flags`, 'POST', {
                  title: riskTitle,
                  detail: riskDetail,
                  severity: riskSeverity
                });
                setRiskTitle('');
                setRiskDetail('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <Input value={riskTitle} onChange={(event) => setRiskTitle(event.target.value)} placeholder="Risk title" />
              <Select value={riskSeverity} onChange={(event) => setRiskSeverity(event.target.value as RiskSeverity)}>
                {riskSeverityOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea className="min-h-[100px]" value={riskDetail} onChange={(event) => setRiskDetail(event.target.value)} placeholder="What blocks signing or closing?" />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === 'risk-create'}>
                {busy === 'risk-create' ? 'Adding...' : 'Raise Risk'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.riskFlags.map((risk) => (
              <div key={risk.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{risk.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{risk.detail ?? 'No detail yet.'}</p>
                  </div>
                  <Badge tone={getRiskSeverityTone(risk.severity, risk.isResolved)}>
                    {risk.isResolved ? 'Resolved' : toSentenceCase(risk.severity)}
                  </Badge>
                </div>
                {!risk.isResolved ? (
                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy === risk.id}
                      onClick={() => {
                        void run(risk.id, async () => {
                          await request(`/api/deals/${deal.id}/risk-flags/${risk.id}`, 'PATCH', {
                            isResolved: true,
                            statusLabel: 'RESOLVED'
                          });
                        });
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Bid Revisions</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Negotiation history</h2>
            </div>
            <Badge tone={liveBidRevisions.length > 0 ? 'warn' : 'neutral'}>
              {deal.bidRevisions.length > 0 ? `${deal.bidRevisions.length} logged` : 'empty'}
            </Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('bid-create', async () => {
                await request(`/api/deals/${deal.id}/bids`, 'POST', {
                  label: bidLabel,
                  counterpartyId: bidCounterpartyId || null,
                  status: bidStatus,
                  bidPriceKrw: Number(bidPriceKrw),
                  depositKrw: bidDepositKrw === '' ? null : Number(bidDepositKrw),
                  exclusivityDays: bidExclusivityDays === '' ? null : Number(bidExclusivityDays),
                  diligenceDays: bidDiligenceDays === '' ? null : Number(bidDiligenceDays),
                  closeTimelineDays: bidCloseTimelineDays === '' ? null : Number(bidCloseTimelineDays),
                  submittedAt: bidSubmittedAt || null,
                  notes: bidNotes || null
                });
                setBidLabel('');
                setBidCounterpartyId('');
                setBidStatus(DealBidStatus.DRAFT);
                setBidPriceKrw('');
                setBidDepositKrw('');
                setBidExclusivityDays('');
                setBidDiligenceDays('');
                setBidCloseTimelineDays('');
                setBidSubmittedAt('');
                setBidNotes('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_220px_220px]">
              <Input value={bidLabel} onChange={(event) => setBidLabel(event.target.value)} placeholder="Label (Initial IOI, Revised LOI, BAFO...)" />
              <Select value={bidCounterpartyId} onChange={(event) => setBidCounterpartyId(event.target.value)}>
                <option value="">Recipient / seller-side contact</option>
                {deal.counterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name} / {counterparty.role}
                  </option>
                ))}
              </Select>
              <Select value={bidStatus} onChange={(event) => setBidStatus(event.target.value as DealBidStatus)}>
                {dealBidStatusOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Input type="number" step="any" value={bidPriceKrw} onChange={(event) => setBidPriceKrw(event.target.value)} placeholder="Bid price KRW" />
              <Input type="number" step="any" value={bidDepositKrw} onChange={(event) => setBidDepositKrw(event.target.value)} placeholder="Deposit KRW" />
              <Input type="number" value={bidExclusivityDays} onChange={(event) => setBidExclusivityDays(event.target.value)} placeholder="Exclusivity days" />
              <Input type="number" value={bidDiligenceDays} onChange={(event) => setBidDiligenceDays(event.target.value)} placeholder="DD days" />
              <Input type="number" value={bidCloseTimelineDays} onChange={(event) => setBidCloseTimelineDays(event.target.value)} placeholder="Close days" />
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <Input type="date" value={bidSubmittedAt} onChange={(event) => setBidSubmittedAt(event.target.value)} />
              <Textarea className="min-h-[90px]" value={bidNotes} onChange={(event) => setBidNotes(event.target.value)} placeholder="Commercial changes, certainty points, seller feedback, or BAFO context." />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === 'bid-create' || bidLabel.trim() === '' || bidPriceKrw.trim() === ''}>
                {busy === 'bid-create' ? 'Logging...' : 'Log Bid Revision'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.bidRevisions.map((bidRevision) => (
              <div key={bidRevision.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{bidRevision.label}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {bidRevision.counterparty ? `${bidRevision.counterparty.name} / ` : ''}
                      Submitted {formatDate(bidRevision.submittedAt)}
                    </div>
                    <div className="mt-3 text-sm text-slate-300">
                      {formatCurrency(bidRevision.bidPriceKrw)}
                      {bidRevision.depositKrw ? ` / deposit ${formatCurrency(bidRevision.depositKrw)}` : ''}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {bidRevision.exclusivityDays ? `${bidRevision.exclusivityDays}d exclusivity` : 'No exclusivity term'}
                      {' / '}
                      {bidRevision.diligenceDays ? `${bidRevision.diligenceDays}d DD` : 'No DD clock'}
                      {' / '}
                      {bidRevision.closeTimelineDays ? `${bidRevision.closeTimelineDays}d close` : 'No close timeline'}
                    </div>
                    {bidRevision.notes ? <p className="mt-3 text-sm leading-7 text-slate-400">{bidRevision.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={getDealBidStatusTone(bidRevision.status)}>{toSentenceCase(bidRevision.status)}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {dealBidStatusOptions.filter((value) => value !== bidRevision.status).map((value) => (
                    <Button
                      key={`${bidRevision.id}-${value}`}
                      type="button"
                      variant="secondary"
                      disabled={busy === `${bidRevision.id}-${value}`}
                      onClick={() => {
                        void run(`${bidRevision.id}-${value}`, async () => {
                          await request(`/api/deals/${deal.id}/bids/${bidRevision.id}`, 'PATCH', {
                            status: value
                          });
                        });
                      }}
                    >
                      {toSentenceCase(value)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Lender Quotes</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Financing process</h2>
            </div>
            <Badge tone={liveLenderQuotes.length > 0 ? 'warn' : 'neutral'}>
              {deal.lenderQuotes.length > 0 ? `${deal.lenderQuotes.length} tracked` : 'empty'}
            </Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('lender-create', async () => {
                await request(`/api/deals/${deal.id}/lender-quotes`, 'POST', {
                  counterpartyId: lenderCounterpartyId || null,
                  facilityLabel: lenderFacilityLabel,
                  status: lenderStatus,
                  amountKrw: Number(lenderAmountKrw),
                  ltvPct: lenderLtvPct === '' ? null : Number(lenderLtvPct),
                  spreadBps: lenderSpreadBps === '' ? null : Number(lenderSpreadBps),
                  allInRatePct: lenderAllInRatePct === '' ? null : Number(lenderAllInRatePct),
                  dscrFloor: lenderDscrFloor === '' ? null : Number(lenderDscrFloor),
                  termMonths: lenderTermMonths === '' ? null : Number(lenderTermMonths),
                  ioMonths: lenderIoMonths === '' ? null : Number(lenderIoMonths),
                  quotedAt: lenderQuotedAt || null,
                  notes: lenderNotes || null
                });
                setLenderCounterpartyId('');
                setLenderFacilityLabel('');
                setLenderStatus(DealLenderQuoteStatus.INDICATED);
                setLenderAmountKrw('');
                setLenderLtvPct('');
                setLenderSpreadBps('');
                setLenderAllInRatePct('');
                setLenderDscrFloor('');
                setLenderTermMonths('');
                setLenderIoMonths('');
                setLenderQuotedAt('');
                setLenderNotes('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_220px_220px]">
              <Input value={lenderFacilityLabel} onChange={(event) => setLenderFacilityLabel(event.target.value)} placeholder="Facility label (Senior term loan, bridge, etc.)" />
              <Select value={lenderCounterpartyId} onChange={(event) => setLenderCounterpartyId(event.target.value)}>
                <option value="">{lenderCounterparties.length === 0 ? 'Add lender counterparty first' : 'Select lender'}</option>
                {lenderCounterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name}
                  </option>
                ))}
              </Select>
              <Select value={lenderStatus} onChange={(event) => setLenderStatus(event.target.value as DealLenderQuoteStatus)}>
                {dealLenderQuoteStatusOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Input type="number" step="any" value={lenderAmountKrw} onChange={(event) => setLenderAmountKrw(event.target.value)} placeholder="Amount KRW" />
              <Input type="number" step="any" value={lenderLtvPct} onChange={(event) => setLenderLtvPct(event.target.value)} placeholder="LTV %" />
              <Input type="number" step="any" value={lenderSpreadBps} onChange={(event) => setLenderSpreadBps(event.target.value)} placeholder="Spread bps" />
              <Input type="number" step="any" value={lenderAllInRatePct} onChange={(event) => setLenderAllInRatePct(event.target.value)} placeholder="All-in rate %" />
              <Input type="number" step="any" value={lenderDscrFloor} onChange={(event) => setLenderDscrFloor(event.target.value)} placeholder="DSCR floor" />
            </div>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <Input type="number" value={lenderTermMonths} onChange={(event) => setLenderTermMonths(event.target.value)} placeholder="Term months" />
              <Input type="number" value={lenderIoMonths} onChange={(event) => setLenderIoMonths(event.target.value)} placeholder="IO months" />
              <Input type="date" value={lenderQuotedAt} onChange={(event) => setLenderQuotedAt(event.target.value)} />
            </div>
            <Textarea className="min-h-[90px]" value={lenderNotes} onChange={(event) => setLenderNotes(event.target.value)} placeholder="Term sheet notes, hold points, conditions, covenant comments, or process blockers." />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={busy === 'lender-create' || lenderFacilityLabel.trim() === '' || lenderAmountKrw.trim() === ''}
              >
                {busy === 'lender-create' ? 'Logging...' : 'Log Lender Quote'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.lenderQuotes.map((lenderQuote) => (
              <div key={lenderQuote.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{lenderQuote.facilityLabel}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {lenderQuote.counterparty ? `${lenderQuote.counterparty.name} / ` : ''}
                      Quoted {formatDate(lenderQuote.quotedAt)}
                    </div>
                    <div className="mt-3 text-sm text-slate-300">
                      {formatCurrency(lenderQuote.amountKrw)}
                      {lenderQuote.ltvPct != null ? ` / ${formatNumber(lenderQuote.ltvPct, 1)}% LTV` : ''}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {lenderQuote.spreadBps != null ? `${formatNumber(lenderQuote.spreadBps, 0)} bps spread` : 'No spread'}
                      {' / '}
                      {lenderQuote.allInRatePct != null ? `${formatNumber(lenderQuote.allInRatePct, 2)}% all-in` : 'No all-in rate'}
                      {' / '}
                      {lenderQuote.dscrFloor != null ? `${formatNumber(lenderQuote.dscrFloor, 2)}x DSCR floor` : 'No DSCR floor'}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {lenderQuote.termMonths != null ? `${formatNumber(lenderQuote.termMonths, 0)}m term` : 'No term'}
                      {' / '}
                      {lenderQuote.ioMonths != null ? `${formatNumber(lenderQuote.ioMonths, 0)}m IO` : 'No IO period'}
                    </div>
                    {lenderQuote.notes ? <p className="mt-3 text-sm leading-7 text-slate-400">{lenderQuote.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={getDealLenderQuoteStatusTone(lenderQuote.status)}>{toSentenceCase(lenderQuote.status)}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {dealLenderQuoteStatusOptions.filter((value) => value !== lenderQuote.status).map((value) => (
                    <Button
                      key={`${lenderQuote.id}-${value}`}
                      type="button"
                      variant="secondary"
                      disabled={busy === `${lenderQuote.id}-${value}`}
                      onClick={() => {
                        void run(`${lenderQuote.id}-${value}`, async () => {
                          await request(`/api/deals/${deal.id}/lender-quotes/${lenderQuote.id}`, 'PATCH', {
                            status: value
                          });
                        });
                      }}
                    >
                      {toSentenceCase(value)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Negotiation Events</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Seller counters and exclusivity clock</h2>
            </div>
            <Badge tone={liveNegotiationEvents.length > 0 ? 'warn' : 'neutral'}>
              {deal.negotiationEvents.length > 0 ? `${deal.negotiationEvents.length} tracked` : 'empty'}
            </Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('negotiation-create', async () => {
                await request(`/api/deals/${deal.id}/negotiation-events`, 'POST', {
                  counterpartyId: negotiationCounterpartyId || null,
                  bidRevisionId: negotiationBidRevisionId || null,
                  eventType: negotiationEventType,
                  title: negotiationTitle,
                  effectiveAt: negotiationEffectiveAt || null,
                  expiresAt: negotiationExpiresAt || null,
                  summary: negotiationSummary || null
                });
                setNegotiationCounterpartyId('');
                setNegotiationBidRevisionId('');
                setNegotiationEventType(DealNegotiationEventType.SELLER_COUNTER);
                setNegotiationTitle('');
                setNegotiationEffectiveAt('');
                setNegotiationExpiresAt('');
                setNegotiationSummary('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
              <Select value={negotiationEventType} onChange={(event) => setNegotiationEventType(event.target.value as DealNegotiationEventType)}>
                {dealNegotiationEventTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
              <Select value={negotiationCounterpartyId} onChange={(event) => setNegotiationCounterpartyId(event.target.value)}>
                <option value="">Select counterparty</option>
                {deal.counterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name} / {counterparty.role}
                  </option>
                ))}
              </Select>
              <Input value={negotiationTitle} onChange={(event) => setNegotiationTitle(event.target.value)} placeholder="Title (Seller countered on price, exclusivity granted, etc.)" />
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
              <Input type="date" value={negotiationEffectiveAt} onChange={(event) => setNegotiationEffectiveAt(event.target.value)} />
              <Input type="date" value={negotiationExpiresAt} onChange={(event) => setNegotiationExpiresAt(event.target.value)} />
              <Select value={negotiationBidRevisionId} onChange={(event) => setNegotiationBidRevisionId(event.target.value)}>
                <option value="">Link bid revision optionally</option>
                {deal.bidRevisions.map((bidRevision) => (
                  <option key={bidRevision.id} value={bidRevision.id}>
                    {bidRevision.label}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea className="min-h-[90px]" value={negotiationSummary} onChange={(event) => setNegotiationSummary(event.target.value)} placeholder="What changed in the process, how the seller reacted, what feedback came back, and when the exclusivity clock ends." />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === 'negotiation-create' || negotiationTitle.trim() === ''}>
                {busy === 'negotiation-create' ? 'Logging...' : 'Log Negotiation Event'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.negotiationEvents.map((event) => (
              <div key={event.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{event.title}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {event.counterparty ? `${event.counterparty.name} / ` : ''}
                      Effective {formatDate(event.effectiveAt)}
                      {event.expiresAt ? ` / Expires ${formatDate(event.expiresAt)}` : ''}
                    </div>
                    {event.bidRevision ? (
                      <div className="mt-2 text-sm text-slate-500">Linked bid: {event.bidRevision.label}</div>
                    ) : null}
                    {event.summary ? <p className="mt-3 text-sm leading-7 text-slate-400">{event.summary}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={getDealNegotiationEventTone(event.eventType)}>{toSentenceCase(event.eventType)}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {(event.eventType === DealNegotiationEventType.EXCLUSIVITY_GRANTED ||
                    event.eventType === DealNegotiationEventType.EXCLUSIVITY_EXTENDED) &&
                  event.expiresAt ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy === `${event.id}-extend`}
                      onClick={() => {
                        const currentExpiry = event.expiresAt;
                        if (!currentExpiry) return;
                        const nextExpiry = new Date(currentExpiry);
                        nextExpiry.setDate(nextExpiry.getDate() + 7);
                        void run(`${event.id}-extend`, async () => {
                          await request(`/api/deals/${deal.id}/negotiation-events/${event.id}`, 'PATCH', {
                            eventType: 'EXCLUSIVITY_EXTENDED',
                            expiresAt: nextExpiry.toISOString()
                          });
                        });
                      }}
                    >
                      Extend +7d
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {error ? <div className="rounded-[24px] border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Counterparties</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Contacts on the process</h2>
            </div>
            <Badge tone={deal.counterparties.length > 0 ? 'good' : 'neutral'}>{deal.counterparties.length} tracked</Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('counterparty-create', async () => {
                await request(`/api/deals/${deal.id}/counterparties`, 'POST', {
                  name: counterpartyName,
                  role: counterpartyRole,
                  company: counterpartyCompany || null,
                  email: counterpartyEmail || null,
                  phone: counterpartyPhone || null,
                  notes: counterpartyNotes || null
                });
                setCounterpartyName('');
                setCounterpartyCompany('');
                setCounterpartyEmail('');
                setCounterpartyPhone('');
                setCounterpartyNotes('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input value={counterpartyName} onChange={(event) => setCounterpartyName(event.target.value)} placeholder="Name" />
              <Select value={counterpartyRole} onChange={(event) => setCounterpartyRole(event.target.value)}>
                {dealCounterpartyRoleOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
              <Input value={counterpartyCompany} onChange={(event) => setCounterpartyCompany(event.target.value)} placeholder="Company" />
              <Input value={counterpartyEmail} onChange={(event) => setCounterpartyEmail(event.target.value)} placeholder="Email" />
              <Input value={counterpartyPhone} onChange={(event) => setCounterpartyPhone(event.target.value)} placeholder="Phone" />
              <Input value={counterpartyNotes} onChange={(event) => setCounterpartyNotes(event.target.value)} placeholder="Internal notes" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === 'counterparty-create'}>
                {busy === 'counterparty-create' ? 'Adding...' : 'Add Counterparty'}
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {deal.counterparties.map((counterparty) => (
              <div key={counterparty.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{counterparty.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{counterparty.role} {counterparty.company ? `/ ${counterparty.company}` : ''}</div>
                  </div>
                  <div className="text-right text-sm text-slate-400">
                    <div>{counterparty.email ?? 'No email'}</div>
                    <div className="mt-1">{counterparty.phone ?? 'No phone'}</div>
                  </div>
                </div>
                {counterparty.notes ? <p className="mt-3 text-sm leading-7 text-slate-400">{counterparty.notes}</p> : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Notes</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Broker / seller / buyer notes</h2>
            </div>
            <Badge tone={snapshot.notesByRole.reduce((count, item) => count + item.notes.length, 0) > 0 ? 'good' : 'neutral'}>
              {snapshot.notesByRole.reduce((count, item) => count + item.notes.length, 0)} notes
            </Badge>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteCounterpartyId) {
                setError(`Add a ${toSentenceCase(noteRole)} counterparty first.`);
                return;
              }
              void run('note-create', async () => {
                await request(`/api/deals/${deal.id}/activity`, 'POST', {
                  activityType: ActivityType.NOTE,
                  title: noteTitle,
                  body: noteBody,
                  counterpartyId: noteCounterpartyId
                });
                setNoteBody('');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[170px_1fr_1fr]">
              <Select value={noteRole} onChange={(event) => setNoteRole(event.target.value as 'BROKER' | 'SELLER' | 'BUYER')}>
                {(['BROKER', 'SELLER', 'BUYER'] as const).map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
              <Select value={noteCounterpartyId} onChange={(event) => setNoteCounterpartyId(event.target.value)} disabled={noteCounterparties.length === 0}>
                <option value="">{noteCounterparties.length === 0 ? 'Add counterparty first' : 'Select counterparty'}</option>
                {noteCounterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name}
                  </option>
                ))}
              </Select>
              <Input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} />
            </div>
            <Textarea className="min-h-[110px]" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="What did they say and why does it matter?" />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === 'note-create' || noteCounterparties.length === 0}>
                {busy === 'note-create' ? 'Saving...' : 'Log Note'}
              </Button>
            </div>
          </form>
          <div className="space-y-4">
            {snapshot.notesByRole.map((group) => (
              <div key={group.role} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-lg font-semibold text-white">{toSentenceCase(group.role)}</div>
                  <Badge>{group.notes.length}</Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {group.notes.length > 0 ? (
                    group.notes.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">{entry.title}</div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(entry.createdAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-slate-400">{entry.counterparty?.name ?? 'Unknown counterparty'}</div>
                        <p className="mt-3 text-sm leading-7 text-slate-300">{entry.body ?? 'No body.'}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">No notes for this role yet.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="eyebrow">Activity</div>
          <h2 className="text-2xl font-semibold text-white">Recent log</h2>
          <div className="space-y-3">
            {deal.activityLogs.map((activity) => (
              <div key={activity.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{activity.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {toSentenceCase(activity.activityType)} / {formatDate(activity.createdAt)}
                    </div>
                  </div>
                  {activity.counterparty ? <Badge>{activity.counterparty.role}</Badge> : null}
                </div>
                {activity.body ? <p className="mt-3 text-sm leading-7 text-slate-300">{activity.body}</p> : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="eyebrow">Pricing Frame</div>
          <h2 className="text-2xl font-semibold text-white">Commercial guardrails</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="metric-card">
              <div className="fine-print">Seller Guidance</div>
              <div className="mt-3 text-base font-semibold text-white">{formatCurrency(deal.sellerGuidanceKrw)}</div>
            </div>
            <div className="metric-card">
              <div className="fine-print">Bid Guidance</div>
              <div className="mt-3 text-base font-semibold text-white">{formatCurrency(deal.bidGuidanceKrw)}</div>
            </div>
            <div className="metric-card">
              <div className="fine-print">Target Purchase</div>
              <div className="mt-3 text-base font-semibold text-white">{formatCurrency(deal.purchasePriceKrw)}</div>
            </div>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="eyebrow">Archive / Close-out</div>
          <h2 className="text-2xl font-semibold text-white">End the process cleanly</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Current Status</div>
              <div className="mt-3 text-base font-semibold text-white">{deal.statusLabel}</div>
              <div className="mt-2 text-sm text-slate-400">
                Archived {formatDate(deal.archivedAt)} / Closed {formatDate(deal.closedAt)}
              </div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Close Summary</div>
              <div className="mt-3 text-sm leading-7 text-slate-300">{deal.closeSummary ?? 'No close-out summary yet.'}</div>
            </div>
          </div>
          <form
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run('close-out', async () => {
                await request(`/api/deals/${deal.id}/close-out`, 'POST', {
                  outcome: closeOutcome,
                  summary: closeSummary
                });
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <Select value={closeOutcome} onChange={(event) => setCloseOutcome(event.target.value as 'CLOSED_WON' | 'CLOSED_LOST')}>
                <option value="CLOSED_WON">Closed Won</option>
                <option value="CLOSED_LOST">Closed Lost</option>
              </Select>
              <Textarea className="min-h-[100px]" value={closeSummary} onChange={(event) => setCloseSummary(event.target.value)} placeholder="Write the final outcome, economics, and what matters for handoff or post-mortem." />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Button type="button" variant="secondary" disabled={busy === 'archive'} onClick={() => {
                void run('archive', async () => {
                  await request(`/api/deals/${deal.id}/archive`, 'POST', {
                    summary: closeSummary || 'Archived for now.'
                  });
                });
              }}>
                {busy === 'archive' ? 'Archiving...' : 'Archive Deal'}
              </Button>
              <div className="flex flex-wrap gap-2">
                {(deal.statusLabel === 'ARCHIVED' || deal.archivedAt || deal.statusLabel === 'CLOSED_LOST') ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy === 'restore'}
                    onClick={() => {
                      void run('restore', async () => {
                        await request(`/api/deals/${deal.id}/restore`, 'POST', {
                          summary: closeSummary || 'Reopened from archive.'
                        });
                      });
                    }}
                  >
                    {busy === 'restore' ? 'Restoring...' : 'Restore Deal'}
                  </Button>
                ) : null}
                <Button type="submit" disabled={busy === 'close-out'}>
                  {busy === 'close-out' ? 'Closing Out...' : 'Save Close-out'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
