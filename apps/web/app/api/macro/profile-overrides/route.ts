import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
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
    return validationOrGenericError(error, { message: 'Failed to create macro profile override.' });
  }
}
