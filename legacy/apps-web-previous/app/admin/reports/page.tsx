import { prisma } from '@/lib/db/prisma';
import { AdminNav } from '@/components/admin/admin-nav';
import { ReportGenerateForm } from '@/components/admin/report-generate-form';

export default async function AdminReportsPage() {
  const assets = await prisma.asset.findMany({ select: { id: true, name: true } });
  return (
    <main>
      <h1 className="text-2xl font-semibold">AI Report Generation</h1>
      <AdminNav />
      <p className="mb-3 text-sm text-slate-400">AI는 검토 보조/요약 보조 역할이며 투자 확정 판단을 제공하지 않습니다. NASA+변수 기반 가치추정도 보조 추정치입니다.</p>
      <ReportGenerateForm assets={assets} />
    </main>
  );
}
