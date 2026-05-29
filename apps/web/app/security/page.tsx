import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '보안 · 컴플라이언스',
  description:
    '인증 · RBAC · Edge 보호 · 관측 · 문서 무결성 · 블록체인 6개 방어 계층. PIPA · 자본시장법 · SOC2 · GDPR 대응 데이터 거버넌스.'
};

const layers = [
  {
    title: '인증 · 세션',
    detail:
      'HMAC 서명 세션 쿠키 (ADMIN_SESSION_SECRET). 모든 admin 경로는 단일 게이트 (middleware.ts)를 통과합니다. 세션은 IP 바인딩 가능하며, 만료는 환경변수로 제어됩니다.',
    primitives: ['HMAC 쿠키 서명', 'IP 바인딩 옵션', '단일 미들웨어 게이트']
  },
  {
    title: 'RBAC · 감사',
    detail:
      '모든 admin API는 withAdminApi() 헬퍼로 감싸여 — operator-session 해결, 역할 게이트, zod 검증, request-id 전파, 감사 로그가 한 번에 처리됩니다. 우회 경로 없음.',
    primitives: ['단일 헬퍼 통한 통일', '감사 로그 자동 생성', 'zod 입력 검증']
  },
  {
    title: 'Edge 보호',
    detail:
      'IP allowlist + 경로별 rate limit이 미들웨어에서 적용됩니다. ADMIN_IP_ALLOWLIST · OPS_IP_ALLOWLIST · *_RATE_* 환경변수로 운영자가 직접 통제하고, Upstash Redis 분산 rate limit도 옵션으로 끼울 수 있습니다.',
    primitives: ['IP 화이트리스트', '경로별 rate limit', '분산 Redis rate limit']
  },
  {
    title: '관측 · 알람',
    detail:
      '구조화된 JSON 로그 + request-id 전파 + Sentry 통합. 운영 이벤트는 OPS_ALERT_* 웹훅으로 페이저까지 도달하고, 30분 dedup 윈도우로 중복 알람을 차단합니다.',
    primitives: ['Sentry 통합', '구조화 JSON 로그', '운영 알람 dedup']
  },
  {
    title: '문서 무결성',
    detail:
      '업로드된 모든 문서는 SHA-256 해시가 저장되며, 옵션으로 블록체인 레지스트리에 앵커링됩니다. 사후 조작 시도가 해시 미스매치로 즉시 드러납니다.',
    primitives: ['SHA-256 해시', '레지스트리 앵커', 'S3 호환 스토리지']
  },
  {
    title: '블록체인 (Registry-Only)',
    detail:
      '문서 해시 · 레지스트리 식별자 · 패킷 메타데이터만 온체인에 앵커됩니다. 증거 · 평가 · 워크플로 · 투자자 정보는 모두 오프체인. ERC-3643 스타일 게이트 (KYC) 토큰화 옵션은 별도 운영자 키로 통제합니다.',
    primitives: ['Registry-only 스코프', 'ERC-3643 토큰', '운영자 키 분리']
  }
];

const compliance = [
  {
    standard: '한국 개인정보보호법 (PIPA)',
    posture:
      '투자자 PII는 admin 콘솔 안에서만 접근 가능, RBAC 필터링 + 감사 로그 + 보존기간 자동 정리.'
  },
  {
    standard: '자본시장법 (집합투자업)',
    posture:
      '약정 · 캐피털콜 · 배당 · 분배 워크플로가 결정론적 재계산 가능. 감사 시 같은 입력으로 같은 출력 재현.'
  },
  {
    standard: 'SOC2 Type II (지향)',
    posture:
      '접근통제 · 변경관리 · 모니터링 · 사고대응 로그가 모두 코드 수준 헬퍼로 통합. 외부 감사 시 추가 도구 불필요.'
  },
  {
    standard: 'GDPR (역외 LP)',
    posture:
      'right-to-erasure 대응 가능 — 투자자 셸 삭제 시 연관 PII가 cascade로 정리되도록 스키마 설계.'
  }
];

const incidentPlay = [
  {
    step: '01',
    title: '탐지',
    detail: 'Sentry · 운영 웹훅 · 감사 로그 이상 패턴 자동 알림.'
  },
  {
    step: '02',
    title: '격리',
    detail: '문제 자격 증명 즉시 만료, 세션 회수, IP allowlist 일시 강화.'
  },
  {
    step: '03',
    title: '근본 원인',
    detail: 'request-id로 모든 로그 라인 추적. 감사 로그에서 actor · role · 입력 재구성.'
  },
  {
    step: '04',
    title: 'LP 통지',
    detail: '영향 자산 / 영향 LP 식별. 사고 보고서 IM 트레일에 첨부.'
  }
];

export default function SecurityPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">보안 · 컴플라이언스</Badge>
            <Badge>Production Hardened</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            기관투자가 수준의
            <br />
            보안 · 감사 · 무결성.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            Nexus Seoul은 단순한 부동산 SaaS가 아니라 운용사의 <strong>운영 시스템</strong>입니다.
            그래서 보안은 후행 옵션이 아니라 코드 수준에서 통합되어야 합니다. 모든 admin
            엔드포인트는 동일한 헬퍼를 거치며, 우회 경로는 의도적으로 만들어두지 않았습니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/contact">
              <Button>보안 감사 자료 요청</Button>
            </Link>
            <Link href="/product">
              <Button variant="ghost">제품 개요</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">6개 방어 계층</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            네트워크 → 인증 → 권한 → 무결성까지 코드로 통제.
          </h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {layers.map((l, index) => (
            <Card key={l.title} className="min-h-[260px]">
              <div className="flex items-center justify-between">
                <div className="fine-print">계층 {String(index + 1).padStart(2, '0')}</div>
              </div>
              <h3 className="mt-3 text-xl font-semibold text-white">{l.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{l.detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {l.primitives.map((p) => (
                  <Badge key={p}>{p}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">규제 · 컴플라이언스</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            국내 · 국제 규제에 맞춘 데이터 거버넌스.
          </h2>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40">
          <div className="grid grid-cols-12 border-b border-white/10 bg-white/5 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">
            <div className="col-span-4">기준</div>
            <div className="col-span-8">대응</div>
          </div>
          {compliance.map((c, i) => (
            <div
              key={c.standard}
              className={`grid grid-cols-12 gap-4 px-6 py-5 text-sm leading-7 ${
                i === compliance.length - 1 ? '' : 'border-b border-white/5'
              }`}
            >
              <div className="col-span-4 font-semibold text-white">{c.standard}</div>
              <div className="col-span-8 text-slate-300">{c.posture}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">사고 대응 플레이북</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            탐지 → 격리 → 분석 → 통지 4단계.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            모든 단계가 시스템 내부 헬퍼(감사 로그, request-id, 운영 웹훅) 위에서 실행됩니다. 별도
            외부 도구 없이도 사고 보고서를 만들 수 있도록 설계되었습니다.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {incidentPlay.map((step) => (
            <Card key={step.step} className="min-h-[180px]">
              <div className="font-mono text-xs uppercase tracking-[0.28em] text-accent">
                {step.step}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{step.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="eyebrow">보안 자료 패키지</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
                실사팀 검토용 풀 패키지 제공.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                아키텍처 다이어그램, 위협 모델, 환경변수 분리 정책, 펜테스트 결과, 감사 로그 샘플을
                NDA 후 제공합니다.
              </p>
            </div>
            <Link href="/contact">
              <Button>NDA · 패키지 요청</Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
