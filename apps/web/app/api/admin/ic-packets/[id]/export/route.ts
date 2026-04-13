import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { committeePacketInclude } from '@/lib/services/ic';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';

export const dynamic = 'force-dynamic';

function csvEscape(value: string | number | null | undefined | Date) {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return '';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function buildPacketCsv(packet: Awaited<ReturnType<typeof loadPacket>>): string {
  if (!packet) return '';
  const rows: string[] = [];
  rows.push(['Field', 'Value'].map(csvEscape).join(','));
  rows.push(['Packet Code', packet.packetCode].map(csvEscape).join(','));
  rows.push(['Title', packet.title].map(csvEscape).join(','));
  rows.push(['Status', packet.status].map(csvEscape).join(','));
  rows.push(['Prepared By', packet.preparedByLabel ?? ''].map(csvEscape).join(','));
  rows.push(['Scheduled For', packet.scheduledFor ?? ''].map(csvEscape).join(','));
  rows.push(['Locked At', packet.lockedAt ?? ''].map(csvEscape).join(','));
  rows.push(['Released At', packet.releasedAt ?? ''].map(csvEscape).join(','));
  rows.push(['Created At', packet.createdAt].map(csvEscape).join(','));
  rows.push(['Updated At', packet.updatedAt].map(csvEscape).join(','));
  rows.push(['Decision Summary', packet.decisionSummary ?? ''].map(csvEscape).join(','));
  rows.push(['Follow-up Summary', packet.followUpSummary ?? ''].map(csvEscape).join(','));
  rows.push(['Deal Code', packet.deal?.dealCode ?? ''].map(csvEscape).join(','));
  rows.push(['Deal Title', packet.deal?.title ?? ''].map(csvEscape).join(','));
  rows.push(['Deal Stage', packet.deal?.stage ?? ''].map(csvEscape).join(','));
  rows.push(['Deal Target Close', packet.deal?.targetCloseDate ?? ''].map(csvEscape).join(','));
  rows.push(['Asset Code', packet.asset?.assetCode ?? ''].map(csvEscape).join(','));
  rows.push(['Asset Name', packet.asset?.name ?? ''].map(csvEscape).join(','));
  rows.push(['Asset Class', packet.asset?.assetClass ?? ''].map(csvEscape).join(','));
  rows.push(['Asset Status', packet.asset?.status ?? ''].map(csvEscape).join(','));
  rows.push(['Valuation Run', packet.valuationRun?.runLabel ?? ''].map(csvEscape).join(','));
  rows.push(['Valuation Approval', packet.valuationRun?.approvalStatus ?? ''].map(csvEscape).join(','));
  rows.push(
    [
      'Valuation Confidence',
      packet.valuationRun?.confidenceScore != null ? String(packet.valuationRun.confidenceScore) : ''
    ]
      .map(csvEscape)
      .join(',')
  );
  rows.push('');
  rows.push(
    ['Decision Outcome', 'Decided At', 'Decided By', 'Notes', 'Follow-up Actions']
      .map(csvEscape)
      .join(',')
  );
  if (packet.decisions.length === 0) {
    rows.push(['(no decisions recorded)', '', '', '', ''].map(csvEscape).join(','));
  } else {
    for (const decision of packet.decisions) {
      rows.push(
        [
          decision.outcome,
          decision.decidedAt,
          decision.decidedByLabel ?? '',
          decision.notes ?? '',
          decision.followUpActions ?? ''
        ]
          .map(csvEscape)
          .join(',')
      );
    }
  }
  return rows.join('\r\n');
}

function buildPacketHtml(packet: NonNullable<Awaited<ReturnType<typeof loadPacket>>>): string {
  const latestDecision = packet.decisions[0] ?? null;
  const decisionRows = packet.decisions
    .map(
      (decision) => `
      <tr>
        <td>${escapeHtml(decision.outcome)}</td>
        <td>${escapeHtml(formatDateTime(decision.decidedAt))}</td>
        <td>${escapeHtml(decision.decidedByLabel ?? '')}</td>
        <td>${escapeHtml(decision.notes ?? '')}</td>
        <td>${escapeHtml(decision.followUpActions ?? '')}</td>
      </tr>`
    )
    .join('\n');

  const metricsRows: Array<[string, string]> = [
    ['Packet Code', packet.packetCode],
    ['Title', packet.title],
    ['Status', packet.status],
    ['Prepared By', packet.preparedByLabel ?? '—'],
    ['Scheduled For', formatDateTime(packet.scheduledFor) || '—'],
    ['Locked At', formatDateTime(packet.lockedAt) || '—'],
    ['Released At', formatDateTime(packet.releasedAt) || '—'],
    ['Deal', packet.deal ? `${packet.deal.dealCode} — ${packet.deal.title}` : '—'],
    ['Deal Stage', packet.deal?.stage ?? '—'],
    ['Target Close', formatDateTime(packet.deal?.targetCloseDate ?? null) || '—'],
    ['Asset', packet.asset ? `${packet.asset.assetCode} — ${packet.asset.name}` : '—'],
    ['Asset Class', packet.asset?.assetClass ?? '—'],
    ['Asset Status', packet.asset?.status ?? '—'],
    ['Valuation Run', packet.valuationRun?.runLabel ?? '—'],
    ['Valuation Approval', packet.valuationRun?.approvalStatus ?? '—'],
    [
      'Valuation Confidence',
      packet.valuationRun?.confidenceScore != null
        ? `${(packet.valuationRun.confidenceScore * 100).toFixed(1)}%`
        : '—'
    ]
  ];

  const metricsHtml = metricsRows
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )
    .join('\n');

  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>IC Packet ${escapeHtml(packet.packetCode)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1f2b;
    background: #ffffff;
    font-size: 11pt;
    line-height: 1.55;
    padding: 32px;
  }
  header.memo-header {
    border-bottom: 2px solid #1a1f2b;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  header.memo-header .eyebrow {
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #4a5365;
  }
  header.memo-header h1 {
    font-size: 22pt;
    margin: 6px 0 8px 0;
    letter-spacing: -0.01em;
  }
  header.memo-header .subtitle {
    color: #4a5365;
    font-size: 11pt;
  }
  h2 {
    font-size: 14pt;
    margin: 24px 0 8px 0;
    border-bottom: 1px solid #d5dae3;
    padding-bottom: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 20px 0;
    font-size: 10.5pt;
  }
  th, td {
    border: 1px solid #d5dae3;
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  table.metrics th { background: #f5f6fa; width: 35%; font-weight: 600; }
  table.decisions th { background: #f5f6fa; font-weight: 600; }
  .decision-summary {
    background: #f8f9fc;
    border-left: 4px solid #1a1f2b;
    padding: 12px 16px;
    margin: 12px 0 20px 0;
  }
  .signature-block {
    margin-top: 48px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }
  .signature-block .sig {
    border-top: 1px solid #1a1f2b;
    padding-top: 6px;
    font-size: 10pt;
    color: #4a5365;
  }
  footer.memo-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #d5dae3;
    color: #6b7280;
    font-size: 9pt;
    font-style: italic;
  }
  @media print {
    body { padding: 0; }
    h2 { page-break-after: avoid; }
    .signature-block { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <header class="memo-header">
    <div class="eyebrow">Investment Committee Memo</div>
    <h1>${escapeHtml(packet.title)}</h1>
    <div class="subtitle">
      <strong>Packet:</strong> ${escapeHtml(packet.packetCode)} &nbsp;·&nbsp;
      <strong>Status:</strong> ${escapeHtml(packet.status)} &nbsp;·&nbsp;
      <strong>Deal:</strong> ${escapeHtml(packet.deal ? `${packet.deal.dealCode} — ${packet.deal.title}` : '—')}
    </div>
  </header>

  <section>
    <h2>Decision Summary</h2>
    <div class="decision-summary">
      <strong>Latest Outcome:</strong> ${escapeHtml(latestDecision ? latestDecision.outcome : 'Pending')}<br />
      <strong>Decided:</strong> ${escapeHtml(latestDecision ? formatDateTime(latestDecision.decidedAt) : '—')}<br />
      <strong>By:</strong> ${escapeHtml(latestDecision?.decidedByLabel ?? '—')}<br />
      <strong>Summary:</strong> ${escapeHtml(packet.decisionSummary ?? latestDecision?.notes ?? 'No decision recorded yet.')}<br />
      <strong>Follow-ups:</strong> ${escapeHtml(packet.followUpSummary ?? latestDecision?.followUpActions ?? '—')}
    </div>
  </section>

  <section>
    <h2>Key Metrics</h2>
    <table class="metrics">
      <tbody>
${metricsHtml}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Decision History</h2>
    <table class="decisions">
      <thead>
        <tr>
          <th>Outcome</th>
          <th>Decided At</th>
          <th>Decided By</th>
          <th>Notes</th>
          <th>Follow-up</th>
        </tr>
      </thead>
      <tbody>
        ${
          packet.decisions.length > 0
            ? decisionRows
            : '<tr><td colspan="5"><em>No decisions have been recorded for this packet.</em></td></tr>'
        }
      </tbody>
    </table>
  </section>

  <section class="signature-block">
    <div class="sig">
      Committee Chair<br />
      <em>Signature / Date</em>
    </div>
    <div class="sig">
      Prepared By: ${escapeHtml(packet.preparedByLabel ?? '—')}<br />
      <em>Signature / Date</em>
    </div>
  </section>

  <footer class="memo-footer">
    IC packet exported from Investment Firm OS on ${escapeHtml(generatedAt)}.
  </footer>
</body>
</html>`;
}

async function loadPacket(id: string) {
  return prisma.investmentCommitteePacket.findUnique({
    where: { id },
    include: committeePacketInclude
  });
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Operator session required.' }, { status: 401 });
  }

  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get('format')?.toLowerCase() ?? 'html';

  try {
    const packet = await loadPacket(id);

    if (!packet) {
      return NextResponse.json({ error: 'Committee packet not found.' }, { status: 404 });
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.packet.export',
      entityType: 'committee_packet',
      entityId: packet.id,
      assetId: packet.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        packetCode: packet.packetCode,
        format
      }
    });

    const safeCode = packet.packetCode.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const fileBase = `ic-packet-${safeCode}`;

    if (format === 'csv') {
      return new Response(buildPacketCsv(packet), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileBase}.csv"`
        }
      });
    }

    return new Response(buildPacketHtml(packet), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${fileBase}.html"`
      }
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.packet.export',
      entityType: 'committee_packet',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to export committee packet',
        format
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export committee packet' },
      { status: 400 }
    );
  }
}
