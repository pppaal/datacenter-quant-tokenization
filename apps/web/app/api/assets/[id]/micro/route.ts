import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { updateAssetMicroData } from '@/lib/services/micro-data';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const asset = await updateAssetMicroData(id, payload);
    return NextResponse.json(asset);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update micro data.' });
  }
}
