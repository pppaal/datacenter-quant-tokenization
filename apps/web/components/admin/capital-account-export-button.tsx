'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = { fundId: string };

function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="?([^"]+)"?/.exec(header);
  return m?.[1] ?? fallback;
}

/** Downloads the fund's LP capital-account statement (PCAP) as .xlsx (#ca route). */
export function CapitalAccountExportButton({ fundId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/exports/capital-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ fundId })
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `내보내기 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get('Content-Disposition'), 'capital-account.xlsx');
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
      <Button variant="secondary" onClick={download} disabled={busy}>
        {busy ? '내보내는 중…' : 'Excel 내보내기'}
      </Button>
      {error ? (
        <span className="text-xs text-[hsl(var(--danger))]" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
