import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runResearchAgent,
  createMockToolset,
  type ResearchSource,
  type ResearchFetchedPage
} from '@/lib/services/research/research-agent';

const asOf = new Date('2026-04-23T00:00:00Z');

const newsFixtures: ResearchSource[] = [
  {
    id: 'seed-1',
    url: 'https://example.kr/news/gangnam-cap-rate-q2-2026',
    title: '강남 오피스 2026년 2분기 cap rate 5.3%로 소폭 하락',
    publisher: '매일경제',
    publishedAt: new Date('2026-04-10T00:00:00Z'),
    snippet:
      '강남 A급 오피스 시장 cap rate가 2026년 2분기 기준 5.3%로 전분기 대비 10bps 하락했다. ' +
      '거래량 회복과 기관 투자자 자금 유입이 주요인.'
  },
  {
    id: 'seed-2',
    url: 'https://example.kr/news/teheran-transactions-2026',
    title: '테헤란로 Q1 2026 대형 거래 3건 성사',
    publisher: 'The Bell',
    publishedAt: new Date('2026-04-05T00:00:00Z'),
    snippet:
      '테헤란로 A급 오피스 3개 자산이 2026년 1분기 총 5,500억원에 거래됐다. ' +
      '평균 cap rate 5.4%, 평당가 1,200만원.'
  },
  {
    id: 'seed-3',
    url: 'https://example.kr/news/unrelated-retail',
    title: '부산 리테일 공실률 상승',
    publisher: 'KBS',
    publishedAt: new Date('2026-03-20T00:00:00Z'),
    snippet: '부산 리테일 시장 공실률이 전년 대비 상승.'
  }
];

const pageFixtures: Record<string, ResearchFetchedPage> = {
  'https://example.kr/news/gangnam-cap-rate-q2-2026': {
    url: 'https://example.kr/news/gangnam-cap-rate-q2-2026',
    title: '강남 오피스 2026년 2분기 cap rate 5.3%로 소폭 하락',
    publishedAt: new Date('2026-04-10T00:00:00Z'),
    text:
      '강남 A급 오피스 시장의 cap rate가 2026년 2분기 기준 5.3%로 전분기 대비 10bps 하락했다. ' +
      '거래량은 전년 동기 대비 약 12% 증가했으며, 기관 투자자 비중이 60%에 달한다. ' +
      '공실률은 3.8%로 여전히 낮은 수준을 유지.'
  }
};

test('runResearchAgent: offline mode returns structured report with sources', async () => {
  const toolset = createMockToolset({ news: newsFixtures, pages: pageFixtures });
  const report = await runResearchAgent(
    {
      question: '강남 오피스 2026년 2분기 cap rate',
      submarketLabel: '강남 A급 오피스',
      asOf
    },
    toolset
  );

  assert.equal(report.question, '강남 오피스 2026년 2분기 cap rate');
  assert.equal(report.submarketLabel, '강남 A급 오피스');
  assert.ok(report.sources.length > 0, 'should surface at least one matching source');
  assert.ok(
    report.sources.every((s) => s.id.startsWith('S')),
    'source ids should use stable S# format'
  );
  assert.ok(report.claims.length > 0, 'offline mode should emit one claim per source');
  assert.ok(
    report.claims.every((c) =>
      c.sourceIds.every((sid) => report.sources.some((s) => s.id === sid))
    ),
    'every claim sourceId must resolve to a real source'
  );
  assert.ok(report.synthesis.length > 0);
  assert.equal(report.generatedBy, 'offline-template');
  assert.equal(report.toolCalls.length, 1);
  assert.equal(report.toolCalls[0]!.name, 'search_news');
});

test('runResearchAgent: offline mode emits fallback synthesis when no matches', async () => {
  const toolset = createMockToolset({ news: [], pages: {} });
  const report = await runResearchAgent(
    {
      question: '존재하지 않는 서브마켓 리서치',
      asOf
    },
    toolset
  );
  assert.equal(report.sources.length, 0);
  assert.equal(report.claims.length, 0);
  assert.ok(report.synthesis.includes('오프라인'));
});

test('runResearchAgent: source id ordering is stable (S1, S2, ...)', async () => {
  const toolset = createMockToolset({ news: newsFixtures, pages: pageFixtures });
  const report = await runResearchAgent({ question: '강남 오피스', asOf }, toolset);
  for (let i = 0; i < report.sources.length; i++) {
    assert.equal(report.sources[i]!.id, `S${i + 1}`);
  }
});

test('createMockToolset: fetchPage throws on unknown URL', async () => {
  const toolset = createMockToolset({ news: newsFixtures });
  await assert.rejects(() => toolset.fetchPage('https://unknown.example/page'), /no page/);
});
