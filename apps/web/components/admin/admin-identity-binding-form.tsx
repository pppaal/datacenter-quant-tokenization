'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

type IdentityCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AdminIdentityBindingFormProps = {
  bindingId: string;
  emailSnapshot: string | null;
  identifierSnapshot: string;
  hasMapping: boolean;
  candidates: IdentityCandidate[];
};

export function AdminIdentityBindingForm({
  bindingId,
  emailSnapshot,
  identifierSnapshot,
  hasMapping,
  candidates
}: AdminIdentityBindingFormProps) {
  const router = useRouter();
  const suggestedCandidateId = useMemo(() => {
    if (!emailSnapshot) {
      return '';
    }

    return candidates.find((candidate) => candidate.email === emailSnapshot)?.id ?? '';
  }, [candidates, emailSnapshot]);

  const [selectedUserId, setSelectedUserId] = useState(suggestedCandidateId);
  const [submitting, setSubmitting] = useState<'map' | 'clear' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateBinding(nextUserId: string | null, mode: 'map' | 'clear') {
    setSubmitting(mode);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/identity-bindings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bindingId,
          userId: nextUserId
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update identity binding.');
      }

      setFeedback(
        nextUserId ? 'Identity mapped to canonical operator.' : 'Identity mapping cleared.'
      );
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to update identity binding.'
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className="mt-4 space-y-3 rounded-[20px] border border-white/10 bg-slate-950/40 p-4"
      data-testid="identity-binding-form"
    >
      <div className="fine-print">Map to canonical operator</div>
      <Select
        value={selectedUserId}
        onChange={(event) => setSelectedUserId(event.target.value)}
        data-testid="identity-binding-user-select"
      >
        <option value="">Select operator</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} · {candidate.email} · {candidate.role}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={submitting !== null || !selectedUserId}
          onClick={() => updateBinding(selectedUserId, 'map')}
          data-testid="identity-binding-map"
        >
          {submitting === 'map' ? 'Mapping...' : 'Map Identity'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={submitting !== null || !hasMapping}
          onClick={() => updateBinding(null, 'clear')}
          data-testid="identity-binding-clear"
        >
          {submitting === 'clear' ? 'Clearing...' : 'Clear Mapping'}
        </Button>
      </div>
      <div className="text-xs leading-6 text-slate-500">
        Snapshot: {emailSnapshot ?? identifierSnapshot}. Mapping this subject makes review
        attribution and operator analytics user-bound.
      </div>
      {feedback ? (
        <div
          className="text-sm text-emerald-300"
          data-testid="identity-binding-feedback"
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-rose-300" data-testid="identity-binding-feedback" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
