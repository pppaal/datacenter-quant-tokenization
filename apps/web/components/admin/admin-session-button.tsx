'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

export function AdminSessionButton() {
  const router = useRouter();
  const { isRefreshing, refresh } = useRouterRefresh();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/session', {
        method: 'DELETE'
      });
      // Only navigate away once the session cookie was actually revoked
      // server-side — otherwise the UI would claim "signed out" while the
      // session is still live (fail-open on a security action).
      if (!response.ok) {
        throw new Error('Sign-out failed. You are still signed in — please try again.');
      }
      router.push('/admin/login');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        onClick={handleSignOut}
        disabled={isSubmitting || isRefreshing}
      >
        {isSubmitting || isRefreshing ? 'Ending Session...' : 'End Session'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-[hsl(var(--danger))]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
