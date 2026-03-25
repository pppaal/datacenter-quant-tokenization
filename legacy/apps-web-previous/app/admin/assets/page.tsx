import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { AdminNav } from '@/components/admin/admin-nav';
import { Card } from '@/components/ui/card';

export default async function AdminAssetsPage() {
  const assets = await prisma.asset.findMany({ orderBy: { updatedAt: 'desc' } });
  return (
    <main>
      <h1 className="text-2xl font-semibold">Admin · Asset CRUD</h1>
      <AdminNav />
      <Link href="/admin/assets/new" className="text-blue-300">+ New Asset</Link>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {assets.map((a) => (
          <Card key={a.id}>
            <h3 className="font-semibold">{a.name}</h3>
            <p className="text-xs text-slate-400">{a.slug} · {a.isPublished ? 'published' : 'draft'}</p>
            <Link className="text-sm text-blue-300" href={`/admin/assets/${a.id}`}>Edit</Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
