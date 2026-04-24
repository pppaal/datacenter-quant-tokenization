/**
 * Citation tracking & rendering — turns a raw ResearchReport into a
 * validated, auditable document with Moody's-style footnotes.
 *
 * Why this exists:
 *   The research agent emits claims with `sourceIds` plus inline `[S1]`
 *   markers in the synthesis. That's structurally enough to cite, but
 *   we still need to:
 *     - catch orphan markers (`[S7]` that points to no source),
 *     - catch unused sources (fetched but never cited — wasted token spend
 *       and a sign the agent went off-query),
 *     - catch claims with no citation at all (these must never ship to
 *       an IC deck),
 *     - render the report in a format investment committees can audit.
 *
 *   Pure functions, no IO — test-friendly and cheap to run in lint steps.
 */

import type { CitedClaim, ResearchReport, ResearchSource } from '@/lib/services/research/research-agent';

export type CitationIssue = {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code:
    | 'ORPHAN_MARKER'          // synthesis references [S#] that has no source entry
    | 'UNUSED_SOURCE'          // source exists but no claim/synthesis cites it
    | 'UNCITED_CLAIM'          // claim has empty sourceIds array
    | 'MISSING_PUBLISHER'      // source has no publisher attribution
    | 'STALE_SOURCE'           // published date more than 18 months before asOf
    | 'NO_SOURCES';            // report has zero sources (degenerate)
  sourceId?: string;
  claimIndex?: number;
  detail: string;
};

export type CitationAudit = {
  totalSources: number;
  totalClaims: number;
  totalMarkers: number;
  uniqueMarkers: number;
  issues: CitationIssue[];
  ok: boolean; // true when no ERROR issues
};

// Matches `[S1]`, `[S12]`, `[s3]` — 1-based, one or more digits. We keep
// the regex tight so prose like "[S] marker" or "[S1a]" doesn't falsely match.
const CITATION_MARKER_REGEX = /\[([Ss]\d+)\]/g;

const STALE_THRESHOLD_DAYS = 18 * 30; // ~18 months

function extractMarkers(text: string): string[] {
  const out: string[] = [];
  CITATION_MARKER_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION_MARKER_REGEX.exec(text)) !== null) {
    out.push(m[1]!.toUpperCase());
  }
  return out;
}

export function auditCitations(report: ResearchReport): CitationAudit {
  const issues: CitationIssue[] = [];
  const markers = extractMarkers(report.synthesis);
  const uniqueMarkers = new Set(markers);
  const sourceIds = new Set(report.sources.map((s) => s.id));

  if (report.sources.length === 0) {
    issues.push({
      severity: 'ERROR',
      code: 'NO_SOURCES',
      detail: '리포트에 인용 가능한 출처가 하나도 없습니다.'
    });
  }

  for (const m of uniqueMarkers) {
    if (!sourceIds.has(m)) {
      issues.push({
        severity: 'ERROR',
        code: 'ORPHAN_MARKER',
        sourceId: m,
        detail: `synthesis 본문에 ${m} 마커가 있지만 sources 배열에 ${m}이(가) 없습니다.`
      });
    }
  }

  const citedFromClaims = new Set<string>();
  report.claims.forEach((claim, idx) => {
    if (claim.sourceIds.length === 0) {
      issues.push({
        severity: 'ERROR',
        code: 'UNCITED_CLAIM',
        claimIndex: idx,
        detail: `claims[${idx}] 주장에 sourceIds가 비어 있습니다: "${claim.text.slice(0, 80)}"`
      });
    }
    for (const sid of claim.sourceIds) {
      citedFromClaims.add(sid.toUpperCase());
      if (!sourceIds.has(sid)) {
        issues.push({
          severity: 'ERROR',
          code: 'ORPHAN_MARKER',
          sourceId: sid,
          claimIndex: idx,
          detail: `claims[${idx}]가 ${sid}을(를) 인용하지만 sources에 없습니다.`
        });
      }
    }
  });

  for (const s of report.sources) {
    const used = uniqueMarkers.has(s.id) || citedFromClaims.has(s.id);
    if (!used) {
      issues.push({
        severity: 'WARNING',
        code: 'UNUSED_SOURCE',
        sourceId: s.id,
        detail: `${s.id} (${s.publisher || 'unknown publisher'}) 출처가 수집됐지만 어디서도 인용되지 않았습니다.`
      });
    }
    if (!s.publisher || !s.publisher.trim()) {
      issues.push({
        severity: 'WARNING',
        code: 'MISSING_PUBLISHER',
        sourceId: s.id,
        detail: `${s.id} 출처에 publisher 필드가 비어 있습니다 — 감사 추적 불가.`
      });
    }
    if (s.publishedAt) {
      const ageDays = (report.asOf.getTime() - s.publishedAt.getTime()) / 86400000;
      if (ageDays > STALE_THRESHOLD_DAYS) {
        issues.push({
          severity: 'INFO',
          code: 'STALE_SOURCE',
          sourceId: s.id,
          detail: `${s.id} 출처가 ${Math.round(ageDays / 30)}개월 이전 자료입니다 — 최신성 확인 필요.`
        });
      }
    }
  }

  const ok = !issues.some((i) => i.severity === 'ERROR');
  return {
    totalSources: report.sources.length,
    totalClaims: report.claims.length,
    totalMarkers: markers.length,
    uniqueMarkers: uniqueMarkers.size,
    issues,
    ok
  };
}

// ---------------------------------------------------------------------------
// Rendering — Markdown (for docs/memos) and plain text (for CLI/logs)
// ---------------------------------------------------------------------------

function formatDate(d: Date | null): string {
  if (!d) return 'n.d.';
  return d.toISOString().slice(0, 10);
}

function formatSourceFootnote(s: ResearchSource): string {
  const pub = s.publisher ? s.publisher : 'Unknown';
  const date = formatDate(s.publishedAt);
  return `[${s.id}] ${pub} (${date}). "${s.title}". ${s.url}`;
}

export function renderReportAsMarkdown(report: ResearchReport): string {
  const lines: string[] = [];
  lines.push(`# Research: ${report.question}`);
  if (report.submarketLabel) lines.push(`**Submarket:** ${report.submarketLabel}`);
  lines.push(`**As of:** ${formatDate(report.asOf)}`);
  lines.push(`**Generated by:** ${report.generatedBy}`);
  lines.push('');
  lines.push('## Synthesis');
  lines.push(report.synthesis);
  lines.push('');
  if (report.claims.length > 0) {
    lines.push('## Key claims');
    report.claims.forEach((c, i) => {
      const markers = c.sourceIds.length > 0 ? c.sourceIds.map((s) => `[${s}]`).join('') : '(uncited)';
      lines.push(`${i + 1}. ${c.text} ${markers}`);
    });
    lines.push('');
  }
  if (report.sources.length > 0) {
    lines.push('## Sources');
    report.sources.forEach((s) => lines.push(`- ${formatSourceFootnote(s)}`));
    lines.push('');
  }
  if (report.toolCalls.length > 0) {
    lines.push('## Tool calls');
    report.toolCalls.forEach((tc, i) => {
      lines.push(`${i + 1}. \`${tc.name}\` — ${tc.resultSummary}`);
    });
  }
  return lines.join('\n');
}

export function renderReportAsPlainText(report: ResearchReport): string {
  return renderReportAsMarkdown(report).replace(/[#*`]/g, '');
}

// ---------------------------------------------------------------------------
// Evidence mapping — for each claim, gather the actual source snippets that
// back it. Useful for the UI "expand citation" interaction and for IC audit.
// ---------------------------------------------------------------------------

export type ClaimEvidence = {
  claim: CitedClaim;
  evidence: Array<{ source: ResearchSource; snippet: string }>;
};

export function buildEvidenceMap(report: ResearchReport): ClaimEvidence[] {
  const sourceById = new Map(report.sources.map((s) => [s.id, s]));
  return report.claims.map((claim) => ({
    claim,
    evidence: claim.sourceIds
      .map((sid) => sourceById.get(sid))
      .filter((s): s is ResearchSource => !!s)
      .map((s) => ({ source: s, snippet: s.snippet }))
  }));
}
