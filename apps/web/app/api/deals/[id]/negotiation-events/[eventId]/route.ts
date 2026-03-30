import { NextResponse } from 'next/server';
import { updateDealNegotiationEvent } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
    eventId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { id, eventId } = await params;
    const body = await request.json();
    const negotiationEvent = await updateDealNegotiationEvent(id, eventId, body);
    return NextResponse.json({ negotiationEvent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update negotiation event' },
      { status: 400 }
    );
  }
}
