'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Client-side helper that listens for ?print=1 on the IM URL.
 * When set, adds .im-print to <html> (so CSS can hide the TOC and
 * other interactive chrome) and triggers window.print() once the
 * page paint settles. Stays out of the way otherwise.
 *
 * Why ?print=1 rather than a server-side PDF endpoint: this works in
 * any environment without bundling a Chromium binary. The browser's
 * own print engine produces the PDF — the @media print rules already
 * polish the output, and bookmarks via section ids let the operator
 * jump to a specific section before printing if they only want one.
 */
export function ImPrintMode() {
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

  return null;
}
