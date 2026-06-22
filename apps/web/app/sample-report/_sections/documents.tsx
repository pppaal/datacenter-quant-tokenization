import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FreshnessDot } from './helpers';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function DocumentsSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!(asset.documents && asset.documents.length > 0)) {
    return null;
  }
  return (
    <section id="im-documents" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Document evidence</div>
          <Badge>
            {asset.documents.length} doc{asset.documents.length === 1 ? '' : 's'}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
          Source documents on file. Each version anchors specific evidence — lease schedule, power
          study, IC model, lender term sheet — and links through to the original filing.
        </p>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-2 py-2 font-semibold">Title</th>
                <th className="px-2 py-2 font-semibold">Type</th>
                <th className="px-2 py-2 text-right font-semibold">Version</th>
                <th className="px-2 py-2 text-right font-semibold">Updated</th>
                <th className="px-2 py-2 text-right font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              {asset.documents.slice(0, 12).map((doc) => (
                <tr key={doc.id}>
                  <td className="px-2 py-2">
                    <div className="text-[hsl(var(--foreground))]">{doc.title}</div>
                    {doc.aiSummary ? (
                      <div className="text-[10px] leading-4 text-[hsl(var(--muted))]">
                        {doc.aiSummary.length > 120
                          ? `${doc.aiSummary.slice(0, 120)}…`
                          : doc.aiSummary}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-[hsl(var(--foreground-muted))]">
                    {doc.documentType.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">v{doc.currentVersion}</td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-[hsl(var(--foreground-muted))]">
                        {formatDate(doc.updatedAt)}
                      </span>
                      <FreshnessDot observedAt={doc.updatedAt} />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-[10px]">
                    {doc.sourceLink ? (
                      <a
                        href={doc.sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:underline"
                      >
                        link ↗
                      </a>
                    ) : (
                      <span className="text-[hsl(var(--muted))]">stored</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
