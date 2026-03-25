import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ensureSameOrigin, forbidden, requireAdmin } from '@/lib/auth/guard';
import { z } from 'zod';

const statusSchema = z.object({ status: z.enum(['NEW', 'REVIEWING', 'CLOSED']) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  const parsed = statusSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.inquiry.update({ where: { id: params.id }, data: { status: parsed.data.status } });
  return NextResponse.json({ item: updated });
}
