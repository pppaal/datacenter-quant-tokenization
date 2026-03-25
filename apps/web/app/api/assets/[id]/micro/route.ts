import { NextResponse } from 'next/server';
import { updateAssetMicroData } from '@/lib/services/micro-data';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const asset = await updateAssetMicroData(id, payload);
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update micro data' },
      { status: 400 }
    );
  }
}
