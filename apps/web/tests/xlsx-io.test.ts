import assert from 'node:assert/strict';
import test from 'node:test';
import { buildXlsx, xlsxFilename, type XlsxWorkbookSpec } from '@/lib/services/exports/xlsx';
import { parseWorkbook, workbookToCsv } from '@/lib/services/imports/xlsx';

const SPEC: XlsxWorkbookSpec = {
  title: 'Fund I — Cap Table',
  sheets: [
    {
      name: 'Cap Table',
      columns: [
        { header: 'Investor', key: 'investor', type: 'text' },
        { header: 'Commitment (KRW)', key: 'commitment', type: 'currency' },
        { header: 'Ownership', key: 'ownership', type: 'percent' }
      ],
      rows: [
        { investor: 'LP Alpha', commitment: 5_000_000_000, ownership: 0.5 },
        { investor: 'LP Beta', commitment: 3_000_000_000, ownership: 0.3 },
        { investor: '운용사 GP', commitment: 2_000_000_000, ownership: 0.2 }
      ],
      totals: { investor: 'Total', commitment: 10_000_000_000, ownership: 1.0 }
    }
  ]
};

test('buildXlsx returns a non-empty OOXML (zip) buffer', async () => {
  const buf = await buildXlsx(SPEC);
  assert.ok(Buffer.isBuffer(buf) && buf.length > 2000);
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
});

test('export → import round-trips headers and row values', async () => {
  const buf = await buildXlsx(SPEC);
  const { sheets } = await parseWorkbook(buf);
  assert.equal(sheets.length, 1);
  const sheet = sheets[0];
  assert.equal(sheet.name, 'Cap Table');
  assert.deepEqual(sheet.headers, ['Investor', 'Commitment (KRW)', 'Ownership']);
  // 3 data rows + 1 totals row.
  assert.equal(sheet.rows.length, 4);
  assert.deepEqual(sheet.rows[0], ['LP Alpha', 5_000_000_000, 0.5]);
  assert.equal(sheet.rows[3][0], 'Total');
  // Korean text survives the round-trip.
  assert.equal(sheet.rows[2][0], '운용사 GP');
});

test('workbookToCsv flattens the first sheet to CSV (feeds CSV pipelines)', async () => {
  const buf = await buildXlsx(SPEC);
  const csv = await workbookToCsv(buf);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Investor,Commitment (KRW),Ownership');
  assert.equal(lines[1], 'LP Alpha,5000000000,0.5');
  assert.equal(lines.length, 5); // header + 3 rows + totals
});

test('workbookToCsv quotes cells containing commas', async () => {
  const buf = await buildXlsx({
    title: 't',
    sheets: [
      {
        name: 'S',
        columns: [{ header: 'name', key: 'name' }],
        rows: [{ name: 'Yeouido, Seoul' }]
      }
    ]
  });
  const csv = await workbookToCsv(buf);
  assert.ok(csv.includes('"Yeouido, Seoul"'));
});

test('parseWorkbook tolerates an empty workbook sheet', async () => {
  const buf = await buildXlsx({ title: 'empty', sheets: [{ name: 'S', columns: [], rows: [] }] });
  const { sheets } = await parseWorkbook(buf);
  assert.equal(sheets.length, 1);
});

test('xlsxFilename slugifies', () => {
  assert.equal(xlsxFilename('Fund I — Cap Table'), 'fund-i-cap-table.xlsx');
  assert.equal(xlsxFilename(''), 'export.xlsx');
});
