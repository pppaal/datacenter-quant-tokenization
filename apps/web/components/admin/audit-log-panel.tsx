import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type {
  AuditEventFilters,
  AuditEventListResult,
  AuditEventRow
} from '@/lib/services/audit-review';

type Props = {
  data: AuditEventListResult;
  filters: AuditEventFilters;
};

type ChipDescriptor = {
  key: keyof AuditEventFilters;
  label: string;
  value: string;
};

function formatDateValue(value: Date | undefined): string | null {
  if (!value) return null;
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function buildChips(filters: AuditEventFilters): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  if (filters.actor) chips.push({ key: 'actor', label: 'Actor', value: filters.actor });
  if (filters.entityType)
    chips.push({ key: 'entityType', label: 'Type', value: filters.entityType });
  if (filters.entityId) chips.push({ key: 'entityId', label: 'Entity', value: filters.entityId });
  if (filters.severity) chips.push({ key: 'severity', label: 'Severity', value: filters.severity });
  const startLabel = formatDateValue(filters.startDate);
  if (startLabel) chips.push({ key: 'startDate', label: 'From', value: startLabel });
  const endLabel = formatDateValue(filters.endDate);
  if (endLabel) chips.push({ key: 'endDate', label: 'To', value: endLabel });
  return chips;
}

function buildQueryString(
  filters: AuditEventFilters,
  overrides: Partial<Record<keyof AuditEventFilters, string | null>> = {}
) {
  const params = new URLSearchParams();
  const apply = (key: keyof AuditEventFilters, value: string | undefined | null) => {
    if (overrides[key] === null) return;
    const overrideValue = overrides[key];
    const finalValue = overrideValue !== undefined ? overrideValue : (value ?? '');
    if (finalValue && finalValue.length > 0) {
      params.set(key, finalValue);
    }
  };

  apply('actor', filters.actor);
  apply('entityType', filters.entityType);
  apply('entityId', filters.entityId);
  apply('severity', filters.severity);
  apply('startDate', formatDateValue(filters.startDate) ?? undefined);
  apply('endDate', formatDateValue(filters.endDate) ?? undefined);
  if (filters.limit) apply('limit', String(filters.limit));

  const cursorOverride = overrides.cursor;
  if (cursorOverride && cursorOverride.length > 0) {
    params.set('cursor', cursorOverride);
  }

  const query = params.toString();
  return query.length > 0 ? `/admin/audit?${query}` : '/admin/audit';
}

function severityTone(label: string): 'good' | 'warn' | 'danger' | 'neutral' {
  const upper = label.toUpperCase();
  if (upper === 'SUCCESS' || upper === 'OK' || upper === 'INFO') return 'good';
  if (upper === 'WARN' || upper === 'WARNING' || upper === 'NOTICE') return 'warn';
  if (upper === 'FAILED' || upper === 'ERROR' || upper === 'CRITICAL') return 'danger';
  return 'neutral';
}

function formatTimestamp(value: Date): string {
  return value.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function formatPayload(event: AuditEventRow): string {
  return JSON.stringify(
    {
      id: event.id,
      action: event.action,
      actor: {
        identifier: event.actorIdentifier,
        role: event.actorRole
      },
      entity: {
        type: event.entityType,
        id: event.entityId,
        assetId: event.assetId
      },
      request: {
        path: event.requestPath,
        method: event.requestMethod,
        ipAddress: event.ipAddress
      },
      statusLabel: event.statusLabel,
      createdAt: event.createdAt.toISOString(),
      metadata: event.metadata
    },
    null,
    2
  );
}

export function AuditLogPanel({ data, filters }: Props) {
  const chips = buildChips(filters);
  const { events, nextCursor, totalCount } = data;
  const loadMoreHref = nextCursor ? buildQueryString(filters, { cursor: nextCursor }) : null;

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Audit Trail</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Admin event ledger
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted))]">
            Inspect operator actions, system mutations, and security events captured by the audit
            pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="neutral">{totalCount.toLocaleString()} matches</Badge>
          <Badge tone="neutral">{events.length} on page</Badge>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="fine-print">Active filters</span>
          {chips.map((chip) => {
            const removeHref = buildQueryString(filters, { [chip.key]: null, cursor: null });
            return (
              <span
                key={`${chip.key}-${chip.value}`}
                className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--foreground))]"
              >
                <span className="text-[hsl(var(--muted))]">{chip.label}</span>
                <span className="text-[hsl(var(--foreground))]">{chip.value}</span>
                <Link
                  href={removeHref}
                  aria-label={`Clear ${chip.label} filter`}
                  className="text-[hsl(var(--muted))] transition hover:text-[hsl(var(--danger))]"
                >
                  x
                </Link>
              </span>
            );
          })}
          <Link
            href="/admin/audit"
            className="inline-flex items-center rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--foreground-muted))] transition hover:border-rose-400/40 hover:text-rose-200"
          >
            Clear all
          </Link>
        </div>
      ) : null}

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-8 text-center">
          <div className="eyebrow">No Events</div>
          <h3 className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">
            No audit events match the current filters
          </h3>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Adjust the filter form above or clear filters to widen the search.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))]">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-[hsl(var(--panel-alt))] text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
              <tr>
                <th className="w-44 px-4 py-3 font-medium">Time</th>
                <th className="w-48 px-4 py-3 font-medium">Actor</th>
                <th className="w-44 px-4 py-3 font-medium">Type</th>
                <th className="w-48 px-4 py-3 font-medium">Entity</th>
                <th className="w-32 px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {events.map((event) => (
                <tr key={event.id} className="align-top text-[hsl(var(--foreground))]">
                  <td className="px-4 py-4 font-mono text-[11px] text-[hsl(var(--foreground-muted))]">
                    {formatTimestamp(event.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm text-[hsl(var(--foreground))]">
                      {event.actorIdentifier}
                    </div>
                    <div className="fine-print mt-1">{event.actorRole}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm text-[hsl(var(--foreground))]">{event.entityType}</div>
                    <div className="fine-print mt-1">{event.action}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="truncate font-mono text-[11px] text-[hsl(var(--foreground-muted))]">
                      {event.entityId ?? 'n/a'}
                    </div>
                    {event.assetId ? (
                      <div className="fine-print mt-1">asset {event.assetId}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <Badge tone={severityTone(event.statusLabel)}>{event.statusLabel}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-accent transition group-open:text-cyan-300">
                        View detail
                      </summary>
                      <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3 text-[11px] leading-5 text-[hsl(var(--foreground))]">
                        {formatPayload(event)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loadMoreHref ? (
        <div className="flex justify-center">
          <Link
            href={loadMoreHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-6 py-2.5 text-sm font-semibold tracking-[-0.01em] text-[hsl(var(--foreground))] transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-[hsl(var(--surface-hover))]"
          >
            Load more events
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
