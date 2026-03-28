import { ReportDdChecklistSheet } from '@/components/reports/report-dd-checklist-sheet';
import { ReportIcMemoSheet } from '@/components/reports/report-ic-memo-sheet';
import { ReportRiskMemoSheet } from '@/components/reports/report-risk-memo-sheet';
import { ReportTeaserSheet } from '@/components/reports/report-teaser-sheet';
import type { DealReport } from '@/lib/services/reports';

type Props = {
  assetName: string;
  assetCode: string;
  locationLabel: string;
  report: DealReport;
};

export function ReportRenderer(props: Props) {
  switch (props.report.kind) {
    case 'teaser':
      return <ReportTeaserSheet {...props} />;
    case 'ic-memo':
      return <ReportIcMemoSheet {...props} />;
    case 'dd-checklist':
      return <ReportDdChecklistSheet {...props} />;
    case 'risk-memo':
      return <ReportRiskMemoSheet {...props} />;
    default:
      return null;
  }
}
