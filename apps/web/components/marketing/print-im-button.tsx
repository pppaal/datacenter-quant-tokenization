'use client';

import { Button } from '@/components/ui/button';

/**
 * Two ways to produce a PDF:
 *  1. Inline: window.print() against the current page — fastest, but
 *     keeps the URL chrome on screen briefly.
 *  2. Print URL: opens /sample-report?print=1 in a new tab — that
 *     tab's ImPrintMode component fires print() automatically once
 *     paint settles, with the TOC/site nav hidden via .im-print
 *     class. Use this when sending the PDF over email.
 */
export function PrintImButton() {
  function openPrintTab() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('print', '1');
    window.open(url.toString(), '_blank', 'noopener');
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={() => window.print()}>
        Print / Save PDF
      </Button>
      <Button type="button" variant="ghost" onClick={openPrintTab}>
        Open print-ready tab
      </Button>
    </div>
  );
}
