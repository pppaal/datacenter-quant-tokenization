'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function OpsCycleButton() {
  const router = useRouter();
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

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to run ops cycle');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleRun} disabled={isRunning}>
        {isRunning ? 'Running Ops Cycle...' : 'Run Ops Cycle'}
      </Button>
      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
    </div>
  );
}
