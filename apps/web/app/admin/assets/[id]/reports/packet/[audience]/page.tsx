import { notFound } from 'next/navigation';
import { ReportExportCover } from '@/components/reports/report-export-cover';
import { ReportRenderer } from '@/components/reports/report-renderer';
import {
  buildDealReportPacket,
  getAssetReportBundle,
  isReportPacketAudience
} from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

export default async function AssetReportPacketPage({
  params
}: {
  params: Promise<{ id: string; audience: string }>;
}) {
  const { id, audience } = await params;
  if (!isReportPacketAudience(audience)) notFound();

  const bundle = await getAssetReportBundle(id);
  if (!bundle) notFound();

  const packet = buildDealReportPacket(bundle, audience);

  return (
    <div className="space-y-8">
      {packet.reports.map((report) => (
        <div key={report.kind} className="space-y-6">
          <ReportExportCover
            assetName={bundle.assetName}
            assetCode={bundle.assetCode}
            locationLabel={bundle.locationLabel}
            report={report}
          />
          <ReportRenderer
            assetName={bundle.assetName}
            assetCode={bundle.assetCode}
            locationLabel={bundle.locationLabel}
            report={report}
          />
        </div>
      ))}
    </div>
  );
}
