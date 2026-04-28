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
import type { AuthorizedAdminActor as AdminActor } from './admin-auth';
import { recordAuditEvent } from '@/lib/services/audit';

export type WithAdminApiContext<TBody> = {
  actor: AdminActor;
  body: TBody;
  request: Request;
  ipAddress: string | null;
  requestId: string;
};

export type WithAdminApiOptions<TSchema extends ZodTypeAny | undefined> = {
  bodySchema?: TSchema;
  allowBasic?: boolean;
  requireActiveSeat?: boolean;
  auditAction?: string;
  auditEntityType?: string;
  auditEntityIdFromBody?: (body: TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined) => string | null;
  handler: (
    context: WithAdminApiContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined>
  ) => Promise<Response>;
};

function readRequestId(request: Request): string {
  const inbound = request.headers.get('x-request-id')?.trim();
  if (inbound && /^[a-zA-Z0-9._-]{8,128}$/.test(inbound)) return inbound;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function withAdminApi<TSchema extends ZodTypeAny | undefined>(
  options: WithAdminApiOptions<TSchema>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
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
      const context: WithAdminApiContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined> = {
        actor,
        body: body as TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined,
        request,
        ipAddress,
        requestId
      };

      try {
        const response = await options.handler(context);
        if (options.auditAction && options.auditEntityType) {
          const entityId = options.auditEntityIdFromBody
            ? options.auditEntityIdFromBody(context.body)
            : null;
          await recordAuditEvent({
            actorIdentifier: actor.identifier,
            actorRole: actor.role,
            action: options.auditAction,
            entityType: options.auditEntityType,
            entityId,
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
          const entityId = options.auditEntityIdFromBody
            ? options.auditEntityIdFromBody(context.body)
            : null;
          await recordAuditEvent({
            actorIdentifier: actor.identifier,
            actorRole: actor.role,
            action: options.auditAction,
            entityType: options.auditEntityType,
            entityId,
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
