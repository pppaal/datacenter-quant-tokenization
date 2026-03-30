'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  assetId: string;
  className?: string;
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
};

export function AssetEnrichmentButton({
  assetId,
  className,
  fullWidth = false,
  variant = 'secondary',
  label = 'Refresh Source Enrichment'
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
            const response = await fetch(`/api/assets/${assetId}/enrich`, { method: 'POST' });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(payload?.error ?? 'Failed to refresh source enrichment');
            }

            router.refresh();
          } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'Failed to refresh source enrichment');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? 'Refreshing...' : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
