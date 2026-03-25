import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { AssetForm } from '@/components/admin/asset-form';
import { Card } from '@/components/ui/card';
import { PublishToggle } from '@/components/admin/publish-toggle';

export default async function EditAssetPage({ params }: { params: { id: string } }) {
  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { documents: { orderBy: { createdAt: 'desc' } }, reports: { orderBy: { createdAt: 'desc' } } }
  });
  if (!asset) return notFound();

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit Asset</h1>
      <AdminNav />
      <PublishToggle assetId={asset.id} initial={asset.isPublished} />
      <AssetForm mode="edit" assetId={asset.id} asset={{ ...asset, status: asset.status as any }} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-semibold">Uploaded Documents</h3>
          {asset.documents.length === 0 && <p className="text-sm text-slate-400">No documents</p>}
          <ul className="list-disc pl-4 text-sm text-slate-300">
            {asset.documents.map((doc) => (
              <li key={doc.id}><a href={doc.fileUrl} className="text-blue-300">{doc.title}</a> · {doc.visibility}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">Generated AI Reports</h3>
          {asset.reports.length === 0 && <p className="text-sm text-slate-400">No reports</p>}
          <ul className="list-disc pl-4 text-sm text-slate-300">
            {asset.reports.map((r) => (
              <li key={r.id}>
                {r.reportType} · {r.model} · {new Date(r.createdAt).toLocaleString()}
                {r.reportType === 'asset_valuation' && (r.content as any)?.valuationKrw && (
                  <div className="text-xs text-blue-300">
                    Estimated Value: {Number((r.content as any).valuationKrw).toLocaleString()} KRW
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
