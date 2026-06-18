import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createDealTask } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const task = await createDealTask(id, payload);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create task.' });
  }
}
