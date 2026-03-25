import { prisma } from '@/lib/db/prisma';
import { AdminNav } from '@/components/admin/admin-nav';
import { DocumentUploadForm } from '@/components/admin/document-upload-form';
import { Card } from '@/components/ui/card';

export default async function AdminDocumentsPage() {
  const assets = await prisma.asset.findMany({ select: { id: true, name: true } });
  const docs = await prisma.document.findMany({ orderBy: { createdAt: 'desc' }, include: { asset: true } });
  return (
    <main>
      <h1 className="text-2xl font-semibold">Document Upload</h1>
      <AdminNav />
      <DocumentUploadForm assets={assets} />
      <div className="mt-4 grid gap-2">
        {docs.map((d) => <Card key={d.id}><p>{d.title}</p><p className="text-xs text-slate-400">{d.asset.name} · {d.visibility}</p></Card>)}
      </div>
    </main>
  );
}
