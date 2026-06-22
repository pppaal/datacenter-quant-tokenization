'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Wraps `router.refresh()` in a React transition so callers get a real pending
 * flag for the server round-trip.
 *
 * Most admin mutation handlers did `await fetch(); router.refresh()` and cleared
 * their local in-flight flag in a `finally` that runs the instant the transition
 * is *kicked* — not when the refreshed server data has painted. That re-enables
 * the submit button (and drops any "saving…" affordance) while the screen is
 * still showing stale data.
 *
 * Combine `isRefreshing` with your own in-flight state to keep the control busy
 * until the refresh actually settles:
 *
 *   const { isRefreshing, refresh } = useRouterRefresh();
 *   const [submitting, setSubmitting] = useState(false);
 *   // ... after a successful mutation: refresh();
 *   <Button disabled={submitting || isRefreshing}>…</Button>
 */
export function useRouterRefresh(): { isRefreshing: boolean; refresh: () => void } {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  return { isRefreshing, refresh };
}
