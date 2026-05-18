import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-static';

const pillars = [
  {
    name: '헤도닉 OLS 회귀',
    detail:
      '비교거래 매트릭스에 로그-선형 헤도닉을 적합해 단가(KRW/sqm) 예측을 만듭니다. 빌딩 규모, 빈티지, 서브마켓 더미가 회귀변수로 들어가고, R² · 잔차 표준오차 · 표본수가 모든 보고서에 함께 노출됩니다.',
    metric: '9개 단위테스트 통과',
    bullets: [
      '제로분산 빈티지 컬럼 자동 드롭으로 특이행렬 회피',
      '서브마켓 더미 매트릭스로 입지 효과 분리',
      '적합값 / 신뢰구간을 자산 IM에 그대로 임베드'
    ]
  },
  {
    name: '캡레이트 6요소 분해',
    detail:
      '헤드라인 캡레이트를 무위험금리 + 섹터 리스크 프리미엄 + 서브마켓 spread − 성장 + 유동성 + 노후도 6개로 분해해 IC가 가격을 구성요소 단위로 검증할 수 있게 합니다.',
    metric: '베이지안 shrinkage 적용',
    bullets: [
      '캡레이트 = RFR + βi·ERP + spread − growth + liquidity + obsolescence',
      '서브마켓 표본 < 임계치면 KR 평균 쪽으로 자동 수축(shrinkage)',
      '유통량 인덱스로 thin-market 페널티 정량화'
    ]
  },
  {
    name: '단계별 확률가중 공급-수요',
    detail:
      '파이프라인 프로젝트를 단계별 완공확률로 가중해(ANNOUNCED 30% → DELIVERED 100%) 5년 공급 곡선을 만들고, 수요 성장 가정과 페어링해 연도별 implied vacancy를 산출합니다.',
    metric: 'DC 자산 한정 8% AI 수요 기본',
    bullets: [
      '단계 8단계 — ANNOUNCED · FEASIBILITY · PERMITTED · PRE_CONSTRUCTION · UNDER_CONSTRUCTION · TOPPING_OUT · COMMISSIONING · DELIVERED',
      'Year-1 supply 델타 = pipeline intensity %, 헤더 뱃지로 노출',
      '수요 성장은 매크로 rent_growth_pct로 오버라이드 가능'
    ]
  }
];

const dataSources = [
  { tier: 'Tier 1 — 권위', label: '국토교통부 RTMS · KEPCO 부하 데이터 · BOK ECOS', cadence: '실시간 / 일별' },
  { tier: 'Tier 1 — 권위', label: '서울시 인허가 · 토지대장 · 건축물대장', cadence: '주별' },
  { tier: 'Tier 2 — 시장', label: 'CBRE / JLL / Savills 분기 보고서, 한국감정원 시계열', cadence: '분기' },
  { tier: 'Tier 3 — 마이크로', label: '문서 인테이크 (PDF · 이미지 · CSV → OCR + 추출)', cadence: '온디맨드' }
];

const moats = [
  {
    title: '결정론적 산출물',
    detail:
      '같은 가정 입력 → 같은 IM 출력. 시드 · 캐시 키 · 회귀 적합 결과를 함께 저장해 위원회가 보는 숫자가 재계산 가능합니다.'
  },
  {
    title: '검토 게이팅 증거',
    detail:
      '리뷰 승인된 증거만 언더라이팅 단계로 진입. 거짓·미검증 출처가 IM에 새 나가지 않도록 모델 단에서 차단합니다.'
  },
  {
    title: '코어 quant 모듈',
    detail:
      '헤도닉 · 캡레이트 분해 · 공급-수요는 pure function — DB 의존 없이 단위테스트로 검증되며, IM 외 임의 위치에서 재사용 가능합니다.'
  },
  {
    title: '출처-셀 매핑',
    detail:
      'IM 모든 셀이 sourceCache 한 줄로 거슬러 올라갑니다. neon 화살표 한 번이면 "이 캡레이트 어디서 왔어요?"에 답이 나옵니다.'
  }
];

export default function ResearchDeskPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">리서치 데스크</Badge>
            <Badge>Quant 코어</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            리서치를 모델로,
            <br />
            모델을 IC 의사결정으로.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            대부분의 부동산 운용사는 평가의 절반을 "감"으로 채웁니다. Nexus Seoul은 리서치
            데이터 → 회귀 적합 → IM 셀까지의 경로를 결정론적으로 묶어, 같은 가정 입력이면
            언제 다시 돌려도 같은 숫자가 나오도록 합니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sample-report">
              <Button>샘플 IM 보기</Button>
            </Link>
            <Link href="/product">
              <Button variant="ghost">제품 개요</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">3대 quant 모듈</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            가격을 구성요소 단위로 분해합니다.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            세 개의 pure function — 헤도닉 회귀, 캡레이트 분해, 단계별 확률가중 공급-수요 —
            가 IM의 quant 백본을 이룹니다. 모든 모듈은 DB 의존 없이 단위테스트로 검증되며,
            결과는 자산 IM 카드로 즉시 surfacing됩니다.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {pillars.map((p, index) => (
            <Card key={p.name} className="min-h-[420px]">
              <div className="flex items-center justify-between">
                <div className="fine-print">모듈 {String(index + 1).padStart(2, '0')}</div>
                <Badge>{p.metric}</Badge>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-white">{p.name}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{p.detail}</p>
              <ul className="mt-5 space-y-2 text-xs leading-6 text-slate-300">
                {p.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-2 inline-block h-1 w-1 flex-none rounded-full bg-accent" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">데이터 소스 카탈로그</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            권위 있는 1차 데이터부터 마이크로 증거까지.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            모든 데이터는 신선도, 출처(provenance), 폴백 사용 여부, 리뷰 상태가 같이 적재됩니다.
            IM 한 셀의 숫자가 어느 소스에서 왔는지 항상 추적 가능합니다.
          </p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40">
          <div className="grid grid-cols-12 border-b border-white/10 bg-white/5 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">
            <div className="col-span-3">계층</div>
            <div className="col-span-6">소스</div>
            <div className="col-span-3 text-right">주기</div>
          </div>
          {dataSources.map((s, i) => (
            <div
              key={s.label}
              className={`grid grid-cols-12 gap-4 px-6 py-5 text-sm leading-7 ${
                i === dataSources.length - 1 ? '' : 'border-b border-white/5'
              }`}
            >
              <div className="col-span-3 font-semibold text-white">{s.tier}</div>
              <div className="col-span-6 text-slate-300">{s.label}</div>
              <div className="col-span-3 text-right font-mono text-xs text-slate-400">
                {s.cadence}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">왜 이 방식이 차별되는가</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            출처 추적 + 결정론 + Pure function.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            한국 부동산 운용사의 리서치 산출물은 보통 두 가지 문제를 안고 있습니다 —
            "이 숫자 어디서 왔지?"와 "같은 가정 다시 돌리면 다른 결과가 나오네". 우리는 그
            두 가지를 데이터 모델 단에서 차단합니다.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {moats.map((m) => (
            <Card key={m.title} className="min-h-[180px]">
              <h3 className="text-lg font-semibold text-white">{m.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{m.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="eyebrow">샘플 IM 확인</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
                3개 모듈이 IM 어디에 들어가는지 직접 확인하세요.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Underwriting Assumptions의 캡레이트 분해 카드, Comparable Transactions의
                헤도닉 적합값 타일, Outcomes & Pipeline 뒤의 5년 supply-demand 표 —
                모두 같은 quant 코어에서 도출됩니다.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/sample-report">
                <Button>샘플 IM 36섹션 보기</Button>
              </Link>
              <Link href="/contact">
                <Button variant="ghost">데모 요청</Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
