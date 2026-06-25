'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

export function AdminLoginForm() {
  const router = useRouter();
  const { isRefreshing, refresh } = useRouterRefresh();
  const searchParams = useSearchParams();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user, password })
      });

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Unable to sign in.');
      }

      router.push(searchParams?.get('next') || '/admin');
      refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="fine-print" htmlFor="user">
          Operator ID
        </label>
        <input
          id="user"
          className="mt-2 w-full rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-[hsl(var(--foreground))] outline-none transition focus:border-cyan-400/50"
          value={user}
          onChange={(event) => setUser(event.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label className="fine-print" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="mt-2 w-full rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-[hsl(var(--foreground))] outline-none transition focus:border-cyan-400/50"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {error ? (
        <div className="rounded-[18px] border border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] p-3 text-sm text-[hsl(var(--danger))]">
          {error}
        </div>
      ) : null}
      <Button type="submit" disabled={isSubmitting || isRefreshing}>
        {isSubmitting || isRefreshing ? 'Signing In...' : 'Start Operator Session'}
      </Button>
    </form>
  );
}
