import Link from 'next/link';

export function AdminNav() {
  return (
    <nav className="mb-6 flex gap-3 text-sm text-slate-300">
      <Link href="/admin/assets">Assets</Link>
      <Link href="/admin/inquiries">Inquiries</Link>
      <Link href="/admin/documents">Documents</Link>
      <Link href="/admin/reports">Reports</Link>
    </nav>
  );
}
