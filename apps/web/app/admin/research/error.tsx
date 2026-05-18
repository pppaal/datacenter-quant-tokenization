'use client';

import { Button } from '@/components/ui/button';

export default function AdminResearchError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="surface space-y-4">
      <div className="eyebrow">Research OS</div>
      <h1 className="text-3xl font-semibold text-white">Research workspace failed to load</h1>
      <p className="text-sm leading-7 text-slate-300">
        {error.message ||
          'The research fabric could not be assembled from the current source and coverage set.'}
      </p>
      <Button onClick={reset}>Retry Research Workspace</Button>
    </div>
  );
}
