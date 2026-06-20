'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  /** POST endpoint that returns an .xlsx (a withAdminApi export route). */
  endpoint: string;
  /** JSON body to POST (e.g. { fundId } / { assetId }). */
  body: Record<string, unknown>;
  label?: string;
  fallbackName: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="?([^"]+)"?/.exec(header);
  return m?.[1] ?? fallback;
}

/**
 * Generic client trigger for the .xlsx export routes: POSTs `body` to
 * `endpoint` (same-origin, so the admin session cookie authorizes) and
 * downloads the returned workbook with the server-provided filename.
 */
export function XlsxDownloadButton({
  endpoint,
  body,
  label = 'Excel 내보내기',
  fallbackName,
  variant = 'secondary'
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `내보내기 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get('Content-Disposition'), fallbackName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '내보내기 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant={variant} onClick={download} disabled={busy}>
        {busy ? '내보내는 중…' : label}
      </Button>
      {error ? (
        <span className="text-xs text-[hsl(var(--danger))]" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
