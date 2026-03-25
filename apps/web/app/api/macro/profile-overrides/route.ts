import { NextResponse } from 'next/server';
import {
  createMacroProfileOverride,
  listMacroProfileOverrides
} from '@/lib/services/macro/profile-overrides';

export async function GET() {
  const overrides = await listMacroProfileOverrides();
  return NextResponse.json(overrides);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const override = await createMacroProfileOverride(payload);
    return NextResponse.json(override, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create macro profile override' },
      { status: 400 }
    );
  }
}
