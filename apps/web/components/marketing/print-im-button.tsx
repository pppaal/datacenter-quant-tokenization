'use client';

import { Button } from '@/components/ui/button';

export function PrintImButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print / Save PDF
    </Button>
  );
}
