import { NextResponse } from 'next/server';
import { genericErrorResponse } from '@/lib/security/error-response';
import { deleteAssetRiskRegisterEntry } from '@/lib/services/asset-risk-register';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const asset = await deleteAssetRiskRegisterEntry(id, entryId);
    return NextResponse.json(asset);
  } catch (error) {
    return genericErrorResponse(error, { message: 'Failed to delete risk register entry.' });
  }
}
