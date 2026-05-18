import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-static';

type ChangeKind = 'feature' | 'quant' | 'security' | 'infra' | 'fix';

const kindStyles: Record<ChangeKind, { label: string; tone?: 'good' | 'warn' | 'danger' }> = {
  feature: { label: '기능', tone: 'good' },
  quant: { label: 'Quant', tone: 'good' },
  security: { label: '보안', tone: 'warn' },
  infra: { label: '인프라' },
  fix: { label: '수정' }
};

const entries: Array<{
  date: string;
  kinds: ChangeKind[];
  title: string;
  bullets: string[];
}> = [
  {
    date: '2026-05-18',
    kinds: ['quant', 'feature'],
    title: 'IM 36섹션에 quant 코어 3종 surfacing',
    bullets: [
      'Underwriting Assumptions에 캡레이트 6요소 분해 카드 추가',
      'Comparable Transactions에 헤도닉 OLS 적합값 + R² · 잔차 SE 노출',
      'Outcomes & Pipeline 뒤에 5년 단계별 확률가중 공급-수요 표 추가',
      '데이터 부족 시 모든 카드는 자동 숨김 (조건부 렌더)'
    ]
  },
  {
    date: '2026-05-18',
    kinds: ['quant'],
    title: '리서치 데스크 quant 코어 모듈 추가',
    bullets: [
      '헤도닉 회귀 (`lib/services/research/hedonic.ts`) + 9개 단위테스트',
      '캡레이트 분해 + 서브마켓 spread 베이지안 shrinkage + 9개 테스트',
      '단계별 확률가중 supply-demand 모델 + 8개 테스트',
      '모든 모듈 pure function — DB · IO 의존 없음, 단위테스트로 검증'
    ]
  },
  {
    date: '2026-05-18',
    kinds: ['security', 'infra'],
    title: '@sentry/nextjs 통합 + observability 강화',
    bullets: [
      'Sentry 10.53.1 추가, instrumentation.ts로 Node / Edge 런타임 자동 분기',
      'reportError() 어댑터 — DSN 있으면 Sentry, 없으면 webhook, 둘 다 있으면 둘 다 전송',
      'next.config.ts에 withSentryConfig 조건부 래핑 (소스맵 업로드 토큰 3종 모두 있을 때만)',
      'SENTRY_* 환경변수 7종 env.ts 스키마 등록'
    ]
  },
  {
    date: '2026-04-28',
    kinds: ['infra'],
    title: '레거시 데모 앱 archive · 단일 apps/web으로 정리',
    bullets: [
      '이전 데모 앱은 git tag `legacy-archive-2026-04-28`로 스냅샷',
      'apps/web가 단일 active 제품으로 확정',
      '모노레포 구조: apps/web + packages/contracts 두 워크스페이스만 유지'
    ]
  },
  {
    date: '2026-04-28',
    kinds: ['infra', 'fix'],
    title: '스키마 드리프트 reconcile 마이그레이션',
    bullets: [
      '`20260428080000_reconcile_schema_drift` — IF NOT EXISTS · IF EXISTS 가드 모델 정립',
      '기 배포 마이그레이션 수정 금지 정책 확립',
      'CI에 `prisma migrate diff --exit-code` 게이트 추가'
    ]
  },
  {
    date: '2026-04-20',
    kinds: ['security'],
    title: 'Edge 보호 레이어 + 분산 rate limit',
    bullets: [
      'lib/security/edge-protection.ts — IP allowlist + 경로별 rate limit',
      'lib/security/distributed-rate-limit.ts — Upstash Redis REST 통합 (옵션)',
      'ADMIN_IP_ALLOWLIST · OPS_IP_ALLOWLIST 환경변수로 운영자 직접 통제'
    ]
  },
  {
    date: '2026-04-10',
    kinds: ['feature'],
    title: 'withAdminApi 단일 헬퍼로 admin 라우트 통일',
    bullets: [
      'auth + 역할 게이트 + zod 검증 + request-id 전파 + 감사 로그 자동',
      '기존 admin API 라우트 30+ 전면 마이그레이션',
      '우회 경로 0 — 보안 게이트 누락 가능성 코드 수준에서 차단'
    ]
  }
];

export default function ChangelogPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">릴리스 노트</Badge>
            <Badge>월간 업데이트</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            제품은 매주 자랍니다.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            기관 운용사에게 OS는 곧 일정과 운영 안정성입니다. 새 기능, quant 모듈, 보안
            업데이트, 인프라 변경을 일자별로 공개합니다.
          </p>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="space-y-5">
          {entries.map((e, i) => (
            <Card key={`${e.date}-${i}`} className="flex flex-col gap-4 lg:flex-row">
              <div className="lg:w-48 lg:flex-none">
                <div className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">
                  {e.date}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.kinds.map((k) => {
                    const s = kindStyles[k];
                    return (
                      <Badge key={k} tone={s.tone}>
                        {s.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white">{e.title}</h3>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
                  {e.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-2 inline-block h-1 w-1 flex-none rounded-full bg-accent" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="eyebrow">월간 노트 받아보기</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
                매월 1일 운용사 단위 운영자에게 발송됩니다.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                보안 패치 · 신규 quant 모듈 · 인프라 변경을 정리한 월간 노트입니다.
              </p>
            </div>
            <Link href="/contact">
              <Button>구독 요청</Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
