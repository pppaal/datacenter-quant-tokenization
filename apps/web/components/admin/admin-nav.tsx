'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type AdminNavItem = {
  href: string;
  label: string;
};

/**
 * Whether a nav item is the active one for the current pathname. The root
 * '/admin' (Overview) matches EXACTLY; every other item also matches its nested
 * routes via a prefix. Exported pure for unit testing.
 */
export function isAdminNavItemActive(href: string, pathname: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = isAdminNavItemActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full border px-4 py-2 text-sm transition',
              isActive
                ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
                : 'border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] text-[hsl(var(--foreground-muted))] hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
