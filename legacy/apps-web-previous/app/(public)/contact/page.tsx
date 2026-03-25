import { SiteHeader } from '@/components/layout/site-header';

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="space-y-3">
        <h1 className="text-2xl font-semibold">Contact</h1>
        <p className="text-slate-300">사업 제휴/딜 제안: deals@kdc-review.com</p>
        <p className="text-sm text-slate-400">본 플랫폼은 투자권유/판매 플랫폼이 아닌 B2B 딜 검토·소개 목적입니다.</p>
      </main>
    </>
  );
}
