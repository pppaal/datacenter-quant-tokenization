import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { type SupportedCurrency } from '@/lib/finance/currency';
import { createPrismaSourceCacheStore } from '@/lib/sources/cache';
import { createFxAdapter } from '@/lib/sources/adapters/fx';

export async function getFxRateMap(
  currencies: Iterable<SupportedCurrency>,
  db: Pick<PrismaClient, 'sourceCache' | 'sourceOverride'> = prisma
) {
  const uniqueCurrencies = [...new Set(currencies)];
  const adapter = createFxAdapter(createPrismaSourceCacheStore(db as PrismaClient));
  const entries = await Promise.all(
    uniqueCurrencies.map(async (currency) => {
      const envelope = await adapter.fetch(currency);
      return [currency, envelope.data.rateToKrw] as const;
    })
  );

  return Object.fromEntries(entries) as Partial<Record<SupportedCurrency, number>>;
}
