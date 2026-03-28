import { NextResponse } from 'next/server';
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 400 }
    );
  }
}
