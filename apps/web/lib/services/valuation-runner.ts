import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
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

  if (pythonEligible && mode !== 'typescript') {
    try {
      const python = await runPythonValuation(bundle);
      // The dossier (pro-forma, lease ladder, valuation breakdown) reads the
      // TS engine's assumption shape — notably `proForma.baseCase`. The Python
      // engine returns a lighter assumption set without it, so under `auto`
      // only serve the Python result when it actually carries that shape;
      // otherwise fall through to the TS engine. `mode === 'python'` opts in
      // explicitly and accepts the lighter output.
      const pythonHasProForma = Boolean(
        (python?.assumptions as { proForma?: { baseCase?: unknown } } | undefined)?.proForma
          ?.baseCase
      );
      if (python && (pythonHasProForma || mode === 'python')) {
        const analysis: UnderwritingAnalysis = {
          asset: {
            name: bundle.asset.name,
            assetCode: bundle.asset.assetCode,
            assetClass: bundle.asset.assetClass,
            stage: bundle.asset.stage,
            market: bundle.asset.market
          },
          baseCaseValueKrw: python.baseCaseValueKrw,
          confidenceScore: python.confidenceScore,
          underwritingMemo: '',
          keyRisks: python.keyRisks,
          ddChecklist: python.ddChecklist,
          assumptions: python.assumptions,
          provenance: buildValuationAnalysisProvenance(bundle),
          scenarios: python.scenarios
        };
        const finalized = applyCreditOverlay(analysis, bundle);
        finalized.underwritingMemo = await generateUnderwritingMemo(finalized);
        return {
          analysis: finalized,
          engineVersion: 'kdc-kr-py-v1'
        };
      }
    } catch (error) {
      if (mode === 'python') {
        throw error;
      }
    }
  }

  return {
    analysis: await buildValuationAnalysis(bundle),
    engineVersion: pythonEligible ? 'kdc-kr-ts-v1' : 're-underwriting-ts-v1'
  };
}

function buildValuationAnalysisProvenance(
  bundle: UnderwritingBundle
): UnderwritingAnalysis['provenance'] {
  return [
    {
      field: 'address',
      value: bundle.address ? `${bundle.address.line1}, ${bundle.address.city}` : null,
      sourceSystem: 'manual-intake',
      mode: 'manual',
      fetchedAt: new Date().toISOString(),
      freshnessLabel: bundle.address?.sourceLabel || 'manual intake'
    },
    {
      field: 'capRatePct',
      value: bundle.marketSnapshot?.capRatePct ?? null,
      sourceSystem: 'market-snapshot',
      mode:
        bundle.marketSnapshot?.sourceStatus === 'FRESH'
          ? 'api'
          : bundle.marketSnapshot?.sourceStatus === 'MANUAL'
            ? 'manual'
            : 'fallback',
      fetchedAt: bundle.marketSnapshot?.sourceUpdatedAt?.toISOString() ?? new Date().toISOString(),
      freshnessLabel: bundle.marketSnapshot?.sourceStatus.toLowerCase() ?? 'fallback dataset'
    },
    {
      field: 'tariffKrwPerKwh',
      value: bundle.energySnapshot?.tariffKrwPerKwh ?? null,
      sourceSystem: 'energy-snapshot',
      mode:
        bundle.energySnapshot?.sourceStatus === 'FRESH'
          ? 'api'
          : bundle.energySnapshot?.sourceStatus === 'MANUAL'
            ? 'manual'
            : 'fallback',
      fetchedAt: bundle.energySnapshot?.sourceUpdatedAt?.toISOString() ?? new Date().toISOString(),
      freshnessLabel: bundle.energySnapshot?.sourceStatus.toLowerCase() ?? 'fallback dataset'
    },
    {
      field: 'powerApprovalStatus',
      value: bundle.permitSnapshot?.powerApprovalStatus ?? null,
      sourceSystem: 'permit-snapshot',
      mode:
        bundle.permitSnapshot?.sourceStatus === 'FRESH'
          ? 'api'
          : bundle.permitSnapshot?.sourceStatus === 'MANUAL'
            ? 'manual'
            : 'fallback',
      fetchedAt: bundle.permitSnapshot?.sourceUpdatedAt?.toISOString() ?? new Date().toISOString(),
      freshnessLabel: bundle.permitSnapshot?.sourceStatus.toLowerCase() ?? 'fallback dataset'
    }
  ];
}
