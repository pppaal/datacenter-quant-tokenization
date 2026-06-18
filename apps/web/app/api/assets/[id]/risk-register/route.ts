import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createAssetRiskRegisterEntry } from '@/lib/services/asset-risk-register';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const asset = await createAssetRiskRegisterEntry(id, payload);
    return NextResponse.json(asset);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to save risk register entry.' });
  }
}
