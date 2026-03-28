import { NextResponse } from 'next/server';
import { seedDealStageChecklist } from '@/lib/services/deals';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tasks = await seedDealStageChecklist(id);
    return NextResponse.json({ createdCount: tasks.length, tasks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to seed checklist' },
      { status: 400 }
    );
  }
}
