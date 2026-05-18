import { NextResponse } from 'next/server';
import { updateMacroProfileOverride } from '@/lib/services/macro/profile-overrides';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const payload = await request.json();
    const override = await updateMacroProfileOverride(id, payload);
    return NextResponse.json(override);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update macro profile override' },
      { status: 400 }
    );
  }
}
