import Link from 'next/link';
import { AssetClass } from '@prisma/client';
import { InquiryForm } from '@/components/marketing/inquiry-form';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { getLandingData } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import { formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const workflow = [
  {
    step: '01',
    title: '리서치 인테이크',
    body: '자산·시장·스폰서·금융·문서 컨텍스트를 단일 운영 레코드 한 곳에 모아 새 투자 건을 시작합니다.'
  },
  {
    step: '02',
    title: '증거 검토 (Review-Gated)',
    body: '시장·인허가·법적·임차·지리공간 증거를 자산 레코드로 끌어오고, 승인된 증거만 언더라이팅 단계로 진입합니다.'
  },
  {
    step: '03',
    title: '언더라이팅 · IC',
    body: '평가·다운사이드·DD 분석을 실행하고, 동일 레코드에서 위원회용 메모 · DD 체크리스트 · 리스크 메모를 자동 생성합니다.'
  },
  {
    step: '04',
    title: '포트폴리오 · 자본조달',
    body: '실행 중인 딜, 보유 자산 KPI, 커버넌트 워치리스트, 펀드/SPV/투자자 셸을 동일 시스템에서 추적합니다.'
  }
];

const outputs = [
  {
    label: '평가 결과 (Valuation Surface)',
    detail:
      '베이스 케이스 가치, 다운사이드, 승인된 증거 커버리지, 시나리오 분산을 한 화면에서 봅니다.'
  },
  {
    label: '리서치 도시에 (Dossier)',
    detail:
      '거시 thesis, 시장 지표, 비교거래, 인허가 맥락, 승인된 마이크로 증거를 같은 자산 레코드에 묶습니다.'
  },
  {
    label: 'IC · DD 산출물',
    detail:
      '승인된 증거와 현재 평가 상태에 기반한 위원회 메모, DD 체크리스트, 리스크 메모를 자동 생성합니다.'
  },
  {
    label: '실행 트레일',
    detail:
      '딜, 문서 해시, 검토 패킷, 레지스트리 앵커 참조를 각 투자건에 연결해 추적합니다.'
  }
];

function getPrimaryMetric(asset: Awaited<ReturnType<typeof getLandingData>>['assets'][number]) {
  if (asset.assetClass === AssetClass.DATA_CENTER) {
    return ['전력 용량', `${formatNumber(asset.powerCapacityMw)} MW`];
  }

  return ['연면적', `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`];
}

export default async function LandingPage() {
  const { assets, summary } = await getLandingData();
  const fxRateMap = await getFxRateMap(
    assets.map((asset) => resolveDisplayCurrency(asset.address?.country ?? asset.market))
  );
  const averageCapRate =
    assets.reduce((total, asset) => total + (asset.marketSnapshot?.capRatePct ?? 0), 0) /
    Math.max(assets.filter((asset) => asset.marketSnapshot?.capRatePct !== null).length, 1);
  const totalArea = assets.reduce(
    (total, asset) => total + (asset.rentableAreaSqm ?? asset.grossFloorAreaSqm ?? 0),
    0
  );
  const latestBaseValue =
    assets[0]?.valuations[0]?.baseCaseValueKrw ?? assets[0]?.currentValuationKrw ?? null;
  const latestBaseValueCurrency = assets[0]
    ? resolveDisplayCurrency(assets[0].address?.country ?? assets[0].market)
    : 'KRW';
  const latestBaseValueFxRate = fxRateMap[latestBaseValueCurrency];
  const activeAssetClasses = new Set(assets.map((asset) => asset.assetClass)).size;

  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-6 md:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="surface relative hero-mesh glow-ring reveal-up overflow-hidden">
            <div className="floating-orb absolute right-10 top-10 hidden h-28 w-28 rounded-full bg-accent/10 blur-2xl lg:block" />
            <div className="relative space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="good">한국 부동산 운용사 OS</Badge>
                <Badge>리서치 · 언더라이팅 · 딜 · 포트폴리오 · 자본조달</Badge>
              </div>

              <div className="space-y-5">
                <h1 className="max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-7xl">
                  부동산 투자의 모든 단계를
                  <br />
                  하나의 운영 시스템에서.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-slate-300">
                  Nexus Seoul은 한국 부동산 투자팀을 위한 AI 네이티브 운영 시스템입니다. 리서치
                  인테이크, 증거 검토, 언더라이팅, 딜 실행, 포트폴리오 관리, 자본조달 워크플로를
                  단일 애플리케이션에서 운영합니다.
                </p>
                <p className="max-w-3xl text-base leading-7 text-slate-400">
                  데이터센터·오피스·산업/물류·랜드 자산군을 동일한 검토 게이팅(review-gated) 증거
                  모델 위에서 다룹니다. 스프레드시트로 흩어지는 가정·문서·메모를 자산 레코드 하나에
                  묶어 위원회가 읽는 그 숫자가 어디서 왔는지 항상 추적 가능하게 만듭니다.
                </p>
                <p className="max-w-3xl text-sm leading-7 text-slate-500">
                  문서·추출 텍스트·평가 로직·워크플로는 모두 오프체인에 머무릅니다. 레지스트리
                  식별자, 문서 해시, 패킷 메타데이터만 온체인에 앵커링되는 registry-only 구조입니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/admin/assets/new">
                  <Button>새 투자 건 시작</Button>
                </Link>
                <Link href="/sample-report">
                  <Button variant="secondary">샘플 IC 메모 보기</Button>
                </Link>
                <Link href="/admin">
                  <Button variant="ghost">콘솔 열기</Button>
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ['추적 중 자산', formatNumber(summary.assetCount, 0)],
                  ['자산군', formatNumber(activeAssetClasses, 0)],
                  ['문서', formatNumber(summary.documentCount, 0)],
                  ['IM 실행 횟수', formatNumber(summary.valuationCount, 0)]
                ].map(([label, value]) => (
                  <div key={label} className="metric-card">
                    <div className="fine-print">{label}</div>
                    <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            <Card className="grid-lines overflow-hidden">
              <div className="eyebrow">What You Get</div>
              <div className="mt-4 grid gap-4">
                {outputs.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5"
                  >
                    <div className="fine-print">{item.label}</div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="eyebrow">Workflow</div>
              <div className="mt-4 grid gap-3">
                {workflow.map((item) => (
                  <div
                    key={item.step}
                    className="flex gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="font-mono text-sm text-accent">{item.step}</div>
                    <div>
                      <div className="text-base font-semibold text-white">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-400">{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell py-2">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['활성 자산군', formatNumber(activeAssetClasses, 0), '진행 중인 언더라이팅 섹터'],
            ['평균 Cap Rate', formatPercent(averageCapRate), '최근 시장 스냅샷 기준'],
            ['추적 면적', `${formatNumber(totalArea)} sqm`, '현재 자산 합계'],
            [
              '최신 베이스 케이스',
              formatCurrencyFromKrwAtRate(
                latestBaseValue,
                latestBaseValueCurrency,
                latestBaseValueFxRate
              ),
              '가장 최근 모델링된 기준값'
            ]
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">자산 파이프라인</div>
            <h2 className="section-title mt-3">현재 언더라이팅 · 리서치 진행 중인 자산</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              아래 모든 자산이 동일한 운영 체인 — 인테이크 · 리서치 보강 · 증거 검토 · 언더라이팅 ·
              실행 · 준비 패키징 — 을 통과합니다.
            </p>
          </div>
          <Link
            href="/product"
            className="fine-print rounded-full border border-white/10 px-4 py-3 transition hover:border-white/20 hover:text-white"
          >
            제품 개요 보기
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {assets.map((asset, index) => {
            const [metricLabel, metricValue] = getPrimaryMetric(asset);
            const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
            const fxRateToKrw = fxRateMap[displayCurrency];

            return (
              <Card key={asset.id} className="overflow-hidden">
                <div className="fine-print">Asset {String(index + 1).padStart(2, '0')}</div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <Badge>{asset.assetClass}</Badge>
                  <span className="fine-print">{asset.assetCode}</span>
                </div>
                <div className="mt-5">
                  <h3 className="text-2xl font-semibold text-white">{asset.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{asset.description}</p>
                </div>
                <div className="mt-6 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>위치</span>
                    <span>{asset.address?.city}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>{metricLabel}</span>
                    <span>{metricValue}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>Cap Rate</span>
                    <span>{formatPercent(asset.marketSnapshot?.capRatePct)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>최신 베이스 케이스</span>
                    <span>
                      {formatCurrencyFromKrwAtRate(
                        asset.valuations[0]?.baseCaseValueKrw ?? asset.currentValuationKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <div className="eyebrow">플랫폼 구성</div>
            <h2 className="section-title mt-3">
              분석, 메모 생성, 검토를 위한 하나의 제품.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              단일 Next.js 애플리케이션이 자산 인테이크, 보강, 수익 분석, IM 생성, 문서 워크플로를
              모두 담당합니다. 프론트엔드는 운영 제품처럼 읽히고, 백엔드는 실제 서비스 레이어에
              직접 연결되어 있습니다.
            </p>

            <div className="mt-6 grid gap-3">
              {[
                [
                  'Assets API',
                  '/api/assets',
                  '자산 도시에를 생성합니다. 이후 모든 분석과 메모 실행이 이 레코드를 읽습니다.'
                ],
                [
                  'Valuation API',
                  '/api/valuations',
                  '모델을 실행하고 평가 결과 + 생성된 IM을 함께 기록합니다.'
                ],
                [
                  'Document API',
                  '/api/documents/upload',
                  'DD 파일, 추출 노트, 버전 이력을 저장합니다.'
                ],
                [
                  'Inquiry API',
                  '/api/inquiries',
                  '데모/검토 문의를 동일 시스템 안에 기록합니다.'
                ]
              ].map(([label, route, detail]) => (
                <div
                  key={route}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-white">{label}</div>
                    <span className="fine-print">{route}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="hero-mesh">
            <div className="eyebrow">핵심 약속</div>
            <div className="mt-4 grid gap-4">
              {[
                '흩어진 스프레드시트가 아니라 구조화된 가정으로 위원회 전 딜을 평가합니다.',
                '단일 정적 케이스 대신 Bull · Base · Bear 시나리오를 비교합니다.',
                '모델 출력에 직결된 IM(투자 메모)을 자동 생성해 숫자와 내러티브가 분리되지 않게 합니다.',
                '가정·DD 문서·생성된 산출물 모두를 하나의 자산 레코드 안에서 관리합니다.'
              ].map((line) => (
                <div
                  key={line}
                  className="rounded-[22px] border border-white/10 bg-slate-950/45 p-5 text-sm leading-7 text-slate-300"
                >
                  {line}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="app-shell py-10">
        <Card className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="eyebrow">기관 문의</div>
            <h2 className="section-title mt-3">워크플로와 샘플 IM을 직접 확인하세요.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              분석 흐름, 자동 생성된 메모, 운영 콘솔을 둘러보세요. 문의 기록은 플랫폼의 다른
              산출물과 같은 백엔드에 저장됩니다.
            </p>
          </div>
          <InquiryForm />
        </Card>
      </section>

      <section className="app-shell py-6">
        <Card className="hero-mesh grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="eyebrow">시작하기</div>
            <h2 className="section-title mt-3">분석을 실행하고 그 자리에서 메모를 엽니다.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              인테이크, 보강, 평가, 리스크 요약, 투자 메모 생성이 부동산 언더라이팅을 위한 하나의
              운영 워크플로 안에 모입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <Link href="/admin/assets/new">
              <Button>분석 시작</Button>
            </Link>
            <Link href="/sample-report">
              <Button variant="secondary">샘플 IM 열기</Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
