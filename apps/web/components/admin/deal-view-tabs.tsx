'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

type DealView = 'active' | 'actionable' | 'archived';

type Props = {
  initialView: DealView;
};

const storageKey = 'deal-list-view-preference';

export function DealViewTabs({ initialView }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedPathname = pathname ?? '/admin/deals';
  const searchParams = useSearchParams();
  const [view, setView] = useState<DealView>(initialView);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) as DealView | null;
    if (stored && stored !== initialView) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (stored === 'active') {
        params.delete('view');
      } else {
        params.set('view', stored);
      }
      router.replace(
        params.size > 0 ? `${resolvedPathname}?${params.toString()}` : resolvedPathname
      );
    }
  }, [initialView, resolvedPathname, router, searchParams]);

  function applyView(nextView: DealView) {
    setView(nextView);
    window.localStorage.setItem(storageKey, nextView);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextView === 'active') {
      params.delete('view');
    } else {
      params.set('view', nextView);
    }
    router.push(params.size > 0 ? `${resolvedPathname}?${params.toString()}` : resolvedPathname);
  }

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <Button
        variant={view === 'active' ? 'primary' : 'secondary'}
        type="button"
        onClick={() => applyView('active')}
      >
        Active
      </Button>
      <Button
        variant={view === 'actionable' ? 'primary' : 'secondary'}
        type="button"
        onClick={() => applyView('actionable')}
      >
        Actionable
      </Button>
      <Button
        variant={view === 'archived' ? 'primary' : 'secondary'}
        type="button"
        onClick={() => applyView('archived')}
      >
        Archived
      </Button>
    </div>
  );
}
