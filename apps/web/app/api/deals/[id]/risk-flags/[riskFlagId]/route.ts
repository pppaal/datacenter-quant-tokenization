import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { updateDealRiskFlag } from '@/lib/services/deals';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; riskFlagId: string }> }
) {
  try {
    const { id, riskFlagId } = await params;
    const payload = await request.json();
    const riskFlag = await updateDealRiskFlag(id, riskFlagId, payload);
    return NextResponse.json(riskFlag);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update risk flag.' });
  }
}
