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
import { withRequestContext } from '@/lib/observability/logger';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from './admin-request';
import {
  hasRequiredAdminRole,
  type AdminAccessRole,
  type AuthorizedAdminActor as AdminActor
} from './admin-auth';
import { recordAuditEvent } from '@/lib/services/audit';

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
  auditEntityIdFromBody?: (body: TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined) => string | null;
  auditEntityIdFromParams?: (params: TParams) => string | null;
  handler: (
    context: WithAdminApiContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined, TParams>
  ) => Promise<Response>;
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
// callbacks that consume `params`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminApiHandler = (request: Request, routeContext?: any) => Promise<Response>;

export function withAdminApi<
  TSchema extends ZodTypeAny | undefined = undefined,
  TParams extends Record<string, string> = Record<string, never>
>(
  options: WithAdminApiOptions<TSchema, TParams>
): AdminApiHandler {
  return async (request: Request, routeContext?: WithAdminApiRouteContext<TParams>) => {
    const requestId = readRequestId(request);
    return withRequestContext({ requestId }, async () => {
      const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
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
      const context: WithAdminApiContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined, TParams> = {
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
        const response = await options.handler(context);
        if (options.auditAction && options.auditEntityType) {
          await recordAuditEvent({
            actorIdentifier: actor.identifier,
            actorRole: actor.role,
            action: options.auditAction,
            entityType: options.auditEntityType,
            entityId: resolveAuditEntityId(),
            requestPath: new URL(request.url).pathname,
            requestMethod: request.method,
            ipAddress,
            metadata: { requestId }
          });
        }
        response.headers.set('X-Request-Id', requestId);
        return response;
      } catch (error) {
        if (options.auditAction && options.auditEntityType) {
          await recordAuditEvent({
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
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Request failed' },
          { status: 500, headers: { 'X-Request-Id': requestId } }
        );
      }
    });
  };
}
