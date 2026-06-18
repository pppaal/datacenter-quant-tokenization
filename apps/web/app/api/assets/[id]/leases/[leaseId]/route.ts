import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { deleteAssetLease, updateAssetLease } from '@/lib/services/lease-book';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; leaseId: string }> }
) {
  try {
    const { id, leaseId } = await params;
    const payload = await request.json();
    const lease = await updateAssetLease(id, leaseId, payload);
    return NextResponse.json(lease);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update lease.' });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; leaseId: string }> }
) {
  try {
    const { id, leaseId } = await params;
    const result = await deleteAssetLease(id, leaseId);
    return NextResponse.json(result);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to delete lease.' });
  }
}
