import { prisma } from '@/lib/db/prisma';
import { AdminNav } from '@/components/admin/admin-nav';
import { InquiriesTable } from '@/components/admin/inquiries-table';

export default async function AdminInquiriesPage() {
  const inquiries = await prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, include: { asset: true } });
  return (
    <main>
      <h1 className="text-2xl font-semibold">Inquiry Management</h1>
      <AdminNav />
      <InquiriesTable initial={inquiries as any} />
    </main>
  );
}
