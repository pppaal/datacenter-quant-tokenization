import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditCitations,
  renderReportAsMarkdown,
  buildEvidenceMap
} from '@/lib/services/research/citations';
import type { ResearchReport } from '@/lib/services/research/research-agent';

const asOf = new Date('2026-04-23T00:00:00Z');

function makeReport(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    question: '강남 오피스 cap rate',
    submarketLabel: '강남 A급',
    asOf,
    sources: [
      {
        id: 'S1',
        url: 'https://example.kr/article-1',
        title: '강남 cap rate 5.3%',
        publisher: '매일경제',
        publishedAt: new Date('2026-04-10T00:00:00Z'),
        snippet: '강남 A급 오피스 cap rate 5.3%로 소폭 하락.'
      },
      {
        id: 'S2',
        url: 'https://example.kr/article-2',
        title: '테헤란로 거래 3건',
        publisher: 'The Bell',
        publishedAt: new Date('2026-04-01T00:00:00Z'),
        snippet: '테헤란로 3개 자산 5,500억원 거래.'
      }
    ],
    claims: [
      { text: '강남 cap rate가 5.3%로 하락했다.', sourceIds: ['S1'] },
      { text: '테헤란로 거래가 회복세다.', sourceIds: ['S2'] }
    ],
    synthesis: '2026 Q2 기준 강남 A급 오피스 cap rate는 5.3%로 소폭 하락 [S1]. 테헤란로 대형 거래 3건이 성사됐다 [S2].',
    toolCalls: [{ name: 'search_news', input: { query: '강남' }, resultSummary: '2 sources' }],
    generatedBy: 'claude-opus-4-7',
    promptTokens: 1200,
    completionTokens: 400,
    ...overrides
  };
}

test('auditCitations: healthy report passes with zero errors', () => {
  const audit = auditCitations(makeReport());
  assert.equal(audit.ok, true);
  assert.equal(audit.totalSources, 2);
  assert.equal(audit.totalClaims, 2);
  assert.equal(audit.uniqueMarkers, 2);
  assert.equal(audit.issues.filter((i) => i.severity === 'ERROR').length, 0);
});

test('auditCitations: orphan marker in synthesis raises ERROR', () => {
  const report = makeReport({
    synthesis: '강남 cap rate 5.3% [S1]. 여의도 공실률 [S7].'
  });
  const audit = auditCitations(report);
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((i) => i.code === 'ORPHAN_MARKER' && i.sourceId === 'S7'));
});

test('auditCitations: uncited claim raises ERROR', () => {
  const report = makeReport({
    claims: [
      { text: '근거 없는 주장', sourceIds: [] },
      { text: '정상 주장', sourceIds: ['S1'] }
    ]
  });
  const audit = auditCitations(report);
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((i) => i.code === 'UNCITED_CLAIM' && i.claimIndex === 0));
});

test('auditCitations: unused source raises WARNING not ERROR', () => {
  const report = makeReport({
    synthesis: '강남 cap rate 5.3% [S1].',
    claims: [{ text: '강남 cap rate 하락.', sourceIds: ['S1'] }]
  });
  const audit = auditCitations(report);
  assert.equal(audit.ok, true); // warnings don't fail the audit
  assert.ok(audit.issues.some((i) => i.code === 'UNUSED_SOURCE' && i.sourceId === 'S2'));
});

test('auditCitations: stale source flagged as INFO', () => {
  const report = makeReport({
    sources: [
      {
        id: 'S1',
        url: 'https://example.kr/old',
        title: 'old article',
        publisher: '옛날신문',
        publishedAt: new Date('2023-01-01T00:00:00Z'),
        snippet: 'old snippet'
      }
    ],
    claims: [{ text: 'old claim', sourceIds: ['S1'] }],
    synthesis: 'old synthesis [S1]'
  });
  const audit = auditCitations(report);
  assert.ok(audit.issues.some((i) => i.code === 'STALE_SOURCE' && i.severity === 'INFO'));
});

test('auditCitations: no sources is an ERROR', () => {
  const audit = auditCitations(makeReport({ sources: [], claims: [], synthesis: 'nothing found' }));
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((i) => i.code === 'NO_SOURCES'));
});

test('renderReportAsMarkdown: includes synthesis, claims, sources, tool calls', () => {
  const md = renderReportAsMarkdown(makeReport());
  assert.ok(md.includes('# Research:'));
  assert.ok(md.includes('## Synthesis'));
  assert.ok(md.includes('## Key claims'));
  assert.ok(md.includes('## Sources'));
  assert.ok(md.includes('매일경제'));
  assert.ok(md.includes('[S1]'));
  assert.ok(md.includes('claude-opus-4-7'));
});

test('buildEvidenceMap: resolves every claim sourceId to its source snippet', () => {
  const evidence = buildEvidenceMap(makeReport());
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0]!.evidence.length, 1);
  assert.equal(evidence[0]!.evidence[0]!.source.id, 'S1');
  assert.ok(evidence[0]!.evidence[0]!.snippet.includes('cap rate'));
});
