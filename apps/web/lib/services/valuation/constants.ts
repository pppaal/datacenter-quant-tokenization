/**
 * Single source of truth for the cross-cutting, analyst-auditable valuation
 * assumptions used across `lib/services/valuation/*`.
 *
 * SCOPE / PHILOSOPHY
 * ------------------
 * This module deliberately holds ONLY the handful of constants that are either
 * (a) genuinely shared by more than one valuation module, or (b) headline
 * underwriting assumptions an analyst/auditor must be able to find in one place
 * (terminal floors, comp-adjustment clamps & elasticity, the engine-wide
 * confidence-score range, and the default investment-verdict hurdles).
 *
 * It is NOT a dumping ground for every numeric literal. Per-asset-class tuning
 * (cap-rate / opex / occupancy / debt assumptions in the income-config and
 * per-strategy builders) intentionally stays local to those builders — those
 * numbers are MEANT to differ per class and grouping them here would obscure,
 * not clarify. Likewise, literals whose value is coincidentally equal to one of
 * these (e.g. a `4.8` confidence floor vs. a `4.8%` exit-cap floor) are NOT
 * unified here: equal numbers with different meanings must move independently.
 *
 * Every value below is pinned by `tests/valuation-constants.test.ts` so an
 * accidental future edit trips a test rather than silently re-pricing deals.
 */

// ---------------------------------------------------------------------------
// Comparable-sale adjustment bounds / coefficients (거래사례비교법)
// Authoritative home for the constants historically declared in
// `comp-adjustments.ts` (which now re-exports them). Audit-worthy because they
// bound how far any single comp can move the reconciled value.
// ---------------------------------------------------------------------------

/** Max absolute single-factor comp adjustment (±%). Source: comp-adjustments.ts
 * — beyond ±35% on one dimension a comp is too dissimilar to trust. */
export const MAX_FACTOR_ADJUSTMENT_PCT = 35;

/** Max absolute *net* (compounded) comp adjustment (±%). Source:
 * comp-adjustments.ts — keeps the adjusted price within ±60% of raw even if
 * every factor pegs its bound. */
export const MAX_NET_ADJUSTMENT_PCT = 60;

/** Default annual capital-value growth (%/yr) for time-adjustment when no
 * market index signal is supplied. Source: comp-adjustments.ts — deliberately
 * modest (below historical Seoul prime) so stale comps are never over-inflated. */
export const DEFAULT_ANNUAL_PRICE_GROWTH_PCT = 2.5;

/** Cap on the effective annual growth (%/yr) used in time-adjustment. Source:
 * comp-adjustments.ts — stops a noisy index spike compounding on an old comp. */
export const MAX_ANNUAL_GROWTH_PCT = 12;

/** Constant-elasticity coefficient for the size (economies-of-scale)
 * adjustment: pricePerSqm ∝ area^(−SIZE_ELASTICITY). Source: comp-adjustments.ts
 * — 0.10 is intentionally small/conservative for noisy KR commercial data. */
export const SIZE_ELASTICITY = 0.1;

// ---------------------------------------------------------------------------
// Engine-wide confidence-score clamp range (0–10 scale)
// Shared by credit-overlay.ts (DEFAULT_CONFIDENCE_BOUNDS fallback),
// data-center-sections.ts, and strategies/land.ts. Declared as a [floor,
// ceiling] PAIR so the shared semantic — not a bare number that also appears
// elsewhere with a different meaning — is what gets centralized.
// ---------------------------------------------------------------------------

/** Lowest confidence score the engine will report for strategies without their
 * own declared bounds. Source: credit-overlay.ts / data-center-sections.ts /
 * strategies/land.ts ("4.5–9.9 engine convention"). */
export const ENGINE_CONFIDENCE_FLOOR = 4.5;

/** Highest confidence score under the same engine-wide convention. */
export const ENGINE_CONFIDENCE_CEILING = 9.9;

/** Convenience pair matching `ConfidenceBounds` { floor, ceiling }. */
export const ENGINE_CONFIDENCE_BOUNDS = {
  floor: ENGINE_CONFIDENCE_FLOOR,
  ceiling: ENGINE_CONFIDENCE_CEILING
} as const;

// ---------------------------------------------------------------------------
// Lease-DCF terminal-value floors
// ---------------------------------------------------------------------------

/** Floor on forward terminal NOI as a fraction of total capex, so a degenerate
 * (near-zero / suppressed) stabilized NOI can't collapse the exit value to ~0.
 * Source: lease-dcf.ts — conservative downside anchor, not a typical-case
 * adjustment. */
export const TERMINAL_NOI_FLOOR_RATIO = 0.01;

// ---------------------------------------------------------------------------
// Investment-verdict default hurdles (all overridable per-deal)
// Source: investment-verdict.ts. Centralized because these are the headline
// underwriting gates an IC reviewer must be able to audit at a glance.
// ---------------------------------------------------------------------------

/** Default target levered IRR (%). Source: investment-verdict.ts. */
export const DEFAULT_TARGET_LEVERED_IRR_PCT = 12;

/** Default floor on P10 (downside) IRR (%). Source: investment-verdict.ts. */
export const DEFAULT_FLOOR_P10_IRR_PCT = 6;

/** Default max acceptable probability of IRR < 8% (fraction). Source:
 * investment-verdict.ts. */
export const DEFAULT_MAX_PROB_BELOW_8_PCT = 0.25;

/** Default minimum P50 MOIC (x). Source: investment-verdict.ts. */
export const DEFAULT_MIN_MOIC_P50 = 1.5;

/** Default max macro-risk score on the 0–100 scale. Source:
 * investment-verdict.ts. */
export const DEFAULT_MAX_MACRO_SCORE = 70;

/** Default DSCR covenant (x) when the caller supplies none. Source:
 * investment-verdict.ts. */
export const DEFAULT_DSCR_COVENANT = 1.15;
