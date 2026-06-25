'use client';

import { CommitteeDecisionOutcome } from '@prisma/client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toSentenceCase } from '@/lib/utils';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

const outcomes = [
  CommitteeDecisionOutcome.APPROVED,
  CommitteeDecisionOutcome.CONDITIONAL,
  CommitteeDecisionOutcome.DECLINED,
  CommitteeDecisionOutcome.DEFERRED
] as const;

export function CommitteePacketDecisionForm({ packetId }: { packetId: string }) {
  const { isRefreshing, refresh } = useRouterRefresh();
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
      refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to record decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-3 space-y-3 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3"
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
          <div className="text-xs text-[hsl(var(--danger))]">{error}</div>
        ) : (
          <div className="text-xs text-[hsl(var(--muted))]">
            Write the IC outcome into packet lineage.
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onSubmit}
          disabled={busy || isRefreshing}
          data-testid="ic-packet-decision-submit"
        >
          {busy || isRefreshing ? 'Saving...' : 'Record Decision'}
        </Button>
      </div>
    </div>
  );
}
