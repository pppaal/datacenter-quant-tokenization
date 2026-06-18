import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { seedDealStageChecklist } from '@/lib/services/deals';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tasks = await seedDealStageChecklist(id);
    return NextResponse.json({ createdCount: tasks.length, tasks });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to seed checklist.' });
  }
}
