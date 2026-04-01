import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getAdminAuthConfig } from '@/lib/security/admin-auth';
import { getSecurityOverview } from '@/lib/services/audit';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminSecurityPage() {
  const authConfig = getAdminAuthConfig();
  const security = await getSecurityOverview();

  return (
    <div className="space-y-8">
      <Card className="hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={authConfig.mode === 'configured' ? 'good' : authConfig.mode === 'disabled' ? 'warn' : 'danger'}>
            {authConfig.mode}
          </Badge>
          <Badge tone={security.storageReadiness.status === 'good' ? 'good' : security.storageReadiness.status === 'warning' ? 'warn' : 'danger'}>
            {security.storageReadiness.mode}
          </Badge>
        </div>
        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white">Security, audit, and operator controls</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
          Review admin-access posture, document-storage readiness, and mutation audit trails before promoting this
          environment into live institutional use.
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <div className="eyebrow">Admin Auth</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span>Mode</span>
              <Badge tone={authConfig.mode === 'configured' ? 'good' : authConfig.mode === 'disabled' ? 'warn' : 'danger'}>
                {authConfig.mode}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Configured credentials</span>
              <span className="text-white">{formatNumber(authConfig.credentials.length, 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Viewer credentials</span>
              <span className="text-white">
                {formatNumber(authConfig.credentials.filter((entry) => entry.role === 'VIEWER').length, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Analyst credentials</span>
              <span className="text-white">
                {formatNumber(authConfig.credentials.filter((entry) => entry.role === 'ANALYST').length, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Admin credentials</span>
              <span className="text-white">
                {formatNumber(authConfig.credentials.filter((entry) => entry.role === 'ADMIN').length, 0)}
              </span>
            </div>
            {authConfig.errors.length > 0 ? (
              <div className="rounded-[20px] border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200">
                {authConfig.errors.join(' ')}
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Document Storage</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span>Mode</span>
              <Badge tone={security.storageReadiness.status === 'good' ? 'good' : security.storageReadiness.status === 'warning' ? 'warn' : 'danger'}>
                {security.storageReadiness.mode}
              </Badge>
            </div>
            <p className="leading-7 text-slate-400">{security.storageReadiness.detail}</p>
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-xs leading-6 text-slate-400">
              External storage env keys: `DOCUMENT_STORAGE_BUCKET`, `DOCUMENT_STORAGE_ENDPOINT`,
              `DOCUMENT_STORAGE_ACCESS_KEY_ID`, `DOCUMENT_STORAGE_SECRET_ACCESS_KEY`.
            </div>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">AI Runtime</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span>OpenAI key</span>
              <Badge tone={security.aiReadiness.hasApiKey ? 'good' : 'warn'}>
                {security.aiReadiness.hasApiKey ? 'configured' : 'missing'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Model</span>
              <span className="text-white">{security.aiReadiness.model}</span>
            </div>
            <p className="leading-7 text-slate-400">
              Memo generation and extraction can still fall back, but institutional deployment should pin an approved
              production model and rotate keys through the deployment platform.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Operator Footprint</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recent authenticated actors</h2>
          </div>
          <Badge tone="neutral">{formatNumber(security.actorSummary.length, 0)} actors</Badge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {security.actorSummary.length > 0 ? (
            security.actorSummary.map((actor) => (
              <div key={`${actor.actorIdentifier}-${actor.actorRole}`} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-white">{actor.actorIdentifier}</div>
                  <Badge>{actor.actorRole}</Badge>
                </div>
                <div className="mt-3 text-sm text-slate-400">
                  {formatNumber(actor.eventCount, 0)} events / last seen {formatDate(actor.lastSeenAt)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400 md:col-span-3">
              No audit events have been recorded yet.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Audit Trail</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Latest mutation history</h2>
          </div>
          <Badge tone="neutral">{formatNumber(security.auditEvents.length, 0)} events</Badge>
        </div>
        <div className="mt-5 space-y-3">
          {security.auditEvents.length > 0 ? (
            security.auditEvents.map((event) => (
              <div key={event.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{event.actorRole}</Badge>
                    <Badge tone={event.statusLabel === 'SUCCESS' ? 'good' : 'warn'}>{event.statusLabel}</Badge>
                    <div className="text-sm font-semibold text-white">{event.action}</div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(event.createdAt)}</div>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                  <div>
                    <div className="fine-print">Actor</div>
                    <div className="mt-1">{event.actorIdentifier}</div>
                  </div>
                  <div>
                    <div className="fine-print">Entity</div>
                    <div className="mt-1">{event.entityType}{event.entityId ? ` / ${event.entityId}` : ''}</div>
                  </div>
                  <div>
                    <div className="fine-print">Route</div>
                    <div className="mt-1">{event.requestMethod ?? 'N/A'} {event.requestPath ?? 'N/A'}</div>
                  </div>
                  <div>
                    <div className="fine-print">Asset</div>
                    <div className="mt-1">{event.assetId ?? 'N/A'}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No audit history recorded yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
