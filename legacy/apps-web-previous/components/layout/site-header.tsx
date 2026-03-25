import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-slate-800">
      <div className="mx-auto flex w-[min(1100px,92vw)] items-center justify-between py-4">
        <Link href="/" className="font-semibold">Korea Data Center Deal Review Platform</Link>
        <nav className="flex gap-3 text-sm text-slate-300">
          <Link href="/assets">Assets</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
