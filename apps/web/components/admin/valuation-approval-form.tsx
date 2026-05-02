'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ApprovalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'CONDITIONAL' | 'REJECTED';

const approvalOptions: ApprovalStatus[] = ['PENDING_REVIEW', 'APPROVED', 'CONDITIONAL', 'REJECTED'];

export function ValuationApprovalForm({
  runId,
  approvalStatus,
  approvalNotes
}: {
  runId: string;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ApprovalStatus>(approvalStatus);
  const [notes, setNotes] = useState(approvalNotes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
          const response = await fetch(`/api/valuations/${runId}/approval`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              approvalStatus: status,
              approvalNotes: notes
            })
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error ?? 'Failed to update approval');
          }

          router.refresh();
        } catch (caughtError) {
          setError(
            caughtError instanceof Error ? caughtError.message : 'Failed to update approval'
          );
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <label className="space-y-2">
        <span className="fine-print">Approval Status</span>
        <div className="flex flex-wrap gap-2">
          {approvalOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-full border px-3 py-2 text-xs tracking-[0.14em] ${
                status === option
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-white/10 bg-white/[0.03] text-slate-300'
              }`}
              onClick={() => setStatus(option)}
            >
              {option.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </label>

      <label className="space-y-2">
        <span className="fine-print">Approval Notes</span>
        <Textarea
          className="min-h-[120px]"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Conditions, review caveats, committee notes, or rejection reasons."
        />
      </label>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Update Approval'}
        </Button>
      </div>
    </form>
  );
}
