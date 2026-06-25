import { Card } from '@/components/ui/card';

type Props = {
  label: string;
  primary: string;
  detail: string;
};

/**
 * Compact metric card used across the admin/research dashboards: a `Card`
 * with an eyebrow label, a 2xl primary value and a small detail line.
 *
 * Extracted from the byte-identical `StatCard` previously copy-pasted into
 * the sponsors, ops/ai-cache, deal-flow and tenant-demand pages. Markup and
 * Tailwind classes are preserved exactly for visual parity.
 */
export function StatCard({ label, primary, detail }: Props) {
  return (
    <Card className="space-y-2">
      <div className="fine-print">{label}</div>
      <div className="text-2xl font-semibold text-[hsl(var(--foreground))]">{primary}</div>
      <div className="text-xs text-[hsl(var(--muted))]">{detail}</div>
    </Card>
  );
}
