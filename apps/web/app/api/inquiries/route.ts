import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createInquiry } from '@/lib/services/inquiries';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const inquiry = await createInquiry(payload);
    return NextResponse.json(inquiry, { status: 201 });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create inquiry.' });
  }
}
