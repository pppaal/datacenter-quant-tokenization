import { NextResponse } from 'next/server';
import { enrichAssetFromSources } from '@/lib/services/assets';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await enrichAssetFromSources(id);
    return NextResponse.redirect(new URL(`/admin/assets/${id}`, request.url));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich asset' },
      { status: 400 }
    );
  }
}
