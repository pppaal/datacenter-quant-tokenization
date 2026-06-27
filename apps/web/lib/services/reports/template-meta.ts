import {
  reportKinds,
  type ReportKind,
  type ReportPacketAudience,
  type ReportTemplateMeta
} from './types';

const reportTemplateMeta: Record<ReportKind, ReportTemplateMeta> = {
  teaser: {
    kind: 'teaser',
    title: 'One-Page Teaser',
    shortLabel: 'Teaser',
    audience: 'investor',
    description:
      'A one-page external summary for an institutional real estate underwriting process.',
    status: 'production-ready',
    notes:
      'Ready for operator-led outreach and PDF export; narrative stays deterministic and data-backed.'
  },
  'ic-memo': {
    kind: 'ic-memo',
    title: 'IC Memo',
    shortLabel: 'IC Memo',
    audience: 'operator',
    description:
      'Internal investment committee package using the current valuation, research, and diligence set.',
    status: 'production-ready',
    notes:
      'Ready as an internal draft memo; final committee sign-off should still include human edits.'
  },
  'dd-checklist': {
    kind: 'dd-checklist',
    title: 'DD Checklist',
    shortLabel: 'DD Checklist',
    audience: 'operator',
    description:
      'Operator-facing diligence coverage summary with open, partial, and complete items.',
    status: 'partial',
    notes:
      'Checklist grouping is practical and exportable, but status inference is still heuristic.'
  },
  'risk-memo': {
    kind: 'risk-memo',
    title: 'Risk Memo',
    shortLabel: 'Risk Memo',
    audience: 'operator',
    description: 'Internal risk note focused on downside drivers, mitigants, and document support.',
    status: 'partial',
    notes:
      'Useful for deal review; severity and mitigation language remains template-derived from current data.'
  }
};

export function getReportTemplateMeta(kind: ReportKind) {
  return reportTemplateMeta[kind];
}

export function listReportTemplates() {
  return reportKinds.map((kind) => reportTemplateMeta[kind]);
}

export function isReportKind(value: string): value is ReportKind {
  return reportKinds.includes(value as ReportKind);
}

export function isReportPacketAudience(value: string): value is ReportPacketAudience {
  return value === 'investor' || value === 'operator';
}
