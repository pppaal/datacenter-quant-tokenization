import { getValuationRecommendation } from '@/lib/services/valuation/recommendation';
import { formatDate, formatNumber } from '@/lib/utils';
import { formatKrw, shortHash, takeSentences } from './helpers';
import { type DealReportBundle, type ReportFact, type ReportKind } from './types';

export function buildTraceabilityFacts(bundle: DealReportBundle, kind: ReportKind): ReportFact[] {
  const latestRun = bundle.latestValuation;
  const latestDoc = bundle.documents[0];
  return [
    {
      label: 'Report Version',
      value: `${kind.toUpperCase()}-${bundle.generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${bundle.reportFingerprint}`,
      detail: 'Derived from the latest valuation, document versions, and anchor state.'
    },
    {
      label: 'Valuation Source',
      value: latestRun
        ? `${latestRun.runLabel} / ${formatDate(latestRun.createdAt)}`
        : 'No valuation run',
      detail: latestRun
        ? `Run ${latestRun.id} / Engine ${latestRun.engineVersion}`
        : 'Generate a valuation run to tighten the memo package.'
    },
    {
      label: 'Latest Document',
      value: latestDoc
        ? `${latestDoc.title} v${latestDoc.currentVersion}`
        : 'No documents uploaded',
      detail: latestDoc ? `Hash ${shortHash(latestDoc.hash)}` : 'Document schedule is empty.'
    },
    {
      label: 'Approved Evidence',
      value: String(bundle.reviewSummary.totals.approved),
      detail:
        bundle.reviewSummary.totals.pending > 0
          ? `${bundle.reviewSummary.totals.pending} pending / ${bundle.reviewSummary.totals.rejected} rejected`
          : 'No pending evidence blockers in the normalized review queue.'
    },
    {
      label: 'Research Freshness',
      value: bundle.researchDossier.freshnessLabel,
      detail:
        bundle.researchDossier.openCoverageTaskCount > 0
          ? `${bundle.researchDossier.openCoverageTaskCount} open research coverage task(s)`
          : bundle.researchDossier.freshnessHeadline
    },
    {
      label: 'House View',
      value: bundle.researchDossier.houseViewLabel,
      detail:
        bundle.researchDossier.thesisAgeDays != null
          ? `Current thesis age ${bundle.researchDossier.thesisAgeDays} day(s)`
          : 'No persisted house-view thesis age is available.'
    },
    {
      label: 'Review Packet',
      value: bundle.latestReviewPacket?.fingerprint
        ? shortHash(bundle.latestReviewPacket.fingerprint, 16)
        : 'Not staged',
      detail: bundle.latestReviewPacket?.stagedAt
        ? `Staged ${formatDate(bundle.latestReviewPacket.stagedAt)} / valuation ${bundle.latestReviewPacket.latestValuationId ?? 'none'}`
        : 'Stage readiness to lock the current approved evidence set into a deterministic packet.'
    },
    {
      label: 'On-Chain Integrity',
      value: bundle.latestOnchainRecord?.txHash
        ? shortHash(bundle.latestOnchainRecord.txHash)
        : 'Not anchored',
      detail: bundle.latestOnchainRecord?.txHash
        ? `${bundle.latestOnchainRecord.chainId ?? 'Unknown chain'} / ${formatDate(bundle.latestOnchainRecord.anchoredAt)}`
        : 'No blockchain anchor linked to the current document set.'
    }
  ];
}

export function buildControlSheet(bundle: DealReportBundle, reportVersion: string): ReportFact[] {
  const latestRun = bundle.latestValuation;
  const latestDoc = bundle.documents[0];
  return [
    {
      label: 'Report Id',
      value: reportVersion
    },
    {
      label: 'Asset Code',
      value: bundle.assetCode
    },
    {
      label: 'Valuation Run Id',
      value: latestRun?.id ?? 'N/A',
      detail: latestRun
        ? `${latestRun.runLabel} / ${formatDate(latestRun.createdAt)}`
        : 'No valuation run linked'
    },
    {
      label: 'Approved / Pending Evidence',
      value: `${bundle.reviewSummary.totals.approved} / ${bundle.reviewSummary.totals.pending}`,
      detail: `${bundle.reviewSummary.totals.rejected} rejected evidence row(s)`
    },
    {
      label: 'Research Coverage Queue',
      value: String(bundle.researchDossier.openCoverageTaskCount),
      detail: `${bundle.researchDossier.freshnessHeadline} / ${bundle.researchDossier.houseViewLabel}`
    },
    {
      label: 'Document Count',
      value: String(bundle.counts.documents)
    },
    {
      label: 'Latest Document Hash',
      value: latestDoc?.hash ? shortHash(latestDoc.hash, 16) : 'N/A',
      detail: latestDoc ? `${latestDoc.title} v${latestDoc.currentVersion}` : 'No document schedule'
    },
    {
      label: 'Anchor Reference',
      value: bundle.latestOnchainRecord?.txHash
        ? shortHash(bundle.latestOnchainRecord.txHash, 16)
        : 'Not anchored',
      detail: bundle.latestOnchainRecord?.chainId ?? 'No linked chain'
    },
    {
      label: 'Review Packet Fingerprint',
      value: bundle.latestReviewPacket?.fingerprint
        ? shortHash(bundle.latestReviewPacket.fingerprint, 16)
        : 'Not staged',
      detail: bundle.latestReviewPacket?.stagedAt
        ? `Staged ${formatDate(bundle.latestReviewPacket.stagedAt)}`
        : 'No deterministic review packet has been staged yet.'
    }
  ];
}

export function buildHeroFacts(bundle: DealReportBundle, kind: ReportKind): ReportFact[] {
  const latestRun = bundle.latestValuation;
  const baseScenario = latestRun?.baseScenario;
  const yearOne = bundle.proForma?.years[0];
  const recommendation = getValuationRecommendation(latestRun?.confidenceScore);

  const facts: ReportFact[] = [
    {
      label: 'Recommendation',
      value: recommendation,
      tone:
        recommendation === 'Proceed To Committee'
          ? 'good'
          : recommendation === 'Proceed With Conditions'
            ? 'warn'
            : 'danger'
    },
    {
      label: 'Base Case Value',
      value: latestRun ? formatKrw(bundle, latestRun.baseCaseValueKrw) : 'N/A'
    },
    {
      label: 'Confidence',
      value: latestRun ? `${formatNumber(latestRun.confidenceScore, 1)} / 10` : 'N/A'
    },
    {
      label: 'Year 1 NOI',
      value: yearOne ? formatKrw(bundle, yearOne.noiKrw) : 'N/A'
    }
  ];

  if (kind !== 'teaser') {
    facts.push(
      {
        label: 'Stabilized DSCR (base case)',
        value: baseScenario?.debtServiceCoverage
          ? `${formatNumber(baseScenario.debtServiceCoverage, 2)}x`
          : 'N/A',
        // Missing DSCR is unknown, not a covenant breach — don't flag danger on
        // absent data (the `?? 0` form rendered "no data" as 0x → false danger).
        tone:
          baseScenario?.debtServiceCoverage == null
            ? 'neutral'
            : baseScenario.debtServiceCoverage < 1.15
              ? 'danger'
              : 'neutral'
      },
      {
        label: 'Anchored Docs',
        value: String(bundle.counts.anchoredDocuments)
      }
    );
  }

  return facts;
}

export function buildHeroSummary(bundle: DealReportBundle, kind: ReportKind) {
  const latestRun = bundle.latestValuation;
  const underwritingLead = takeSentences(latestRun?.underwritingMemo, kind === 'teaser' ? 2 : 3);
  const baseText = takeSentences(bundle.assetDescription, 2);
  const qualityLead = bundle.valuationQuality
    ? `${bundle.valuationQuality.coverage.filter((item) => item.status === 'good').length} of ${
        bundle.valuationQuality.coverage.length
      } core diligence coverage lines are currently populated.`
    : 'Core diligence coverage has not been summarized yet.';
  return [underwritingLead, baseText, qualityLead].filter(Boolean).join(' ');
}

export function buildDistributionNotice(kind: ReportKind) {
  switch (kind) {
    case 'teaser':
      return 'Confidential teaser for a limited private process. Subject to revision, withdrawal, and NDA-gated follow-up material.';
    case 'ic-memo':
      return 'Internal investment committee draft. Not for external circulation or reliance by third parties.';
    case 'dd-checklist':
      return 'Internal diligence working paper. Coverage status is derived from the current data room and underwriting bundle.';
    case 'risk-memo':
      return 'Internal downside note for deal team and committee use. Does not replace legal, tax, technical, or accounting advice.';
  }
}

export function buildFooterNotice(kind: ReportKind) {
  switch (kind) {
    case 'teaser':
      return 'This teaser is indicative only and should not be treated as a binding offer, final memorandum, or complete diligence package.';
    case 'ic-memo':
      return 'Committee approval should remain conditional on final legal, technical, financing, and counterparty confirmation.';
    case 'dd-checklist':
      return 'Checklist completion reflects current system evidence only; operators should still confirm each item before sign-off.';
    case 'risk-memo':
      return 'Risk severity remains dynamic and should be refreshed whenever valuation, permit, legal, or debt inputs change.';
  }
}

export function buildDistressContext(bundle: DealReportBundle) {
  const facts: string[] = [];
  const baseScenario = bundle.latestValuation?.baseScenario;
  const yearOne = bundle.proForma?.years[0];
  if ((baseScenario?.debtServiceCoverage ?? Infinity) < 1.15) {
    facts.push(
      `Base DSCR is ${formatNumber(baseScenario?.debtServiceCoverage, 2)}x, which puts financing resilience under pressure.`
    );
  }
  if ((yearOne?.activeRenewalLeaseCount ?? 0) > 0) {
    facts.push(
      `${yearOne?.activeRenewalLeaseCount} lease rollover event(s) are already modeled in the opening year cash flow.`
    );
  }
  if (bundle.counts.encumbrances > 0) {
    facts.push(
      `${bundle.counts.encumbrances} recorded encumbrance item(s) are attached to the asset legal pack.`
    );
  }
  if ((bundle.counts.debtFacilities ?? 0) > 0) {
    facts.push(
      `${bundle.counts.debtFacilities} debt facility record(s) are loaded into the current capital stack.`
    );
  }
  return facts;
}
