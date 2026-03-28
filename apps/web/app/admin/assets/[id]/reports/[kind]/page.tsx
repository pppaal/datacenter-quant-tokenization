import { notFound } from 'next/navigation';
import { ReportDdChecklistSheet } from '@/components/reports/report-dd-checklist-sheet';
import { ReportExportCover } from '@/components/reports/report-export-cover';
import { ReportExportBar } from '@/components/reports/report-export-bar';
import { ReportIcMemoSheet } from '@/components/reports/report-ic-memo-sheet';
import { ReportRiskMemoSheet } from '@/components/reports/report-risk-memo-sheet';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportTeaserSheet } from '@/components/reports/report-teaser-sheet';
import { buildDealReport, getAssetReportBundle, isReportKind } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

export default async function AssetReportDetailPage({
  params
}: {
  params: Promise<{ id: string; kind: string }>;
}) {
  const { id, kind } = await params;
  if (!isReportKind(kind)) notFound();

  const bundle = await getAssetReportBundle(id);
  if (!bundle) notFound();

  const report = buildDealReport(bundle, kind);

  return (
    <div className="space-y-6">
      <ReportExportBar assetId={bundle.assetId} kind={kind} report={report} />
      <ReportExportCover
        assetName={bundle.assetName}
        assetCode={bundle.assetCode}
        locationLabel={bundle.locationLabel}
        report={report}
      />
      {kind === 'teaser' ? (
        <ReportTeaserSheet
          assetName={bundle.assetName}
          assetCode={bundle.assetCode}
          locationLabel={bundle.locationLabel}
          report={report}
        />
      ) : kind === 'ic-memo' ? (
        <ReportIcMemoSheet
          assetName={bundle.assetName}
          assetCode={bundle.assetCode}
          locationLabel={bundle.locationLabel}
          report={report}
        />
      ) : kind === 'risk-memo' ? (
        <ReportRiskMemoSheet
          assetName={bundle.assetName}
          assetCode={bundle.assetCode}
          locationLabel={bundle.locationLabel}
          report={report}
        />
      ) : kind === 'dd-checklist' ? (
        <ReportDdChecklistSheet
          assetName={bundle.assetName}
          assetCode={bundle.assetCode}
          locationLabel={bundle.locationLabel}
          report={report}
        />
      ) : (
        <ReportShell
          assetName={bundle.assetName}
          assetCode={bundle.assetCode}
          locationLabel={bundle.locationLabel}
          report={report}
        />
      )}
    </div>
  );
}
