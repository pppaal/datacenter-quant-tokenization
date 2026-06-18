import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { updateDealStage } from '@/lib/services/deals';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const deal = await updateDealStage(id, payload);
    return NextResponse.json(deal);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update deal stage.' });
  }
}
