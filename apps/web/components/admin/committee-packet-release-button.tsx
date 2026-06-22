'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

export function CommitteePacketReleaseButton({ packetId }: { packetId: string }) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);

    const confirmed = window.confirm(
      'Releasing this packet makes the committee decision final and visible. This action cannot be undone. Continue?'
    );
    if (!confirmed) {
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`/api/admin/ic-packets/${packetId}/release`, {
        method: 'POST'
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to release packet');
      }
      refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to release packet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        disabled={busy || isRefreshing}
        data-testid="ic-packet-release-button"
      >
        {busy || isRefreshing ? 'Releasing...' : 'Release Packet'}
      </Button>
      {error ? <div className="text-xs text-[hsl(var(--danger))]">{error}</div> : null}
    </div>
  );
}
