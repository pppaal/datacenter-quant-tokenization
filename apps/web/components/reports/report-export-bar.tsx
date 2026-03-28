import Link from 'next/link';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DealReport } from '@/lib/services/reports';

function actionClassName(variant: 'secondary' | 'ghost' = 'secondary') {
  return cn(
    'inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold tracking-[-0.01em] transition duration-200',
    variant === 'secondary' &&
      'border border-white/12 bg-white/[0.04] text-slate-100 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]',
    variant === 'ghost' && 'text-slate-300 hover:bg-white/5 hover:text-white'
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
    <div className="print-hidden flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={report.status === 'production-ready' ? 'good' : 'warn'}>{report.statusLabel}</Badge>
        <Badge>{report.audienceLabel}</Badge>
        <div className="fine-print">Version {report.versionLabel}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <PrintImButton />
        <a href={`/api/assets/${assetId}/reports/${kind}?format=md`} className={actionClassName()}>
          Download Markdown
        </a>
        <a href={`/api/assets/${assetId}/reports/${kind}?format=json`} className={actionClassName()}>
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
