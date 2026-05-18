import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <main className="pb-24">
      <SiteNav />
      <section className="app-shell py-16">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="warn">404</Badge>
            <Badge>페이지를 찾을 수 없음</Badge>
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            해당 페이지가
            <br />
            존재하지 않습니다.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            요청하신 경로는 이동되었거나 삭제되었습니다. 아래에서 자주 찾는 페이지로 이동하실
            수 있습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/">
              <Button>홈으로</Button>
            </Link>
            <Link href="/sample-report">
              <Button variant="ghost">샘플 IM</Button>
            </Link>
            <Link href="/product">
              <Button variant="ghost">제품 개요</Button>
            </Link>
            <Link href="/contact">
              <Button variant="ghost">데모 요청</Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
