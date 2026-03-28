'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  dealId: string;
};

export function DealRestoreButton({ dealId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
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
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Restoring...' : 'Restore'}
    </Button>
  );
}
