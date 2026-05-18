import { SiteNav } from '@/components/marketing/site-nav';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="pb-24">
      <SiteNav />
      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="mt-6 h-14 w-3/4 rounded-2xl" />
          <Skeleton className="mt-3 h-14 w-2/3 rounded-2xl" />
          <Skeleton className="mt-8 h-5 w-2/3 rounded" />
          <Skeleton className="mt-2 h-5 w-1/2 rounded" />
        </div>
      </section>
      <section className="app-shell py-10">
        <div className="grid gap-5 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-3xl" />
          ))}
        </div>
      </section>
    </main>
  );
}
