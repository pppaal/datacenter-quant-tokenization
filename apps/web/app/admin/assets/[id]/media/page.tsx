import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { Card } from '@/components/ui/card';
import { AssetMediaManager } from '@/components/admin/asset-media-manager';

export const dynamic = 'force-dynamic';

export default async function AssetMediaPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, assetCode: true }
  });
  if (!asset) notFound();

  const media = await prisma.assetMedia.findMany({
    where: { assetId: id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/assets/${asset.id}`} className="eyebrow text-slate-400">
            ← {asset.name}
          </Link>
          <h2 className="mt-2 text-2xl font-semibold text-white">Asset media</h2>
          <p className="mt-1 text-sm text-slate-400">
            Photos, site plans, floorplans, and renders shown on the IM cover and gallery.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <AssetMediaManager
          assetId={asset.id}
          initialMedia={media.map((m) => ({
            id: m.id,
            kind: m.kind,
            caption: m.caption,
            sortOrder: m.sortOrder,
            mimeType: m.mimeType,
            sizeBytes: m.sizeBytes
          }))}
        />
      </Card>
    </div>
  );
}
