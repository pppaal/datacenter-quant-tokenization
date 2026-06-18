import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createDebtFacility } from '@/lib/services/debt-book';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const facility = await createDebtFacility(id, payload);
    return NextResponse.json(facility);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create debt facility.' });
  }
}
