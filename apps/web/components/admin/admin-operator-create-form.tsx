'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

const PASSWORD_MIN_LENGTH = 12;

/**
 * In-app operator provisioning: creates a canonical `User` seat together with
 * a DB-backed login credential, so adding an operator no longer requires
 * editing ADMIN_BASIC_AUTH_* env vars and redeploying. The new operator signs
 * in at /admin/login with the email + initial password entered here.
 */
export function AdminOperatorCreateForm() {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'VIEWER' | 'ANALYST' | 'ADMIN'>('ANALYST');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Initial password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/operators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          password
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create operator seat.');
      }

      setFeedback(
        `Operator created. They can sign in at /admin/login with ${email.trim().toLowerCase()} and the initial password.`
      );
      setName('');
      setEmail('');
      setPassword('');
      setRole('ANALYST');
      refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to create operator seat.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="space-y-3 rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
      data-testid="operator-create-form"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Operator name"
          autoComplete="off"
          data-testid="operator-create-name"
        />
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="operator@firm.example"
          type="email"
          autoComplete="off"
          data-testid="operator-create-email"
        />
        <Select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
          data-testid="operator-create-role"
        >
          <option value="VIEWER">VIEWER</option>
          <option value="ANALYST">ANALYST</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
        <Input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`Initial password (min ${PASSWORD_MIN_LENGTH} chars)`}
          type="password"
          autoComplete="new-password"
          data-testid="operator-create-password"
        />
      </div>
      <div className="rounded-[18px] border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] p-3 text-xs leading-6 text-[hsl(var(--warning))]">
        Share the initial password over a secure channel and reset it after first sign-in. The seat
        logs in with its email — no env-var change or redeploy required.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={submitting || isRefreshing}
          data-testid="operator-create-save"
        >
          {submitting || isRefreshing ? 'Creating...' : 'Create Operator'}
        </Button>
      </div>
      {feedback ? (
        <div
          className="text-sm text-[hsl(var(--success))]"
          data-testid="operator-create-feedback"
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div
          className="text-sm text-[hsl(var(--danger))]"
          data-testid="operator-create-feedback"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
