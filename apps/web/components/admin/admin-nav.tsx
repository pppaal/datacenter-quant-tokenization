'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type AdminNavItem = {
  href: string;
  label: string;
};

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'rounded-full border px-4 py-2 text-sm transition',
            pathname === item.href || pathname.startsWith(`${item.href}/`)
              ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
