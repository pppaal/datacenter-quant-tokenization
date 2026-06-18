import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createRealizedOutcome } from '@/lib/services/realized-outcomes';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const asset = await createRealizedOutcome(id, payload);
    return NextResponse.json(asset);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to save realized outcome.' });
  }
}
