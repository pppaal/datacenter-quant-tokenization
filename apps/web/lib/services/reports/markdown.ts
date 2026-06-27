import { formatDate } from '@/lib/utils';
import { shortHash } from './helpers';
import { type DealReport, type DealReportPacket } from './types';

export function serializeReportToMarkdown(report: DealReport) {
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`- Audience: ${report.audienceLabel}`);
  lines.push(`- Template status: ${report.statusLabel}`);
  lines.push(`- Generated: ${report.generatedAtLabel}`);
  lines.push(`- Version: ${report.versionLabel}`);
  lines.push('');
  lines.push(report.heroSummary);
  lines.push('');

  if (report.heroFacts.length) {
    lines.push('## Summary');
    lines.push('');
    report.heroFacts.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    lines.push('');
  }

  report.sections.forEach((section) => {
    lines.push(`## ${section.title}`);
    lines.push('');
    if (section.kicker) {
      lines.push(`_${section.kicker}_`);
      lines.push('');
    }
    section.body?.forEach((paragraph) => {
      lines.push(paragraph);
      lines.push('');
    });
    section.facts?.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    if (section.facts?.length) lines.push('');
    section.bullets?.forEach((bullet) => {
      lines.push(`- ${bullet}`);
    });
    if (section.bullets?.length) lines.push('');
    section.checklist?.forEach((item) => {
      lines.push(`- [${item.status.toUpperCase()}] ${item.label}: ${item.detail}`);
      if (item.sources?.length) {
        lines.push(`  - Sources: ${item.sources.join(', ')}`);
      }
    });
    if (section.checklist?.length) lines.push('');
  });

  if (report.documents.length) {
    lines.push('## Document Schedule');
    lines.push('');
    report.documents.forEach((document) => {
      const anchor = document.anchoredTxHash
        ? ` / anchor ${shortHash(document.anchoredTxHash)}`
        : '';
      lines.push(
        `- ${document.title} (${document.documentType}, v${document.currentVersion}, ${formatDate(document.updatedAt)}, hash ${shortHash(document.hash)}${anchor})`
      );
    });
    lines.push('');
  }

  if (report.traceability.length) {
    lines.push('## Traceability');
    lines.push('');
    report.traceability.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    lines.push('');
  }

  if (report.controlSheet.length) {
    lines.push('## Control Sheet');
    lines.push('');
    report.controlSheet.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    lines.push('');
  }

  if (report.readinessNotes.length) {
    lines.push('## Template Notes');
    lines.push('');
    report.readinessNotes.forEach((note) => {
      lines.push(`- ${note}`);
    });
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function serializeReportPacketToMarkdown(packet: DealReportPacket) {
  const lines: string[] = [];
  lines.push(`# ${packet.title}`);
  lines.push('');
  lines.push(`- Audience: ${packet.audience}`);
  lines.push(`- Generated: ${packet.generatedAtLabel}`);
  lines.push(`- Version: ${packet.versionLabel}`);
  lines.push('');
  lines.push(packet.description);
  lines.push('');

  packet.reports.forEach((report, index) => {
    if (index > 0) {
      lines.push('---');
      lines.push('');
    }
    lines.push(serializeReportToMarkdown(report));
    lines.push('');
  });

  return lines.join('\n').trim();
}
