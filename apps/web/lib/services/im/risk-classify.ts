/**
 * Lightweight risk/diligence classification for the IM register view.
 *
 * The valuation engine emits key risks and DD items as free-text strings, so a
 * full structured register (operator-entered owner / mitigation / likelihood)
 * is not available without a workflow we don't have. Rather than render a bare
 * bullet list — or fabricate owner/mitigation fields — we infer a SEVERITY and
 * a CATEGORY from the risk language so the committee can triage. The inference
 * is keyword-based and explicitly labeled as such in the UI.
 *
 * Pure functions, no IO — unit-tested in tests/risk-classify.test.ts.
 */

export type RiskSeverity = 'High' | 'Medium' | 'Low';
export type RiskTone = 'danger' | 'warn' | 'neutral';

export type RiskCategory =
  | 'Legal / Title'
  | 'Permitting / Power'
  | 'Market / Leasing'
  | 'Financial / Debt'
  | 'Environmental'
  | 'General';

export type ClassifiedRisk = {
  text: string;
  severity: RiskSeverity;
  tone: RiskTone;
  category: RiskCategory;
};

const SEVERITY_RANK: Record<RiskSeverity, number> = { High: 0, Medium: 1, Low: 2 };

export function inferRiskSeverity(risk: string): { severity: RiskSeverity; tone: RiskTone } {
  const lower = risk.toLowerCase();
  if (
    /(title|encumbr|permit|power approval|grid approval|critical|liquidity|dscr|default|breach)/.test(
      lower
    )
  ) {
    return { severity: 'High', tone: 'danger' };
  }
  if (
    /(rollover|vacancy|comparable|debt|refinanc|covenant|delay|cost overrun|lease-up)/.test(lower)
  ) {
    return { severity: 'Medium', tone: 'warn' };
  }
  return { severity: 'Low', tone: 'neutral' };
}

export function inferRiskCategory(risk: string): RiskCategory {
  const lower = risk.toLowerCase();
  if (/(title|deed|encumbr|ownership|lien|legal|registr|mortgage)/.test(lower))
    return 'Legal / Title';
  if (/(permit|power|grid|utility|zoning|substation|interconnect)/.test(lower))
    return 'Permitting / Power';
  if (/(flood|seismic|wildfire|environment|contamination|climate|typhoon)/.test(lower))
    return 'Environmental';
  if (/(vacancy|rollover|lease|comparable|demand|market|rent|tenant|absorption)/.test(lower))
    return 'Market / Leasing';
  if (/(dscr|debt|liquidity|refinanc|covenant|interest|leverage|capital)/.test(lower))
    return 'Financial / Debt';
  return 'General';
}

/**
 * Classify and severity-rank a list of risk strings (High → Low, stable within
 * a severity so the engine's original ordering is preserved as a tiebreaker).
 */
export function classifyRisks(risks: string[]): ClassifiedRisk[] {
  return risks
    .map((text) => {
      const { severity, tone } = inferRiskSeverity(text);
      return { text, severity, tone, category: inferRiskCategory(text) };
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
