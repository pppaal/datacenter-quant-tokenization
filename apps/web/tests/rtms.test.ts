import assert from 'node:assert/strict';
import test from 'node:test';
import { enumerateMonths, parseRtmsXml } from '@/lib/services/public-data/live/rtms';
import { MockTransactionComps } from '@/lib/services/public-data/mock/transaction-comps';
import { rtmsWindowYyyyMm } from '@/lib/services/property-analyzer/auto-analyze';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
  <body>
    <items>
      <item>
        <거래금액> 128,000 </거래금액>
        <건물면적>1200</건물면적>
        <대지면적>450</대지면적>
        <건물명>테헤란타워</건물명>
        <년>2025</년>
        <월>9</월>
        <일>15</일>
        <유형>업무시설</유형>
        <건축년도>2012</건축년도>
        <층>18</층>
      </item>
      <item>
        <거래금액>54,000</거래금액>
        <건물면적>520</건물면적>
        <대지면적>180</대지면적>
        <년>2025</년>
        <월>6</월>
        <일>8</일>
        <유형>제2종근린생활시설</유형>
      </item>
    </items>
  </body>
</response>`;

test('parseRtmsXml extracts items with correct fields', () => {
  const comps = parseRtmsXml(SAMPLE_XML, '11680');
  assert.equal(comps.length, 2);
  const first = comps[0]!;
  assert.equal(first.lawdCode, '11680');
  assert.equal(first.buildingName, '테헤란타워');
  assert.equal(first.transactionDate, '2025-09-15');
  assert.equal(first.dealAmountManWon, 128_000);
  assert.equal(first.gfaSqm, 1200);
  assert.equal(first.landAreaSqm, 450);
  assert.equal(first.buildYear, 2012);
  assert.equal(first.floor, 18);
  assert.equal(first.buildingUse, '업무시설');
  // 128_000 만원 × 10_000 / 1200 = 1_066_666.67 → 1_066_667
  assert.equal(first.pricePerSqmKrw, 1_066_667);
});

test('parseRtmsXml skips items without 거래금액 and handles missing building name', () => {
  const comps = parseRtmsXml(SAMPLE_XML, '11680');
  const second = comps[1]!;
  assert.equal(second.buildingName, null);
  assert.equal(second.dealAmountManWon, 54_000);
});

test('parseRtmsXml returns empty array on malformed xml', () => {
  const comps = parseRtmsXml('<nope/>', '11680');
  assert.equal(comps.length, 0);
});

test('enumerateMonths produces inclusive month sequence', () => {
  assert.deepEqual(enumerateMonths('202511', '202602'), ['202511', '202512', '202601', '202602']);
});

test('enumerateMonths single month echoes input', () => {
  assert.deepEqual(enumerateMonths('202509', '202509'), ['202509']);
});

test('MockTransactionComps returns seed data for Gangnam-gu (11680)', async () => {
  const mock = new MockTransactionComps();
  const comps = await mock.fetch({
    lawdCode: '11680',
    fromYyyyMm: '202501',
    toYyyyMm: '202512'
  });
  assert.equal(comps.length, 3);
  for (const c of comps) {
    assert.equal(c.lawdCode, '11680');
    assert.ok(c.dealAmountManWon > 0);
    assert.ok(c.source.startsWith('mock-RTMS'));
  }
});

test('MockTransactionComps returns [] for unknown LAWD code', async () => {
  const mock = new MockTransactionComps();
  const comps = await mock.fetch({
    lawdCode: '99999',
    fromYyyyMm: '202501',
    toYyyyMm: '202512'
  });
  assert.equal(comps.length, 0);
});

test('rtmsWindowYyyyMm yields trailing 12-month inclusive window', () => {
  const { fromYyyyMm, toYyyyMm } = rtmsWindowYyyyMm(new Date(Date.UTC(2026, 3, 1)), 12);
  assert.equal(toYyyyMm, '202604');
  assert.equal(fromYyyyMm, '202505');
});
