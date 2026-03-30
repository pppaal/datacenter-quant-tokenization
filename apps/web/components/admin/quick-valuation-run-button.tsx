'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  assetId: string;
  assetCode?: string | null;
  className?: string;
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
};

export function QuickValuationRunButton({
  assetId,
  assetCode,
  className,
  fullWidth = false,
  variant = 'primary',
  label = 'Re-run Analysis'
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={className}>
      <Button
        className={fullWidth ? 'w-full' : undefined}
        variant={variant}
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          setError(null);

          try {
            const response = await fetch('/api/valuations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                assetId,
                runLabel: `Re-run ${assetCode ?? assetId}`
              })
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(payload?.error ?? 'Failed to run analysis');
            }

            router.refresh();
          } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'Failed to run analysis');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? 'Running...' : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
