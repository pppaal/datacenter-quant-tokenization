'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ResearchRefreshButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          setError(null);

          try {
            const response = await fetch('/api/research/refresh', {
              method: 'POST'
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(payload?.error ?? 'Failed to refresh research workspace');
            }

            router.refresh();
          } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'Failed to refresh research workspace');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? 'Refreshing Research...' : 'Run Research Sync'}
      </Button>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
