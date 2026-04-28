import {
  buildDealReport,
  getAssetReportBundle,
  isReportKind,
  serializeReportToMarkdown
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
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const { id, kind } = await params;
  if (!isReportKind(kind)) {
    return Response.json({ error: 'Unsupported report kind' }, { status: 404 });
  }

  const bundle = await getAssetReportBundle(id);
  if (!bundle) {
    return Response.json({ error: 'Asset not found' }, { status: 404 });
  }

  const report = buildDealReport(bundle, kind);
  const searchParams = new URL(request.url).searchParams;
  const format = searchParams.get('format')?.toLowerCase() ?? 'md';

  if (format === 'json') {
    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: buildHeaders(`${report.exportFileBase}.json`, 'application/json; charset=utf-8')
    });
  }

  const markdown = serializeReportToMarkdown(report);
  return new Response(markdown, {
    status: 200,
    headers: buildHeaders(`${report.exportFileBase}.md`, 'text/markdown; charset=utf-8')
  });
}
