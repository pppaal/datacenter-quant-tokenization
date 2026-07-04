'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Issues a time-limited LP-portal access link for one investor and surfaces it
 * as a copyable URL, closing the "admin gets a raw token back and must
 * hand-deliver it" gap. ADMIN-gated server-side by /api/admin/portal/issue-token.
 */
export function InvestorPortalLinkButton({ investorId }: { investorId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setSubmitting(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch('/api/admin/portal/issue-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ investorId })
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        portalUrl?: string;
      } | null;
      if (!response.ok || !payload?.portalUrl) {
        throw new Error(payload?.error ?? 'Failed to issue portal link.');
      }

      setPortalUrl(payload.portalUrl);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to issue portal link.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="investor-portal-link">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={issue}
          disabled={submitting}
          data-testid="investor-portal-link-issue"
        >
          {submitting ? 'Issuing...' : 'Issue Portal Link'}
        </Button>
        {portalUrl ? (
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? 'Copied' : 'Copy Link'}
          </Button>
        ) : null}
      </div>
      {portalUrl ? (
        <div className="space-y-1">
          <input
            readOnly
            value={portalUrl}
            onFocus={(event) => event.target.select()}
            className="w-full rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-xs text-slate-300"
            data-testid="investor-portal-link-url"
          />
          <div className="text-xs text-[hsl(var(--muted))]">
            Time-limited link. Share over a secure channel — anyone with it can view this
            investor&apos;s capital account until it expires.
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-[hsl(var(--danger))]" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
