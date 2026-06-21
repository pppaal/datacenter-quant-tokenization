'use client';

import { Button } from '@/components/ui/button';

type Props = {
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

/**
 * Shared "print / save-as-PDF" trigger. Uses the browser print path styled by
 * the @media print rules in globals.css (#137), so every screen produces a
 * consistent PDF without a headless-Chromium dependency. Hidden in the printout
 * itself (print:hidden).
 */
export function PrintButton({ label = 'PDF / 인쇄', variant = 'ghost' }: Props) {
  return (
    <div className="print:hidden">
      <Button variant={variant} onClick={() => window.print()}>
        {label}
      </Button>
    </div>
  );
}
