'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AssetTab = {
  id: string;
  label: string;
  content: ReactNode;
};

type Props = {
  tabs: AssetTab[];
  /** Persistent identity + KPI bar rendered above the tab nav. */
  header?: ReactNode;
  /** Server-resolved default (e.g. land on Valuation when ?rolloverYear is set). */
  defaultTabId?: string;
};

/**
 * Two-tier sticky shell for the asset detail page: a persistent identity/KPI
 * header plus a tab nav, with the active tab synced to the `?tab=` search param
 * so views are deep-linkable and shareable for committee discussion. All tab
 * content is server-rendered and passed in as `content`; switching is instant
 * (no refetch) and preserves other query params (e.g. `rolloverYear`).
 */
export function AssetTabs({ tabs, header, defaultTabId }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Active tab is local state for INSTANT switching. The page is force-dynamic,
  // so routing the `?tab=` change through the Next router would refetch the
  // whole asset on every click; instead we sync the URL with
  // history.replaceState (no server roundtrip) purely so the view stays
  // deep-linkable / shareable. Initial value still reads the URL on load.
  const initialId = (() => {
    const urlTab = searchParams?.get('tab');
    if (urlTab && tabs.some((tab) => tab.id === urlTab)) return urlTab;
    if (defaultTabId && tabs.some((tab) => tab.id === defaultTabId)) return defaultTabId;
    return tabs[0]?.id;
  })();
  const [activeId, setActiveId] = useState<string | undefined>(initialId);

  const selectTab = useCallback(
    (id: string) => {
      setActiveId(id);
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('tab', id);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
      }
    },
    [pathname, searchParams]
  );

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/90 px-4 pt-4 backdrop-blur-md md:-mx-6 md:px-6">
        {header}
        <nav
          className="mt-3 flex gap-1 overflow-x-auto"
          aria-label="Asset detail sections"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === active.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(tab.id)}
                className={cn(
                  'whitespace-nowrap rounded-t-[8px] border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-foregroundMuted hover:border-borderStrong hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div role="tabpanel" className="space-y-6">
        {active?.content}
      </div>
    </div>
  );
}
