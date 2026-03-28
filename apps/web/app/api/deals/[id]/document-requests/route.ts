import { NextResponse } from 'next/server';
import { createDealDocumentRequest } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const documentRequest = await createDealDocumentRequest(id, body);
    return NextResponse.json({ documentRequest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create document request' },
      { status: 400 }
    );
  }
}
