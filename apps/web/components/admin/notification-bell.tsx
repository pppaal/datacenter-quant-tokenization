'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type NotificationSeverity = 'INFO' | 'WARN' | 'CRITICAL';

type NotificationRecord = {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  audienceRole: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  notifications: NotificationRecord[];
  unreadCount: number;
};

const POLL_INTERVAL_MS = 30_000;

function formatRelative(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function severityDotClass(severity: NotificationSeverity) {
  if (severity === 'CRITICAL') return 'bg-rose-400';
  if (severity === 'WARN') return 'bg-amber-400';
  return 'bg-emerald-400';
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/notifications?limit=20', {
        method: 'GET',
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`Failed to load notifications (${response.status})`);
      }
      const payload = (await response.json()) as NotificationsResponse;
      setNotifications(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handle = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/admin/notifications/${id}/read`, {
          method: 'POST'
        });
        if (!response.ok) {
          throw new Error(`Failed to mark read (${response.status})`);
        }
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to mark notification read');
      }
    },
    [load]
  );

  const handleMarkAll = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/notifications/read-all', {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to mark all read (${response.status})`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to mark all notifications read');
    }
  }, [load]);

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 99 ? '99+' : String(unreadCount);
  }, [unreadCount]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-slate-200 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
        data-testid="admin-notification-bell"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {badgeLabel ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-slate-950 bg-rose-500 px-1.5 text-[10px] font-semibold leading-none text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-3 w-[360px] max-w-[92vw] rounded-[22px] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <div className="text-sm font-semibold text-white">Notifications</div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent transition hover:text-cyan-300 disabled:text-slate-600"
            >
              Mark all read
            </button>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {loading && notifications.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-slate-500">
                Loading notifications...
              </div>
            ) : null}
            {error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {error}
              </div>
            ) : null}
            {!loading && !error && notifications.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-slate-500">
                No notifications yet.
              </div>
            ) : null}
            {notifications.map((item) => {
              const isUnread = item.readAt == null;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-2xl border p-3 transition',
                    isUnread ? 'border-white/12 bg-white/[0.05]' : 'border-white/5 bg-white/[0.02]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                        severityDotClass(item.severity)
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={cn(
                            'text-sm font-semibold leading-snug',
                            isUnread ? 'text-white' : 'text-slate-300'
                          )}
                        >
                          {item.title}
                        </div>
                        <div className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          {formatRelative(item.createdAt)}
                        </div>
                      </div>
                      {item.body ? (
                        <div className="mt-1 text-xs leading-relaxed text-slate-400">
                          {item.body}
                        </div>
                      ) : null}
                      {isUnread ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(item.id)}
                          className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent transition hover:text-cyan-300"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
