import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const asset = await prisma.asset.findUnique({ where: { slug: params.slug }, include: { documents: true } });
  if (!asset || !asset.isPublished) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(asset);
}
