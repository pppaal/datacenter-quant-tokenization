import { Badge } from '@/components/ui/badge';
import { AdminIdentityBindingForm } from '@/components/admin/admin-identity-binding-form';
import { AdminOperatorSeatForm } from '@/components/admin/admin-operator-seat-form';
import { OpsAlertReplayButton } from '@/components/admin/ops-alert-replay-button';
import { OpsWorkItemReplayButton } from '@/components/admin/ops-work-item-replay-button';
import { OpsCycleButton } from '@/components/admin/ops-cycle-button';
import { Card } from '@/components/ui/card';
import { getAdminAuthConfig } from '@/lib/security/admin-auth';
import { getAdminReviewerAttributionSummary } from '@/lib/security/admin-identity';
import { getSecurityOverview } from '@/lib/services/audit';
import { maskOpsAlertDestination } from '@/lib/services/ops-alerts';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminSecurityPage() {
  const authConfig = getAdminAuthConfig();
  const reviewerAttribution = getAdminReviewerAttributionSummary();
  const security = await getSecurityOverview();
  const replayableDeliveries = security.opsAlertDeliveries.filter(
    (delivery) => delivery.channel.startsWith('webhook') && delivery.statusLabel !== 'DELIVERED'
  );
  const interventionWorkItems = security.opsWorkItems.filter(
    (item) => item.status === 'FAILED' || item.status === 'DEAD_LETTER'
  );

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
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={security.opsAlerts.requiresIntervention || security.opsAlerts.hasActiveAlert ? 'danger' : 'good'}>
              {security.opsAlerts.requiresIntervention || security.opsAlerts.hasActiveAlert ? 'ops alert' : 'ops stable'}
            </Badge>
            <span>{security.opsAlerts.headline}</span>
          </div>
          {security.opsAlerts.interventionItems.length > 0 ? (
            <div className="mt-3 space-y-2 text-xs text-rose-200">
              {security.opsAlerts.interventionItems.map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-5">
          <OpsCycleButton />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-4">
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

        <Card>
          <div className="eyebrow">Reviewer Attribution</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span>Auth mode</span>
              <Badge tone={reviewerAttribution.canResolveUserBoundReviewer ? 'good' : 'warn'}>
                {reviewerAttribution.authMode}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Binding mode</span>
              <span className="text-white">{reviewerAttribution.reviewerAttributionMode}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Mapped identities</span>
              <span className="text-white">
                {formatNumber(security.identityBindings.mappedBindings, 0)} / {formatNumber(security.identityBindings.totalBindings, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Unmapped identities</span>
              <Badge tone={security.identityBindings.unmappedBindings > 0 ? 'warn' : 'good'}>
                {formatNumber(security.identityBindings.unmappedBindings, 0)}
              </Badge>
            </div>
            <p className="leading-7 text-slate-400">{reviewerAttribution.detail}</p>
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-xs leading-6 text-slate-400">
              Latest identity seen:{' '}
              <span className="text-white">
                {security.identityBindings.latestSeenAt ? formatDate(security.identityBindings.latestSeenAt) : 'none'}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Ops Thresholds</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span>Failure streak threshold</span>
              <span className="text-white">{formatNumber(security.opsAlerts.failureStreakThreshold, 0)} runs</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Stale run window</span>
              <span className="text-white">{formatNumber(security.opsAlerts.staleHours, 0)}h</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Latest research run</span>
              <Badge tone={security.opsAlerts.latestResearchRunStale ? 'warn' : 'good'}>
                {security.opsAlerts.latestResearchRunStartedAt
                  ? formatDate(security.opsAlerts.latestResearchRunStartedAt)
                  : 'missing'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Latest source run</span>
              <Badge tone={security.opsAlerts.latestSourceRunStale ? 'warn' : 'good'}>
                {security.opsAlerts.latestSourceRunStartedAt
                  ? formatDate(security.opsAlerts.latestSourceRunStartedAt)
                  : 'missing'}
              </Badge>
            </div>
            <p className="leading-7 text-slate-400">
              These thresholds define when the security surface escalates from informational alerts to explicit operator
              intervention.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Delivery Intervention Queue</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Ops alerts that still need operator follow-up</h2>
          </div>
          <Badge tone={replayableDeliveries.length > 0 ? 'warn' : 'good'}>
            {formatNumber(replayableDeliveries.length, 0)} open
          </Badge>
        </div>
        <div className="mt-5 space-y-3">
          {replayableDeliveries.length > 0 ? (
            replayableDeliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{delivery.channel}</Badge>
                    <Badge tone="warn">{delivery.statusLabel.toLowerCase()}</Badge>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(delivery.createdAt)}</div>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <div>
                    <div className="fine-print">Destination</div>
                    <div className="mt-1 break-all">{maskOpsAlertDestination(delivery.destination)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Reason</div>
                    <div className="mt-1">{delivery.reason ?? 'N/A'}</div>
                  </div>
                  <div>
                    <div className="fine-print">Action</div>
                    <div className="mt-1 text-slate-400">Replay this alert after confirming webhook routing or fallback config.</div>
                  </div>
                </div>
                <OpsAlertReplayButton deliveryId={delivery.id} />
                {delivery.errorMessage ? <div className="mt-3 text-sm text-rose-200">{delivery.errorMessage}</div> : null}
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No replayable ops alert deliveries are waiting for intervention.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Ops Queue</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Queued and dead-letter ops work</h2>
            <p className="mt-2 text-sm text-slate-400">
              Track queued scheduler work outside request handling and requeue failed items after the underlying source,
              credential, or environment issue is fixed.
            </p>
          </div>
          <Badge tone={interventionWorkItems.length > 0 ? 'warn' : 'neutral'}>
            {formatNumber(interventionWorkItems.length, 0)} intervention items
          </Badge>
        </div>
        <div className="mt-5 space-y-3">
          {security.opsWorkItems.length > 0 ? (
            security.opsWorkItems.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4" data-testid="ops-work-item-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{item.workType.toLowerCase()}</Badge>
                    <Badge
                      tone={
                        item.status === 'SUCCEEDED'
                          ? 'good'
                          : item.status === 'QUEUED' || item.status === 'RUNNING'
                            ? 'warn'
                            : 'danger'
                      }
                    >
                      {item.status.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(item.createdAt)}</div>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                  <div>
                    <div className="fine-print">Actor</div>
                    <div className="mt-1">{item.actorIdentifier ?? 'system'}</div>
                  </div>
                  <div>
                    <div className="fine-print">Attempts</div>
                    <div className="mt-1">
                      {formatNumber(item.attemptCount, 0)} / {formatNumber(item.maxAttempts, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Scheduled For</div>
                    <div className="mt-1">{formatDate(item.scheduledFor)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Dead-lettered</div>
                    <div className="mt-1">{item.deadLetteredAt ? formatDate(item.deadLetteredAt) : 'N/A'}</div>
                  </div>
                </div>
                {item.lastError ? <div className="mt-3 text-sm text-rose-200">{item.lastError}</div> : null}
                {(item.status === 'FAILED' || item.status === 'DEAD_LETTER') ? (
                  <OpsWorkItemReplayButton workItemId={item.id} />
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No queued ops work items have been recorded yet.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Unmapped Reviewer Identities</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">SSO identities that still need a bound user</h2>
            <p className="mt-2 text-sm text-slate-400">
              Map each provider subject to a canonical operator before using reviewer analytics or operator scorecards.
            </p>
          </div>
          <Badge tone={security.identityBindings.unmappedBindings > 0 ? 'warn' : 'good'}>
            {formatNumber(security.identityBindings.unmappedBindings, 0)} open
          </Badge>
        </div>
        <div className="mt-5 space-y-3">
          {security.identityBindings.recentUnmapped.length > 0 ? (
            security.identityBindings.recentUnmapped.map((binding) => (
              <div
                key={`${binding.provider}:${binding.subject}`}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                data-testid="identity-binding-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{binding.provider}</Badge>
                    <div className="text-sm font-semibold text-white">{binding.emailSnapshot ?? binding.identifierSnapshot}</div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Last seen {formatDate(binding.lastSeenAt)}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <div>
                    <div className="fine-print">Identifier snapshot</div>
                    <div className="mt-1">{binding.identifierSnapshot}</div>
                  </div>
                  <div>
                    <div className="fine-print">Email snapshot</div>
                    <div className="mt-1">{binding.emailSnapshot ?? 'N/A'}</div>
                  </div>
                  <div>
                    <div className="fine-print">Next action</div>
                    <div className="mt-1 text-slate-400">Map this subject to a canonical `User` before relying on reviewer analytics.</div>
                  </div>
                </div>
                <AdminIdentityBindingForm
                  bindingId={binding.id}
                  emailSnapshot={binding.emailSnapshot}
                  identifierSnapshot={binding.identifierSnapshot}
                  hasMapping={Boolean(binding.userId)}
                  candidates={security.identityBindings.userCandidates}
                />
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              All persisted reviewer identities are mapped to a canonical user.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Operator Seats</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Canonical operators and seat lifecycle</h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage role assignment and active status for the canonical `User` records that reviewer attribution and
              operator analytics bind to.
            </p>
          </div>
          <Badge tone="neutral">{formatNumber(security.operatorSeats.length, 0)} seats</Badge>
        </div>
        <div className="mt-5 space-y-3">
          {security.operatorSeats.length > 0 ? (
            security.operatorSeats.map((seat) => (
              <div key={seat.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4" data-testid="operator-seat-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{seat.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{seat.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{seat.role}</Badge>
                    <Badge tone={seat.isActive ? 'good' : 'warn'}>{seat.isActive ? 'active' : 'inactive'}</Badge>
                  </div>
                </div>
                <AdminOperatorSeatForm
                  userId={seat.id}
                  currentRole={seat.role as 'VIEWER' | 'ANALYST' | 'ADMIN'}
                  isActive={seat.isActive}
                  sessionVersion={seat.sessionVersion}
                />
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No canonical operators are available yet.
            </div>
          )}
        </div>
      </Card>

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

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Research Sync Runs</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recent research fabric refresh history</h2>
            </div>
            <Badge tone="neutral">{formatNumber(security.opsRuns.researchSyncRuns.length, 0)} runs</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {security.opsRuns.researchSyncRuns.length > 0 ? (
              security.opsRuns.researchSyncRuns.map((run) => (
                <div key={run.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{run.triggerType.toLowerCase()}</Badge>
                      <Badge tone={run.statusLabel === 'SUCCESS' ? 'good' : run.statusLabel === 'RUNNING' ? 'warn' : 'danger'}>
                        {run.statusLabel.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(run.startedAt)}</div>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                    <div>
                      <div className="fine-print">Official Sources</div>
                      <div className="mt-1">{formatNumber(run.officialSourceCount, 0)}</div>
                    </div>
                    <div>
                      <div className="fine-print">Asset Dossiers</div>
                      <div className="mt-1">{formatNumber(run.assetDossierCount, 0)}</div>
                    </div>
                    <div>
                      <div className="fine-print">Stale Sources</div>
                      <div className="mt-1">{formatNumber(run.staleOfficialSourceCount, 0)}</div>
                    </div>
                    <div>
                      <div className="fine-print">Stale Assets</div>
                      <div className="mt-1">{formatNumber(run.staleAssetDossierCount, 0)}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-400">
                    {run.errorSummary
                      ? run.errorSummary
                      : `Triggered by ${run.refreshedByActor ?? 'system'} and finished ${formatDate(run.finishedAt)}.`}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                No research sync runs have been recorded yet.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Source Refresh Runs</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recent source and enrichment refresh history</h2>
            </div>
            <Badge tone="neutral">{formatNumber(security.opsRuns.sourceRefreshRuns.length, 0)} runs</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {security.opsRuns.sourceRefreshRuns.length > 0 ? (
              security.opsRuns.sourceRefreshRuns.map((run) => (
                <div key={run.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{run.triggerType.toLowerCase()}</Badge>
                      <Badge tone={run.statusLabel === 'SUCCESS' ? 'good' : run.statusLabel === 'RUNNING' ? 'warn' : 'danger'}>
                        {run.statusLabel.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(run.startedAt)}</div>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                    <div>
                      <div className="fine-print">Source Systems</div>
                      <div className="mt-1">{formatNumber(run.sourceSystemCount, 0)}</div>
                    </div>
                    <div>
                      <div className="fine-print">Stale Systems</div>
                      <div className="mt-1">{formatNumber(run.staleSourceSystemCount, 0)}</div>
                    </div>
                    <div>
                      <div className="fine-print">Refreshed Assets</div>
                      <div className="mt-1">{formatNumber(run.refreshedAssetCount, 0)}</div>
                    </div>
                    <div>
                      <div className="fine-print">Failed Assets</div>
                      <div className="mt-1">{formatNumber(run.failedAssetCount, 0)}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-400">
                    {run.errorSummary
                      ? run.errorSummary
                      : `Triggered by ${run.refreshedByActor ?? 'system'} with threshold ${run.staleThresholdHours}h and batch ${run.batchSize}.`}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                No source refresh runs have been recorded yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Alert Delivery Log</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recent ops alert delivery attempts</h2>
          </div>
          <Badge tone="neutral">{formatNumber(security.opsAlertDeliveries.length, 0)} deliveries</Badge>
        </div>
        <div className="mt-5 space-y-3">
          {security.opsAlertDeliveries.length > 0 ? (
            security.opsAlertDeliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4" data-testid="ops-alert-delivery-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{delivery.channel}</Badge>
                    <Badge tone={delivery.statusLabel === 'DELIVERED' ? 'good' : delivery.statusLabel === 'SKIPPED' ? 'warn' : 'danger'}>
                      {delivery.statusLabel.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatDate(delivery.createdAt)}</div>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                  <div>
                    <div className="fine-print">Destination</div>
                    <div className="mt-1 break-all">{maskOpsAlertDestination(delivery.destination)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Reason</div>
                    <div className="mt-1">{delivery.reason ?? 'N/A'}</div>
                  </div>
                  <div>
                    <div className="fine-print">Actor</div>
                    <div className="mt-1">{delivery.actorIdentifier ?? 'system'}</div>
                  </div>
                  <div>
                    <div className="fine-print">Delivered</div>
                    <div className="mt-1">{delivery.deliveredAt ? formatDate(delivery.deliveredAt) : 'not delivered'}</div>
                  </div>
                </div>
                {(delivery.statusLabel === 'FAILED' || delivery.statusLabel === 'SKIPPED') && delivery.channel === 'webhook' ? (
                  <OpsAlertReplayButton deliveryId={delivery.id} />
                ) : null}
                {delivery.errorMessage ? <div className="mt-3 text-sm text-rose-200">{delivery.errorMessage}</div> : null}
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No ops alert deliveries have been recorded yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
