'use client';

import { useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  dealId: string;
};

export function DealRestoreButton({ dealId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const response = await fetch(`/api/deals/${dealId}/restore`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                summary: 'Restored from archived queue.'
              })
            });
            if (!response.ok) {
              throw new Error('Failed to restore deal');
            }
            startTransition(() => router.refresh());
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to restore deal.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Restoring...' : 'Restore'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
