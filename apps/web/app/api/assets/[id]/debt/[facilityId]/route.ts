import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { deleteDebtFacility, updateDebtFacility } from '@/lib/services/debt-book';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; facilityId: string }> }
) {
  try {
    const { id, facilityId } = await params;
    const payload = await request.json();
    const facility = await updateDebtFacility(id, facilityId, payload);
    return NextResponse.json(facility);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update debt facility.' });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; facilityId: string }> }
) {
  try {
    const { id, facilityId } = await params;
    const result = await deleteDebtFacility(id, facilityId);
    return NextResponse.json(result);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to delete debt facility.' });
  }
}
