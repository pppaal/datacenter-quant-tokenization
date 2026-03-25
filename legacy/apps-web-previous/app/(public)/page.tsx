import { SiteHeader } from '@/components/layout/site-header';
import { Card } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="space-y-6">
        <p className="text-sm text-blue-300">Institutional Deal Review Platform</p>
        <h1 className="text-4xl font-semibold">Korea Data Center Deal Review Platform</h1>
        <p className="max-w-3xl text-slate-300">
          본 서비스는 B2B/전문투자자/자산운용사/브로커/시행사 대상의 데이터센터 딜 검토·소개 플랫폼입니다.
          토큰/코인 발행 기능이나 대중 대상 투자 모집 UX를 제공하지 않습니다.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><h3 className="font-semibold">Deal Sourcing</h3><p className="text-sm text-slate-300">구조화된 자산 정보 기반 검토</p></Card>
          <Card><h3 className="font-semibold">Data Room</h3><p className="text-sm text-slate-300">문서 업로드 및 권한 관리</p></Card>
          <Card><h3 className="font-semibold">AI Review Memo</h3><p className="text-sm text-slate-300">투자판단 자동화가 아닌 검토 보조 요약</p></Card>
        </div>
      </main>
    </>
  );
}
