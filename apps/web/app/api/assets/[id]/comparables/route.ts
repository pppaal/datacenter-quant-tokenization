import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createComparableEntry } from '@/lib/services/comparable-book';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const entry = await createComparableEntry(id, payload);
    return NextResponse.json(entry);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create comparable entry.' });
  }
}
