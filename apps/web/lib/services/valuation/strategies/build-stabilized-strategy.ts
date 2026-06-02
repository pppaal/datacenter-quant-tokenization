import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import { debtDdChecklistItem } from '@/lib/services/valuation/stabilized-income-configs';
import {
  buildStabilizedIncomeAssumptions,
  buildStabilizedIncomeDdChecklist,
  buildStabilizedIncomeKeyRisks,
  buildStabilizedIncomeProvenance,
  buildStabilizedIncomeValuation
} from '@/lib/services/valuation/stabilized-income';
import type { StabilizedIncomeValuation } from '@/lib/services/valuation/stabilized-income';
import type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';

type ValuationConfig = Parameters<typeof buildStabilizedIncomeValuation>[2];
type RiskConfig = Parameters<typeof buildStabilizedIncomeKeyRisks>[2];
type ProvenanceConfig = Parameters<typeof buildStabilizedIncomeProvenance>[2];

/**
 * A config field that is either a static value or a builder derived from the
 * bundle (and, for provenance, the computed valuation). The stabilized-income
 * strategies differ here: e.g. office's risk/provenance are bundle-derived
 * builders, while retail/industrial/multifamily pass static values.
 */
type ValueOr<T, A extends unknown[]> = T | ((...args: A) => T);

function resolveValueOr<T, A extends unknown[]>(input: ValueOr<T, A>, ...args: A): T {
  return typeof input === 'function' ? (input as (...args: A) => T)(...args) : input;
}

export type StabilizedStrategyOptions = {
  /** Asset-class label surfaced on the assumptions block (e.g. 'OFFICE'). */
  assetClassLabel: string;
  /** Builds the income-engine config for this asset class. */
  valuationConfig: () => ValuationConfig;
  /** Risk config — a static value or a bundle-derived builder. */
  riskConfig: ValueOr<RiskConfig, [UnderwritingBundle]>;
  /** Provenance config — a static value or a (bundle, valuation)-derived builder. */
  provenanceConfig: ValueOr<ProvenanceConfig, [UnderwritingBundle, StabilizedIncomeValuation]>;
  /** DD checklist base items; the debt item is appended by the factory. */
  ddChecklistBase: string[];
  /** Optional extra assumption fields (e.g. office TI/LC + WALT). */
  assumptionExtras?: (
    bundle: UnderwritingBundle,
    valuation: StabilizedIncomeValuation
  ) => Record<string, unknown>;
};

/**
 * Factory for the stabilized-income valuation strategies (office, retail,
 * industrial, multifamily). They share an identical call sequence — only their
 * config objects/builders differ — so each strategy is now a one-line wiring of
 * its existing configs through this factory.
 *
 * The returned builder reproduces the exact prior sequence: valuation, base
 * scenario pick, analysis assembly (asset header, base value, confidence, key
 * risks, dd checklist, assumptions, provenance, scenarios, stabilizedNoiKrw),
 * credit overlay with `valuation.confidenceBounds`, then memo generation.
 */
export function makeStabilizedStrategy(opts: StabilizedStrategyOptions) {
  // `debtDdChecklistItem` is the single shared debt item every strategy appended;
  // it is read once from the config module so behavior is byte-for-byte identical.
  return async function buildStabilizedValuationAnalysis(
    bundle: UnderwritingBundle,
    context: ValuationStrategyContext = {}
  ): Promise<UnderwritingAnalysis> {
    const valuation = buildStabilizedIncomeValuation(bundle, context, opts.valuationConfig());
    const baseScenario = pickBaseScenario(valuation.scenarios) ?? valuation.scenarios[0];

    const analysis: UnderwritingAnalysis = {
      asset: {
        name: bundle.asset.name,
        assetCode: bundle.asset.assetCode,
        assetClass: bundle.asset.assetClass,
        stage: bundle.asset.stage,
        market: bundle.asset.market
      },
      baseCaseValueKrw: baseScenario.valuationKrw,
      confidenceScore: valuation.confidenceScore,
      underwritingMemo: '',
      keyRisks: buildStabilizedIncomeKeyRisks(
        bundle,
        valuation,
        resolveValueOr(opts.riskConfig, bundle)
      ),
      ddChecklist: buildStabilizedIncomeDdChecklist(opts.ddChecklistBase, debtDdChecklistItem),
      assumptions: buildStabilizedIncomeAssumptions(
        opts.assetClassLabel,
        valuation,
        bundle.comparableSet?.entries.length ?? 0,
        opts.assumptionExtras ? opts.assumptionExtras(bundle, valuation) : {}
      ),
      provenance: buildStabilizedIncomeProvenance(
        bundle,
        valuation,
        resolveValueOr(opts.provenanceConfig, bundle, valuation)
      ),
      scenarios: valuation.scenarios,
      // Expose the strategy's REAL stabilized NOI (the figure behind
      // baseCaseValueKrw) so the analyzer drives the pro-forma off it instead of
      // back-solving value×cap.
      stabilizedNoiKrw: valuation.stabilizedNoiKrw
    };

    const finalized = applyCreditOverlay(analysis, bundle, valuation.confidenceBounds);
    finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

    return finalized;
  };
}
