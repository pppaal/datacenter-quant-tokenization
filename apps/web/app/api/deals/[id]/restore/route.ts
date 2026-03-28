import { NextResponse } from 'next/server';
import { restoreDeal } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const deal = await restoreDeal(id, body);
    return NextResponse.json({ deal });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore deal' },
      { status: 400 }
    );
  }
}
