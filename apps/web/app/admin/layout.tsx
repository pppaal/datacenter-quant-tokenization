import Link from 'next/link';
import { AdminNav } from '@/components/admin/admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell pb-16 pt-8">
      <div className="mb-8 rounded-[32px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <Link href="/" className="eyebrow">
              Nexus Seoul
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
              Underwriting And Deal Execution Console
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Manage sourcing, screening, diligence, valuations, counterparties, and closing workflow inside one Next.js operating surface.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="fine-print">Mode</div>
              <div className="mt-2 text-white">Admin</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="fine-print">Stack</div>
              <div className="mt-2 text-white">Next.js + Prisma</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="fine-print">Scope</div>
              <div className="mt-2 text-white">Full Workflow</div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <AdminNav />
        </div>
      </div>

      {children}
    </main>
  );
}
