import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminNav, type AdminNavItem } from '@/components/admin/admin-nav';
import { AdminSessionButton } from '@/components/admin/admin-session-button';
import { NotificationBell } from '@/components/admin/notification-bell';
import { prisma } from '@/lib/db/prisma';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { hasRequiredAdminRole, type AdminAccessRole } from '@/lib/security/admin-auth';

const navItems: Array<AdminNavItem & { minimumRole: AdminAccessRole }> = [
  { href: '/admin', label: 'Overview', minimumRole: 'VIEWER' },
  { href: '/admin/assets', label: 'Assets', minimumRole: 'VIEWER' },
  { href: '/admin/valuations', label: 'Valuations', minimumRole: 'VIEWER' },
  { href: '/admin/deals', label: 'Deals', minimumRole: 'ANALYST' },
  { href: '/admin/ic', label: 'IC', minimumRole: 'ANALYST' },
  { href: '/admin/portfolio', label: 'Portfolio', minimumRole: 'ANALYST' },
  { href: '/admin/funds', label: 'Funds', minimumRole: 'ANALYST' },
  { href: '/admin/investors', label: 'Investors', minimumRole: 'ANALYST' },
  { href: '/admin/research', label: 'Research', minimumRole: 'ANALYST' },
  { href: '/admin/review', label: 'Review', minimumRole: 'ANALYST' },
  { href: '/admin/documents', label: 'Documents', minimumRole: 'ANALYST' },
  { href: '/admin/sources', label: 'Sources', minimumRole: 'ANALYST' },
  { href: '/admin/macro-profiles', label: 'Macro Profiles', minimumRole: 'ANALYST' },
  { href: '/admin/readiness', label: 'Readiness', minimumRole: 'ANALYST' },
  { href: '/admin/security', label: 'Security', minimumRole: 'ADMIN' }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(await headers(), prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor) {
    redirect('/admin/login?error=session_required');
  }

  const visibleItems = navItems
    .filter((item) => !actor || hasRequiredAdminRole(actor.role, item.minimumRole))
    .map(({ href, label }) => ({ href, label }));

  return (
    <main className="app-shell pb-16 pt-8">
      <div className="mb-8 rounded-[32px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <Link href="/" className="eyebrow">
              Nexus Seoul
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
              Investment Firm Operating Console
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Run shared research, review-gated underwriting, deal execution, portfolio operations,
              and capital reporting inside one controlled operator surface.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="fine-print">Mode</div>
              <div className="mt-2 text-white">{actor?.role ?? 'Admin'}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="fine-print">Stack</div>
              <div className="mt-2 text-white">Next.js + Prisma</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="fine-print">Scope</div>
              <div className="mt-2 text-white">Research To Capital</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <div className="text-sm text-slate-400">
            Active operator:{' '}
            <span className="font-semibold text-white">
              {actor?.identifier ?? 'basic-auth operator'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <AdminSessionButton />
          </div>
        </div>

        <div className="mt-6">
          <AdminNav items={visibleItems} />
        </div>
      </div>

      {children}
    </main>
  );
}
