import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-static';

const tiers = [
  {
    name: 'Pilot',
    price: '월 1,500만원~',
    summary: '단일 운용본부, AUM < 5천억',
    cta: '파일럿 시작',
    highlighted: false,
    features: [
      '자산 50건까지',
      '운용자 시트 10석',
      '리서치 데스크 quant 코어 (헤도닉 · 캡레이트 · 공급수요)',
      'IM 자동 생성 · 36섹션',
      '감사 로그 1년 보존',
      '이메일 지원 (영업일 24h)'
    ]
  },
  {
    name: 'Institutional',
    price: '월 4,000만원~',
    summary: '복수 운용본부, AUM 5천억~3조',
    cta: '상담 요청',
    highlighted: true,
    features: [
      '자산 무제한',
      '운용자 시트 50석',
      'Pilot의 모든 기능 +',
      '펀드 · SPV · LP · 캐피털콜 · 배당 모듈',
      'IC 워크플로 + readiness 게이팅',
      '블록체인 레지스트리 앵커링 (옵션)',
      '감사 로그 3년 보존',
      '전담 솔루션 엔지니어',
      'SLA 99.9%'
    ]
  },
  {
    name: 'Enterprise',
    price: '맞춤 견적',
    summary: '대형 운용사, 다국가 LP, AUM 3조+',
    cta: '엔터프라이즈 협의',
    highlighted: false,
    features: [
      'Institutional의 모든 기능 +',
      '온프레미스 / 한국 리전 전용 배포',
      'ERC-3643 토큰화 모듈 풀 구성',
      'SSO (SAML / OIDC)',
      '커스텀 RBAC 역할',
      '전담 보안 감사 자료',
      '연 1회 펜테스트 포함',
      'SLA 99.95% + 페이저',
      'SOC2 Type II 대응'
    ]
  }
];

const addOns = [
  {
    name: '데이터 소스 통합',
    detail: 'RTMS · KEPCO · 한국감정원 · CBRE / JLL 등 외부 데이터 피드 설치 및 매핑.',
    price: '소스당 500만원 (1회)'
  },
  {
    name: '커스텀 IM 템플릿',
    detail: '운용사 브랜드 IM 36섹션 레이아웃, 헤더, 워터마크, PDF 인쇄 설정 커스터마이즈.',
    price: '1,000만원 (1회)'
  },
  {
    name: '데이터 마이그레이션',
    detail: '기존 엑셀 모델 / PDF IM → Nexus 레코드 변환. 자산당 50개 정도 처리 기준.',
    price: '자산당 100만원'
  },
  {
    name: '온콜 운영 지원',
    detail: '한국 영업시간 외 페이저 대응, 24/7 인시던트 대응.',
    price: '월 800만원'
  }
];

const faqs = [
  {
    q: '최소 계약 기간은?',
    a: 'Pilot 6개월, Institutional·Enterprise 12개월. 분기 갱신 가능합니다.'
  },
  {
    q: '시트 추가 비용은?',
    a: 'Pilot은 추가 시트당 월 50만원, Institutional은 시트 50석 기준 + 추가시 시트당 월 80만원. Enterprise는 무제한 또는 협의.'
  },
  {
    q: 'AUM 산정 기준은?',
    a: 'Nexus 안에 적재된 자산의 직전 valuation 가치 합계 기준. LP 약정액이 아니라 실제 운용자산 NAV를 따릅니다.'
  },
  {
    q: '데이터 보관 위치는?',
    a: '기본은 한국 리전 (Supabase ap-northeast-2). Enterprise는 온프레미스 / 자체 인프라 배포 옵션 가능. LP PII는 절대 역외 이전하지 않습니다.'
  },
  {
    q: '계약 해지 시 데이터는?',
    a: '모든 데이터는 PostgreSQL 덤프 + S3 객체 export로 30일 내 인도. 인도 후 30일이 지나면 전체 파기 (감사 로그 포함).'
  }
];

export default function PricingPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">가격</Badge>
            <Badge>한국 운용사 전용</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            AUM 규모에 맞춘
            <br />
            세 가지 플랜.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            시트 단위 SaaS가 아니라 운용사 단위 OS 라이선스입니다. AUM과 운용본부 규모, 필요한
            모듈에 따라 Pilot · Institutional · Enterprise 셋 중 선택하시면 됩니다.
          </p>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="grid gap-5 lg:grid-cols-3">
          {tiers.map((t) => (
            <Card
              key={t.name}
              className={`relative flex flex-col ${
                t.highlighted ? 'border-accent/40 bg-accent/[0.04]' : ''
              }`}
            >
              {t.highlighted ? (
                <div className="absolute -top-3 right-6">
                  <Badge tone="good">가장 인기</Badge>
                </div>
              ) : null}
              <div className="fine-print">{t.summary}</div>
              <h3 className="mt-3 text-2xl font-semibold text-white">{t.name}</h3>
              <div className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white">
                {t.price}
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm leading-6 text-slate-300">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link href="/contact">
                  <Button variant={t.highlighted ? 'primary' : 'ghost'} className="w-full">
                    {t.cta}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">애드온 · 1회성 옵션</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            플랜과 별도로 추가 가능한 옵션.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {addOns.map((a) => (
            <Card key={a.name} className="flex flex-row items-start gap-6 min-h-[140px]">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{a.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{a.detail}</p>
              </div>
              <Badge>{a.price}</Badge>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">자주 묻는 질문</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            가격 · 계약 관련 FAQ.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {faqs.map((f, i) => (
            <Card key={f.q} className="min-h-[170px]">
              <div className="fine-print">FAQ {String(i + 1).padStart(2, '0')}</div>
              <h3 className="mt-3 text-lg font-semibold text-white">{f.q}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{f.a}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="eyebrow">다음 단계</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
                30분 데모로 시작하세요.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                실제 데이터 일부를 가져오시면 IM 자동 생성을 라이브로 시연합니다.
                NDA 후 진행 가능합니다.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/contact">
                <Button>데모 요청</Button>
              </Link>
              <Link href="/sample-report">
                <Button variant="ghost">샘플 IM 먼저 보기</Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
