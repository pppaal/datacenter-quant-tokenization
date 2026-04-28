import { ActivityType } from '@prisma/client';
import type { DealDetailRecord } from '../deals';

export type DealTimelineEvent = {
  id: string;
  kind: 'activity' | 'valuation';
  category: 'execution' | 'note' | 'risk' | 'valuation';
  title: string;
  body: string | null;
  createdAt: Date;
  href: string | null;
  tone: 'neutral' | 'good' | 'warn';
  meta: string[];
};

function sameUtcDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

/**
 * Builds the merged activity / negotiation / valuation timeline for the
 * deal detail view. Sorted newest-first and capped at 20 entries.
 *
 * Same-day task-churn events are collapsed into a single 'Task queue
 * updated' line so noisy inputs (rapid task creates / updates from
 * import flows) don't drown out higher-signal items.
 */
export function buildDealTimeline(deal: DealDetailRecord): DealTimelineEvent[] {
  const rawActivityEvents: DealTimelineEvent[] = deal.activityLogs.map((activity) => ({
    id: `activity-${activity.id}`,
    kind: 'activity',
    category:
      activity.activityType === ActivityType.NOTE
        ? 'note'
        : activity.activityType === ActivityType.RISK_CREATED || activity.activityType === ActivityType.RISK_UPDATED
          ? 'risk'
          : 'execution',
    title: activity.title,
    body: activity.body,
    createdAt: activity.createdAt,
    href: null,
    tone:
      activity.activityType === ActivityType.RISK_CREATED
        ? 'warn'
        : activity.activityType === ActivityType.STAGE_CHANGED || activity.activityType === ActivityType.TASK_CREATED
          ? 'good'
          : 'neutral',
    meta: [
      activity.activityType.toLowerCase().replaceAll('_', ' '),
      activity.counterparty ? activity.counterparty.role.toLowerCase() : null
    ].filter(Boolean) as string[]
  }));
  const activityEvents: DealTimelineEvent[] = [];

  for (const event of rawActivityEvents) {
    const previous = activityEvents[activityEvents.length - 1];
    const isTaskChurn =
      event.meta.includes('task updated') ||
      event.meta.includes('task created');
    const previousIsTaskChurn =
      previous?.meta.includes('task updated') ||
      previous?.meta.includes('task created');

    if (
      previous &&
      isTaskChurn &&
      previousIsTaskChurn &&
      sameUtcDay(previous.createdAt, event.createdAt)
    ) {
      previous.title = 'Task queue updated';
      previous.body = previous.body ?? event.body;
      previous.meta = [...new Set([...previous.meta, ...event.meta, 'task batch'])];
      continue;
    }

    activityEvents.push(event);
  }

  const valuationEvents: DealTimelineEvent[] = (deal.asset?.valuations ?? []).map((valuation) => ({
    id: `valuation-${valuation.id}`,
    kind: 'valuation',
    category: 'valuation',
    title: 'Valuation run updated',
    body: `Base case ${valuation.baseCaseValueKrw.toLocaleString()} KRW with ${valuation.confidenceScore.toFixed(0)} confidence.`,
    createdAt: valuation.createdAt,
    href: `/admin/valuations/${valuation.id}`,
    tone: valuation.confidenceScore >= 70 ? 'good' : valuation.confidenceScore >= 55 ? 'neutral' : 'warn',
    meta: ['valuation', valuation.runLabel ?? 'latest run']
  }));

  const negotiationEvents: DealTimelineEvent[] = deal.negotiationEvents.map((event) => ({
    id: `negotiation-${event.id}`,
    kind: 'activity',
    category: 'execution',
    title: event.title,
    body: [event.summary, event.expiresAt ? `expires ${event.expiresAt.toLocaleDateString()}` : null]
      .filter(Boolean)
      .join(' / ') || null,
    createdAt: event.effectiveAt,
    href: null,
    tone:
      event.eventType === 'SELLER_COUNTER' || event.eventType === 'EXCLUSIVITY_GRANTED' || event.eventType === 'EXCLUSIVITY_EXTENDED'
        ? 'warn'
        : 'neutral',
    meta: [
      'negotiation',
      event.eventType.toLowerCase().replaceAll('_', ' '),
      event.counterparty ? event.counterparty.role.toLowerCase() : null,
      event.bidRevision ? event.bidRevision.label : null
    ].filter(Boolean) as string[]
  }));

  return [...activityEvents, ...negotiationEvents, ...valuationEvents]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 20);
}
