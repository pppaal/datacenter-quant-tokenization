import { AssetClass } from '@prisma/client';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { formatCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { getValuationRecommendation } from '@/lib/services/valuation/recommendation';
import { formatDate, formatNumber, formatPercent, toSentenceCase } from '@/lib/utils';
import { buildDistressContext } from './facts';
import {
  buildChecklistStatus,
  formatKrw,
  inferDocumentTopic,
  inferSeverityTone,
  pickSupportingDocuments,
  shortHash,
  takeSentences
} from './helpers';
import { type DealReportBundle, type ReportKind, type ReportSection } from './types';

function buildTeaserSections(bundle: DealReportBundle): ReportSection[] {
  const latestRun = bundle.latestValuation;
  const yearOne = bundle.proForma?.years[0];
  const proFormaSummary = bundle.proForma?.summary;
  const distressContext = buildDistressContext(bundle);

  return [
    {
      id: 'situation',
      kicker: 'Situation',
      title: 'Opportunity Frame',
      body: [
        takeSentences(bundle.assetDescription, 2) || 'Asset overview is still being captured.',
        bundle.developmentSummary
          ? takeSentences(bundle.developmentSummary, 2)
          : 'The current package is being positioned as a small private distressed real estate process rather than a broad marketed sale.'
      ].filter(Boolean),
      bullets: distressContext.length
        ? distressContext
        : [
            'Current leverage, legal, and permit data do not yet point to a single critical distress trigger.'
          ]
    },
    {
      id: 'snapshot',
      kicker: 'Snapshot',
      title: 'Asset And Pricing Snapshot',
      facts: [
        { label: 'Location', value: bundle.locationLabel },
        { label: bundle.sizeLabel, value: bundle.sizeValue },
        {
          label: 'Current Value',
          value: latestRun ? formatKrw(bundle, latestRun.baseCaseValueKrw) : 'N/A'
        },
        {
          label: 'Bull / Bear',
          value: `${formatKrw(bundle, latestRun?.bullScenarioValueKrw)} / ${formatKrw(bundle, latestRun?.bearScenarioValueKrw)}`
        },
        {
          label: 'Year 1 Revenue',
          value: yearOne ? formatKrw(bundle, yearOne.totalOperatingRevenueKrw) : 'N/A'
        },
        {
          label: 'Gross Exit Value',
          value: proFormaSummary ? formatKrw(bundle, proFormaSummary.grossExitValueKrw) : 'N/A'
        }
      ]
    },
    {
      id: 'materials',
      kicker: 'Materials',
      title: 'Data Room Excerpt',
      bullets:
        bundle.documents.slice(0, 5).map((document) => {
          const anchor = document.anchoredTxHash
            ? ` / anchored ${shortHash(document.anchoredTxHash)}`
            : '';
          return `${document.title} (${document.documentType}, v${document.currentVersion}, ${formatDate(document.updatedAt)}${anchor})`;
        }) || []
    },
    {
      id: 'process',
      kicker: 'Process',
      title: 'Current Process Position',
      bullets: [
        `Current stage is ${bundle.stage} with ${bundle.counts.documents} document(s) in the exported support pack.`,
        latestRun
          ? `Latest valuation draft is ${latestRun.runLabel} dated ${formatDate(latestRun.createdAt)}.`
          : 'No valuation draft is currently linked to this opportunity.',
        bundle.counts.anchoredDocuments > 0
          ? `${bundle.counts.anchoredDocuments} document(s) have an integrity anchor reference.`
          : 'No document integrity anchor is linked at this time.'
      ]
    },
    {
      id: 'risks',
      kicker: 'Key Flags',
      title: 'Primary Risks',
      bullets: latestRun?.keyRisks.slice(0, 5) ?? [
        'No risk memo has been generated yet. Run valuation and upload core diligence documents first.'
      ]
    }
  ];
}

function buildIcMemoSections(bundle: DealReportBundle): ReportSection[] {
  const latestRun = bundle.latestValuation;
  const yearOne = bundle.proForma?.years[0];
  const summary = bundle.proForma?.summary;
  const quality = bundle.valuationQuality;

  return [
    {
      id: 'transaction',
      kicker: 'Transaction Context',
      title: 'Why This Deal Is On The Table',
      body: [
        takeSentences(latestRun?.underwritingMemo, 3) ||
          'No current underwriting memo is available.',
        bundle.ownerName || bundle.sponsorName
          ? `Current counterparties in the package are ${[bundle.ownerName, bundle.sponsorName].filter(Boolean).join(' / ')}.`
          : 'Named owner and sponsor parties are still sparse in the current package.'
      ].filter(Boolean),
      bullets: buildDistressContext(bundle)
    },
    {
      id: 'valuation',
      kicker: 'Valuation',
      title: 'Underwriting And Downside Frame',
      facts: [
        {
          label: 'Base Case',
          value: latestRun ? formatKrw(bundle, latestRun.baseCaseValueKrw) : 'N/A'
        },
        { label: 'Bull Case', value: formatKrw(bundle, latestRun?.bullScenarioValueKrw) },
        { label: 'Bear Case', value: formatKrw(bundle, latestRun?.bearScenarioValueKrw) },
        {
          label: 'Implied Yield',
          value: latestRun?.baseScenario?.impliedYieldPct
            ? formatPercent(latestRun.baseScenario.impliedYieldPct)
            : 'N/A'
        },
        {
          label: 'Exit Cap',
          value: latestRun?.baseScenario?.exitCapRatePct
            ? formatPercent(latestRun.baseScenario.exitCapRatePct)
            : 'N/A'
        },
        {
          label: 'Levered Equity Value',
          value: summary ? formatKrw(bundle, summary.leveredEquityValueKrw) : 'N/A'
        }
      ]
    },
    {
      id: 'returns',
      kicker: 'Returns',
      title: 'Levered Return Profile',
      facts: [
        {
          label: 'Equity IRR',
          value: summary ? formatPercent(summary.equityIrr) : 'N/A',
          detail: 'Levered, after-tax IRR to the equity from the base-case pro forma.'
        },
        {
          label: 'Unlevered IRR',
          value: summary ? formatPercent(summary.unleveragedIrr) : 'N/A'
        },
        {
          label: 'Equity Multiple',
          value: summary ? `${formatNumber(summary.equityMultiple, 2)}x` : 'N/A'
        },
        {
          label: 'Avg Cash-on-Cash',
          value: summary ? formatPercent(summary.averageCashOnCash) : 'N/A'
        },
        {
          label: 'Payback',
          value: summary?.paybackYear ? `Year ${formatNumber(summary.paybackYear, 0)}` : 'N/A',
          detail: 'First year cumulative equity cash flow turns positive.'
        },
        {
          label: 'Net Exit Proceeds',
          value: summary ? formatKrw(bundle, summary.netExitProceedsKrw) : 'N/A'
        }
      ]
    },
    {
      id: 'cashflow',
      kicker: 'Cash Flow',
      title: 'Opening-Year Cash Flow And Capital Stack',
      facts: [
        {
          label: 'Year 1 Total Op. Rev.',
          value: yearOne ? formatKrw(bundle, yearOne.totalOperatingRevenueKrw) : 'N/A'
        },
        { label: 'Year 1 NOI', value: yearOne ? formatKrw(bundle, yearOne.noiKrw) : 'N/A' },
        {
          label: 'Year 1 Debt Service',
          value: yearOne ? formatKrw(bundle, yearOne.debtServiceKrw) : 'N/A'
        },
        {
          label: 'Year 1 DSCR',
          value: yearOne?.dscr ? `${formatNumber(yearOne.dscr, 2)}x` : 'N/A'
        },
        {
          label: 'Reserve Requirement',
          value: summary ? formatKrw(bundle, summary.reserveRequirementKrw) : 'N/A'
        },
        {
          label: 'Ending Debt Balance',
          value: summary ? formatKrw(bundle, summary.endingDebtBalanceKrw) : 'N/A'
        }
      ],
      bullets: yearOne
        ? [
            `${formatCurrencyFromKrwAtRate(yearOne.tenantCapitalCostKrw, bundle.displayCurrency, bundle.fxRateToKrw)} of TI / LC is currently modeled in Year 1.`,
            `${formatCurrencyFromKrwAtRate(yearOne.nonRecoverableOperatingExpenseKrw, bundle.displayCurrency, bundle.fxRateToKrw)} sits below recoveries as non-recoverable OpEx.`,
            `${yearOne.activeRenewalLeaseCount} active renewal event(s) are reflected in the opening-year lease schedule.`
          ]
        : undefined
    },
    {
      id: 'diligence',
      kicker: 'Diligence',
      title: 'Coverage And Gating Items',
      facts:
        quality?.coverage.map((item) => ({
          label: item.label,
          value: item.status === 'good' ? 'Covered' : 'Thin',
          detail: item.detail,
          tone: item.status === 'good' ? 'good' : 'warn'
        })) ?? [],
      bullets: latestRun?.ddChecklist ?? []
    },
    {
      id: 'decision-request',
      kicker: 'Decision Request',
      title: 'Proposed Committee Posture',
      body: [
        `${getValuationRecommendation(latestRun?.confidenceScore)} is the current recommended posture based on valuation confidence, downside coverage, and document support.`,
        latestRun?.keyRisks.length
          ? `Approval, if granted, should stay conditional on the following: ${latestRun.keyRisks.slice(0, 2).join(' ')}`
          : 'No formal conditions are available yet because the current valuation risk list is empty.'
      ]
    }
  ];
}

function buildDdChecklistSections(bundle: DealReportBundle): ReportSection[] {
  const playbook = getAssetClassPlaybook(bundle.assetClass);
  const docsByDiscipline = {
    legal: bundle.documents.filter((document) => inferDocumentTopic(document) === 'legal').length,
    technical: bundle.documents.filter((document) => inferDocumentTopic(document) === 'technical')
      .length
  };
  const yearOne = bundle.proForma?.years[0];
  const technicalReview = bundle.reviewSummary.disciplines.find(
    (discipline) => discipline.key === 'power_permit'
  );
  const legalReview = bundle.reviewSummary.disciplines.find(
    (discipline) => discipline.key === 'legal_title'
  );
  const leaseReview = bundle.reviewSummary.disciplines.find(
    (discipline) => discipline.key === 'lease_revenue'
  );

  return [
    {
      id: 'commercial',
      kicker: 'Commercial',
      title: playbook.checklistLabels.commercial,
      checklist: [
        {
          label: 'Approved lease evidence',
          detail:
            (leaseReview?.approvedCount ?? 0) > 0
              ? `${leaseReview?.approvedCount ?? 0} approved lease row(s) are valuation-ready${(leaseReview?.pendingCount ?? 0) > 0 ? `, with ${leaseReview?.pendingCount} pending review` : ''}.`
              : (leaseReview?.pendingCount ?? 0) > 0
                ? `${leaseReview?.pendingCount ?? 0} lease row(s) are pending review; the revenue view still falls back to unapproved evidence or model assumptions.`
                : bundle.assetClass === AssetClass.OFFICE
                  ? 'No approved office lease evidence is loaded; the current underwriting still leans on stabilized occupancy, market rent, and rollover assumptions.'
                  : 'No approved lease rows are loaded; the current underwriting still leans on residual lease-up assumptions.',
          status: buildChecklistStatus({
            ready: (leaseReview?.approvedCount ?? 0) > 0,
            partial: (leaseReview?.pendingCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'lease revenue occupancy rent roll')
        },
        {
          label: 'Comparable evidence',
          detail:
            bundle.counts.comparables >= 3
              ? `${bundle.counts.comparables} comparable entries are available for pricing calibration.`
              : `${bundle.counts.comparables} comparable entries are loaded; add more for a robust IC pack.`,
          status: buildChecklistStatus({
            ready: bundle.counts.comparables >= 3,
            partial: bundle.counts.comparables > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'market comparable pricing broker')
        },
        {
          label: 'Year 1 revenue bridge',
          detail: yearOne
            ? `Opening-year total operating revenue is ${formatKrw(bundle, yearOne.totalOperatingRevenueKrw)}.`
            : 'No opening-year pro forma is stored yet.',
          status: buildChecklistStatus({
            ready: Boolean(yearOne),
            partial: Boolean(bundle.latestValuation)
          }),
          sources: pickSupportingDocuments(bundle.documents, 'revenue noi cash flow lease')
        },
        {
          label: 'Pending commercial blockers',
          detail:
            (leaseReview?.pendingCount ?? 0) > 0
              ? bundle.reviewSummary.pendingBlockers
                  .filter((blocker) => blocker.startsWith(playbook.checklistLabels.commercial))
                  .slice(0, 2)
                  .join(' / ')
              : 'No commercial evidence is currently waiting on approval.',
          status: buildChecklistStatus({
            ready: (leaseReview?.pendingCount ?? 0) === 0,
            partial: (leaseReview?.approvedCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'lease revenue diligence pending')
        }
      ]
    },
    {
      id: 'technical',
      kicker: 'Technical',
      title: playbook.checklistLabels.technical,
      checklist: [
        {
          label: 'Technical documents in room',
          detail:
            docsByDiscipline.technical > 0
              ? `${docsByDiscipline.technical} technical / permit document(s) are in the current schedule.`
              : 'No site, permit, building, or engineering document is visible in the current schedule.',
          status: buildChecklistStatus({
            ready: docsByDiscipline.technical >= 2,
            partial: docsByDiscipline.technical > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'permit power utility engineering')
        },
        {
          label: 'Approved technical evidence',
          detail:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'power')?.detail ??
            'Approved technical evidence has not been evaluated.',
          status: buildChecklistStatus({
            ready:
              bundle.valuationQuality?.coverage.find((item) => item.key === 'power')?.status ===
              'good'
          }),
          sources: pickSupportingDocuments(bundle.documents, 'power utility interconnection')
        },
        {
          label: 'Permit visibility',
          detail:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'permit')?.detail ??
            'Permit visibility has not been evaluated.',
          status: buildChecklistStatus({
            ready:
              bundle.valuationQuality?.coverage.find((item) => item.key === 'permit')?.status ===
              'good'
          }),
          sources: pickSupportingDocuments(bundle.documents, 'permit zoning environmental')
        },
        {
          label: 'Pending technical blockers',
          detail:
            (technicalReview?.pendingCount ?? 0) > 0
              ? bundle.reviewSummary.pendingBlockers
                  .filter((blocker) => blocker.startsWith(playbook.checklistLabels.technical))
                  .slice(0, 2)
                  .join(' / ')
              : 'No pending technical records are blocking the review packet.',
          status: buildChecklistStatus({
            ready: (technicalReview?.pendingCount ?? 0) === 0,
            partial: (technicalReview?.approvedCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'permit power pending diligence')
        }
      ]
    },
    {
      id: 'legal',
      kicker: 'Legal',
      title: playbook.checklistLabels.legal,
      checklist: [
        {
          label: 'Legal document support',
          detail:
            docsByDiscipline.legal > 0
              ? `${docsByDiscipline.legal} legal / title document(s) are present.`
              : 'No title, deed, mortgage, or legal pack document is present.',
          status: buildChecklistStatus({
            ready: docsByDiscipline.legal >= 2,
            partial: docsByDiscipline.legal > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'title mortgage legal ownership')
        },
        {
          label: 'Approved legal evidence',
          detail:
            (legalReview?.approvedCount ?? 0) > 0
              ? `${legalReview?.approvedCount ?? 0} approved legal record(s) are staged${(legalReview?.pendingCount ?? 0) > 0 ? `, with ${legalReview?.pendingCount} pending review` : ''}.`
              : (legalReview?.pendingCount ?? 0) > 0
                ? `${legalReview?.pendingCount ?? 0} legal record(s) are pending review before the committee packet is complete.`
                : 'Ownership chain, encumbrance, or planning evidence is not yet recorded in approved form.',
          status: buildChecklistStatus({
            ready: (legalReview?.approvedCount ?? 0) > 0,
            partial: (legalReview?.pendingCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'ownership title register')
        },
        {
          label: 'Debt stack loaded',
          detail:
            bundle.counts.debtFacilities > 0
              ? `${bundle.counts.debtFacilities} debt facility record(s) are in the capital stack.`
              : 'No debt facilities are loaded yet — confirm the capital structure against executed facility documents.',
          status: buildChecklistStatus({ ready: bundle.counts.debtFacilities > 0 }),
          sources: pickSupportingDocuments(bundle.documents, 'debt term sheet financing dscr')
        },
        {
          label: 'Pending legal blockers',
          detail:
            (legalReview?.pendingCount ?? 0) > 0
              ? bundle.reviewSummary.pendingBlockers
                  .filter((blocker) => blocker.startsWith(playbook.checklistLabels.legal))
                  .slice(0, 2)
                  .join(' / ')
              : 'No pending title or legal evidence blockers.',
          status: buildChecklistStatus({
            ready: (legalReview?.pendingCount ?? 0) === 0,
            partial: (legalReview?.approvedCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(
            bundle.documents,
            'title mortgage legal diligence pending'
          )
        }
      ]
    }
  ];
}

function buildRiskMemoSections(bundle: DealReportBundle): ReportSection[] {
  const playbook = getAssetClassPlaybook(bundle.assetClass);
  const latestRun = bundle.latestValuation;
  const quality = bundle.valuationQuality;
  const reviewSummary = bundle.reviewSummary;
  const riskChecklist = latestRun?.keyRisks.length
    ? latestRun.keyRisks.map((risk) => ({
        label: `${toSentenceCase(inferSeverityTone(risk))} risk`,
        detail: risk,
        status: inferSeverityTone(risk) === 'danger' ? ('open' as const) : ('partial' as const),
        sources: pickSupportingDocuments(bundle.documents, risk)
      }))
    : [
        {
          label: 'Risk list missing',
          detail: 'No valuation risk list is available yet.',
          status: 'open' as const,
          sources: pickSupportingDocuments(bundle.documents, 'general risk')
        }
      ];

  const mitigationChecklist = [
    ...(latestRun?.ddChecklist.slice(0, 4).map((item) => ({
      label: item,
      detail: 'Current DD action carried from the latest valuation run.',
      status: 'open' as const,
      sources: pickSupportingDocuments(bundle.documents, item)
    })) ?? []),
    ...(quality?.missingInputs.slice(0, 3).map((item) => ({
      label: item,
      detail: 'Coverage gap inferred from current valuation quality summary.',
      status: 'partial' as const,
      sources: pickSupportingDocuments(bundle.documents, item)
    })) ?? [])
  ];

  return [
    {
      id: 'risk-posture',
      kicker: 'Risk Posture',
      title: 'Current Downside View',
      facts: [
        {
          label: 'Confidence',
          value: latestRun ? `${formatNumber(latestRun.confidenceScore, 1)} / 10` : 'N/A',
          // Absent run = unknown, not critical. Don't paint a red danger flag on
          // missing data (the `?? 0` form made "no valuation" read as a 0 score).
          tone: latestRun == null ? 'neutral' : latestRun.confidenceScore < 5.5 ? 'danger' : 'warn'
        },
        {
          label: 'Base DSCR',
          value: latestRun?.baseScenario?.debtServiceCoverage
            ? `${formatNumber(latestRun.baseScenario.debtServiceCoverage, 2)}x`
            : 'N/A',
          // Missing DSCR = unknown, not a breach. Only flag danger when the metric
          // is actually present and below the covenant floor.
          tone:
            latestRun?.baseScenario?.debtServiceCoverage == null
              ? 'neutral'
              : latestRun.baseScenario.debtServiceCoverage < 1.15
                ? 'danger'
                : 'neutral'
        },
        {
          label: `${playbook.checklistLabels.legal} Coverage`,
          value:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'legal')?.status ===
            'good'
              ? 'Covered'
              : 'Thin',
          tone:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'legal')?.status ===
            'good'
              ? 'good'
              : 'warn'
        },
        {
          label: 'Anchored Docs',
          value: String(bundle.counts.anchoredDocuments)
        },
        {
          label: 'Approved / Pending Evidence',
          value: `${reviewSummary.totals.approved} / ${reviewSummary.totals.pending}`,
          tone: reviewSummary.totals.pending > 0 ? 'warn' : 'good'
        }
      ],
      body: [
        `This note isolates the current downside drivers for the ${playbook.label.toLowerCase()} case before committee or lender circulation.`,
        takeSentences(bundle.latestValuation?.underwritingMemo, 2) ||
          'No current underwriting memo is available.',
        reviewSummary.pendingBlockers.length > 0
          ? `Open approval blockers: ${reviewSummary.pendingBlockers.slice(0, 3).join('; ')}.`
          : 'No normalized evidence rows are currently pending review.'
      ]
    },
    {
      id: 'primary-risks',
      kicker: 'Primary Risks',
      title: 'Issues Requiring Management Attention',
      checklist: riskChecklist
    },
    {
      id: 'mitigation',
      kicker: 'Mitigation',
      title: 'Near-Term Mitigants And Open Items',
      checklist:
        mitigationChecklist.length > 0
          ? mitigationChecklist
          : [
              {
                label: 'Mitigation list missing',
                detail: 'No mitigation list is available yet.',
                status: 'open',
                sources: pickSupportingDocuments(bundle.documents, 'mitigation')
              }
            ]
    },
    {
      id: 'evidence',
      kicker: 'Evidence',
      title: 'Document Support',
      facts: bundle.documents.slice(0, 6).map((document) => ({
        label: document.title,
        value: `${document.documentType} / v${document.currentVersion}`,
        detail: `${formatDate(document.updatedAt)} / ${shortHash(document.hash)}`
      }))
    }
  ];
}

export function buildReportSections(bundle: DealReportBundle, kind: ReportKind): ReportSection[] {
  switch (kind) {
    case 'teaser':
      return buildTeaserSections(bundle);
    case 'ic-memo':
      return buildIcMemoSections(bundle);
    case 'dd-checklist':
      return buildDdChecklistSections(bundle);
    case 'risk-memo':
      return buildRiskMemoSections(bundle);
  }
}
