'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAccessScopeType } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { AdminAccessGrantSummary } from '@/lib/security/admin-access';

type SeatOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Props = {
  grants: AdminAccessGrantSummary[];
  seats: SeatOption[];
};

const SCOPE_TYPES: AdminAccessScopeType[] = [
  AdminAccessScopeType.ASSET,
  AdminAccessScopeType.DEAL,
  AdminAccessScopeType.PORTFOLIO,
  AdminAccessScopeType.FUND
];

function formatDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function AccessGrantsPanel({ grants, seats }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyGrantId, setBusyGrantId] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: seats[0]?.id ?? '',
    scopeType: AdminAccessScopeType.ASSET as AdminAccessScopeType,
    scopeId: ''
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.userId || !form.scopeId.trim()) {
      setError('Operator and scope id are both required.');
      return;
    }
    const response = await fetch('/api/admin/access-grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: form.userId,
        scopeType: form.scopeType,
        scopeId: form.scopeId.trim()
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Create failed (HTTP ${response.status}).`);
      return;
    }
    setForm((prev) => ({ ...prev, scopeId: '' }));
    startTransition(() => router.refresh());
  }

  async function handleRevoke(grantId: string) {
    setError(null);
    setBusyGrantId(grantId);
    try {
      const response = await fetch(`/api/admin/access-grants/${grantId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `Revoke failed (HTTP ${response.status}).`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyGrantId(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Row-level access grants</h2>
        <span className="text-xs text-zinc-500">
          {grants.length} {grants.length === 1 ? 'grant' : 'grants'} active
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Restricts an operator (non-ADMIN role) to a specific asset / deal / portfolio / fund.
        ADMIN-role users bypass all grants. Adding a grant does not remove existing access — the
        operator simply must satisfy at least one grant for each scoped surface they reach.
      </p>

      <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-[2fr_1fr_2fr_auto]">
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500">Operator</span>
          <select
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={form.userId}
            onChange={(e) => setForm((prev) => ({ ...prev, userId: e.target.value }))}
          >
            {seats.length === 0 ? (
              <option value="">(no seats available)</option>
            ) : (
              seats.map((seat) => (
                <option key={seat.id} value={seat.id}>
                  {seat.name} · {seat.email} ({seat.role})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500">Scope</span>
          <select
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={form.scopeType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                scopeType: e.target.value as AdminAccessScopeType
              }))
            }
          >
            {SCOPE_TYPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500">Scope id (Asset/Deal/Portfolio/Fund cuid)</span>
          <Input
            value={form.scopeId}
            onChange={(e) => setForm((prev) => ({ ...prev, scopeId: e.target.value }))}
            placeholder="e.g. cmoiaofs30004cmyamxdtwgzm"
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Add grant'}
          </Button>
        </div>
      </form>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900/70 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Operator
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Scope
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Resource
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Updated
              </th>
              <th scope="col" className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-zinc-500">
                  No row-level grants configured. Non-ADMIN operators currently see all rows.
                </td>
              </tr>
            ) : (
              grants.map((grant) => (
                <tr key={grant.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-100">{grant.userName}</div>
                    <div className="text-xs text-zinc-500">
                      {grant.userEmail} · {grant.userRole}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone="neutral">{grant.scopeType}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <div className="text-zinc-200">{grant.scopeLabel}</div>
                    <div className="text-zinc-600">{grant.scopeId}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{formatDate(grant.updatedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleRevoke(grant.id)}
                      disabled={busyGrantId === grant.id}
                    >
                      {busyGrantId === grant.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
