import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { recordAuditEvent } from '@/lib/services/audit';
import { runResearchAgent } from '@/lib/services/research/research-agent';
import {
  combineToolsets,
  createDatabaseToolset,
  createHttpToolset
} from '@/lib/services/research/research-tools';
import { auditCitations } from '@/lib/services/research/citations';

type AgentRequestBody = {
  question?: unknown;
  submarketLabel?: unknown;
  asOf?: unknown;
  maxToolCalls?: unknown;
};

function parseBody(body: AgentRequestBody | null):
  | { question: string; submarketLabel: string | null; asOf: Date; maxToolCalls: number | undefined }
  | { error: string } {
  if (!body || typeof body.question !== 'string' || body.question.trim().length === 0) {
    return { error: 'question is required.' };
  }
  const question = body.question.trim().slice(0, 1000);
  const submarketLabel =
    typeof body.submarketLabel === 'string' && body.submarketLabel.trim().length > 0
      ? body.submarketLabel.trim().slice(0, 200)
      : null;
  const asOf =
    typeof body.asOf === 'string' && body.asOf.trim().length > 0
      ? new Date(body.asOf)
      : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return { error: 'asOf must be a valid ISO date string.' };
  }
  const maxToolCalls =
    typeof body.maxToolCalls === 'number' && Number.isFinite(body.maxToolCalls) && body.maxToolCalls > 0
      ? Math.min(Math.floor(body.maxToolCalls), 12)
      : undefined;
  return { question, submarketLabel, asOf, maxToolCalls };
}

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Analyst access required.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as AgentRequestBody | null;
  const parsed = parseBody(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const toolset = combineToolsets(createDatabaseToolset(prisma), createHttpToolset());
    const report = await runResearchAgent(
      {
        question: parsed.question,
        submarketLabel: parsed.submarketLabel,
        asOf: parsed.asOf,
        maxToolCalls: parsed.maxToolCalls
      },
      toolset
    );

    const audit = auditCitations(report);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.agent.run',
      entityType: 'ResearchAgentRun',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        question: parsed.question.slice(0, 200),
        submarketLabel: parsed.submarketLabel,
        generatedBy: report.generatedBy,
        sourceCount: report.sources.length,
        claimCount: report.claims.length,
        toolCallCount: report.toolCalls.length,
        citationOk: audit.ok,
        errorIssueCount: audit.issues.filter((i) => i.severity === 'ERROR').length
      }
    });

    return NextResponse.json({ report, audit });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.agent.run',
      entityType: 'ResearchAgentRun',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Research agent failed'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Research agent failed' },
      { status: 500 }
    );
  }
}
