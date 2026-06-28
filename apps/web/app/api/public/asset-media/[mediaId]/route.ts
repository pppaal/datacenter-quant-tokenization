import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createDocumentStorageFromEnv } from '@/lib/storage/local';
import { buildMediaServingHeaders } from '@/lib/storage/media-headers';

// Public read for asset media bytes. The IM cover (sample-report) is a
// public marketing surface, so the photo gallery is too. Knowing the
// mediaId is treated as proof of access — there is no listing endpoint
// outside the authenticated admin API.
export async function GET(_request: Request, context: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await context.params;
  const media = await prisma.assetMedia.findUnique({ where: { id: mediaId } });
  if (!media) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const storage = createDocumentStorageFromEnv();
  const buffer = await storage.read(media.storagePath);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    // Hardened headers: forces SVG/XML to download + sandbox (stored-XSS guard
    // on this public surface) and sets nosniff for all media.
    headers: buildMediaServingHeaders(media.mimeType, media.sizeBytes)
  });
}
