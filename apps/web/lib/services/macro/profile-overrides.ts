import type { AssetClass, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type {
  CountryProfileRule,
  MacroProfileRuntimeRules,
  SubmarketProfileRule
} from '@/lib/services/macro/profile-registry';
import {
  countryProfileRegistry,
  submarketProfileRegistry
} from '@/lib/services/macro/profile-registry';
import {
  macroProfileOverrideSchema,
  type MacroProfileOverrideInput
} from '@/lib/validations/macro-profile';

export type MacroProfileOverrideRecord = {
  id: string;
  assetClass: AssetClass | null;
  country: string | null;
  submarketPattern: string | null;
  label: string;
  capitalRateMultiplier: number | null;
  liquidityMultiplier: number | null;
  leasingMultiplier: number | null;
  constructionMultiplier: number | null;
  priority: number;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MacroProfileOverrideDelegate = {
  findMany(args?: unknown): Promise<MacroProfileOverrideRecord[]>;
  findUnique(args: unknown): Promise<MacroProfileOverrideRecord | null>;
  create(args: unknown): Promise<MacroProfileOverrideRecord>;
  update(args: unknown): Promise<MacroProfileOverrideRecord>;
};

function macroProfileOverrideDelegate(db: PrismaClient | typeof prisma): MacroProfileOverrideDelegate {
  return (db as unknown as { macroProfileOverride: MacroProfileOverrideDelegate }).macroProfileOverride;
}

function isDatabaseConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Can't reach database server") ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('P1001')
  );
}

function buildCountryRule(override: MacroProfileOverrideRecord): CountryProfileRule | null {
  if (!override.country || override.submarketPattern) return null;

  return {
    country: override.country,
    assetClass: override.assetClass ?? undefined,
    label: override.label,
    modifiers: {
      capitalRateSensitivity: override.capitalRateMultiplier ?? undefined,
      liquiditySensitivity: override.liquidityMultiplier ?? undefined,
      leasingSensitivity: override.leasingMultiplier ?? undefined,
      constructionSensitivity: override.constructionMultiplier ?? undefined
    }
  };
}

function buildSubmarketRule(override: MacroProfileOverrideRecord): SubmarketProfileRule | null {
  if (!override.submarketPattern) return null;

  return {
    pattern: new RegExp(override.submarketPattern, 'i'),
    country: override.country ?? undefined,
    assetClass: override.assetClass ?? undefined,
    label: override.label,
    modifiers: {
      capitalRateSensitivity: override.capitalRateMultiplier ?? undefined,
      liquiditySensitivity: override.liquidityMultiplier ?? undefined,
      leasingSensitivity: override.leasingMultiplier ?? undefined,
      constructionSensitivity: override.constructionMultiplier ?? undefined
    }
  };
}

export function buildMacroProfileRuntimeRules(
  overrides: MacroProfileOverrideRecord[]
): MacroProfileRuntimeRules {
  const activeOverrides = overrides
    .filter((override) => override.isActive)
    .sort((left, right) => left.priority - right.priority);

  return {
    countryRules: [
      ...countryProfileRegistry,
      ...activeOverrides
        .map((override) => buildCountryRule(override))
        .filter((rule): rule is CountryProfileRule => rule !== null)
    ],
    submarketRules: [
      ...submarketProfileRegistry,
      ...activeOverrides
        .map((override) => buildSubmarketRule(override))
        .filter((rule): rule is SubmarketProfileRule => rule !== null)
    ]
  };
}

export async function listMacroProfileOverrides(db: PrismaClient = prisma) {
  return macroProfileOverrideDelegate(db).findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }]
  });
}

export async function listActiveMacroProfileRuntimeRules(db: PrismaClient = prisma) {
  let overrides: MacroProfileOverrideRecord[] = [];

  try {
    overrides = await macroProfileOverrideDelegate(db).findMany({
      where: {
        isActive: true
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }]
    });
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
  }

  return buildMacroProfileRuntimeRules(overrides);
}

export async function createMacroProfileOverride(
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = macroProfileOverrideSchema.parse(input);
  return macroProfileOverrideDelegate(db).create({
    data: {
      assetClass: parsed.assetClass,
      country: parsed.country,
      submarketPattern: parsed.submarketPattern,
      label: parsed.label,
      capitalRateMultiplier: parsed.capitalRateMultiplier,
      liquidityMultiplier: parsed.liquidityMultiplier,
      leasingMultiplier: parsed.leasingMultiplier,
      constructionMultiplier: parsed.constructionMultiplier,
      priority: parsed.priority,
      isActive: parsed.isActive,
      notes: parsed.notes
    }
  });
}

export async function updateMacroProfileOverride(
  id: string,
  input: Partial<MacroProfileOverrideInput>,
  db: PrismaClient = prisma
) {
  const existing = await macroProfileOverrideDelegate(db).findUnique({ where: { id } });
  if (!existing) throw new Error('Macro profile override not found');

  const parsed = macroProfileOverrideSchema.parse({
    assetClass: input.assetClass ?? existing.assetClass,
    country: input.country ?? existing.country,
    submarketPattern: input.submarketPattern ?? existing.submarketPattern,
    label: input.label ?? existing.label,
    capitalRateMultiplier: input.capitalRateMultiplier ?? existing.capitalRateMultiplier,
    liquidityMultiplier: input.liquidityMultiplier ?? existing.liquidityMultiplier,
    leasingMultiplier: input.leasingMultiplier ?? existing.leasingMultiplier,
    constructionMultiplier: input.constructionMultiplier ?? existing.constructionMultiplier,
    priority: input.priority ?? existing.priority,
    isActive: input.isActive ?? existing.isActive,
    notes: input.notes ?? existing.notes
  });

  return macroProfileOverrideDelegate(db).update({
    where: { id },
    data: {
      assetClass: parsed.assetClass,
      country: parsed.country,
      submarketPattern: parsed.submarketPattern,
      label: parsed.label,
      capitalRateMultiplier: parsed.capitalRateMultiplier,
      liquidityMultiplier: parsed.liquidityMultiplier,
      leasingMultiplier: parsed.leasingMultiplier,
      constructionMultiplier: parsed.constructionMultiplier,
      priority: parsed.priority,
      isActive: parsed.isActive,
      notes: parsed.notes
    }
  });
}
