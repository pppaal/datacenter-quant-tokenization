'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Client-side helper that listens for ?print=1 on the IM URL.
 * When set, adds .im-print to <html> (so CSS can hide the TOC and
 * other interactive chrome) and triggers window.print() once the
 * page paint settles. Stays out of the way otherwise.
 *
 * It also renders a print-only running footer and a confidentiality
 * watermark. Both are real `position: fixed` nodes (see globals.css
 * `.print-running-footer` / `.print-watermark`), so Chromium's print
 * engine repeats them on every page — institutional polish (running
 * confidentiality line + page footer + watermark) without bundling a
 * headless-Chromium PDF binary or a paged-media engine.
 *
 * Why ?print=1 rather than a server-side PDF endpoint: this works in
 * any environment without a headless browser. The browser's own print
 * engine produces the PDF — the @media print rules polish the output,
 * @page sets A4 geometry, and section ids let the operator jump to a
 * specific section before printing if they only want one.
 */
export function ImPrintMode({
  confidentiality = 'CONFIDENTIAL — for the named recipient only',
  footerLabel = 'Investment Memo',
  watermark = 'CONFIDENTIAL'
}: {
  /** Left-side running-footer text (also the watermark intent). */
  confidentiality?: string;
  /** Right-side running-footer label (e.g. the asset / firm name). */
  footerLabel?: string;
  /** Diagonal page watermark; pass an empty string to disable. */
  watermark?: string;
} = {}) {
  const params = useSearchParams();
  const enabled = params?.get('print') === '1';

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    document.documentElement.classList.add('im-print');
    // Defer to next tick so the layout is fully painted.
    const t = window.setTimeout(() => {
      window.print();
    }, 400);
    return () => {
      window.clearTimeout(t);
      document.documentElement.classList.remove('im-print');
    };
  }, [enabled]);

  return (
    <>
      {watermark ? (
        <div className="print-watermark" aria-hidden>
          {watermark}
        </div>
      ) : null}
      <div className="print-running-footer" aria-hidden>
        <span>{confidentiality}</span>
        <span>{footerLabel}</span>
      </div>
    </>
  );
}
