import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createAssetLease } from '@/lib/services/lease-book';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const lease = await createAssetLease(id, payload);
    return NextResponse.json(lease);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create lease.' });
  }
}
