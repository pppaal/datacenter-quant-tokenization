'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function CommitteePacketLockButton({
  packetId,
  disabled,
  disabledReason
}: {
  packetId: string;
  disabled: boolean;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (disabled || busy) return;

    const confirmed = window.confirm(
      'Locking this packet will freeze its contents for committee circulation. This action cannot be undone until a decision is recorded. Continue?'
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/ic-packets/${packetId}/lock`, {
        method: 'POST'
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to lock packet');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to lock packet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || busy}
        onClick={onClick}
        data-testid="ic-packet-lock-button"
      >
        {busy ? 'Locking...' : 'Lock Packet'}
      </Button>
      {disabledReason ? <div className="text-xs text-slate-500">{disabledReason}</div> : null}
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
