'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function SourcesRefreshButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch('/api/sources/refresh', {
        method: 'POST'
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to refresh source adapters');
      }

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to refresh source adapters'
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing Sources...' : 'Run Source Refresh'}
      </Button>
      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
    </div>
  );
}
