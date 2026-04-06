'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ValuationRunForm({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [runLabel, setRunLabel] = useState('Latest committee scenario');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'good' | 'danger'>('good');

  return (
    <form
      className="space-y-3"
      data-testid="valuation-run-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setFeedback(null);
        try {
          const response = await fetch('/api/valuations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              assetId,
              runLabel
            })
          });

          if (!response.ok) throw new Error('Valuation failed');
          setFeedbackTone('good');
          setFeedback(`Valuation run queued: ${runLabel}`);
          router.refresh();
        } catch (error) {
          setFeedbackTone('danger');
          setFeedback(error instanceof Error ? error.message : 'Valuation failed');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <label className="space-y-2">
        <span className="fine-print">Run Label</span>
        <Input data-testid="valuation-run-label" value={runLabel} onChange={(event) => setRunLabel(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-slate-400">
          This runs the return analysis through the Next.js API route and refreshes the asset dossier with a new generated IM.
        </p>
        <Button type="submit" disabled={submitting} data-testid="valuation-run-submit">
          {submitting ? 'Running...' : 'Run Analysis + Generate IM'}
        </Button>
      </div>
      {feedback ? (
        <div
          className={feedbackTone === 'good' ? 'text-sm text-emerald-300' : 'text-sm text-rose-300'}
          data-testid="valuation-run-feedback"
          role={feedbackTone === 'good' ? 'status' : 'alert'}
        >
          {feedback}
        </div>
      ) : null}
    </form>
  );
}
