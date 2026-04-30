import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBreakdown } from '@/components/valuation/confidence-breakdown';
import { ValuationBreakdown } from '@/components/valuation/valuation-breakdown';
import { ValuationProvenance } from '@/components/valuation/valuation-provenance';
import { ValuationSignals } from '@/components/valuation/valuation-signals';
import { getSampleReport } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import {
  computeCapitalStructure,
  computeLeaseRollSummary,
  computeReturnsSnapshot,
  formatMacroValue,
  pickMacroBackdrop,
  rollupTenantCredit
} from '@/lib/services/im/sections';
import { getSponsorTrackByName } from '@/lib/services/im/sponsor';
import { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

function getRecommendation(confidenceScore?: number | null) {
  if ((confidenceScore ?? 0) >= 75) return 'Proceed To Committee';
  if ((confidenceScore ?? 0) >= 55) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}

const glossary = [
  {
    term: 'Base Case Value',
    ko: '기본 시나리오 가치',
    body: '평가 엔진이 산출한 기본(중립) 시나리오 추정 가치. 위원회 논의의 기준선으로 사용되며, Bull/Bear 시나리오의 폭이 함께 제시됩니다.'
  },
  {
    term: 'Bull / Bear Case',
    ko: '상방 / 하방 시나리오',
    body: '시장 · 임대 · 자본비용 가정의 낙관/비관 케이스에서 산출된 가치. 기본 시나리오 대비 스프레드가 IC 토론의 리스크 한계를 정의합니다.'
  },
  {
    term: 'Implied Yield',
    ko: '암시 수익률',
    body: '평가 가치와 운영 NOI를 기반으로 역산된 수익률. 매입 가격 대비 운영 단계에서 기대되는 현금 수익률을 나타냅니다.'
  },
  {
    term: 'Exit Cap Rate',
    ko: '엑시트 캡레이트',
    body: '보유 종료 시점의 매각 가정 캡레이트. 잔존 가치(terminal value) 산정의 핵심 입력이며, 시장 캡레이트 대비 보수적/공격적 정도를 보여줍니다.'
  },
  {
    term: 'DSCR',
    ko: '부채상환계수 (Debt Service Coverage Ratio)',
    body: '운영 NOI를 연간 원리금 상환액으로 나눈 값. 1.00 이하는 부채 상환 부족, 1.20–1.50이 일반적인 대출 커버넌트 기준.'
  },
  {
    term: 'Confidence Score',
    ko: '신뢰 점수',
    body: '데이터 커버리지 · 신선도 · 폴백 사용 여부를 종합한 평가 신뢰도(0–100). 75 이상은 위원회 진행, 55–75는 조건부, 55 미만은 추가 실사 권고.'
  },
  {
    term: 'Provenance',
    ko: '출처 추적',
    body: '평가 입력값마다 어떤 시스템 · 보고서에서 왔는지, 언제 수집되었는지, 폴백 값인지 여부를 기록한 메타데이터. 위원회가 보는 모든 숫자의 추적 단위입니다.'
  },
  {
    term: 'Engine Version',
    ko: '엔진 버전',
    body: '평가를 산출한 평가 엔진의 버전 식별자. 같은 자산이라도 엔진 버전이 다르면 가정 트리 · 가중치가 달라질 수 있어 비교 시 항상 함께 표기합니다.'
  }
];

export default async function SampleReportPage() {
  const asset = await getSampleReport();
  if (!asset) notFound();

  const latestRun = asset.valuations[0];
  if (!latestRun) notFound();

  const scenarios = latestRun.scenarios ?? [];
  const provenance = Array.isArray(latestRun.provenance)
    ? (latestRun.provenance as ProvenanceEntry[])
    : [];
  const bullValue = scenarios[0]?.valuationKrw ?? null;
  const bearValue = scenarios[2]?.valuationKrw ?? null;
  const recommendation = getRecommendation(latestRun.confidenceScore);
  const isDataCenter = asset.assetClass === AssetClass.DATA_CENTER;
  const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
  const fxRateToKrw = (await getFxRateMap([displayCurrency]))[displayCurrency];

  // REPE-grade IM section data. All inputs come from the asset bundle
  // already loaded by getSampleReport (macroSeries / leases /
  // debtFacilities / spvStructure / creditAssessments) — this layer
  // just shapes them into the cards a Blackstone / Brookfield / KKR
  // IM expects to see.
  const macroBackdrop = pickMacroBackdrop(asset.macroSeries ?? []);
  const leaseRoll = computeLeaseRollSummary(asset.leases ?? []);
  const capStack = computeCapitalStructure(asset.debtFacilities ?? []);
  const returnsSnapshot = computeReturnsSnapshot(scenarios);
  const tenantCredit = rollupTenantCredit(asset.creditAssessments ?? []);
  // Year-by-year proForma comes off the stored ValuationRun.assumptions
  // blob; the engine writes it via buildStoredBaseCaseProForma at run
  // time so the IM doesn't need to re-execute the model. Null here just
  // means the assumptions blob predates the stored-proforma update — the
  // S&U / P&L / IRR cards render an empty state when that happens.
  const proForma = readStoredBaseCaseProForma(latestRun.assumptions);
  // Sponsor track record auto-links by case-insensitive name match on
  // Asset.sponsorName so creating a Sponsor row immediately surfaces in
  // the IM without an FK migration on the asset.
  const sponsorTrack = await getSponsorTrackByName(asset.sponsorName ?? null);

  return (
    <main className="pb-24">
      <div className="print-hidden">
        <SiteNav />
      </div>

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">Sample IM</Badge>
            <Badge>Investment Memo</Badge>
            <Badge>{asset.assetCode}</Badge>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <div>
                <div className="fine-print">Committee Draft</div>
                <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                  Sample Investment Memo for
                  <br />
                  {asset.name}
                </h1>
              </div>

              <p className="max-w-3xl text-lg leading-8 text-slate-300">{asset.description}</p>

              <div className="print-hidden flex flex-wrap gap-3">
                <PrintImButton />
                <Link href="/admin/assets/new">
                  <Button>Start New Analysis</Button>
                </Link>
                <Link href="/admin">
                  <Button variant="ghost">Open Console</Button>
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="metric-card">
                  <div className="fine-print">Recommendation</div>
                  <div className="mt-3 text-2xl font-semibold text-white">{recommendation}</div>
                  <p className="mt-2 text-sm text-slate-400">
                    Generated from confidence, scenario spread, and diligence posture.
                  </p>
                </div>
                <div className="metric-card">
                  <div className="fine-print">Base Case Value</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(
                      latestRun.baseCaseValueKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Current modeled value for committee discussion.
                  </p>
                </div>
                <div className="metric-card">
                  <div className="fine-print">Confidence Score</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatNumber(latestRun.confidenceScore, 1)}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Reflects data coverage, freshness, and fallback usage.
                  </p>
                </div>
              </div>
            </div>

            <Card className="grid gap-4">
              <div>
                <div className="eyebrow">Memo Cover</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Prepared On</span>
                    <span>{formatDate(latestRun.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Location</span>
                    <span>{asset.address?.city ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>{isDataCenter ? 'Power Capacity' : 'Rentable Area'}</span>
                    <span>
                      {isDataCenter
                        ? `${formatNumber(asset.powerCapacityMw)} MW`
                        : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Engine Version</span>
                    <span>{latestRun.engineVersion}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-accent/20 bg-accent/10 p-5">
                <div className="fine-print text-accent">Investment View</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  This sample IM shows how the platform converts structured asset inputs, scenario
                  analysis, and diligence signals into a committee-ready investment narrative.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell py-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            [
              'Bull Case',
              formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw),
              'upside scenario'
            ],
            [
              'Bear Case',
              formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw),
              'downside scenario'
            ],
            ['Implied Yield', formatPercent(scenarios[1]?.impliedYieldPct), 'base scenario'],
            ['Exit Cap Rate', formatPercent(scenarios[1]?.exitCapRatePct), 'base scenario']
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {asset.media && asset.media.length > 0 ? (
        <section className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Site media</div>
                <p className="mt-2 text-sm text-slate-400">
                  Photos, site plans, and renders. Curated by the deal lead — same set the IM cover
                  and committee pack draw from.
                </p>
              </div>
              <span className="text-xs text-slate-500">{asset.media.length} item{asset.media.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {asset.media.map((m) => (
                <figure
                  key={m.id}
                  className="overflow-hidden rounded-[18px] border border-white/10 bg-slate-950/60"
                >
                  <div className="aspect-video w-full bg-slate-900">
                    {m.mimeType.startsWith('image/') ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/public/asset-media/${m.id}`}
                        alt={m.caption ?? m.kind}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        {m.mimeType}
                      </div>
                    )}
                  </div>
                  <figcaption className="space-y-1 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{m.kind}</div>
                    {m.caption ? (
                      <div className="text-sm text-slate-200">{m.caption}</div>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {macroBackdrop.length > 0 ? (
        <section className="app-shell py-4">
          <Card>
            <div className="eyebrow">Macro backdrop</div>
            <p className="mt-2 text-sm text-slate-400">
              The latest observation per series from the research workspace's official-source feed
              (KOSIS / BOK ECOS). Same numbers the cap-rate and discount-rate assumptions in the
              base scenario depend on.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              {macroBackdrop.map((point) => (
                <div
                  key={point.seriesKey}
                  className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="fine-print">{point.label}</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatMacroValue(point)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(point.observationDate)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      <section className="app-shell py-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <div className="eyebrow">Returns snapshot</div>
            <p className="mt-2 text-sm text-slate-400">
              Pulled from the latest valuation run scenarios. Going-in yield + exit cap come from
              the base case; min DSCR is the lower bound across all scenarios.
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label="Going-in yield">
                {returnsSnapshot.goingInYieldPct !== null
                  ? formatPercent(returnsSnapshot.goingInYieldPct)
                  : '—'}
              </Row>
              <Row label="Exit cap">
                {returnsSnapshot.exitCapPct !== null
                  ? formatPercent(returnsSnapshot.exitCapPct)
                  : '—'}
              </Row>
              <Row label="Upside (base → bull)">
                {returnsSnapshot.upsideToBullPct !== null
                  ? `+${returnsSnapshot.upsideToBullPct.toFixed(1)}%`
                  : '—'}
              </Row>
              <Row label="Downside (base → bear)">
                {returnsSnapshot.downsideToBearPct !== null
                  ? `${returnsSnapshot.downsideToBearPct.toFixed(1)}%`
                  : '—'}
              </Row>
              <Row label="Min DSCR">
                {returnsSnapshot.minDscr !== null
                  ? `${returnsSnapshot.minDscr.toFixed(2)}x`
                  : '—'}
              </Row>
            </dl>
          </Card>

          <Card>
            <div className="eyebrow">Capital structure</div>
            <p className="mt-2 text-sm text-slate-400">
              {capStack.facilityCount === 0
                ? 'No debt facilities recorded. The IM is presented unlevered until financing is committed.'
                : `${capStack.facilityCount} facility${capStack.facilityCount === 1 ? '' : 'ies'} aggregated.`}
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label="Total commitment">
                {formatCurrencyFromKrwAtRate(
                  capStack.totalCommitmentKrw,
                  displayCurrency,
                  fxRateToKrw
                )}
              </Row>
              <Row label="Drawn">
                {formatCurrencyFromKrwAtRate(capStack.totalDrawnKrw, displayCurrency, fxRateToKrw)}
              </Row>
              <Row label="Drawn / commitment">
                {capStack.totalCommitmentKrw === 0
                  ? '—'
                  : `${capStack.drawnPctOfCommitment.toFixed(1)}%`}
              </Row>
              <Row label="Blended rate">
                {capStack.totalCommitmentKrw === 0
                  ? '—'
                  : `${capStack.blendedRatePct.toFixed(2)}%`}
              </Row>
              <Row label="Facilities">
                {asset.debtFacilities && asset.debtFacilities.length > 0
                  ? asset.debtFacilities
                      .map((f) => `${f.facilityType}${f.lenderName ? ` · ${f.lenderName}` : ''}`)
                      .join(' / ')
                  : '—'}
              </Row>
            </dl>
          </Card>

          <Card>
            <div className="eyebrow">Tenancy snapshot</div>
            <p className="mt-2 text-sm text-slate-400">
              {leaseRoll.leaseCount === 0
                ? 'No leases on file. Pre-stabilized asset; rent assumptions are projected only.'
                : `${leaseRoll.leaseCount} lease${leaseRoll.leaseCount === 1 ? '' : 's'} aggregated; weighted by leasedKw.`}
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label="Total leased capacity">
                {leaseRoll.totalLeasedKw > 0
                  ? `${formatNumber(leaseRoll.totalLeasedKw, 1)} kW`
                  : '—'}
              </Row>
              <Row label="WALT">
                {leaseRoll.weightedAvgTermYears > 0
                  ? `${leaseRoll.weightedAvgTermYears.toFixed(1)} yrs`
                  : '—'}
              </Row>
              <Row label="Weighted in-place rent">
                {leaseRoll.weightedRentPerKwKrw > 0
                  ? `${formatNumber(leaseRoll.weightedRentPerKwKrw, 0)} KRW/kW/mo`
                  : '—'}
              </Row>
              <Row label="Mark-to-market gap">
                {leaseRoll.markToMarketGapPct !== null
                  ? `${leaseRoll.markToMarketGapPct >= 0 ? '+' : ''}${leaseRoll.markToMarketGapPct.toFixed(1)}%`
                  : '—'}
              </Row>
              <Row label="Tenant credit (avg)">
                {tenantCredit.count > 0 ? tenantCredit.averageScore.toFixed(0) : '—'}
              </Row>
            </dl>
          </Card>
        </div>
      </section>

      {proForma ? (
        <section className="app-shell py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="eyebrow">Sources & Uses</div>
              <p className="mt-2 text-sm text-slate-400">
                Initial capitalization at close. Initial equity is total cost less initial debt
                funding; reserve contributions accumulate from the equity year-1 outflow.
              </p>
              <dl className="mt-5 grid gap-3 text-sm">
                <Row label="Sources · senior debt">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialDebtFundingKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Sources · LP/GP equity">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialEquityKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Sources · total">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialDebtFundingKrw + proForma.summary.initialEquityKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Uses · purchase + capex">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialDebtFundingKrw + proForma.summary.initialEquityKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Reserves required">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.reserveRequirementKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Peak equity exposure">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.peakEquityExposureKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
              </dl>
            </Card>

            <Card>
              <div className="eyebrow">Equity returns</div>
              <p className="mt-2 text-sm text-slate-400">
                Computed by computeReturnMetrics over the year-by-year cash flow stream stored on
                the latest ValuationRun. Equity multiple = total LP distributions / initial
                equity.
              </p>
              <dl className="mt-5 grid gap-3 text-sm">
                <Row label="Equity IRR">
                  {proForma.summary.equityIrr !== null
                    ? formatPercent(proForma.summary.equityIrr)
                    : '—'}
                </Row>
                <Row label="Unlevered IRR">
                  {proForma.summary.unleveragedIrr !== null
                    ? formatPercent(proForma.summary.unleveragedIrr)
                    : '—'}
                </Row>
                <Row label="Equity multiple">
                  {proForma.summary.equityMultiple > 0
                    ? `${proForma.summary.equityMultiple.toFixed(2)}x`
                    : '—'}
                </Row>
                <Row label="Avg cash-on-cash">
                  {proForma.summary.averageCashOnCash > 0
                    ? formatPercent(proForma.summary.averageCashOnCash)
                    : '—'}
                </Row>
                <Row label="Payback year">
                  {proForma.summary.paybackYear !== null
                    ? `Year ${proForma.summary.paybackYear}`
                    : 'Beyond model horizon'}
                </Row>
                <Row label="Net exit proceeds">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.netExitProceedsKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
              </dl>
            </Card>
          </div>
        </section>
      ) : null}

      {proForma && proForma.years.length > 0 ? (
        <section className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Year-by-year P&L (base case)</div>
                <p className="mt-2 text-sm text-slate-400">
                  Stabilized revenue, NOI, debt service, and DSCR per year of the hold. Numbers in
                  KRW (millions); switch to {displayCurrency} via the cover currency selector.
                </p>
              </div>
              <Badge tone="good">{proForma.years.length} year hold</Badge>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[18px] border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Year</th>
                    <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                    <th className="px-3 py-2 text-right font-semibold">Opex</th>
                    <th className="px-3 py-2 text-right font-semibold">NOI</th>
                    <th className="px-3 py-2 text-right font-semibold">Debt service</th>
                    <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                    <th className="px-3 py-2 text-right font-semibold">Distributions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {proForma.years.map((year) => {
                    const toMillions = (n: number) => `₩${formatNumber(n / 1_000_000, 0)}`;
                    return (
                      <tr key={year.year}>
                        <td className="px-3 py-2 text-xs text-slate-400">Y{year.year}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {toMillions(year.revenueKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {toMillions(year.operatingExpenseKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-white">
                          {toMillions(year.noiKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {toMillions(year.debtServiceKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {year.dscr !== null ? `${year.dscr.toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {toMillions(year.afterTaxDistributionKrw)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {sponsorTrack ? (
        <section className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Sponsor track record</div>
                <p className="mt-2 text-sm text-slate-400">
                  {sponsorTrack.name}
                  {sponsorTrack.hqMarket ? ` · ${sponsorTrack.hqMarket}` : ''}
                  {sponsorTrack.yearFounded ? ` · founded ${sponsorTrack.yearFounded}` : ''}
                  {sponsorTrack.aumKrw
                    ? ` · AUM ${formatNumber(sponsorTrack.aumKrw / 1_000_000_000_000, 2)}조 KRW`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {sponsorTrack.averageEquityMultiple !== null ? (
                  <Badge tone="good">avg {sponsorTrack.averageEquityMultiple.toFixed(2)}x</Badge>
                ) : null}
                {sponsorTrack.averageGrossIrrPct !== null ? (
                  <Badge tone="good">
                    avg IRR {sponsorTrack.averageGrossIrrPct.toFixed(1)}%
                  </Badge>
                ) : null}
                <Badge>{sponsorTrack.priorDealCount} prior</Badge>
                {sponsorTrack.oldestVintage ? (
                  <Badge>
                    {sponsorTrack.oldestVintage}–{sponsorTrack.newestVintage} vintage
                  </Badge>
                ) : null}
              </div>
            </div>
            {sponsorTrack.recentDeals.length === 0 ? (
              <div className="mt-5 rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Sponsor on file but no prior deals captured yet — populate the track record on{' '}
                <span className="font-mono text-xs">/admin/sponsors</span>.
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[18px] border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Deal</th>
                      <th className="px-3 py-2 font-semibold">Vintage</th>
                      <th className="px-3 py-2 font-semibold">Class / market</th>
                      <th className="px-3 py-2 text-right font-semibold">Multiple</th>
                      <th className="px-3 py-2 text-right font-semibold">IRR</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {sponsorTrack.recentDeals.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 text-sm">{d.dealName}</td>
                        <td className="px-3 py-2 text-xs">
                          {d.vintageYear}
                          {d.exitYear ? ` → ${d.exitYear}` : ''}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">
                          {d.assetClass ?? '—'} / {d.market ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {d.equityMultiple !== null ? `${d.equityMultiple.toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {d.grossIrrPct !== null ? `${d.grossIrrPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Badge tone={d.status === 'EXITED' ? 'good' : 'warn'}>{d.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      ) : null}

      <section className="app-shell space-y-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card>
            <div className="eyebrow">Investment Memo (IM)</div>
            <div className="mt-5 space-y-5">
              <p className="text-base leading-8 text-slate-200">{latestRun.underwritingMemo}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Asset Thesis</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Asset quality, market positioning, and scenario resilience support the current
                    underwriting case.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Return Profile</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    The base scenario anchors committee discussion, while the bull and bear cases
                    frame upside and downside.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Diligence Posture</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Remaining open items are tracked directly below in the risk list and diligence
                    checklist.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6">
            <Card>
              <div className="eyebrow">Committee Snapshot</div>
              <div className="mt-4 grid gap-4 text-sm text-slate-300">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Updated</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatDate(latestRun.createdAt)}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Latest Base Case</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(
                      latestRun.baseCaseValueKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Confidence</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatNumber(latestRun.confidenceScore, 1)}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="eyebrow">Key Risks</div>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {latestRun.keyRisks.map((risk) => (
                  <li
                    key={risk}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    {risk}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="eyebrow">DD Checklist</div>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {latestRun.ddChecklist.map((item) => (
                  <li
                    key={item}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <ValuationBreakdown
          assumptions={latestRun.assumptions as Record<string, number | string | null>}
          provenance={provenance}
          displayCurrency={displayCurrency}
          fxRateToKrw={fxRateToKrw}
        />

        <ConfidenceBreakdown
          engineVersion={latestRun.engineVersion}
          confidenceScore={latestRun.confidenceScore}
          address={asset.address}
          siteProfile={asset.siteProfile}
          buildingSnapshot={asset.buildingSnapshot}
          permitSnapshot={asset.permitSnapshot}
          energySnapshot={asset.energySnapshot}
          marketSnapshot={asset.marketSnapshot}
          provenance={provenance}
        />

        <ValuationSignals
          confidenceScore={latestRun.confidenceScore}
          assumptions={latestRun.assumptions as Record<string, number | string | null>}
          provenance={provenance}
        />

        <div className="print-break grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-4">
            <div className="eyebrow">Scenario Table</div>
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">{scenario.name}</h3>
                  <span className="text-sm text-slate-400">
                    {formatCurrencyFromKrwAtRate(
                      scenario.valuationKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <div>
                    <div className="text-slate-500">Implied Yield</div>
                    <div>{formatPercent(scenario.impliedYieldPct)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Exit Cap Rate</div>
                    <div>{formatPercent(scenario.exitCapRatePct)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">DSCR</div>
                    <div>{formatNumber(scenario.debtServiceCoverage, 2)}x</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-400">{scenario.notes}</p>
              </div>
            ))}
          </Card>

          <div className="grid gap-6">
            <ValuationProvenance entries={provenance} />

            <Card className="hero-mesh print-hidden">
              <div className="eyebrow">Next Step</div>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                See how this IM is generated from a live workflow.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Open the admin console to create a new asset, run the analysis, and produce a new
                committee-ready memo from live data and assumptions.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/admin/assets/new">
                  <Button>Start New Analysis</Button>
                </Link>
                <Link href="/admin">
                  <Button variant="secondary">Open Console</Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell space-y-6 py-10">
        <div className="max-w-3xl">
          <div className="eyebrow">용어 해설</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            이 메모에서 쓰는 평가 용어.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            샘플 IM은 영문 IC 양식을 그대로 보여줍니다. 표기된 평가 · 시나리오 · 신뢰도 용어는 아래
            정의를 참고해 주세요.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {glossary.map((entry) => (
            <Card key={entry.term} className="min-h-[170px]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-white">{entry.term}</h3>
                <span className="text-sm text-slate-400">{entry.ko}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-400">{entry.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-sm text-white">{children}</dd>
    </div>
  );
}
