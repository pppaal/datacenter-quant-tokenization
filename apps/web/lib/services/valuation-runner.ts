import { runPythonValuation } from '@/lib/services/python-valuation';
import {
  buildValuationAnalysis,
  type UnderwritingAnalysis,
  type UnderwritingBundle
} from '@/lib/services/valuation-engine';

export async function runValuationAnalysis(
  bundle: UnderwritingBundle
): Promise<{ analysis: UnderwritingAnalysis; engineVersion: string }> {
  const mode = (process.env.VALUATION_ENGINE_MODE || 'auto').toLowerCase();
  const pythonEligible = bundle.asset.assetClass === 'DATA_CENTER';

  // The TypeScript engine is the single canonical valuation: its strategies
  // own the full assumption shape the dossier and reports read (proForma.baseCase,
  // lease ladder, scenarios), plus credit overlay and the underwriting memo.
  const analysis = await buildValuationAnalysis(bundle);
  const engineVersion = pythonEligible ? 'kdc-kr-ts-v1' : 're-underwriting-ts-v1';

  // Optional Python cross-check for data centers. The secondary engine runs an
  // independent value/confidence pass; we record how far it sits from the
  // canonical TS result rather than replacing it, so the two engines can never
  // silently disagree on what the UI shows. `typescript` mode skips it;
  // `python` mode requires it (re-throws on failure).
  if (pythonEligible && mode !== 'typescript') {
    try {
      const python = await runPythonValuation(bundle);
      if (python) {
        const tsValue = analysis.baseCaseValueKrw;
        const valueDeltaPct =
          tsValue > 0 ? ((python.baseCaseValueKrw - tsValue) / tsValue) * 100 : null;
        const assumptions = analysis.assumptions as Record<string, unknown>;
        assumptions.engineCrossCheck = {
          engineVersion: 'kdc-kr-py-v1',
          baseCaseValueKrw: python.baseCaseValueKrw,
          confidenceScore: python.confidenceScore,
          valueDeltaPct: valueDeltaPct === null ? null : Number(valueDeltaPct.toFixed(1))
        };
      }
    } catch (error) {
      if (mode === 'python') {
        throw error;
      }
    }
  }

  return { analysis, engineVersion };
}
