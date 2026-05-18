'use client';

import { CommitteeDecisionOutcome } from '@prisma/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toSentenceCase } from '@/lib/utils';

const outcomes = [
  CommitteeDecisionOutcome.APPROVED,
  CommitteeDecisionOutcome.CONDITIONAL,
  CommitteeDecisionOutcome.DECLINED,
  CommitteeDecisionOutcome.DEFERRED
] as const;

export function CommitteePacketDecisionForm({ packetId }: { packetId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<CommitteeDecisionOutcome>(
    CommitteeDecisionOutcome.APPROVED
  );
  const [notes, setNotes] = useState('');
  const [followUpActions, setFollowUpActions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/ic-packets/${packetId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          outcome,
          notes: notes || null,
          followUpActions: followUpActions || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to record decision');
      }

      setNotes('');
      setFollowUpActions('');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to record decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-3 space-y-3 rounded-[18px] border border-white/10 bg-slate-950/35 p-3"
      data-testid="ic-packet-decision-form"
    >
      <div className="fine-print">Committee Decision</div>
      <Select
        value={outcome}
        onChange={(event) => setOutcome(event.target.value as CommitteeDecisionOutcome)}
        data-testid="ic-packet-decision-outcome"
      >
        {outcomes.map((value) => (
          <option key={value} value={value}>
            {toSentenceCase(value)}
          </option>
        ))}
      </Select>
      <Textarea
        className="min-h-[88px]"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Decision summary or IC note"
        data-testid="ic-packet-decision-notes"
      />
      <Textarea
        className="min-h-[88px]"
        value={followUpActions}
        onChange={(event) => setFollowUpActions(event.target.value)}
        placeholder="Follow-up actions"
        data-testid="ic-packet-decision-followup"
      />
      <div className="flex items-center justify-between gap-3">
        {error ? (
          <div className="text-xs text-rose-300">{error}</div>
        ) : (
          <div className="text-xs text-slate-500">Write the IC outcome into packet lineage.</div>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onSubmit}
          disabled={busy}
          data-testid="ic-packet-decision-submit"
        >
          {busy ? 'Saving...' : 'Record Decision'}
        </Button>
      </div>
    </div>
  );
}
