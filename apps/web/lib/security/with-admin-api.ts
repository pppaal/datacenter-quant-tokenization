/**
 * Boilerplate-eliminator for admin Node-runtime API routes.
 *
 * Wraps a handler with:
 *   - operator-session resolution (`resolveVerifiedAdminActorFromHeaders`)
 *   - request-id propagation through `withRequestContext` so the logger
 *     auto-tags every line emitted underneath
 *   - centralized 401 response on missing/invalid actor
 *   - optional `zod` body validation
 *   - optional `auditAction` so the route doesn't have to call
 *     `recordAuditEvent` itself for the success/failure pair
 *
 * Use this on new routes; existing routes can migrate incrementally.
 *
 * Example:
 *   export const POST = withAdminApi({
 *     bodySchema: z.object({ assetId: z.string().min(1) }),
 *     auditAction: 'asset.example',
 *     auditEntityType: 'Asset',
 *     async handler({ actor, body, request }) {
 *       const result = await doWork(body.assetId);
 *       return NextResponse.json(result);
 *     }
 *   });
 */
import { NextResponse } from 'next/server';
import { z, type ZodTypeAny } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withRequestContext, reportError } from '@/lib/observability/logger';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from './admin-request';
import {
  hasRequiredAdminRole,
  type AdminAccessRole,
  type AuthorizedAdminActor as AdminActor
} from './admin-auth';
import { recordAuditEvent } from '@/lib/services/audit';
import { genericErrorResponse } from './error-response';

export type WithAdminApiContext<TBody, TParams> = {
  actor: AdminActor;
  body: TBody;
  params: TParams;
  request: Request;
  ipAddress: string | null;
  requestId: string;
};

export type WithAdminApiOptions<
  TSchema extends ZodTypeAny | undefined,
  TParams = Record<string, never>
> = {
  bodySchema?: TSchema;
  allowBasic?: boolean;
  requireActiveSeat?: boolean;
  /** Minimum role the actor must satisfy. Defaults to VIEWER. */
  requiredRole?: AdminAccessRole;
  auditAction?: string;
  auditEntityType?: string;
  auditEntityIdFromBody?: (
    body: TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined
  ) => string | null;
  auditEntityIdFromParams?: (params: TParams) => string | null;
  handler: (
    context: WithAdminApiContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined, TParams>
  ) => Promise<HandlerResult>;
  /**
   * Test-only seam: override the actor resolver. Defaults to the real
   * header/DB-backed resolver. Production callers never set this; it exists so
   * unit tests can deterministically exercise the 401 (no actor) vs 403
   * (insufficient role) branches without standing up a database.
   */
  resolveActor?: (request: Request) => Promise<AdminActor | null>;
  /**
   * Test-only seam: override the audit recorder. Defaults to the real
   * `recordAuditEvent`. Production callers never set this; it lets unit tests
   * assert the success/failure status labeling and the swallow-on-audit-error
   * behavior without a database.
   */
  recordAudit?: (input: Parameters<typeof recordAuditEvent>[0]) => Promise<unknown>;
};

/**
 * Handlers may either return a `Response` directly (legacy / backward-compatible)
 * or `{ response, before, after }` so the audit event captures before/after
 * state snapshots ("who changed what to what"). Both forms are accepted.
 */
export type HandlerResult =
  | Response
  | {
      response: Response;
      before?: unknown;
      after?: unknown;
    };

type WithAdminApiRouteContext<TParams> = { params: Promise<TParams> };

function readRequestId(request: Request): string {
  const inbound = request.headers.get('x-request-id')?.trim();
  if (inbound && /^[a-zA-Z0-9._-]{8,128}$/.test(inbound)) return inbound;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// `any` is intentional: Next.js validates the exported handler's parameter
// types against its own auto-generated `RouteContext`. A precisely-typed
// second parameter (even when optional) trips that validator. The runtime
// check below covers the actual shape — TParams is enforced on the option
// callbacks that consume `params`. Disabled inline (not via the off-list) so
// the rest of `lib/security/**` can stay under the no-explicit-any error gate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminApiHandler = (request: Request, routeContext?: any) => Promise<Response>;

/**
 * Record an audit event WITHOUT letting a persistence failure escape. The
 * handler's mutation commits independently and before the audit write, so a
 * throwing `recordAuditEvent` (transient DB error, append-only trigger
 * contention, hash-chain tip read failure) must never (a) turn a committed
 * mutation's response into a 500 the client retries and double-applies, nor
 * (b) write a misleading FAILED row for an operation that succeeded. The
 * failure is reported out-of-band instead. Mirrors the KYC webhook's
 * recordFailureAuditSafe.
 */
type AuditRecorder = (input: Parameters<typeof recordAuditEvent>[0]) => Promise<unknown>;

async function recordAuditEventSafe(
  record: AuditRecorder,
  input: Parameters<typeof recordAuditEvent>[0]
): Promise<void> {
  try {
    await record(input);
  } catch (auditError) {
    void reportError(auditError, {
      scope: 'withAdminApi.audit',
      action: input.action,
      statusLabel: input.statusLabel ?? 'SUCCESS'
    });
  }
}

export function withAdminApi<
  TSchema extends ZodTypeAny | undefined = undefined,
  TParams extends Record<string, string> = Record<string, never>
>(options: WithAdminApiOptions<TSchema, TParams>): AdminApiHandler {
  return async (request: Request, routeContext?: WithAdminApiRouteContext<TParams>) => {
    const requestId = readRequestId(request);
    return withRequestContext({ requestId }, async () => {
      const actor = options.resolveActor
        ? await options.resolveActor(request)
        : await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
            allowBasic: options.allowBasic ?? false,
            requireActiveSeat: options.requireActiveSeat ?? true
          });
      if (!actor) {
        return NextResponse.json(
          { error: 'Active operator session required.' },
          { status: 401, headers: { 'X-Request-Id': requestId } }
        );
      }

      if (options.requiredRole && !hasRequiredAdminRole(actor.role, options.requiredRole)) {
        return NextResponse.json(
          { error: `Insufficient role. ${options.requiredRole} access required.` },
          { status: 403, headers: { 'X-Request-Id': requestId } }
        );
      }

      const params = (routeContext ? await routeContext.params : ({} as TParams)) as TParams;

      let body: unknown = undefined;
      if (options.bodySchema) {
        try {
          const raw = await request.json();
          body = options.bodySchema.parse(raw);
        } catch (error) {
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Invalid request body' },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          );
        }
      }

      const ipAddress = getRequestIpAddress(request.headers);
      const context: WithAdminApiContext<
        TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined,
        TParams
      > = {
        actor,
        body: body as TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined,
        params,
        request,
        ipAddress,
        requestId
      };

      const resolveAuditEntityId = () => {
        if (options.auditEntityIdFromBody) return options.auditEntityIdFromBody(context.body);
        if (options.auditEntityIdFromParams) return options.auditEntityIdFromParams(params);
        return null;
      };

      try {
        const handlerResult = await options.handler(context);
        const isWrapped = handlerResult instanceof Response === false;
        const response = isWrapped
          ? (handlerResult as { response: Response }).response
          : (handlerResult as Response);
        const before = isWrapped ? (handlerResult as { before?: unknown }).before : undefined;
        const after = isWrapped ? (handlerResult as { after?: unknown }).after : undefined;
        if (options.auditAction && options.auditEntityType) {
          // A handler may return a 4xx denial/rejection (e.g. 422 eligibility,
          // 409 duplicate) WITHOUT throwing. Those are not successes — record
          // them as FAILED with the status code so the tamper-evident audit
          // chain stays accurate. before/after snapshots are only meaningful on
          // an applied (2xx) mutation.
          const isError = response.status >= 400;
          await recordAuditEventSafe(options.recordAudit ?? recordAuditEvent, {
            actorIdentifier: actor.identifier,
            actorRole: actor.role,
            action: options.auditAction,
            entityType: options.auditEntityType,
            entityId: resolveAuditEntityId(),
            requestPath: new URL(request.url).pathname,
            requestMethod: request.method,
            ipAddress,
            statusLabel: isError ? 'FAILED' : 'SUCCESS',
            metadata: isError ? { requestId, statusCode: response.status } : { requestId },
            before: (isError ? undefined : (before ?? undefined)) as Parameters<
              typeof recordAuditEvent
            >[0]['before'],
            after: (isError ? undefined : (after ?? undefined)) as Parameters<
              typeof recordAuditEvent
            >[0]['after']
          });
        }
        response.headers.set('X-Request-Id', requestId);
        return response;
      } catch (error) {
        if (options.auditAction && options.auditEntityType) {
          await recordAuditEventSafe(options.recordAudit ?? recordAuditEvent, {
            actorIdentifier: actor.identifier,
            actorRole: actor.role,
            action: options.auditAction,
            entityType: options.auditEntityType,
            entityId: resolveAuditEntityId(),
            requestPath: new URL(request.url).pathname,
            requestMethod: request.method,
            ipAddress,
            statusLabel: 'FAILED',
            metadata: {
              requestId,
              error: error instanceof Error ? error.message : 'unknown'
            }
          });
        }
        // Genericize: unexpected handler failures (incl. raw Prisma errors)
        // must not leak `error.message` to the client. The full error is
        // logged + reported server-side, correlated by `requestId`.
        return genericErrorResponse(error, {
          status: 500,
          requestId,
          context: { route: new URL(request.url).pathname, method: request.method }
        });
      }
    });
  };
}
