import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'card' | 'inline' | 'divider' | 'panel';

type Props = {
  label: ReactNode;
  children: ReactNode;
  /**
   * Visual layout. Each variant reproduces, byte-for-byte, the markup of a
   * `Row` helper that previously lived inline in a page/panel:
   *   - `card`    — bordered card (admin distributions / transfers /
   *                 tokenization). `dt`/`dd` semantic markup.
   *   - `inline`  — flex label/value pill (admin sample-report). `dt`/`dd`.
   *   - `divider` — flex row with a hairline divider (quarterly-report and
   *                 property-analyze). `span`/`span` markup.
   *   - `panel`   — eyebrow-label tile (asset-tokenization-panel). `div`/`div`
   *                 markup with an optional `mono` value font.
   */
  variant?: Variant;
  /**
   * `panel` variant only: render the value in a monospace font, mirroring the
   * original `mono` prop.
   */
  mono?: boolean;
  /**
   * Extra classes merged onto the wrapper. Used by the `card` variant where
   * the rounding/padding differed slightly between call sites
   * (`rounded-[18px] p-3` vs `rounded-[20px] p-4`).
   */
  className?: string;
  /**
   * Rendered when `children` is `null`/`undefined`. Mirrors the
   * `{children ?? 'Not attached'}` fallback the tokenization page baked into
   * its `Row`. Defaults to rendering `children` verbatim.
   */
  fallback?: ReactNode;
};

/**
 * Shared label/value row. Consolidates the ~7 inline `Row` helpers that were
 * copy-pasted across reports and admin panels under two signatures
 * (`{label, children}` and `{k, v}`). The `variant` prop preserves the exact
 * Tailwind classes + DOM structure of each original so visual output is
 * unchanged.
 */
export function KeyValueRow({
  label,
  children,
  variant = 'card',
  className,
  fallback,
  mono
}: Props) {
  const content = children ?? fallback;
  if (variant === 'panel') {
    return (
      <div
        className={cn('rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3', className)}
      >
        <div className="fine-print">{label}</div>
        <div className={`mt-2 text-sm text-white ${mono ? 'font-mono' : ''}`}>{content}</div>
      </div>
    );
  }
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm',
          className
        )}
      >
        <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="font-mono text-sm text-white">{content}</dd>
      </div>
    );
  }

  if (variant === 'divider') {
    // Border edge + vertical padding differ between callers
    // (`border-b py-1` vs `border-t py-1.5 first:border-t-0`), so they are
    // supplied via `className` rather than baked into the base.
    return (
      <div className={cn('flex justify-between border-zinc-800', className)}>
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-100">{content}</span>
      </div>
    );
  }

  return (
    <div className={cn('rounded-[18px] border border-white/10 bg-white/[0.03] p-3', className)}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-slate-200">{content}</dd>
    </div>
  );
}
