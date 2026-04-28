import { Suspense } from 'react';
import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PanelSkeleton } from '@/components/ui/skeleton';
import { AuditLogFilters } from '@/components/admin/audit-log-filters';
import { AuditLogPanel } from '@/components/admin/audit-log-panel';
import { prisma } from '@/lib/db/prisma';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { listAuditEvents, type AuditEventFilters } from '@/lib/services/audit-review';

export const dynamic = 'force-dynamic';

type SearchParamsInput = {
  actor?: string | string[];
  entityType?: string | string[];
  entityId?: string | string[];
  severity?: string | string[];
  startDate?: string | string[];
  endDate?: string | string[];
  cursor?: string | string[];
  limit?: string | string[];
};

type Props = {
  searchParams?: Promise<SearchParamsInput>;
};

function singleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function buildFilters(raw: SearchParamsInput): AuditEventFilters {
  const limitRaw = singleParam(raw.limit);
  const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
  return {
    actor: singleParam(raw.actor)?.trim() || undefined,
    entityType: singleParam(raw.entityType)?.trim() || undefined,
    entityId: singleParam(raw.entityId)?.trim() || undefined,
    severity: singleParam(raw.severity)?.trim() || undefined,
    startDate: parseDate(singleParam(raw.startDate)),
    endDate: parseDate(singleParam(raw.endDate)),
    cursor: singleParam(raw.cursor)?.trim() || undefined,
    limit: parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined
  };
}

async function AuditContent({ filters }: { filters: AuditEventFilters }) {
  const data = await listAuditEvents(filters);
  return <AuditLogPanel data={data} filters={filters} />;
}

export default async function AdminAuditPage({ searchParams }: Props) {
  const resolved = (await searchParams) ?? {};
  const actor = await resolveVerifiedAdminActorFromHeaders(await headers(), prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor || !hasRequiredAdminRole(actor.role, 'ADMIN')) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="eyebrow">Restricted</div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Insufficient permissions</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Audit log review requires an active ADMIN session. Contact a platform owner if you need
            access.
          </p>
        </Card>
      </div>
    );
  }

  const filters = buildFilters(resolved);
  const initialFilters = {
    actor: filters.actor,
    entityType: filters.entityType,
    entityId: filters.entityId,
    severity: filters.severity,
    startDate: filters.startDate ? filters.startDate.toISOString().slice(0, 10) : undefined,
    endDate: filters.endDate ? filters.endDate.toISOString().slice(0, 10) : undefined
  };

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">Security OS</div>
          <Badge>Audit Trail</Badge>
          <Badge tone="neutral">Admin Only</Badge>
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Forensic ledger of every operator action across the platform.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          Filter by actor, entity, severity, or window to investigate incidents, validate change
          windows, and confirm governance compliance across underwriting, deals, portfolio, and
          capital workflows.
        </p>
      </section>

      <AuditLogFilters initial={initialFilters} />

      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <AuditContent filters={filters} />
      </Suspense>
    </div>
  );
}
