import assert from 'node:assert/strict';
import test from 'node:test';
import { inferFactsFromText, ingestDocumentExtraction } from '@/lib/services/document-extraction';

test('document extraction chunks text and stores heuristic plus AI facts', async () => {
  const createdChunks: any[] = [];
  const createdFacts: any[] = [];

  const result = await ingestDocumentExtraction(
    {
      assetId: 'asset_1',
      documentVersionId: 'version_1',
      assetName: 'Seoul Hyperscale Campus I',
      title: 'Committee Lease and Permit Memo',
      extractedText:
        'Permit stage: Power allocation review. Power approval status remains pending final utility committee slot. Occupancy assumption 78%. Cap rate 6.1%. The anchor tenant signed 12 MW of contracted capacity. Monthly rate KRW 226000 applies after fit-out.'
    },
    {
      db: {
        documentExtractionRun: {
          async create(args: any) {
            return { id: 'run_1', ...args.data };
          }
        },
        documentChunk: {
          async create(args: any) {
            createdChunks.push(args.data);
            return args.data;
          }
        },
        documentFact: {
          async create(args: any) {
            createdFacts.push(args.data);
            return args.data;
          }
        }
      } as any,
      aiExtractor: async () => [
        {
          factType: 'lease',
          factKey: 'tenant_status',
          factValueText: 'Anchor tenant signed',
          confidenceScore: 0.82
        }
      ]
    }
  );

  assert.equal(result?.runId, 'run_1');
  assert.ok((result?.chunkCount ?? 0) >= 1);
  assert.ok(createdChunks.length >= 1);
  assert.ok(createdFacts.some((fact) => fact.factKey === 'contracted_kw' && fact.factValueNumber === 12000));
  assert.ok(createdFacts.some((fact) => fact.factKey === 'occupancy_pct' && fact.factValueNumber === 78));
  assert.ok(createdFacts.some((fact) => fact.factKey === 'tenant_status'));
});

test('heuristic fact inference extracts core underwriting metrics', () => {
  const facts = inferFactsFromText(
    'Cap rate 6.4%. Occupancy assumption 74%. The project budget KRW 182000000000. Contracted capacity totals 24 MW.'
  );

  assert.ok(facts.some((fact) => fact.factKey === 'cap_rate_pct' && fact.factValueNumber === 6.4));
  assert.ok(facts.some((fact) => fact.factKey === 'occupancy_pct' && fact.factValueNumber === 74));
  assert.ok(facts.some((fact) => fact.factKey === 'budget_krw' && fact.factValueNumber === 182000000000));
  assert.ok(facts.some((fact) => fact.factKey === 'contracted_kw' && fact.factValueNumber === 24000));
});
