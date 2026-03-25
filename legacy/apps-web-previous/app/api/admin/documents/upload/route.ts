import { NextRequest, NextResponse } from 'next/server';
import { uploadDocument } from '@/lib/storage/supabase';
import { prisma } from '@/lib/db/prisma';
import { ensureSameOrigin, forbidden, requireAdmin } from '@/lib/auth/guard';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  const form = await req.formData();
  const file = form.get('file') as File;
  const assetId = String(form.get('assetId') || '');
  const title = String(form.get('title') || '');
  const visibility = String(form.get('visibility') || 'admin');

  if (!file || !assetId || !title) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'only PDF files are allowed' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 });
  }

  const fileUrl = await uploadDocument(file, `${assetId}/${Date.now()}-${file.name}`);
  const doc = await prisma.document.create({
    data: {
      assetId,
      title,
      fileUrl,
      fileType: file.type,
      visibility
    }
  });

  return NextResponse.json({ item: doc }, { status: 201 });
}
