import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createCapexLineItem } from '@/lib/services/capex-book';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const item = await createCapexLineItem(id, payload);
    return NextResponse.json(item);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create CAPEX line item.' });
  }
}
