'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  assetId: string;
  /** Optional: restrict the export to one counterparty's statements. */
  counterpartyId?: string;
};

/** Parse the download filename from a Content-Disposition header, with fallback. */
function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="?([^"]+)"?/.exec(header);
  return m?.[1] ?? fallback;
}

/**
 * Client triggers for the financial-statement exports built in #140/#141:
 * "Excel 내보내기" POSTs to /api/admin/exports/financials and downloads the
 * returned .xlsx; "인쇄 / PDF" uses the browser print path. Same-origin fetch
 * carries the admin session cookie, so the ANALYST-gated route authorizes.
 */
export function FinancialsExportButtons({ assetId, counterpartyId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadExcel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/exports/financials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ assetId, counterpartyId })
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `내보내기 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get('Content-Disposition'), 'financials.xlsx');
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
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={downloadExcel} disabled={busy}>
        {busy ? '내보내는 중…' : 'Excel 내보내기'}
      </Button>
      <Button variant="ghost" onClick={() => window.print()} disabled={busy}>
        인쇄 / PDF
      </Button>
      {error ? (
        <span className="text-xs text-[hsl(var(--danger))]" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
