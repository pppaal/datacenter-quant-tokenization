import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { updateDealTask } from '@/lib/services/deals';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const payload = await request.json();
    const task = await updateDealTask(id, taskId, payload);
    return NextResponse.json(task);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update task.' });
  }
}
