import { NextResponse } from 'next/server';
import { updateDealDocumentRequest } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
    requestId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { id, requestId } = await params;
    const body = await request.json();
    const documentRequest = await updateDealDocumentRequest(id, requestId, body);
    return NextResponse.json({ documentRequest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update document request' },
      { status: 400 }
    );
  }
}
