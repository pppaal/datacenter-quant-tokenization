import {
  buildDealReportPacket,
  getAssetReportBundle,
  isReportPacketAudience,
  serializeReportPacketToMarkdown
} from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

function buildHeaders(fileName: string, contentType: string) {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${fileName}"`
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; audience: string }> }
) {
  const { id, audience } = await params;
  if (!isReportPacketAudience(audience)) {
    return Response.json({ error: 'Unsupported report packet audience' }, { status: 404 });
  }

  const bundle = await getAssetReportBundle(id);
  if (!bundle) {
    return Response.json({ error: 'Asset not found' }, { status: 404 });
  }

  const packet = buildDealReportPacket(bundle, audience);
  const searchParams = new URL(request.url).searchParams;
  const format = searchParams.get('format')?.toLowerCase() ?? 'md';

  if (format === 'json') {
    return new Response(JSON.stringify(packet, null, 2), {
      status: 200,
      headers: buildHeaders(`${packet.exportFileBase}.json`, 'application/json; charset=utf-8')
    });
  }

  const markdown = serializeReportPacketToMarkdown(packet);
  return new Response(markdown, {
    status: 200,
    headers: buildHeaders(`${packet.exportFileBase}.md`, 'text/markdown; charset=utf-8')
  });
}
