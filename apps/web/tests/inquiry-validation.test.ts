import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZodError } from 'zod';
import { inquirySchema } from '@/lib/validations/inquiry';
import { createInquiry } from '@/lib/services/inquiries';

/**
 * The public, unauthenticated POST /api/inquiries persists whatever the schema
 * accepts. Harden the schema against (a) unbounded `assetId` strings and (b)
 * unknown keys (payload-stuffing on the public contact form). Network/DB-free:
 * the schema is exercised directly and `createInquiry` is driven with a Prisma
 * fake so it never touches a real database.
 */

const valid = {
  name: 'Jane Analyst',
  company: 'Acme Capital',
  email: 'jane@example.com',
  requestType: 'data-room',
  message: 'We would like access to the data room for the Seoul logistics asset.'
};

test('inquirySchema rejects unknown keys (strict)', () => {
  assert.throws(
    () => inquirySchema.parse({ ...valid, status: 'APPROVED', isAdmin: true }),
    ZodError
  );
});

test('inquirySchema rejects an over-long assetId', () => {
  assert.throws(() => inquirySchema.parse({ ...valid, assetId: 'x'.repeat(65) }), ZodError);
});

test('inquirySchema still accepts a well-formed payload', () => {
  const parsed = inquirySchema.parse({ ...valid, assetId: 'clr1abcd0000xyz' });
  assert.equal(parsed.email, 'jane@example.com');
  assert.equal(parsed.assetId, 'clr1abcd0000xyz');
});

test('createInquiry does not persist unknown keys via the public route', async () => {
  let captured: unknown;
  const fakeDb = {
    inquiry: {
      create: async (args: { data: unknown }) => {
        captured = args.data;
        return { id: 'inq_1', ...(args.data as object) };
      }
    }
  } as unknown as Parameters<typeof createInquiry>[1];

  await assert.rejects(() => createInquiry({ ...valid, status: 'APPROVED' }, fakeDb), ZodError);
  // The rejected payload never reached the DB layer.
  assert.equal(captured, undefined);
});
