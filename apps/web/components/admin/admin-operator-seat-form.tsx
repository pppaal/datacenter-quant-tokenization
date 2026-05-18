'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

type AdminOperatorSeatFormProps = {
  userId: string;
  currentRole: 'VIEWER' | 'ANALYST' | 'ADMIN';
  isActive: boolean;
  sessionVersion?: number;
};

export function AdminOperatorSeatForm({
  userId,
  currentRole,
  isActive,
  sessionVersion
}: AdminOperatorSeatFormProps) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [active, setActive] = useState(isActive);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const isPrivilegeReduction = role !== currentRole || active !== isActive;
    const isDestructiveSeatChange =
      (currentRole === 'ADMIN' && role !== 'ADMIN') || (isActive && active === false);

    if (isPrivilegeReduction && isDestructiveSeatChange) {
      const confirmed = window.confirm(
        'This seat change can remove admin coverage or deactivate an operator. Confirm only after verifying another active ADMIN seat remains assigned.'
      );
      if (!confirmed) {
        return;
      }
    }

    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/operators', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          role,
          isActive: active
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update operator seat.');
      }

      setFeedback('Operator seat updated.');
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to update operator seat.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeSessions() {
    const confirmed = window.confirm(
      'Invalidate all current browser sessions for this operator seat?'
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/operators', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          rotateSessionVersion: true
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to revoke operator sessions.');
      }

      setFeedback('Operator sessions revoked.');
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to revoke operator sessions.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="mt-4 space-y-3 rounded-[20px] border border-white/10 bg-slate-950/40 p-4"
      data-testid="operator-seat-form"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof currentRole)}
          data-testid="operator-seat-role"
        >
          <option value="VIEWER">VIEWER</option>
          <option value="ANALYST">ANALYST</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
        <Select
          value={active ? 'active' : 'inactive'}
          onChange={(event) => setActive(event.target.value === 'active')}
          data-testid="operator-seat-status"
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </Select>
      </div>
      <div className="rounded-[18px] border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-6 text-amber-100">
        Deactivating a seat or removing ADMIN role is a controlled action. Keep at least one other
        active ADMIN seat assigned before saving.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={submitting}
          data-testid="operator-seat-save"
        >
          {submitting ? 'Saving...' : 'Save Seat'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={revokeSessions}
          disabled={submitting}
          data-testid="operator-seat-revoke"
        >
          Revoke Sessions
        </Button>
        <div className="text-xs text-slate-500">session version {sessionVersion ?? 1}</div>
      </div>
      {feedback ? (
        <div
          className="text-sm text-emerald-300"
          data-testid="operator-seat-feedback"
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-rose-300" data-testid="operator-seat-feedback" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
