/**
 * Deal-scoped proxy to the document analyzer service.
 *
 *   GET  /api/deals/:id/analyzer/docs/overview
 *   GET  /api/deals/:id/analyzer/docs/outputs/:name
 *   POST /api/deals/:id/analyzer/docs/digest   (body is passed through, deal_id/operator injected)
 *
 * Only paths in `PROXY_ROUTES` are reachable. The operator session, role and
 * deal scope are checked here; the analyzer re-checks its own NDA gate.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { hasRequiredAdminRole, type AuthorizedAdminActor } from '@/lib/security/admin-auth';
import { withAdminApi } from '@/lib/security/with-admin-api';
import {
  analyzerFetch,
  analyzerHeaders,
  getAnalyzerConfig,
  matchProxyRoute,
  toAnalyzerDealId
} from '@/lib/services/analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string; path: string }; // Next passes the catch-all as string[] at runtime; withAdminApi types params as strings

function pathSegments(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split('/');
  return [];
}

const PassthroughBody = z.record(z.string(), z.unknown()).default({});

async function proxy(
  method: 'GET' | 'POST',
  actor: AuthorizedAdminActor,
  params: Params,
  request: Request,
  requestId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const headers = { 'X-Request-Id': requestId };
  const cfg = getAnalyzerConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'Analyzer service is not configured.', configured: false },
      { status: 503, headers }
    );
  }
  const path = pathSegments(params.path).join('/');
  const matched = matchProxyRoute(method, path);
  if (!matched) {
    return NextResponse.json({ error: 'Analyzer path not allowed.' }, { status: 404, headers });
  }
  if (!hasRequiredAdminRole(actor.role, matched.route.minRole)) {
    return NextResponse.json(
      { error: `Insufficient role. ${matched.route.minRole} access required.` },
      { status: 403, headers }
    );
  }
  try {
    await assertActorScopeAccess(
      actor,
      AdminAccessScopeType.DEAL,
      params.id,
      prisma,
      matched.route.mutation ? 'mutation' : 'read'
    );
  } catch {
    return NextResponse.json({ error: 'Deal access denied.' }, { status: 403, headers });
  }
  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    select: { dealCode: true }
  });
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found.' }, { status: 404, headers });
  }
  const analyzerDealId = toAnalyzerDealId(deal.dealCode);
  const target = matched.route.target(analyzerDealId, matched.match);
  if (!target) {
    return NextResponse.json({ error: 'Analyzer path not allowed.' }, { status: 404, headers });
  }
  const operator = { identifier: actor.identifier, role: actor.role };
  let upstream: Response;
  try {
    if (method === 'GET') {
      const url = `${target}?operator=${encodeURIComponent(operator.identifier)}`;
      upstream = await analyzerFetch(cfg, url, {
        method: 'GET',
        headers: analyzerHeaders(cfg, operator)
      });
    } else {
      const { deal_id: _dealId, operator: _operator, ...rest } = body;
      upstream = await analyzerFetch(cfg, target, {
        method: 'POST',
        headers: { ...analyzerHeaders(cfg, operator), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, deal_id: analyzerDealId, operator: operator.identifier })
      });
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      { error: aborted ? 'Analyzer timed out.' : 'Analyzer unreachable.' },
      { status: 504, headers }
    );
  }
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  if (contentType.includes('application/json')) {
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  const bytes = await upstream.arrayBuffer();
  const out: Record<string, string> = {
    ...headers,
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  };
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) out['Content-Disposition'] = disposition;
  return new NextResponse(bytes, { status: upstream.status, headers: out });
}

export const GET = withAdminApi<undefined, Params>({
  requiredRole: 'VIEWER',
  auditAction: 'deal.analyzer.read',
  auditEntityType: 'deal',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ actor, params, request, requestId }) {
    return proxy('GET', actor, params, request, requestId, {});
  }
});

export const POST = withAdminApi<typeof PassthroughBody, Params>({
  requiredRole: 'ANALYST',
  bodySchema: PassthroughBody,
  auditAction: 'deal.analyzer.run',
  auditEntityType: 'deal',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ actor, params, request, requestId, body }) {
    return proxy('POST', actor, params, request, requestId, body ?? {});
  }
});
