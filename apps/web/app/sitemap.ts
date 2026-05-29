import type { MetadataRoute } from 'next';

const publicRoutes: Array<{
  path: string;
  priority: number;
  changeFrequency: 'monthly' | 'weekly';
}> = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/product', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/research', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/sample-report', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/quarterly-report', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/property-analyze', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/contact', priority: 0.7, changeFrequency: 'monthly' }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_BASE_URL ?? 'https://nexus-seoul.example').replace(/\/$/, '');
  const now = new Date();
  return publicRoutes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority
  }));
}
