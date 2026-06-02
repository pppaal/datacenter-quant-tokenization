import { formatCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { buildLiquidityLadder } from '@/lib/services/im/liquidity';
import {
  buildBalanceSheet,
  buildCreditRatios,
  buildIncomeStatement,
  buildSensitivityMatrix,
  projectFinancials
} from '@/lib/services/im/credit-analysis';
import {
  DEFAULT_CASH_FLOW_ASSUMPTIONS,
  buildCashFlowSlice,
  projectCfadsDscr
} from '@/lib/services/im/cash-flow';
import { buildCovenantAlerts, buildCovenantHeadroom } from '@/lib/services/im/covenant';
import { buildWaterfall, readSpvFromAssumptions } from '@/lib/services/im/waterfall';
import { buildPeerComparison, pickSectorKey } from '@/lib/services/im/peer-benchmarks';
import {
  pickDebtAmortizationPct,
  pickInterestRatePct,
  pickRevenueGrowthPct
} from '@/lib/services/im/projection-inputs';
import type { SampleReportData } from './types';

export function CounterpartySection({ data }: { data: SampleReportData }) {
  const {
    asset,
    latestRun,
    displayCurrency,
    fxRateToKrw,
    returnsSnapshot,
    proForma,
    sponsorRollup,
    tenantRollup
  } = data;
  if (!(asset.counterparties && asset.counterparties.length > 0)) {
    return null;
  }
  return (
    <section id="im-counterparty" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Counterparty financials</div>
          <Badge>
            {asset.counterparties.length} counterpart
            {asset.counterparties.length === 1 ? 'y' : 'ies'}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Filed financials, derived credit ratios benchmarked against KR sponsor peer medians,
          10-year projection, CFADS-based DSCR forward path, distribution waterfall, liquidity
          ladder, and 4×4 sensitivity grid.
        </p>

        {(() => {
          const strips: Array<{ label: string; rollup: typeof sponsorRollup }> = [];
          if (sponsorRollup && sponsorRollup.counterpartyCount > 0) {
            strips.push({
              label: `Sponsor rollup · ${sponsorRollup.counterpartyCount} CP`,
              rollup: sponsorRollup
            });
          }
          if (tenantRollup && tenantRollup.counterpartyCount > 0) {
            strips.push({
              label: `Tenant rollup · ${tenantRollup.counterpartyCount} CP`,
              rollup: tenantRollup
            });
          }
          if (strips.length < 2 && (sponsorRollup?.counterpartyCount ?? 0) <= 1) {
            return null;
          }
          return (
            <div className="mt-5 space-y-3">
              {strips.map(({ label, rollup }) => (
                <div
                  key={label}
                  className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    {label} · {rollup!.weightingBasis}-weighted
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Avg score
                      </div>
                      <div className="mt-1 font-mono text-sm font-semibold text-white">
                        {rollup!.averageScore !== null ? rollup!.averageScore.toFixed(0) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Wtd leverage
                      </div>
                      <div className="mt-1 font-mono text-sm font-semibold text-white">
                        {rollup!.weightedLeverage !== null
                          ? `${rollup!.weightedLeverage.toFixed(2)}x`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Wtd interest coverage
                      </div>
                      <div className="mt-1 font-mono text-sm font-semibold text-white">
                        {rollup!.weightedInterestCoverage !== null
                          ? `${rollup!.weightedInterestCoverage.toFixed(2)}x`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Risk mix
                      </div>
                      <div className="mt-1 font-mono text-[11px]">
                        <span className="text-emerald-300">{rollup!.riskMix.LOW} LOW</span>
                        {' · '}
                        <span className="text-amber-300">{rollup!.riskMix.MODERATE} MOD</span>
                        {' · '}
                        <span className="text-rose-300">{rollup!.riskMix.HIGH} HIGH</span>
                      </div>
                      {rollup!.weakestCounterpartyName ? (
                        <div className="mt-1 text-[10px] text-slate-500">
                          Weakest: {rollup!.weakestCounterpartyName}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="mt-5 space-y-8">
          {asset.counterparties.map((cp) => {
            const latestFs = cp.financialStatements?.[0] ?? null;
            const latestCa = latestFs?.creditAssessments?.[0] ?? null;
            if (!latestFs) {
              return (
                <div
                  key={cp.id}
                  className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-white">{cp.name}</div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {cp.role}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">No financial statement on file.</p>
                </div>
              );
            }
            const inc = buildIncomeStatement(latestFs);
            const bs = buildBalanceSheet(latestFs);
            const ratios = buildCreditRatios(latestFs);
            // Drive forward-projection inputs from the bundle's
            // own data: macro rent_growth_pct anchors revenue
            // growth; the asset's debt facility schedule anchors
            // amortization pace. Each pick carries a provenance
            // string the IM renders so the LP can challenge any
            // input.
            const growthInput = pickRevenueGrowthPct(asset.macroSeries ?? []);
            const amortInput = pickDebtAmortizationPct(asset.debtFacilities ?? []);
            const rateInput = pickInterestRatePct(
              asset.debtFacilities ?? [],
              asset.macroSeries ?? []
            );
            const projection = projectFinancials(latestFs, {
              revenueGrowthPct: growthInput.value,
              debtAmortizationPct: amortInput.value,
              horizonYears: 10
            });
            const sensitivityMatrix = buildSensitivityMatrix(latestFs, {
              ebitdaShocks: [0, -10, -20, -30],
              rateShocks: [0, 100, 200, 300],
              debtRepricedPct: 1.0
            });

            // Tier 1 derivatives — cash flow / FCF / CFADS / EBIT /
            // Net income. Tax rate sourced from the asset's
            // taxAssumption when present, falling back to the
            // default. Maintenance capex / D&A / WC are sector
            // proxies; the IM renders them under the FCF table.
            const taxRateDecimal =
              typeof asset.taxAssumption?.corporateTaxPct === 'number'
                ? asset.taxAssumption.corporateTaxPct / 100
                : DEFAULT_CASH_FLOW_ASSUMPTIONS.taxRate;
            const principalRepayment =
              bs.totalDebtKrw !== null ? bs.totalDebtKrw * (amortInput.value / 100) : 0;
            const cashFlow = buildCashFlowSlice({
              ebitdaKrw: latestFs.ebitdaKrw,
              revenueKrw: latestFs.revenueKrw,
              interestExpenseKrw: latestFs.interestExpenseKrw,
              taxRate: taxRateDecimal,
              daRateOfRevenue: DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue,
              maintCapexRateOfRevenue: DEFAULT_CASH_FLOW_ASSUMPTIONS.maintCapexRateOfRevenue,
              wcChangeRate: DEFAULT_CASH_FLOW_ASSUMPTIONS.wcChangeRate,
              principalRepaymentKrw: principalRepayment
            });
            // Tier 1 covenant headroom — current value distance from
            // benchmark + first-breach-year over the projection.
            const covenantHeadroom = buildCovenantHeadroom(projection);
            const covenantAlerts = buildCovenantAlerts(covenantHeadroom);
            // Tier 2 waterfall — tier table + LP/GP take at projected IRR.
            const spv = readSpvFromAssumptions(latestRun.assumptions);
            const projectedIrrPct = proForma?.summary.equityIrr ?? returnsSnapshot.goingInYieldPct;
            const waterfall = buildWaterfall(spv, projectedIrrPct);
            // Tier 2 liquidity ladder — facility maturities × liquid
            // resources (cash + estimated annual operating CF).
            const liquidity = buildLiquidityLadder(
              asset.debtFacilities ?? [],
              {
                cashKrw: bs.cashKrw,
                estimatedAnnualCashFlowKrw: cashFlow.operatingCashFlowKrw
              },
              new Date().getFullYear()
            );
            // Tier 3 forward-path CFADS DSCR + peer benchmarks.
            const cfadsProjection =
              inc.revenueKrw !== null && inc.ebitdaMarginPct !== null && bs.totalDebtKrw !== null
                ? projectCfadsDscr(
                    {
                      revenueKrw: inc.revenueKrw,
                      ebitdaMarginPct: inc.ebitdaMarginPct,
                      interestRatePct: rateInput.value,
                      totalDebtKrw: bs.totalDebtKrw
                    },
                    {
                      revenueGrowthPct: growthInput.value,
                      debtAmortizationPct: amortInput.value,
                      horizonYears: 10,
                      taxRate: taxRateDecimal
                    }
                  )
                : [];
            const peerComparison = buildPeerComparison(
              Object.fromEntries(ratios.map((r) => [r.key, r.value])),
              pickSectorKey(asset.assetClass, asset.market)
            );
            const riskTone =
              latestCa?.riskLevel === 'LOW'
                ? 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200'
                : latestCa?.riskLevel === 'HIGH'
                  ? 'border-rose-300/30 bg-rose-300/[0.04] text-rose-200'
                  : 'border-amber-300/30 bg-amber-300/[0.04] text-amber-200';
            const fmt = (v: number | null) =>
              v !== null ? formatCurrencyFromKrwAtRate(v, displayCurrency, fxRateToKrw) : '—';
            return (
              <div
                key={cp.id}
                className="rounded-[20px] border border-white/10 bg-white/[0.015] p-5"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold text-white">{cp.name}</div>
                      {(() => {
                        const provSys = latestFs.provenanceSystem ?? '';
                        const sourceLabel = provSys.toUpperCase().includes('DART')
                          ? {
                              text: 'DART filing',
                              tone: 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200'
                            }
                          : provSys.toUpperCase().includes('AUDIT')
                            ? {
                                text: 'Audited',
                                tone: 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200'
                              }
                            : provSys.toUpperCase().includes('UPLOAD')
                              ? {
                                  text: 'Uploaded filing',
                                  tone: 'border-amber-300/30 bg-amber-300/[0.04] text-amber-200'
                                }
                              : {
                                  text: 'Management estimate',
                                  tone: 'border-slate-300/30 bg-slate-300/[0.04] text-slate-300'
                                };
                        return (
                          <span
                            className={`rounded-[8px] border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${sourceLabel.tone}`}
                          >
                            {sourceLabel.text}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      <span className="uppercase tracking-wide">{cp.role}</span>
                      {' · '}
                      <span>{latestFs.fiscalPeriod ?? 'FY'}</span>
                      {latestFs.fiscalYear ? ` ${latestFs.fiscalYear}` : ''}
                      {' · '}
                      <span>{latestFs.currency ?? 'KRW'}</span>
                      {latestFs.provenanceSystem
                        ? ` · source: ${latestFs.provenanceSystem}`
                        : ' · source: operator-entered (no filing)'}
                      {' · '}
                      <span>
                        {(cp.financialStatements?.length ?? 0) === 1
                          ? 'No prior periods on file'
                          : `${cp.financialStatements?.length ?? 0} periods on file`}
                      </span>
                    </div>
                  </div>
                  {latestCa ? (
                    <span
                      className={`rounded-[10px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${riskTone}`}
                    >
                      {latestCa.riskLevel} · score {latestCa.score.toFixed(0)}
                    </span>
                  ) : null}
                </div>

                {/* Multi-year YoY trend (top three periods on file) */}
                {(cp.financialStatements?.length ?? 0) >= 2 ? (
                  <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="fine-print">Multi-year trend</div>
                    <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-2 font-semibold">Period</th>
                            <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                            <th className="px-2 py-2 text-right font-semibold">EBITDA</th>
                            <th className="px-2 py-2 text-right font-semibold">EBITDA margin</th>
                            <th className="px-2 py-2 text-right font-semibold">Total debt</th>
                            <th className="px-2 py-2 text-right font-semibold">Equity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {cp.financialStatements!.slice(0, 5).map((row, idx, arr) => {
                            const next = arr[idx + 1] ?? null;
                            const num = (d: { toNumber: () => number } | null | undefined) =>
                              d ? d.toNumber() : null;
                            const rev = num(row.revenueKrw);
                            const ebd = num(row.ebitdaKrw);
                            const debt = num(row.totalDebtKrw);
                            const eq = num(row.totalEquityKrw);
                            const margin = rev && ebd ? (ebd / rev) * 100 : null;
                            const yoyRev =
                              next && rev !== null && num(next.revenueKrw)
                                ? ((rev - num(next.revenueKrw)!) / num(next.revenueKrw)!) * 100
                                : null;
                            const yoyEbd =
                              next && ebd !== null && num(next.ebitdaKrw)
                                ? ((ebd - num(next.ebitdaKrw)!) / num(next.ebitdaKrw)!) * 100
                                : null;
                            const arrow = (delta: number | null) => {
                              if (delta === null) return null;
                              const tone = delta > 0 ? 'text-emerald-300' : 'text-rose-300';
                              const sign = delta > 0 ? '▲' : '▼';
                              return (
                                <div className={`text-[9px] ${tone}`}>
                                  {sign} {Math.abs(delta).toFixed(1)}% YoY
                                </div>
                              );
                            };
                            return (
                              <tr key={`${row.fiscalYear ?? idx}`}>
                                <td className="px-2 py-2 font-mono text-slate-400">
                                  {row.fiscalPeriod ?? 'FY'} {row.fiscalYear ?? ''}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {rev !== null
                                    ? formatCurrencyFromKrwAtRate(rev, displayCurrency, fxRateToKrw)
                                    : '—'}
                                  {arrow(yoyRev)}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {ebd !== null
                                    ? formatCurrencyFromKrwAtRate(ebd, displayCurrency, fxRateToKrw)
                                    : '—'}
                                  {arrow(yoyEbd)}
                                </td>
                                <td className="px-2 py-2 text-right font-mono text-slate-400">
                                  {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                                </td>
                                <td className="px-2 py-2 text-right font-mono text-slate-400">
                                  {debt !== null
                                    ? formatCurrencyFromKrwAtRate(
                                        debt,
                                        displayCurrency,
                                        fxRateToKrw
                                      )
                                    : '—'}
                                </td>
                                <td className="px-2 py-2 text-right font-mono text-slate-400">
                                  {eq !== null
                                    ? formatCurrencyFromKrwAtRate(eq, displayCurrency, fxRateToKrw)
                                    : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* Income statement + Balance sheet side-by-side */}
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="fine-print">Income statement</div>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Revenue</dt>
                        <dd className="font-mono text-white">{fmt(inc.revenueKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">EBITDA</dt>
                        <dd className="font-mono text-white">{fmt(inc.ebitdaKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">EBITDA margin</dt>
                        <dd className="font-mono text-white">
                          {inc.ebitdaMarginPct !== null
                            ? `${inc.ebitdaMarginPct.toFixed(1)}%`
                            : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">D&amp;A (assumed)</dt>
                        <dd className="font-mono text-white">{fmt(cashFlow.daKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">EBIT</dt>
                        <dd className="font-mono text-white">{fmt(cashFlow.ebitKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Interest expense</dt>
                        <dd className="font-mono text-white">{fmt(inc.interestExpenseKrw)}</dd>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-1.5">
                        <dt className="text-slate-300">Net income (post-tax)</dt>
                        <dd className="font-mono font-semibold text-white">
                          {fmt(cashFlow.netIncomeKrw)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-[10px] leading-4 text-slate-500">
                      D&amp;A: {(DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue * 100).toFixed(1)}%
                      of revenue (sector proxy); tax: {(taxRateDecimal * 100).toFixed(1)}%
                      {asset.taxAssumption?.corporateTaxPct !== undefined &&
                      asset.taxAssumption.corporateTaxPct !== null
                        ? ' (asset taxAssumption)'
                        : ' (default)'}
                      .
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="fine-print">Balance sheet</div>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Total assets</dt>
                        <dd className="font-mono text-white">{fmt(bs.totalAssetsKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Cash</dt>
                        <dd className="font-mono text-white">{fmt(bs.cashKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Total debt</dt>
                        <dd className="font-mono text-white">{fmt(bs.totalDebtKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Net debt</dt>
                        <dd className="font-mono text-white">{fmt(bs.netDebtKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Other liabilities</dt>
                        <dd className="font-mono text-white">{fmt(bs.otherLiabilitiesKrw)}</dd>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-1.5">
                        <dt className="text-slate-300">Total equity</dt>
                        <dd className="font-mono font-semibold text-white">
                          {fmt(bs.totalEquityKrw)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Equity ratio</dt>
                        <dd className="font-mono text-white">
                          {bs.equityRatio !== null ? `${(bs.equityRatio * 100).toFixed(1)}%` : '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Cash flow + FCF + CFADS DSCR */}
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="fine-print">Cash flow</div>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Operating cash flow</dt>
                        <dd className="font-mono text-white">
                          {fmt(cashFlow.operatingCashFlowKrw)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Maintenance capex</dt>
                        <dd className="font-mono text-white">
                          ({fmt(cashFlow.maintenanceCapexKrw)})
                        </dd>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-1.5">
                        <dt className="text-slate-300">Free cash flow</dt>
                        <dd className="font-mono font-semibold text-white">
                          {fmt(cashFlow.freeCashFlowKrw)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">CFADS</dt>
                        <dd className="font-mono text-white">{fmt(cashFlow.cfadsKrw)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Debt service (interest + principal)</dt>
                        <dd className="font-mono text-white">{fmt(cashFlow.debtServiceKrw)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="fine-print">CFADS DSCR (lender-grade)</div>
                    <div className="mt-3 text-3xl font-semibold text-white">
                      {cashFlow.cfadsDscr !== null ? `${cashFlow.cfadsDscr.toFixed(2)}x` : '—'}
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">
                      CFADS ÷ debt service (interest + scheduled principal). Tighter than the
                      headline EBITDA / interest coverage above because it nets out cash tax and
                      maintenance capex. The 2.0x lender minimum is the typical project- finance
                      covenant.
                    </p>
                    <div className="mt-3 grid gap-1.5 text-[10px] text-slate-500">
                      <div>
                        D&amp;A proxy:{' '}
                        {(DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue * 100).toFixed(1)}% of
                        revenue
                      </div>
                      <div>
                        Maint capex proxy:{' '}
                        {(DEFAULT_CASH_FLOW_ASSUMPTIONS.maintCapexRateOfRevenue * 100).toFixed(1)}%
                        of revenue
                      </div>
                      <div>
                        WC drag: {(DEFAULT_CASH_FLOW_ASSUMPTIONS.wcChangeRate * 100).toFixed(1)}% of
                        revenue
                      </div>
                      <div>Tax rate: {(taxRateDecimal * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>

                {/* Covenant alerts banner — surfaced above the headroom card */}
                {covenantAlerts.length > 0 ? (
                  <div className="mt-5 space-y-2">
                    {covenantAlerts.map((a) => {
                      const tone =
                        a.severity === 'critical'
                          ? 'border-rose-300/40 bg-rose-300/[0.06]'
                          : a.severity === 'warning'
                            ? 'border-amber-300/40 bg-amber-300/[0.05]'
                            : 'border-amber-300/20 bg-amber-300/[0.03]';
                      const dot = a.severity === 'critical' ? 'bg-rose-300' : 'bg-amber-300';
                      const label =
                        a.severity === 'critical'
                          ? 'Critical'
                          : a.severity === 'warning'
                            ? 'Projected breach'
                            : 'Watch';
                      return (
                        <div
                          key={`${a.ratioKey}-${a.severity}`}
                          className={`flex items-start gap-3 rounded-[14px] border ${tone} px-3 py-2 text-sm`}
                        >
                          <span className={`mt-1.5 inline-block h-2 w-2 rounded-full ${dot}`} />
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">
                              Covenant alert · {label}
                            </div>
                            <p className="mt-1 text-slate-100">{a.message}</p>
                            {a.firstBreachYear && a.firstBreachYear !== 'now' ? (
                              <p className="mt-1 text-[11px] text-slate-400">
                                First breach in{' '}
                                <span className="font-mono text-slate-200">
                                  {a.firstBreachYear}
                                </span>
                                ; worst{' '}
                                <span className="font-mono text-slate-200">
                                  {a.worstValue !== null ? `${a.worstValue.toFixed(2)}x` : '—'}
                                </span>{' '}
                                in {a.worstYear ?? '—'}.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {/* Covenant headroom */}
                {covenantHeadroom.length > 0 ? (
                  <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="fine-print">Covenant headroom &amp; first-breach year</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {covenantHeadroom.map((c) => {
                        const breachTone =
                          c.firstBreachYear === null
                            ? 'border-emerald-300/30 bg-emerald-300/[0.03]'
                            : 'border-rose-300/30 bg-rose-300/[0.04]';
                        return (
                          <div
                            key={c.ratioKey}
                            className={`rounded-[12px] border ${breachTone} px-3 py-2`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-white">
                                  {c.ratioLabel}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Covenant {c.preferred === 'lower' ? '≤' : '≥'}{' '}
                                  {c.benchmark.toFixed(2)}x
                                </div>
                              </div>
                              <div className="text-right font-mono text-xs">
                                <div className="text-white">
                                  {c.currentValue !== null ? `${c.currentValue.toFixed(2)}x` : '—'}
                                </div>
                                <div
                                  className={
                                    (c.headroomPct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                                  }
                                >
                                  {c.headroomPct !== null
                                    ? `${c.headroomPct >= 0 ? '+' : ''}${c.headroomPct.toFixed(1)}% headroom`
                                    : '—'}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 text-[11px] text-slate-400">
                              {c.firstBreachYear === null ? (
                                <>
                                  No breach across the projection horizon. Worst observed:{' '}
                                  <span className="text-white">
                                    {c.worstValue !== null ? `${c.worstValue.toFixed(2)}x` : '—'}
                                  </span>{' '}
                                  in {c.worstYear ?? '—'}.
                                </>
                              ) : (
                                <>
                                  First breach in{' '}
                                  <span className="font-semibold text-rose-200">
                                    {c.firstBreachYear}
                                  </span>
                                  ; worst{' '}
                                  <span className="text-white">
                                    {c.worstValue !== null ? `${c.worstValue.toFixed(2)}x` : '—'}
                                  </span>{' '}
                                  in {c.worstYear ?? '—'}.
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Liquidity ladder */}
                {liquidity.rows.length > 0 && cp.role === 'SPONSOR' ? (
                  <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="fine-print">
                        Liquidity ladder — asset facility vs sponsor liquid resources
                      </div>
                      <div className="text-[10px] text-slate-500">
                        12mo coverage:{' '}
                        <span
                          className={
                            (liquidity.liquidityCoverage ?? 0) >= 1
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }
                        >
                          {liquidity.liquidityCoverage !== null
                            ? `${liquidity.liquidityCoverage.toFixed(2)}x`
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-2 font-semibold">Facility</th>
                            <th className="px-2 py-2 text-right font-semibold">Drawn</th>
                            <th className="px-2 py-2 text-right font-semibold">Rate</th>
                            <th className="px-2 py-2 text-right font-semibold">Term</th>
                            <th className="px-2 py-2 text-right font-semibold">Yearly amort</th>
                            <th className="px-2 py-2 text-right font-semibold">Balloon</th>
                            <th className="px-2 py-2 text-right font-semibold">Balloon yr</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {liquidity.rows.map((row) => (
                            <tr key={row.facilityKey}>
                              <td className="px-2 py-2 text-slate-300">{row.label}</td>
                              <td className="px-2 py-2 text-right font-mono">
                                {fmt(row.drawnKrw)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {row.interestRatePct !== null
                                  ? `${row.interestRatePct.toFixed(2)}%`
                                  : '—'}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {row.termYears !== null ? `${row.termYears.toFixed(0)} yr` : '—'}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {fmt(row.yearlyAmortizationKrw)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {fmt(row.balloonKrw)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">
                                {row.balloonYear ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 grid gap-1.5 text-[10px] text-slate-500">
                      <div>
                        12-month debt service (interest + scheduled principal):{' '}
                        <span className="font-mono text-slate-300">
                          {fmt(liquidity.twelveMonthDebtServiceKrw)}
                        </span>
                      </div>
                      <div>
                        Resources: cash{' '}
                        <span className="font-mono text-slate-300">
                          {fmt(liquidity.cashOnHandKrw)}
                        </span>{' '}
                        + estimated annual operating CF{' '}
                        <span className="font-mono text-slate-300">
                          {fmt(liquidity.estimatedAnnualCashFlowKrw)}
                        </span>
                      </div>
                      {liquidity.peakAnnualPrincipalKrw !== null ? (
                        <div>
                          Peak principal repayment year:{' '}
                          <span className="font-mono text-slate-300">
                            {liquidity.peakYear ?? '—'}
                          </span>{' '}
                          ({fmt(liquidity.peakAnnualPrincipalKrw)})
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Distribution waterfall */}
                {waterfall.tiers.length > 0 ? (
                  <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="fine-print">Distribution waterfall</div>
                      <div className="text-[10px] text-slate-500">
                        Hurdle{' '}
                        {waterfall.hurdleRatePct !== null
                          ? `${waterfall.hurdleRatePct.toFixed(1)}%`
                          : '—'}
                        {' · '}
                        Promote{' '}
                        {waterfall.promoteSharePct !== null
                          ? `${waterfall.promoteSharePct.toFixed(0)}%`
                          : '—'}
                        {' · '}
                        Mgmt fee{' '}
                        {waterfall.managementFeePct !== null
                          ? `${waterfall.managementFeePct.toFixed(2)}%`
                          : '—'}
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-2 font-semibold">Tier</th>
                            <th className="px-2 py-2 text-right font-semibold">IRR threshold</th>
                            <th className="px-2 py-2 text-right font-semibold">LP</th>
                            <th className="px-2 py-2 text-right font-semibold">GP</th>
                            <th className="px-2 py-2 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {waterfall.tiers.map((t) => (
                            <tr key={t.tier}>
                              <td className="px-2 py-2 text-white">{t.tier}</td>
                              <td className="px-2 py-2 text-right font-mono">
                                {t.irrThresholdPct !== null
                                  ? `${t.irrThresholdPct.toFixed(1)}%`
                                  : '—'}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {t.lpSharePct.toFixed(0)}%
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {t.gpSharePct.toFixed(0)}%
                              </td>
                              <td className="px-2 py-2 text-[11px] text-slate-400">
                                {t.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {waterfall.lpTakePct !== null && waterfall.gpTakePct !== null ? (
                      <p className="mt-3 text-[11px] leading-5 text-slate-400">
                        At projected equity IRR{' '}
                        <span className="font-mono text-slate-200">
                          {waterfall.projectedEquityIrrPct !== null
                            ? `${waterfall.projectedEquityIrrPct.toFixed(1)}%`
                            : '—'}
                        </span>
                        : illustrative LP take{' '}
                        <span className="font-mono text-emerald-200">
                          ≈ {waterfall.lpTakePct.toFixed(0)}%
                        </span>{' '}
                        / GP take{' '}
                        <span className="font-mono text-amber-200">
                          ≈ {waterfall.gpTakePct.toFixed(0)}%
                        </span>
                        . Catch-up dollar amount and side-letter LP-specific terms not modeled.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Credit ratios table */}
                <div className="mt-5">
                  <div className="fine-print">Credit ratios — vs typical PE-sponsor thresholds</div>
                  <div className="mt-3 overflow-x-auto rounded-[14px] border border-white/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2 font-semibold">Ratio</th>
                          <th className="px-2 py-2 text-right font-semibold">Value</th>
                          <th className="px-2 py-2 text-right font-semibold">Benchmark</th>
                          <th className="px-2 py-2 font-semibold">Interpretation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {ratios.map((r) => {
                          const dotTone =
                            r.tone === 'good'
                              ? 'bg-emerald-300'
                              : r.tone === 'warn'
                                ? 'bg-amber-300'
                                : r.tone === 'risk'
                                  ? 'bg-rose-300'
                                  : 'bg-slate-600';
                          const fmtVal = (v: number | null) => {
                            if (v === null) return '—';
                            if (r.unit === 'x') return `${v.toFixed(2)}x`;
                            if (r.unit === 'pct') return `${v.toFixed(1)}%`;
                            return v.toFixed(2);
                          };
                          return (
                            <tr key={r.key}>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
                                  <div>
                                    <div className="text-white">{r.label}</div>
                                    <div className="text-[10px] text-slate-500">{r.formula}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-white">
                                {fmtVal(r.value)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">
                                {r.benchmark !== null
                                  ? `${r.preferred === 'higher' ? '≥' : '≤'} ${fmtVal(r.benchmark)}`
                                  : '—'}
                              </td>
                              <td className="px-2 py-2 text-[11px] text-slate-300">
                                {r.interpretation}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Peer benchmark comparison */}
                <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="fine-print">Peer benchmarks — {peerComparison.sectorLabel}</div>
                    <div className="text-[9px] text-slate-500">{peerComparison.sourceCaveat}</div>
                  </div>
                  <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2 font-semibold">Ratio</th>
                          <th className="px-2 py-2 text-right font-semibold">This sponsor</th>
                          <th className="px-2 py-2 text-right font-semibold">P25</th>
                          <th className="px-2 py-2 text-right font-semibold">Median</th>
                          <th className="px-2 py-2 text-right font-semibold">P75</th>
                          <th className="px-2 py-2 text-right font-semibold">Band</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {peerComparison.comparisons.map((c) => {
                          const ratioLabel =
                            ratios.find((r) => r.key === c.ratioKey)?.label ?? c.ratioKey;
                          const ratioUnit = ratios.find((r) => r.key === c.ratioKey)?.unit ?? 'x';
                          const fmtVal = (v: number | null) => {
                            if (v === null) return '—';
                            if (ratioUnit === 'pct') return `${v.toFixed(1)}%`;
                            if (ratioUnit === 'x') return `${v.toFixed(2)}x`;
                            return v.toFixed(2);
                          };
                          const bandTone =
                            c.band === 'top'
                              ? 'text-emerald-300'
                              : c.band === 'mid'
                                ? 'text-amber-300'
                                : c.band === 'bottom'
                                  ? 'text-rose-300'
                                  : 'text-slate-500';
                          const bandLabel =
                            c.band === 'top'
                              ? 'Top quartile'
                              : c.band === 'mid'
                                ? 'Median band'
                                : c.band === 'bottom'
                                  ? 'Bottom quartile'
                                  : 'n/a';
                          return (
                            <tr key={c.ratioKey}>
                              <td className="px-2 py-2 text-slate-300">{ratioLabel}</td>
                              <td className="px-2 py-2 text-right font-mono text-white">
                                {fmtVal(c.observedValue)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">
                                {fmtVal(c.pct25)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">
                                {fmtVal(c.median)}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">
                                {fmtVal(c.pct75)}
                              </td>
                              <td
                                className={`px-2 py-2 text-right text-[10px] font-mono ${bandTone}`}
                              >
                                {bandLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 10-year projection — assumptions sourced from bundle data */}
                {projection.length > 0 ? (
                  <div className="mt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="fine-print">10-year projection</div>
                      <div className="text-[10px] text-slate-500">
                        Revenue growth: {growthInput.value.toFixed(1)}%/yr · Debt amort:{' '}
                        {amortInput.value.toFixed(1)}%/yr · Margin held constant
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-[14px] border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-2 font-semibold">Year</th>
                            <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                            <th className="px-2 py-2 text-right font-semibold">EBITDA</th>
                            <th className="px-2 py-2 text-right font-semibold">Margin</th>
                            <th className="px-2 py-2 text-right font-semibold">Total debt</th>
                            <th className="px-2 py-2 text-right font-semibold">Leverage</th>
                            <th className="px-2 py-2 text-right font-semibold">EBITDA cov</th>
                            <th className="px-2 py-2 text-right font-semibold">CFADS DSCR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {projection.map((row, idx) => {
                            const cfadsRow = cfadsProjection[idx] ?? null;
                            return (
                              <tr key={row.year}>
                                <td className="px-2 py-2 font-mono text-slate-400">{row.year}</td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {fmt(row.revenueKrw)}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {fmt(row.ebitdaKrw)}
                                </td>
                                <td className="px-2 py-2 text-right font-mono text-slate-400">
                                  {row.ebitdaMarginPct !== null
                                    ? `${row.ebitdaMarginPct.toFixed(1)}%`
                                    : '—'}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {fmt(row.totalDebtKrw)}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {row.leverage !== null ? `${row.leverage.toFixed(2)}x` : '—'}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {row.interestCoverage !== null
                                    ? `${row.interestCoverage.toFixed(2)}x`
                                    : '—'}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {cfadsRow?.cfadsDscr !== null &&
                                  cfadsRow?.cfadsDscr !== undefined ? (
                                    <span
                                      className={
                                        cfadsRow.cfadsDscr >= 2.0
                                          ? 'text-emerald-300'
                                          : 'text-rose-300'
                                      }
                                    >
                                      {cfadsRow.cfadsDscr.toFixed(2)}x
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <ul className="mt-3 space-y-1 text-[10px] text-slate-500">
                      <li>
                        <span className="text-slate-400">Revenue growth source:</span>{' '}
                        {growthInput.provenance}
                      </li>
                      <li>
                        <span className="text-slate-400">Debt amortization source:</span>{' '}
                        {amortInput.provenance}
                      </li>
                      <li>
                        <span className="text-slate-400">Baseline rate:</span>{' '}
                        {rateInput.provenance}
                      </li>
                    </ul>
                  </div>
                ) : null}

                {/* 2D Sensitivity matrix — interest coverage at every shock combo */}
                {sensitivityMatrix ? (
                  <div className="mt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="fine-print">
                        Sensitivity — interest coverage at every shock combo
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Covenant floor: leverage ≤ 4.0x · coverage ≥ 2.0x
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-[14px] border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-2 font-semibold">
                              EBITDA shock ↓ / Rate shock →
                            </th>
                            {sensitivityMatrix.rateShocks.map((rs) => (
                              <th key={rs} className="px-2 py-2 text-right font-semibold">
                                {rs >= 0 ? '+' : ''}
                                {rs} bps
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {sensitivityMatrix.cells.map((row, ri) => (
                            <tr key={sensitivityMatrix.ebitdaShocks[ri]}>
                              <td className="px-2 py-2 text-slate-400">
                                {sensitivityMatrix.ebitdaShocks[ri]! >= 0 ? '+' : ''}
                                {sensitivityMatrix.ebitdaShocks[ri]}%
                              </td>
                              {row.map((cell, ci) => {
                                const tone =
                                  cell.passesCovenant === true
                                    ? 'bg-emerald-300/[0.06] text-emerald-200'
                                    : cell.passesCovenant === false
                                      ? 'bg-rose-300/[0.06] text-rose-200'
                                      : '';
                                return (
                                  <td key={ci} className={`px-2 py-2 text-right font-mono ${tone}`}>
                                    {cell.interestCoverage !== null
                                      ? `${cell.interestCoverage.toFixed(2)}x`
                                      : '—'}
                                    <div className="text-[9px] text-slate-500">
                                      lev{' '}
                                      {cell.leverage !== null
                                        ? `${cell.leverage.toFixed(2)}x`
                                        : '—'}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-slate-500">
                      Each cell shows interest coverage and leverage at the shock combo. Green =
                      covenant pass; rose = covenant breach. Rate shock conservatively assumes 100%
                      of the debt balance reprices on a parallel curve shift — actual exposure
                      depends on the fixed/floating split per facility, which is not captured in the
                      current schema. Treat the grid as the worst-case mark; partial fixed-rate
                      hedging would mute the rate-axis shocks.
                    </p>
                  </div>
                ) : null}

                {latestCa?.summary ? (
                  <p className="mt-5 rounded-[12px] border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-300">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      Credit assessment ·{' '}
                    </span>
                    {latestCa.summary}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
