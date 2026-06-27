import { formatDate, slugify } from '@/lib/utils';
import {
  buildControlSheet,
  buildDistributionNotice,
  buildFooterNotice,
  buildHeroFacts,
  buildHeroSummary,
  buildTraceabilityFacts
} from './reports/facts';
import { getReportStatusLabel } from './reports/helpers';
import { buildReportSections } from './reports/sections';
import { getReportTemplateMeta } from './reports/template-meta';
import {
  type DealReport,
  type DealReportBundle,
  type DealReportPacket,
  type ReportKind,
  type ReportPacketAudience
} from './reports/types';

// Shared report contracts live in ./reports/types; re-exported here so callers
// keep importing report types from the service entrypoint.
export { reportKinds } from './reports/types';
export type {
  DealReport,
  DealReportBundle,
  DealReportPacket,
  ReportAudience,
  ReportChecklistItem,
  ReportDocumentTrace,
  ReportFact,
  ReportFactTone,
  ReportKind,
  ReportPacketAudience,
  ReportSection,
  ReportTemplateMeta,
  ReportTemplateStatus
} from './reports/types';

// Report builders are grouped into sibling modules; re-exported here so every
// existing import of `@/lib/services/reports` keeps resolving from one place.
export {
  getReportTemplateMeta,
  isReportKind,
  isReportPacketAudience,
  listReportTemplates
} from './reports/template-meta';
export { buildReportBundleFromAsset, getAssetReportBundle } from './reports/bundle';
export { serializeReportPacketToMarkdown, serializeReportToMarkdown } from './reports/markdown';

export function buildDealReport(bundle: DealReportBundle, kind: ReportKind): DealReport {
  const meta = getReportTemplateMeta(kind);
  const versionLabel = `${kind.toUpperCase()}-${bundle.generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${bundle.reportFingerprint}`;
  return {
    kind,
    title: meta.title,
    shortLabel: meta.shortLabel,
    audience: meta.audience,
    audienceLabel: meta.audience === 'investor' ? 'Investor-Facing' : 'Operator / IC',
    status: meta.status,
    statusLabel: getReportStatusLabel(meta.status),
    description: meta.description,
    distributionNotice: buildDistributionNotice(kind),
    footerNotice: buildFooterNotice(kind),
    generatedAt: bundle.generatedAt,
    generatedAtLabel: formatDate(bundle.generatedAt),
    versionLabel,
    exportFileBase: `${slugify(bundle.assetCode)}-${slugify(meta.shortLabel)}-${versionLabel.toLowerCase()}`,
    heroSummary: buildHeroSummary(bundle, kind),
    heroFacts: buildHeroFacts(bundle, kind),
    sections: buildReportSections(bundle, kind),
    documents: bundle.documents,
    traceability: buildTraceabilityFacts(bundle, kind),
    controlSheet: buildControlSheet(bundle, versionLabel),
    readinessNotes: [meta.notes]
  };
}

export function buildDealReportPacket(
  bundle: DealReportBundle,
  audience: ReportPacketAudience
): DealReportPacket {
  const kinds: ReportKind[] =
    audience === 'investor' ? ['teaser'] : ['ic-memo', 'dd-checklist', 'risk-memo'];
  const reports = kinds.map((kind) => buildDealReport(bundle, kind));
  const versionLabel = `${audience.toUpperCase()}-PACK-${bundle.generatedAt
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')}-${bundle.reportFingerprint}`;

  return {
    audience,
    title: audience === 'investor' ? 'Investor Packet' : 'IC Packet',
    description:
      audience === 'investor'
        ? 'Teaser-led external packet for limited private circulation.'
        : 'Internal committee packet bundling IC memo, diligence checklist, and risk memo.',
    generatedAt: bundle.generatedAt,
    generatedAtLabel: formatDate(bundle.generatedAt),
    exportFileBase: `${slugify(bundle.assetCode)}-${audience}-packet-${versionLabel.toLowerCase()}`,
    versionLabel,
    reports
  };
}
