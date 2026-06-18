import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createDealActivity } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const activity = await createDealActivity(id, payload);
    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to add activity.' });
  }
}
