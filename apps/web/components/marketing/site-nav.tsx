import Link from 'next/link';

export function SiteNav() {
  return (
    <header className="app-shell sticky top-0 z-30 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/10 bg-slate-950/65 px-5 py-3 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 font-mono text-xs tracking-[0.24em] text-accent">
            NS
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Nexus Seoul</div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
              AI Real Estate Underwriting
            </div>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <Link href="/product" className="rounded-full px-4 py-2 transition hover:bg-white/5 hover:text-white">
            Product
          </Link>
          <Link href="/sample-report" className="rounded-full px-4 py-2 transition hover:bg-white/5 hover:text-white">
            Sample IM
          </Link>
          <Link href="/admin" className="rounded-full border border-white/10 px-4 py-2 text-white transition hover:border-accent/40 hover:bg-white/5">
            Open Console
          </Link>
        </nav>
      </div>
    </header>
  );
}
