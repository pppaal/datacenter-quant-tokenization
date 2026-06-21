/**
 * Financial-statement notes (주석) — the qualitative disclosures that aren't
 * derivable from numeric data (investment-property valuation basis, debt
 * covenants, related-party transactions, contingencies, …). Scoped to a fund
 * OR an asset. Thin CRUD over the `FinancialNote` model added in
 * 20260621060000_financial_notes.
 */
import { prisma } from '@/lib/db/prisma';
import type { FinancialNote, PrismaClient } from '@prisma/client';

export type FinancialNoteScope = { fundId: string } | { assetId: string };

export type FinancialNoteInput = {
  id?: string;
  scope: FinancialNoteScope;
  noteKey: string;
  title: string;
  body: string;
  orderIndex?: number;
};

function scopeWhere(scope: FinancialNoteScope) {
  return 'fundId' in scope ? { fundId: scope.fundId } : { assetId: scope.assetId };
}

/** Notes for a fund or asset, ordered for display. */
export async function getFinancialNotes(
  scope: FinancialNoteScope,
  db: PrismaClient = prisma
): Promise<FinancialNote[]> {
  return db.financialNote.findMany({
    where: scopeWhere(scope),
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
  });
}

/** Create or update a note. Update path is keyed by `id`. */
export async function upsertFinancialNote(
  input: FinancialNoteInput,
  db: PrismaClient = prisma
): Promise<FinancialNote> {
  const data = {
    noteKey: input.noteKey,
    title: input.title,
    body: input.body,
    orderIndex: input.orderIndex ?? 0,
    ...scopeWhere(input.scope)
  };
  if (input.id) {
    return db.financialNote.update({ where: { id: input.id }, data });
  }
  return db.financialNote.create({ data });
}

export async function deleteFinancialNote(id: string, db: PrismaClient = prisma): Promise<void> {
  await db.financialNote.delete({ where: { id } });
}
