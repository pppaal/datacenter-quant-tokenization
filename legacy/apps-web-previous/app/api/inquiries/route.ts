import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { inquirySchema } from '@/lib/validations/asset';
import { ensureSameOrigin } from '@/lib/auth/guard';

export async function POST(req: NextRequest) {
  if (!ensureSameOrigin(req)) return NextResponse.json({ error: 'invalid origin' }, { status: 403 });

  const body = await req.json();
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const inquiry = await prisma.inquiry.create({ data: parsed.data });
  return NextResponse.json({ item: inquiry }, { status: 201 });
}
