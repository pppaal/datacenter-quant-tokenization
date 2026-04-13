'use client';

import { DealDiligenceWorkstreamStatus, DealDiligenceWorkstreamType, DocumentType } from '@prisma/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, toSentenceCase } from '@/lib/utils';

type Workstream = {
  id: string;
  workstreamType: DealDiligenceWorkstreamType;
  status: DealDiligenceWorkstreamStatus;
  ownerLabel: string | null;
  advisorName: string | null;
  reportTitle: string | null;
  requestedAt: Date | null;
  dueDate: Date | null;
  signedOffAt: Date | null;
  signedOffByLabel: string | null;
  summary: string | null;
  blockerSummary: string | null;
  notes: string | null;
  deliverables: Array<{
    id: string;
    note: string | null;
    document: {
      id: string;
      title: string;
      documentType: string;
      currentVersion: number;
      documentHash: string;
      updatedAt: Date;
    };
  }>;
};

type Props = {
  dealId: string;
  stageLabel: string;
  workstreams: Workstream[];
  availableDocuments: Array<{
    id: string;
    title: string;
    documentType: string;
    currentVersion: number;
    documentHash: string;
  }>;
};

const workstreamTypeOptions = Object.values(DealDiligenceWorkstreamType);
const workstreamStatusOptions = Object.values(DealDiligenceWorkstreamStatus);
const documentTypeOptions = Object.values(DocumentType);

function getStatusTone(status: DealDiligenceWorkstreamStatus) {
  switch (status) {
    case DealDiligenceWorkstreamStatus.SIGNED_OFF:
      return 'good';
    case DealDiligenceWorkstreamStatus.READY_FOR_SIGNOFF:
      return 'warn';
    case DealDiligenceWorkstreamStatus.BLOCKED:
      return 'danger';
    default:
      return 'neutral';
  }
}

function toDateValue(value?: Date | null) {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

async function send(url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) {
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

export function DealDiligenceWorkstreamPanel({ dealId, stageLabel, workstreams, availableDocuments }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newType, setNewType] = useState<DealDiligenceWorkstreamType>(DealDiligenceWorkstreamType.LEGAL);
  const [newStatus, setNewStatus] = useState<DealDiligenceWorkstreamStatus>(DealDiligenceWorkstreamStatus.IN_PROGRESS);
  const [newOwner, setNewOwner] = useState('');
  const [newAdvisor, setNewAdvisor] = useState('');
  const [newReportTitle, setNewReportTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newBlocker, setNewBlocker] = useState('');
  const [newNotes, setNewNotes] = useState('');

  async function run(key: string, work: () => Promise<void>, successMessage: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(successMessage);
      setTimeout(() => setNotice(null), 4000);
      router.refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Due Diligence</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Specialist workstreams and sign-off</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Track legal, technical, environmental, tax, insurance, leasing, and financing workstreams as explicit
            diligence lanes. This keeps specialist sign-off tied to the same deal record before committee and closing.
          </p>
        </div>
        <Badge tone="neutral">{stageLabel}</Badge>
      </div>

      {notice ? (
        <div className="rounded-[20px] border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-[20px] border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      ) : null}

      <form
        className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            'create-workstream',
            async () => {
              await send(`/api/deals/${dealId}/diligence-workstreams`, 'POST', {
                workstreamType: newType,
                status: newStatus,
                ownerLabel: newOwner || null,
                advisorName: newAdvisor || null,
                reportTitle: newReportTitle || null,
                dueDate: newDueDate || null,
                summary: newSummary || null,
                blockerSummary: newBlocker || null,
                notes: newNotes || null
              });
              setNewOwner('');
              setNewAdvisor('');
              setNewReportTitle('');
              setNewDueDate('');
              setNewSummary('');
              setNewBlocker('');
              setNewNotes('');
            },
            'Diligence workstream saved.'
          );
        }}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select value={newType} onChange={(event) => setNewType(event.target.value as DealDiligenceWorkstreamType)}>
            {workstreamTypeOptions.map((value) => (
              <option key={value} value={value}>
                {toSentenceCase(value)}
              </option>
            ))}
          </Select>
          <Select value={newStatus} onChange={(event) => setNewStatus(event.target.value as DealDiligenceWorkstreamStatus)}>
            {workstreamStatusOptions.map((value) => (
              <option key={value} value={value}>
                {toSentenceCase(value)}
              </option>
            ))}
          </Select>
          <Input value={newOwner} onChange={(event) => setNewOwner(event.target.value)} placeholder="Internal owner" />
          <Input value={newAdvisor} onChange={(event) => setNewAdvisor(event.target.value)} placeholder="External advisor" />
          <Input value={newReportTitle} onChange={(event) => setNewReportTitle(event.target.value)} placeholder="Report or memo title" />
          <Input type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} />
        </div>
        <Textarea className="min-h-[88px]" value={newSummary} onChange={(event) => setNewSummary(event.target.value)} placeholder="Current diligence scope and status" />
        <Textarea className="min-h-[88px]" value={newBlocker} onChange={(event) => setNewBlocker(event.target.value)} placeholder="Current blocker, if any" />
        <Textarea className="min-h-[88px]" value={newNotes} onChange={(event) => setNewNotes(event.target.value)} placeholder="Internal notes or specialist comments" />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy === 'create-workstream'}>
            {busy === 'create-workstream' ? 'Saving...' : 'Open / Update Workstream'}
          </Button>
        </div>
      </form>

      <div className="grid gap-4">
        {workstreams.map((workstream) => (
          <form
            key={workstream.id}
            className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            data-testid="diligence-workstream-card"
            data-workstream-id={workstream.id}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              void run(
                `workstream-${workstream.id}`,
                async () => {
                  await send(`/api/deals/${dealId}/diligence-workstreams/${workstream.id}`, 'PATCH', {
                    status: String(formData.get('status') ?? ''),
                    ownerLabel: String(formData.get('ownerLabel') ?? '') || null,
                    advisorName: String(formData.get('advisorName') ?? '') || null,
                    reportTitle: String(formData.get('reportTitle') ?? '') || null,
                    dueDate: String(formData.get('dueDate') ?? '') || null,
                    signedOffByLabel: String(formData.get('signedOffByLabel') ?? '') || null,
                    summary: String(formData.get('summary') ?? '') || null,
                    blockerSummary: String(formData.get('blockerSummary') ?? '') || null,
                    notes: String(formData.get('notes') ?? '') || null
                  });
                },
                `${toSentenceCase(workstream.workstreamType)} updated.`
              );
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-white">{toSentenceCase(workstream.workstreamType)}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {workstream.advisorName ?? 'No external advisor set'} / due {formatDate(workstream.dueDate)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={getStatusTone(workstream.status)}>{toSentenceCase(workstream.status)}</Badge>
                {workstream.signedOffAt ? <Badge tone="good">signed {formatDate(workstream.signedOffAt)}</Badge> : null}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Select name="status" defaultValue={workstream.status}>
                {workstreamStatusOptions.map((value) => (
                  <option key={value} value={value}>
                    {toSentenceCase(value)}
                  </option>
                ))}
              </Select>
              <Input name="ownerLabel" defaultValue={workstream.ownerLabel ?? ''} placeholder="Internal owner" />
              <Input name="advisorName" defaultValue={workstream.advisorName ?? ''} placeholder="External advisor" />
              <Input name="reportTitle" defaultValue={workstream.reportTitle ?? ''} placeholder="Report title" />
              <Input name="dueDate" type="date" defaultValue={toDateValue(workstream.dueDate)} />
              <Input
                name="signedOffByLabel"
                defaultValue={workstream.signedOffByLabel ?? ''}
                placeholder="Signed off by"
              />
            </div>
            <Textarea name="summary" className="min-h-[88px]" defaultValue={workstream.summary ?? ''} placeholder="Current scope and status" />
            <Textarea
              name="blockerSummary"
              className="min-h-[88px]"
              defaultValue={workstream.blockerSummary ?? ''}
              placeholder="Current blocker summary"
            />
            <Textarea name="notes" className="min-h-[88px]" defaultValue={workstream.notes ?? ''} placeholder="Internal notes" />
            <div className="space-y-3 rounded-[18px] border border-white/10 bg-slate-950/35 p-4">
              <div className="fine-print">Linked Deliverables</div>
              <div className="space-y-2" data-testid="diligence-deliverables-list">
                {workstream.deliverables.length > 0 ? (
                  workstream.deliverables.map((deliverable) => (
                    <div
                      key={deliverable.id}
                      className="rounded-[16px] border border-white/10 bg-black/20 p-3 text-sm text-slate-300"
                      data-testid="diligence-deliverable-row"
                    >
                      <div className="font-semibold text-white" data-testid="diligence-deliverable-title">
                        {deliverable.document.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {toSentenceCase(deliverable.document.documentType)} / v{deliverable.document.currentVersion} / {deliverable.document.documentHash.slice(0, 12)}
                      </div>
                      {deliverable.note ? <div className="mt-2 text-xs text-slate-400">{deliverable.note}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No specialist deliverables are linked yet.</div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <Select name={`deliverable-${workstream.id}`} defaultValue="">
                  <option value="">Attach existing asset document</option>
                  {availableDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </Select>
                <Input name={`deliverable-note-${workstream.id}`} placeholder="Optional note" />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy === `deliverable-${workstream.id}`}
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    const documentSelect = form?.querySelector<HTMLSelectElement>(`select[name="deliverable-${workstream.id}"]`);
                    const noteInput = form?.querySelector<HTMLInputElement>(`input[name="deliverable-note-${workstream.id}"]`);
                    const documentId = documentSelect?.value ?? '';
                    const note = noteInput?.value ?? '';
                    if (!documentId) {
                      setError('Choose an asset document before linking a deliverable.');
                      return;
                    }
                    void run(
                      `deliverable-${workstream.id}`,
                      async () => {
                        await send(`/api/deals/${dealId}/diligence-workstreams/${workstream.id}/deliverables`, 'POST', {
                          documentId,
                          note: note || null
                        });
                        if (documentSelect) documentSelect.value = '';
                        if (noteInput) noteInput.value = '';
                      },
                      `${toSentenceCase(workstream.workstreamType)} deliverable linked.`
                    );
                  }}
                >
                  {busy === `deliverable-${workstream.id}` ? 'Linking...' : 'Link Deliverable'}
                </Button>
              </div>
              <div className="grid gap-3 rounded-[16px] border border-white/10 bg-black/20 p-3 lg:grid-cols-[1.2fr_0.9fr_1fr_1fr_auto]">
                <Input name={`upload-title-${workstream.id}`} placeholder="Upload new external deliverable title" />
                <Select name={`upload-type-${workstream.id}`} defaultValue={DocumentType.OTHER}>
                  {documentTypeOptions.map((value) => (
                    <option key={value} value={value}>
                      {toSentenceCase(value)}
                    </option>
                  ))}
                </Select>
                <Input name={`upload-note-${workstream.id}`} placeholder="Deliverable note" />
                <Input name={`upload-file-${workstream.id}`} type="file" />
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="upload-deliverable-submit"
                  disabled={busy === `upload-deliverable-${workstream.id}`}
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    const titleInput = form?.querySelector<HTMLInputElement>(`input[name="upload-title-${workstream.id}"]`);
                    const typeSelect = form?.querySelector<HTMLSelectElement>(`select[name="upload-type-${workstream.id}"]`);
                    const noteInput = form?.querySelector<HTMLInputElement>(`input[name="upload-note-${workstream.id}"]`);
                    const fileInput = form?.querySelector<HTMLInputElement>(`input[name="upload-file-${workstream.id}"]`);
                    const file = fileInput?.files?.[0];
                    const title = titleInput?.value?.trim() ?? '';
                    const documentType = typeSelect?.value ?? DocumentType.OTHER;
                    const note = noteInput?.value?.trim() ?? '';

                    if (!title || !file) {
                      setError('Provide a deliverable title and file before uploading.');
                      return;
                    }

                    void run(
                      `upload-deliverable-${workstream.id}`,
                      async () => {
                        const body = new FormData();
                        body.append('title', title);
                        body.append('documentType', documentType);
                        body.append('note', note);
                        body.append('file', file);

                        const response = await fetch(
                          `/api/deals/${dealId}/diligence-workstreams/${workstream.id}/deliverables/upload`,
                          {
                            method: 'POST',
                            body
                          }
                        );

                        if (!response.ok) {
                          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                          throw new Error(payload?.error ?? 'Upload failed');
                        }

                        if (titleInput) titleInput.value = '';
                        if (noteInput) noteInput.value = '';
                        if (fileInput) fileInput.value = '';
                      },
                      `${toSentenceCase(workstream.workstreamType)} deliverable uploaded and linked.`
                    );
                  }}
                >
                  {busy === `upload-deliverable-${workstream.id}` ? 'Uploading...' : 'Upload + Link'}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm text-slate-400">
              <div>
                Requested {formatDate(workstream.requestedAt)} / signed off by {workstream.signedOffByLabel ?? 'not yet'}
              </div>
              <Button type="submit" variant="secondary" disabled={busy === `workstream-${workstream.id}`}>
                {busy === `workstream-${workstream.id}` ? 'Saving...' : 'Update Workstream'}
              </Button>
            </div>
          </form>
        ))}
        {workstreams.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No specialist workstreams are open yet. Start legal, commercial, technical, or environmental diligence before the
            process gets deeper.
          </div>
        ) : null}
      </div>
    </Card>
  );
}
