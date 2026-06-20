import type { Metadata } from 'next';
import { InquiryForm } from '@/components/marketing/inquiry-form';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '데모 · 문의',
  description:
    '30분 라이브 데모. 영업일 24시간 내 회신. 영업 · 보안 · 기술 · 본사 채널 안내, NDA 전/후 자료 가이드.'
};

const channels = [
  {
    label: '데모 · 영업',
    detail: '30분 라이브 데모. 영업일 24시간 내 회신.',
    contact: 'rheeco88@gmail.com',
    note: '한국어 / 영어 모두 가능'
  },
  {
    label: '보안 · 컴플라이언스',
    detail:
      'NDA 후 보안 자료 패키지 송부. 위협 모델 · 보안 통제 요약 포함 (펜테스트 결과는 로드맵).',
    contact: 'rheeco88@gmail.com',
    note: 'PGP 키 요청 가능'
  },
  {
    label: '기술 · API',
    detail: '엔터프라이즈 통합 · 데이터 마이그레이션 · SSO 설정 문의.',
    contact: 'rheeco88@gmail.com',
    note: '솔루션 엔지니어 직접 응대'
  },
  {
    label: '본사',
    detail: '서울 강남구 (디테일은 미팅 확정 시 안내).',
    contact: '대면 미팅은 NDA 후 일정 조율',
    note: '영업일 09:00 — 18:00 KST'
  }
];

const beforeAfter = [
  {
    label: 'NDA 전',
    items: [
      '제품 개요 (/product)',
      '리서치 데스크 quant 소개 (/research)',
      '보안 · 컴플라이언스 개요 (/security)',
      '샘플 IM 36섹션 (/sample-report)',
      '가격 플랜 (/pricing)'
    ]
  },
  {
    label: 'NDA 후',
    items: [
      '아키텍처 다이어그램',
      '위협 모델 + 보안 통제 요약',
      '운용사별 IM 템플릿 데모',
      '환경변수 · 인프라 분리 정책',
      '엔터프라이즈 SLA · 페이저 정책'
    ]
  }
];

export default function ContactPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">데모 · 문의</Badge>
            <Badge>영업일 24h 회신</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            30분이면 충분합니다.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            샘플 IM 한 번 보시고, 운용사 데이터 일부 가져오시면 라이브로 IM 자동 생성을 시연해
            드립니다. 의사결정 전에 보안 자료 · 가격 협의도 동시에 진행 가능합니다.
          </p>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card className="min-h-[460px]">
            <div className="eyebrow">데모 요청</div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              운용본부 · AUM · 자산군 · 현재 도구를 적어주시면 30분 안에 무엇을 시연할지 미리 준비해
              미팅을 잡습니다.
            </p>
            <div className="mt-6">
              <InquiryForm />
            </div>
          </Card>

          <div className="space-y-4">
            {channels.map((c) => (
              <Card key={c.label} className="min-h-[130px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="fine-print">{c.label}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{c.detail}</p>
                  </div>
                  <Badge>{c.note}</Badge>
                </div>
                <div className="mt-3 font-mono text-xs text-accent">{c.contact}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">자료 안내</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            NDA 전 · 후 공유 자료.
          </h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {beforeAfter.map((s) => (
            <Card key={s.label}>
              <div className="fine-print">{s.label}</div>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
                {s.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 inline-block h-1 w-1 flex-none rounded-full bg-accent" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
