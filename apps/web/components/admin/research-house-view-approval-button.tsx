'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type Props = {
  snapshotId: string | null;
  disabled?: boolean;
  compact?: boolean;
};

export function ResearchHouseViewApprovalButton({
  snapshotId,
  disabled = false,
  compact = false
}: Props) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshotId) {
    return null;
  }

  async function approve() {
    const confirmed = window.confirm(
      'Approving this house view will supersede any existing approved version and create an immutable lineage record. Continue?'
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/research-snapshots/${snapshotId}/approve`, {
        method: 'POST'
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to approve house view');
      }

      refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to approve house view');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <Button
        type="button"
        variant={compact ? 'ghost' : 'secondary'}
        onClick={approve}
        disabled={disabled || submitting || isRefreshing}
      >
        {submitting || isRefreshing ? 'Approving...' : 'Approve House View'}
      </Button>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
