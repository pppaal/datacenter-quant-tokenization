import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildIcMemoDraftPrompt,
  parseIcMemoDraftResponse,
  generateIcMemoDraft,
  buildNoticePrompt,
  parseNoticeResponse,
  generateNotice,
  buildLpQaPrompt,
  parseLpQaResponse,
  answerLpQuestion,
  krwCompact,
  type CompletionFn
} from '@/lib/services/co-gp';
import { sanitizeFreeText } from '@/lib/services/co-gp/llm-client';

// A fake completion that returns a canned JSON body, capturing the request it saw.
function fakeCompletion(body: string): { fn: CompletionFn; seen: { req: unknown } } {
  const seen: { req: unknown } = { req: null };
  const fn: CompletionFn = async (req) => {
    seen.req = req;
    return { content: body, model: 'fake-model' };
  };
  return { fn, seen };
}

test('krwCompact uses Korean units', () => {
  assert.equal(krwCompact(1_200_000_000_000), '1.20조원');
  assert.equal(krwCompact(5_500_000_000), '55.0억원');
});

test('sanitizeFreeText strips injection markers, control chars, and caps length', () => {
  assert.equal(sanitizeFreeText('hi `<role>` there\n\nnew'), 'hi role there new');
  assert.equal(sanitizeFreeText('abcdef', 3), 'abc');
});

// ---- IC memo draft ----

test('buildIcMemoDraftPrompt embeds facts + the JSON schema + anti-injection', () => {
  const { systemPrompt, userPrompt } = buildIcMemoDraftPrompt({
    dealCode: 'DC-001',
    assetName: 'Yeouido Tower',
    market: 'Seoul',
    assetClass: 'OFFICE',
    purchasePriceKrw: 250_000_000_000,
    fund: { name: 'Fund I', sizeKrw: 500_000_000_000, calledPct: 40 },
    openQuestions: ['환경실사 미완료']
  });
  assert.match(userPrompt, /DC-001/);
  assert.match(userPrompt, /Yeouido Tower/);
  assert.match(userPrompt, /2500\.0억원/); // 250B KRW compacted to 억
  assert.match(userPrompt, /환경실사/);
  assert.match(systemPrompt, /recommendedVoting/);
  assert.match(systemPrompt, /무시하고/); // anti-injection clause
});

test('parseIcMemoDraftResponse coerces voting + arrays and rejects missing fields', () => {
  const ok = parseIcMemoDraftResponse(
    JSON.stringify({
      headline: 'H',
      executiveSummary: 'E',
      investmentThesis: 'T',
      riskSummary: 'R',
      recommendedVoting: 'approve',
      conditions: ['c1', '', 2]
    })
  );
  assert.equal(ok.recommendedVoting, 'APPROVE'); // upper-cased + validated
  assert.deepEqual(ok.conditions, ['c1']); // non-strings filtered
  // unknown voting → CONDITIONAL fallback
  const fallback = parseIcMemoDraftResponse(
    JSON.stringify({
      headline: 'H',
      executiveSummary: 'E',
      investmentThesis: 'T',
      riskSummary: 'R',
      recommendedVoting: 'YOLO'
    })
  );
  assert.equal(fallback.recommendedVoting, 'CONDITIONAL');
  assert.throws(() => parseIcMemoDraftResponse(JSON.stringify({ headline: 'H' })));
  assert.throws(() => parseIcMemoDraftResponse(JSON.stringify(['not', 'object'])));
});

test('generateIcMemoDraft uses an injected completion fn', async () => {
  const { fn } = fakeCompletion(
    JSON.stringify({
      headline: 'Strong deal',
      executiveSummary: 'summary',
      investmentThesis: 'thesis',
      riskSummary: 'risk',
      recommendedVoting: 'STRONG_APPROVE',
      conditions: []
    })
  );
  const draft = await generateIcMemoDraft({ dealCode: 'DC-1', assetName: 'A' }, fn);
  assert.equal(draft.recommendedVoting, 'STRONG_APPROVE');
  assert.equal(draft.generatedBy, 'fake-model');
});

test('generateIcMemoDraft falls back to offline template when completion fn is null', async () => {
  const draft = await generateIcMemoDraft(
    { dealCode: 'DC-9', assetName: 'Edge', openQuestions: ['title risk'] },
    null
  );
  assert.equal(draft.generatedBy, 'offline-template');
  assert.equal(draft.recommendedVoting, 'CONDITIONAL');
  assert.deepEqual(draft.conditions, ['title risk']);
});

test('generateIcMemoDraft recovers to offline template when the model output is unparseable', async () => {
  const { fn } = fakeCompletion('not json at all');
  const draft = await generateIcMemoDraft({ dealCode: 'DC-2', assetName: 'B' }, fn);
  assert.match(draft.generatedBy, /offline-template \(fallback/);
});

// ---- Notices ----

test('buildNoticePrompt distinguishes call vs distribution; summary table totals', () => {
  const callPrompt = buildNoticePrompt({
    kind: 'CAPITAL_CALL',
    fundName: 'Fund I',
    noticeDate: '2026-06-30',
    actionDate: '2026-07-15',
    totalAmountKrw: 10_000_000_000
  });
  assert.match(callPrompt.userPrompt, /캐피탈 콜/);
  assert.match(callPrompt.userPrompt, /납입기한: 2026-07-15/);

  const distPrompt = buildNoticePrompt({
    kind: 'DISTRIBUTION',
    fundName: 'Fund I',
    noticeDate: '2026-06-30',
    actionDate: '2026-07-15',
    totalAmountKrw: 8_000_000_000
  });
  assert.match(distPrompt.userPrompt, /분배/);
  assert.match(distPrompt.userPrompt, /지급일: 2026-07-15/);
});

test('parseNoticeResponse fills a default disclaimer and rejects empty body', () => {
  const ok = parseNoticeResponse(JSON.stringify({ title: 'T', body: 'B' }));
  assert.equal(ok.title, 'T');
  assert.match(ok.disclaimer, /법적 자문이 아닙니다/);
  assert.throws(() => parseNoticeResponse(JSON.stringify({ title: 'T' })));
});

test('generateNotice always attaches a per-LP summary table with a bold total', async () => {
  const notice = await generateNotice(
    {
      kind: 'CAPITAL_CALL',
      fundName: 'Fund I',
      noticeDate: '2026-06-30',
      actionDate: '2026-07-15',
      totalAmountKrw: 3_000_000_000,
      perInvestor: [
        { investorName: 'LP A', amountKrw: 2_000_000_000 },
        { investorName: 'LP B', amountKrw: 1_000_000_000 }
      ]
    },
    null // offline
  );
  assert.equal(notice.generatedBy, 'offline-template');
  assert.match(notice.summaryTableMarkdown, /LP A/);
  assert.match(notice.summaryTableMarkdown, /합계\(요청\)/);
  assert.match(notice.summaryTableMarkdown, /30\.0억원/); // total
});

// ---- LP Q&A ----

test('buildLpQaPrompt grounds on fund + deal + document context', () => {
  const { systemPrompt, userPrompt } = buildLpQaPrompt({
    question: '우리 펀드 NAV는 얼마인가요?',
    asOf: '2026-06-30',
    fund: { name: 'Fund I', navKrw: 120_000_000_000, dpi: 0.4, tvpi: 1.3, irrPct: 12.4 },
    deals: [{ dealCode: 'DC-1', assetName: 'Tower', stage: 'CLOSING', update: '계약 임박' }],
    documents: [{ title: 'Q2 Report', excerpt: '분배 예정' }]
  });
  assert.match(userPrompt, /NAV 1200\.0억원/);
  assert.match(userPrompt, /DC-1/);
  assert.match(userPrompt, /Q2 Report/);
  assert.match(systemPrompt, /지어내지 않는다/);
});

test('parseLpQaResponse defaults confidence to LOW on unknown values', () => {
  const ok = parseLpQaResponse(
    JSON.stringify({ answer: 'NAV는 1200억원입니다', confidence: 'high', sourcesCited: ['Fund I'] })
  );
  assert.equal(ok.confidence, 'HIGH');
  const low = parseLpQaResponse(JSON.stringify({ answer: 'A', confidence: 'whatever' }));
  assert.equal(low.confidence, 'LOW');
  assert.throws(() => parseLpQaResponse(JSON.stringify({ confidence: 'HIGH' })));
});

test('answerLpQuestion returns a low-confidence stub when no AI is configured', async () => {
  const a = await answerLpQuestion({ question: '?', asOf: '2026-06-30' }, null);
  assert.equal(a.confidence, 'LOW');
  assert.equal(a.generatedBy, 'offline-template');
});

test('answerLpQuestion uses the injected completion fn', async () => {
  const { fn, seen } = fakeCompletion(
    JSON.stringify({ answer: '응답', confidence: 'MEDIUM', sourcesCited: ['Fund I'] })
  );
  const a = await answerLpQuestion(
    { question: 'NAV?', asOf: '2026-06-30', fund: { name: 'Fund I' } },
    fn
  );
  assert.equal(a.answer, '응답');
  assert.equal(a.confidence, 'MEDIUM');
  assert.notEqual(seen.req, null);
});
