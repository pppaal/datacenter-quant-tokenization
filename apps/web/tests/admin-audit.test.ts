import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeAdminHeader,
  getAdminAuthConfig,
  getRequiredAdminRoleForPath,
  hasRequiredAdminRole
} from '@/lib/security/admin-auth';
import {
  buildOpsAlertSummary,
  getDocumentStorageReadiness,
  getSecurityOverview,
  listRecentOpsRuns,
  recordAuditEvent
} from '@/lib/services/audit';

test('admin auth supports multiple credentials and returns actor role', () => {
  const config = getAdminAuthConfig({
    NODE_ENV: 'test',
    ADMIN_BASIC_AUTH_VIEWER_CREDENTIALS: 'viewer:pw1',
    ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS: 'analyst:pw2',
    ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS: 'admin:pw3'
  });

  const actor = authorizeAdminHeader(
    `Basic ${Buffer.from('analyst:pw2').toString('base64')}`,
    config
  );

  assert.equal(config.mode, 'configured');
  assert.equal(actor?.identifier, 'analyst');
  assert.equal(actor?.role, 'ANALYST');
});

test('admin role helpers gate viewer, analyst, and admin routes correctly', () => {
  assert.equal(getRequiredAdminRoleForPath('/admin/assets'), 'VIEWER');
  assert.equal(getRequiredAdminRoleForPath('/api/assets'), 'ANALYST');
  assert.equal(getRequiredAdminRoleForPath('/admin/security'), 'ADMIN');
  assert.equal(hasRequiredAdminRole('ADMIN', 'ANALYST'), true);
  assert.equal(hasRequiredAdminRole('VIEWER', 'ANALYST'), false);
});

test('recordAuditEvent persists normalized audit metadata', async () => {
  let created: any;
  const fakeDb = {
    auditEvent: {
      async findFirst() {
        return null; // empty chain: this is the first event
      },
      async create(args: any) {
        created = args.data;
        return {
          id: 'audit_1',
          createdAt: new Date('2026-03-30T00:00:00.000Z'),
          ...args.data
        };
      }
    }
  };

  const result = await recordAuditEvent(
    {
      actorIdentifier: 'analyst',
      actorRole: 'ANALYST',
      action: 'valuation.run.create',
      entityType: 'valuation_run',
      entityId: 'run_1',
      assetId: 'asset_1',
      statusLabel: 'SUCCESS',
      metadata: { runLabel: 'Base case' }
    },
    fakeDb as any
  );

  assert.equal(created.actorIdentifier, 'analyst');
  assert.equal(created.entityType, 'valuation_run');
  assert.deepEqual(created.metadata, { runLabel: 'Base case' });
  // recordAuditEvent now generates its own id + hash-chain fields.
  assert.equal(result.id, created.id);
  assert.equal(typeof created.recordHash, 'string');
  assert.equal(created.prevHash, null);
});

test('document storage readiness surfaces local, partial, and external states', () => {
  assert.equal(
    getDocumentStorageReadiness({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).mode,
    'local'
  );
  assert.equal(
    getDocumentStorageReadiness({
      NODE_ENV: 'test',
      DOCUMENT_STORAGE_BUCKET: 'bucket',
      DOCUMENT_STORAGE_ENDPOINT: 'https://objects.example.com'
    } as NodeJS.ProcessEnv).mode,
    'partial'
  );
  assert.equal(
    getDocumentStorageReadiness({
      NODE_ENV: 'test',
      DOCUMENT_STORAGE_BUCKET: 'bucket',
      DOCUMENT_STORAGE_ENDPOINT: 'https://objects.example.com',
      DOCUMENT_STORAGE_ACCESS_KEY_ID: 'key',
      DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'secret'
    } as NodeJS.ProcessEnv).mode,
    'object_storage_ready'
  );
});

test('listRecentOpsRuns returns recent research and source run history', async () => {
  const fakeDb = {
    researchSyncRun: {
      async findMany() {
        return [
          {
            id: 'research_run_1',
            triggerType: 'MANUAL',
            statusLabel: 'SUCCESS',
            startedAt: new Date('2026-04-05T00:00:00.000Z')
          }
        ];
      }
    },
    sourceRefreshRun: {
      async findMany() {
        return [
          {
            id: 'source_run_1',
            triggerType: 'SCHEDULED',
            statusLabel: 'SUCCESS',
            startedAt: new Date('2026-04-05T01:00:00.000Z')
          }
        ];
      }
    }
  };

  const result = await listRecentOpsRuns(fakeDb as any);
  assert.equal(result.researchSyncRuns[0]?.id, 'research_run_1');
  assert.equal(result.sourceRefreshRuns[0]?.id, 'source_run_1');
});

test('buildOpsAlertSummary surfaces latest failed run clearly', () => {
  const summary = buildOpsAlertSummary({
    researchSyncRuns: [
      {
        statusLabel: 'FAILED',
        startedAt: new Date('2026-04-05T00:00:00.000Z'),
        errorSummary: 'research sync failed'
      }
    ],
    sourceRefreshRuns: [
      {
        statusLabel: 'SUCCESS',
        startedAt: new Date('2026-04-05T01:00:00.000Z'),
        errorSummary: null
      }
    ],
    env: {
      OPS_ALERT_FAILURE_STREAK: '2',
      OPS_ALERT_STALE_HOURS: '6'
    } as unknown as NodeJS.ProcessEnv
  });

  assert.equal(summary.hasActiveAlert, true);
  assert.equal(summary.researchFailureCount, 1);
  assert.match(summary.headline, /research sync failed/i);
});

test('buildOpsAlertSummary escalates intervention when runs are stale or repeatedly failing', () => {
  const summary = buildOpsAlertSummary({
    researchSyncRuns: [
      {
        statusLabel: 'FAILED',
        startedAt: new Date('2026-04-05T00:00:00.000Z'),
        errorSummary: 'research sync failed'
      },
      {
        statusLabel: 'FAILED',
        startedAt: new Date('2026-04-04T23:00:00.000Z'),
        errorSummary: 'research sync failed'
      }
    ],
    sourceRefreshRuns: [],
    env: {
      OPS_ALERT_FAILURE_STREAK: '2',
      OPS_ALERT_STALE_HOURS: '1'
    } as unknown as NodeJS.ProcessEnv
  });

  assert.equal(summary.requiresIntervention, true);
  assert.equal(summary.researchFailureStreak, 2);
  assert.equal(summary.failureStreakThreshold, 2);
  assert.ok(summary.interventionItems.some((item) => /failed 2 runs in a row/i.test(item)));
});

test('getSecurityOverview actorSummary dedups actors, derives last-seen from createdAt, and is stably ordered', async () => {
  const t = (iso: string) => new Date(iso);
  const auditRows = [
    {
      id: 'e1',
      actorIdentifier: 'analyst',
      actorRole: 'ANALYST',
      action: 'a',
      entityType: 'deal',
      entityId: null,
      assetId: null,
      requestPath: null,
      requestMethod: null,
      ipAddress: null,
      statusLabel: 'SUCCESS',
      metadata: null,
      createdAt: t('2026-05-01T00:00:00.000Z')
    },
    {
      id: 'e2',
      actorIdentifier: 'analyst',
      actorRole: 'ANALYST',
      action: 'b',
      entityType: 'deal',
      entityId: null,
      assetId: null,
      requestPath: null,
      requestMethod: null,
      ipAddress: null,
      statusLabel: 'FAILED',
      metadata: null,
      // Newer than e1; proves last-seen tracks the max createdAt.
      createdAt: t('2026-06-01T00:00:00.000Z')
    },
    {
      id: 'e3',
      actorIdentifier: 'admin',
      actorRole: 'ADMIN',
      action: 'c',
      entityType: 'valuation',
      entityId: null,
      assetId: null,
      requestPath: null,
      requestMethod: null,
      ipAddress: null,
      statusLabel: 'SUCCESS',
      metadata: null,
      createdAt: t('2026-04-01T00:00:00.000Z')
    }
  ];

  const emptyFindMany = async () => [];
  const db = {
    auditEvent: { findMany: async () => auditRows },
    researchSyncRun: { findMany: emptyFindMany },
    sourceRefreshRun: { findMany: emptyFindMany },
    user: { findMany: emptyFindMany },
    opsAlertDelivery: { findMany: emptyFindMany }
    // adminIdentityBinding + opsWorkItem are optional and intentionally omitted.
  };

  const overview = await getSecurityOverview(db as any, { NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  // Two distinct actors despite three events (analyst deduped).
  assert.equal(overview.actorSummary.length, 2);
  const analyst = overview.actorSummary.find((a) => a.actorIdentifier === 'analyst')!;
  assert.equal(analyst.eventCount, 2);
  assert.equal(analyst.failureCount, 1);
  // last-seen is the NEWER of the two analyst events, not the first encountered.
  assert.equal(analyst.lastSeenAt.getTime(), t('2026-06-01T00:00:00.000Z').getTime());
  // Ordering is by last-seen desc → analyst (Jun) before admin (Apr).
  assert.equal(overview.actorSummary[0].actorIdentifier, 'analyst');

  // The reconciling roll-up is exposed alongside the per-actor list.
  assert.equal(overview.auditSummary.totalCount, 3);
  assert.equal(overview.auditSummary.failureCount, 1);
  assert.equal(overview.auditSummary.distinctActorCount, 2);
});
