import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const assets = await prisma.asset.findMany({ where: { isPublished: true }, orderBy: { updatedAt: 'desc' } });
  return NextResponse.json({ items: assets });
}
