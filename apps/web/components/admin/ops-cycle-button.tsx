'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

export function OpsCycleButton() {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setIsRunning(true);
    setError(null);

    try {
      const response = await fetch('/api/ops/cycle/trigger', {
        method: 'POST'
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? 'Failed to run ops cycle');
      }

      refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to run ops cycle');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleRun} disabled={isRunning || isRefreshing}>
        {isRunning || isRefreshing ? 'Running Ops Cycle...' : 'Run Ops Cycle'}
      </Button>
      {error ? <div className="text-sm text-[hsl(var(--danger))]">{error}</div> : null}
    </div>
  );
}
