import { SiteHeader } from '@/components/layout/site-header';
import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { InquiryForm } from '@/components/inquiries/inquiry-form';

export default async function AssetDetailPage({ params }: { params: { slug: string } }) {
  const asset = await prisma.asset.findUnique({ where: { slug: params.slug }, include: { documents: true } });
  if (!asset || !asset.isPublished) return notFound();

  return (
    <>
      <SiteHeader />
      <main className="space-y-5">
        <h1 className="text-3xl font-semibold">{asset.name}</h1>
        <p className="text-sm text-slate-400">
          {asset.isSample ? 'DEMO/SAMPLE 데이터' : '검토 대상 자산'} · {asset.country}/{asset.city} · {asset.assetType}
        </p>

        <Card>
          <h3 className="mb-2 font-semibold">Deal Summary</h3>
          <p className="text-slate-300">{asset.summary}</p>
          <p className="mt-2 text-sm text-slate-400">{asset.description}</p>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Key Metrics</h3>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <p>Power Capacity: {asset.powerCapacityMw} MW</p>
            <p>Land Area: {asset.landArea.toLocaleString()} ㎡</p>
            <p>Gross Floor Area: {asset.grossFloorArea.toLocaleString()} ㎡</p>
            <p>Expected IRR (reference): {asset.expectedIrr}%</p>
            <p>Target Equity: {asset.targetEquity.toLocaleString()}</p>
            <p>Tenant: {asset.tenantStatus}</p>
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Risk Notes</h3>
          <p className="text-sm text-slate-300">{asset.riskNotes}</p>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Data Room (public)</h3>
          <ul className="list-disc pl-4 text-sm text-slate-300">
            {asset.documents.filter((d) => d.visibility === 'public').map((d) => (
              <li key={d.id}><a href={d.fileUrl} className="text-blue-300">{d.title}</a></li>
            ))}
            {asset.documents.filter((d) => d.visibility === 'public').length === 0 && <li>공개 문서 없음</li>}
          </ul>
        </Card>

        <InquiryForm assetId={asset.id} />
        <p className="text-xs text-slate-500">본 정보는 투자 권유/확정 수익 제안이 아닌 딜 검토 목적의 참고 자료입니다.</p>
      </main>
    </>
  );
}
