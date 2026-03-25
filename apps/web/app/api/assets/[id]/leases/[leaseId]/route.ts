import { NextResponse } from 'next/server';
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update lease' },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete lease' },
      { status: 400 }
    );
  }
}
