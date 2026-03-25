import { NextResponse } from 'next/server';
import { registerAssetOnchain } from '@/lib/services/readiness';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await registerAssetOnchain(id);
    return NextResponse.redirect(new URL(`/admin/assets/${id}`, request.url));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to prepare the review package onchain' },
      { status: 400 }
    );
  }
}
