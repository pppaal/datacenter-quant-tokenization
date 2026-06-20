'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ImDeckInput } from '@/lib/services/exports/im-pptx';

type Props = {
  /** Headline deck content built server-side from the report data. */
  deck: ImDeckInput;
};

/**
 * Public IM export triggers. PDF uses the browser print path (?print=1 →
 * ImPrintMode adds .im-print and prints, with the #137 @media print styling).
 * PowerPoint is generated entirely client-side via pptxgenjs (dynamic-imported
 * on click so it stays out of the initial bundle), so the public sample IM can
 * export without any server route or auth.
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
      const { buildImPptxBlob, deckFilename } = await import('@/lib/services/exports/im-pptx');
      const blob = await buildImPptxBlob(deck);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = deckFilename(deck.title);
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
