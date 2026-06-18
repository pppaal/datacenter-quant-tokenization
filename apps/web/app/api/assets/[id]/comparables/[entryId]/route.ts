import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { deleteComparableEntry, updateComparableEntry } from '@/lib/services/comparable-book';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const payload = await request.json();
    const entry = await updateComparableEntry(id, entryId, payload);
    return NextResponse.json(entry);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update comparable entry.' });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const result = await deleteComparableEntry(id, entryId);
    return NextResponse.json(result);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to delete comparable entry.' });
  }
}
