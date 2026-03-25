import { NextResponse } from 'next/server';
import { normalizeDocumentHash } from '@/lib/blockchain/registry';
import { getAssetById } from '@/lib/services/assets';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAssetById(id);

  if (!asset || !asset.readinessProject) {
    return NextResponse.json({ error: 'Readiness asset not found' }, { status: 404 });
  }

  const latestDocument = asset.documents[0];

  return NextResponse.json({
    id: asset.id,
    assetCode: asset.assetCode,
    slug: asset.slug,
    name: asset.name,
    assetClass: asset.assetClass,
    market: asset.market,
    stage: asset.stage,
    status: asset.status,
    updatedAt: asset.updatedAt.toISOString(),
    readiness: {
      name: asset.readinessProject.packageName,
      status: asset.readinessProject.readinessStatus,
      reviewPhase: asset.readinessProject.reviewPhase,
      chainName: asset.readinessProject.chainName,
      nextAction: asset.readinessProject.nextAction
    },
    latestDocument: latestDocument
      ? {
          id: latestDocument.id,
          title: latestDocument.title,
          documentType: latestDocument.documentType,
          documentHash: normalizeDocumentHash(latestDocument.documentHash),
          updatedAt: latestDocument.updatedAt.toISOString()
        }
      : null
  });
}
