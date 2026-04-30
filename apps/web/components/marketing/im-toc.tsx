'use client';

import { useEffect, useState } from 'react';

type TocItem = { id: string; label: string };

/**
 * Sticky table-of-contents for the IM. Renders a vertical pill rail
 * on lg+ screens (left margin), or a horizontal scrollable bar on
 * smaller screens. Highlights the section currently in view via
 * IntersectionObserver. Hidden in print since the printed PDF gets
 * its own layout breaks.
 */
export function ImToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="IM table of contents"
      className="print-hidden sticky top-4 z-30 mx-auto mb-4 hidden max-h-[80vh] w-fit max-w-full overflow-y-auto rounded-[18px] border border-white/10 bg-slate-950/85 px-3 py-3 backdrop-blur-md lg:block"
    >
      <ol className="space-y-1 text-xs">
        {items.map((item, idx) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block rounded-[10px] px-2 py-1 transition ${
                  active
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span className="font-mono text-[10px] text-slate-500">
                  {String(idx + 1).padStart(2, '0')}
                </span>{' '}
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
