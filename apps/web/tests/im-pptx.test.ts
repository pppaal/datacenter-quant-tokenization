import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImPptx, deckFilename, type ImDeckInput } from '@/lib/services/exports/im-pptx';

const SAMPLE: ImDeckInput = {
  title: 'Yeouido Prime Office — Investment Memo',
  subtitle: 'Core+ acquisition · Seoul CBD',
  confidentiality: 'Confidential — for the named recipient only',
  footer: 'Investment Firm OS · 2026-06',
  sections: [
    {
      heading: 'Executive Summary',
      body: 'A stabilized Grade-A office at the Yeouido core.',
      bullets: ['Target levered IRR 12.4%', 'WALT 4.2 years', 'In-place occupancy 94%']
    },
    {
      heading: 'Key Metrics',
      metrics: [
        { label: 'NOI Yield', value: '4.8%', tone: 'good' },
        { label: 'LTV', value: '55%' },
        { label: 'DSCR', value: '1.28x', tone: 'good' },
        { label: 'Macro Risk', value: '62 / 100', tone: 'warn' }
      ]
    },
    {
      heading: 'Rent Roll',
      table: {
        headers: ['Tenant', 'Area (sqm)', 'Expiry'],
        rows: [
          ['Anchor Corp', '4,200', '2029-03'],
          ['Tenant B', '1,800', '2027-11']
        ]
      }
    }
  ]
};

test('buildImPptx returns a non-empty OOXML (zip) buffer', async () => {
  const buf = await buildImPptx(SAMPLE);
  assert.ok(Buffer.isBuffer(buf), 'returns a Buffer');
  assert.ok(buf.length > 2000, `pptx should be non-trivial, got ${buf.length} bytes`);
  // .pptx is a ZIP container — first two bytes are "PK".
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
});

test('buildImPptx handles an empty section list (cover only)', async () => {
  const buf = await buildImPptx({ title: 'Teaser', sections: [] });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 2000);
  assert.equal(buf[0], 0x50);
});

test('deckFilename slugifies the title', () => {
  assert.equal(deckFilename('Yeouido Prime Office — IM'), 'yeouido-prime-office-im.pptx');
  assert.equal(deckFilename(''), 'investment-memo.pptx');
  assert.equal(deckFilename('!!!'), 'investment-memo.pptx');
});
