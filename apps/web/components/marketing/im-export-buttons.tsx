'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ImDeckInput } from '@/lib/services/exports/im-pptx';

type Props = {
  /** Headline deck content built server-side from the report data. */
  deck: ImDeckInput;
};

function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="?([^"]+)"?/.exec(header);
  return m?.[1] ?? fallback;
}

/**
 * Public IM export triggers. PDF uses the browser print path (?print=1 →
 * ImPrintMode adds .im-print and prints, with the #137 @media print styling).
 * PowerPoint POSTs the deck to the public server route `/api/public/im-deck`
 * which renders the .pptx server-side — pptxgenjs (node:fs / node:https) must
 * NOT be bundled into the browser, so generation stays on the server.
 *
 * Note: `import type { ImDeckInput }` is erased at build time, so it does not
 * pull pptxgenjs into the client bundle.
 */
export function ImExportButtons({ deck }: Props) {
  const [busy, setBusy] = useState(false);

  function printPdf() {
    const url = new URL(window.location.href);
    url.searchParams.set('print', '1');
    window.location.href = url.toString();
  }

  async function downloadPptx() {
    setBusy(true);
    try {
      const res = await fetch('/api/public/im-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deck)
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get('Content-Disposition'), 'investment-memo.pptx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="secondary" onClick={downloadPptx} disabled={busy}>
        {busy ? '생성 중…' : 'PowerPoint'}
      </Button>
      <Button variant="ghost" onClick={printPdf} disabled={busy}>
        PDF / 인쇄
      </Button>
    </div>
  );
}
