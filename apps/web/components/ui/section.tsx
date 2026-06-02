import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  /** Uppercase fine-print kicker rendered above the title (the `.eyebrow`). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot (buttons / links / badges) shown next to the header. */
  action?: ReactNode;
  children?: ReactNode;
  /**
   * Heading element for the title. Defaults to `h3`, matching the dominant
   * admin-panel section header. Pass `h2` for page-level headers.
   */
  as?: 'h2' | 'h3';
  /**
   * Override the title classes. Defaults to the ubiquitous
   * `mt-2 text-2xl font-semibold text-white`.
   */
  titleClassName?: string;
  /**
   * Override the description classes. Defaults to the repeated
   * `mt-3 max-w-3xl text-sm leading-7 text-slate-400`.
   */
  descriptionClassName?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
};

/**
 * The eyebrow + title + description header block that recurs across nearly
 * every admin panel. When `action` is supplied the header lays out as a
 * `flex … justify-between` row (the other common admin variant); otherwise it
 * is a plain stacked block.
 *
 * Defaults reproduce the most common admin markup byte-for-byte; the `as`,
 * `titleClassName` and `descriptionClassName` props let bespoke-but-close call
 * sites adopt it without visual drift.
 */
export function Section({
  eyebrow,
  title,
  description,
  action,
  children,
  as = 'h3',
  titleClassName,
  descriptionClassName,
  className
}: Props) {
  const Heading = as;
  const headerContent = (
    <>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <Heading className={cn('mt-2 text-2xl font-semibold text-white', titleClassName)}>
        {title}
      </Heading>
      {description ? (
        <p className={cn('mt-3 max-w-3xl text-sm leading-7 text-slate-400', descriptionClassName)}>
          {description}
        </p>
      ) : null}
    </>
  );

  // When an action is present the header lays out as a flex row with the
  // action right-aligned; otherwise the wrapper IS the header block (no extra
  // nesting), reproducing the bare `<div>…</div>` markup of the call sites.
  if (action) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>{headerContent}</div>
          {action}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      {headerContent}
      {children}
    </div>
  );
}
