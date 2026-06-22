import Link from 'next/link';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DealReport } from '@/lib/services/reports';

function actionClassName(variant: 'secondary' | 'ghost' = 'secondary') {
  return cn(
    'inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold tracking-[-0.01em] transition duration-200',
    variant === 'secondary' &&
      'border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] text-[hsl(var(--foreground))] hover:-translate-y-0.5 hover:border-accent/40 hover:bg-[hsl(var(--surface-hover))]',
    variant === 'ghost' &&
      'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--foreground))]'
  );
}

export function ReportExportBar({
  assetId,
  kind,
  report
}: {
  assetId: string;
  kind: DealReport['kind'];
  report: DealReport;
}) {
  return (
    <div className="print-hidden flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{report.audienceLabel}</Badge>
        <div className="fine-print">Version {report.versionLabel}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <PrintImButton />
        <a href={`/api/assets/${assetId}/reports/${kind}?format=md`} className={actionClassName()}>
          Download Markdown
        </a>
        <a
          href={`/api/assets/${assetId}/reports/${kind}?format=json`}
          className={actionClassName()}
        >
          Export JSON
        </a>
        <Link href={`/admin/assets/${assetId}/reports`} className={actionClassName('ghost')}>
          All Outputs
        </Link>
        <Link href={`/admin/assets/${assetId}`} className={actionClassName('ghost')}>
          Back To Asset
        </Link>
      </div>
    </div>
  );
}
