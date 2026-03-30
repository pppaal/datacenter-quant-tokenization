import { NextResponse } from 'next/server';
import { createDealNegotiationEvent } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const negotiationEvent = await createDealNegotiationEvent(id, body);
    return NextResponse.json({ negotiationEvent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create negotiation event' },
      { status: 400 }
    );
  }
}
