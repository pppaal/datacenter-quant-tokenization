/**
 * DELETE /api/admin/financial-notes/[id] — remove a financial note (주석).
 */
import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { deleteFinancialNote } from '@/lib/services/financial-notes';

export const dynamic = 'force-dynamic';

export const DELETE = withAdminApi<undefined, { id: string }>({
  requiredRole: 'ANALYST',
  auditAction: 'financial_note.delete',
  auditEntityType: 'FinancialNote',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ params }) {
    await deleteFinancialNote(params.id);
    return NextResponse.json({ ok: true });
  }
});
