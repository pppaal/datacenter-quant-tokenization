'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DealTimelineEvent } from '@/lib/services/deals';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

type Props = {
  events: DealTimelineEvent[];
};

type TimelineFilter = 'all' | 'execution' | 'note' | 'risk' | 'valuation';

const filters: TimelineFilter[] = ['all', 'execution', 'note', 'risk', 'valuation'];

export function DealTimelinePanel({ events }: Props) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const visibleEvents = useMemo(
    () => events.filter((event) => filter === 'all' || event.category === filter),
    [events, filter]
  );

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Timeline</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Deal and valuation stream
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              className={[
                'rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition',
                filter === item
                  ? 'border-accent/50 bg-accent/10 text-[hsl(var(--foreground))]'
                  : 'border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] text-[hsl(var(--muted))] hover:border-[hsl(var(--border-strong))] hover:text-[hsl(var(--foreground))]'
              ].join(' ')}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {visibleEvents.length > 0 ? (
          visibleEvents.map((event) => {
            const body = (
              <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5 transition hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--surface-hover))]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                        {event.title}
                      </div>
                      <Badge tone={event.tone}>{event.kind}</Badge>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      {formatDate(event.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {event.meta.map((item) => (
                      <Badge key={`${event.id}-${item}`}>{item}</Badge>
                    ))}
                  </div>
                </div>
                {event.body ? (
                  <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
                    {event.body}
                  </p>
                ) : null}
              </div>
            );

            return event.href ? (
              <Link key={event.id} href={event.href} className="block">
                {body}
              </Link>
            ) : (
              <div key={event.id}>{body}</div>
            );
          })
        ) : (
          <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5 text-sm text-[hsl(var(--muted))]">
            No timeline events match this filter.
          </div>
        )}
      </div>
    </Card>
  );
}
