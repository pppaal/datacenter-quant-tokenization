/**
 * AML/CDD sanctions + PEP screening.
 *
 * Unlike the legacy KYC bridge — whose "sanctioned country codes" were inert
 * (they never blocked anything) — this screening service ACTUALLY blocks or
 * escalates on a confirmed list hit and emits a `ScreeningResult` evidence
 * record. It exposes a pluggable provider interface so the local denylist
 * adapter can be swapped for Dow Jones / Refinitiv / etc. without touching
 * callers.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { env } from '@/lib/env';

export type ScreeningStatus =
  | 'CLEAR'
  | 'POTENTIAL_MATCH'
  | 'CONFIRMED_MATCH'
  | 'ESCALATED'
  | 'REJECTED';

export type ScreeningListType = 'OFAC' | 'UN' | 'EU' | 'UK_HMT' | 'KR_MOFA' | 'PEP' | 'INTERNAL';

export type ScreeningSubject = {
  name: string;
  /** ISO 8601 date string or Date; used to disambiguate name-only matches. */
  dateOfBirth?: string | Date | null;
  /** ISO 3166-1 alpha-3 country code. */
  country?: string | null;
};

export type ScreeningMatch = {
  listType: ScreeningListType;
  entryName: string;
  matchScore: number; // 0..1
  isPep: boolean;
  reason: string;
};

export type ScreeningOutcome = {
  status: ScreeningStatus;
  matchScore: number;
  isPep: boolean;
  listType: ScreeningListType | null;
  matches: ScreeningMatch[];
  /** True when a Commitment/onboarding must be blocked. */
  blocked: boolean;
};

export interface SanctionsProvider {
  readonly name: string;
  screen(subject: ScreeningSubject): Promise<ScreeningMatch[]>;
}

/** A single denylist entry. */
export type DenylistEntry = {
  name: string;
  listType: ScreeningListType;
  dateOfBirth?: string | null; // YYYY-MM-DD
  countries?: string[]; // alpha-3 codes this entry is associated with
  isPep?: boolean;
};

function normalizeName(value: string): string {
  return (
    value
      .normalize('NFKD')
      // Strip combining diacritical marks so accented Latin folds to ASCII
      // (José → jose). `\p{Diacritic}` covers the U+0300–U+036F range and more.
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      // Keep letters/digits from ANY script (not just ASCII a-z0-9) so non-Latin
      // sanctioned names — Cyrillic, Hangul, CJK, Arabic, etc. — are not silently
      // erased to an empty token set. The previous `[^a-z0-9\s]` stripped every
      // non-Latin code point, leaving an empty string → 0.0 similarity → a FALSE
      // NEGATIVE against the denylist. Only punctuation/symbols collapse to space.
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Token-overlap name similarity (Jaccard over word tokens). Cheap, deterministic,
 * and good enough to flag obvious matches for human review without a fuzzy-match
 * dependency. A real deployment routes `POTENTIAL_MATCH` to an analyst queue.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  const union = new Set([...ta, ...tb]).size;
  return intersection / union;
}

/**
 * Local denylist / sanctions-list adapter. The list is sourced from an explicit
 * array (tests, seeding) or from `SANCTIONS_DENYLIST_JSON` env (a JSON array of
 * `DenylistEntry`). Designed so an operator can pre-load OFAC/UN/EU/KR exports.
 */
export class LocalDenylistProvider implements SanctionsProvider {
  public readonly name = 'local';
  private readonly entries: DenylistEntry[];
  private readonly threshold: number;

  constructor(options?: {
    entries?: DenylistEntry[];
    env?: NodeJS.ProcessEnv;
    threshold?: number;
  }) {
    this.threshold = options?.threshold ?? 0.6;
    if (options?.entries) {
      this.entries = options.entries;
    } else {
      this.entries = LocalDenylistProvider.loadFromEnv(options?.env ?? process.env);
    }
  }

  static loadFromEnv(env: NodeJS.ProcessEnv): DenylistEntry[] {
    const raw = env.SANCTIONS_DENYLIST_JSON?.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is DenylistEntry => e && typeof e.name === 'string' && typeof e.listType === 'string'
      );
    } catch {
      return [];
    }
  }

  async screen(subject: ScreeningSubject): Promise<ScreeningMatch[]> {
    const subjectDob = toIsoDate(subject.dateOfBirth);
    const matches: ScreeningMatch[] = [];

    for (const entry of this.entries) {
      const score = nameSimilarity(subject.name, entry.name);
      if (score < this.threshold) continue;

      // DOB disambiguation: if both DOBs are known and differ, demote the score.
      let adjusted = score;
      let reason = `name match (${score.toFixed(2)})`;
      if (subjectDob && entry.dateOfBirth) {
        if (subjectDob === entry.dateOfBirth) {
          adjusted = Math.min(1, score + 0.2);
          reason += ' + DOB match';
        } else {
          adjusted = score * 0.5;
          reason += ' but DOB mismatch';
        }
      }

      // Country filter: an entry scoped to specific countries only matches when
      // the subject's country is unknown or in scope.
      if (entry.countries && entry.countries.length > 0 && subject.country) {
        if (!entry.countries.includes(subject.country.toUpperCase())) {
          adjusted = adjusted * 0.5;
          reason += ' (country out of scope)';
        }
      }

      if (adjusted < this.threshold) continue;

      matches.push({
        listType: entry.listType,
        entryName: entry.name,
        matchScore: Number(adjusted.toFixed(4)),
        isPep: Boolean(entry.isPep) || entry.listType === 'PEP',
        reason
      });
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }
}

const CONFIRMED_THRESHOLD = 0.85;

/**
 * Reduce raw matches into a screening outcome. The decision policy:
 *   - no matches                          → CLEAR (not blocked)
 *   - any sanctions match >= 0.85         → REJECTED (blocked)
 *   - any sanctions match (>= threshold)  → ESCALATED (blocked, manual review)
 *   - PEP-only match                      → POTENTIAL_MATCH (blocked pending EDD)
 */
export function evaluateScreening(matches: ScreeningMatch[]): ScreeningOutcome {
  if (matches.length === 0) {
    return {
      status: 'CLEAR',
      matchScore: 0,
      isPep: false,
      listType: null,
      matches: [],
      blocked: false
    };
  }

  // Select the HIGHEST-scoring match in each class rather than trusting the
  // caller to pre-sort. `evaluateScreening` is a public entry point; a provider
  // (or a direct caller) that returns matches in arbitrary order must still see
  // a confirmed (>= 0.85) hit classified as REJECTED, not merely ESCALATED.
  // Reading index 0 of an unsorted array would UNDER-BLOCK a true sanctions hit.
  const maxByScore = (a: ScreeningMatch, b: ScreeningMatch): ScreeningMatch =>
    b.matchScore > a.matchScore ? b : a;
  const top = matches.reduce(maxByScore);
  const sanctionsMatches = matches.filter((m) => m.listType !== 'PEP');
  const isPep = matches.some((m) => m.isPep);

  if (sanctionsMatches.length > 0) {
    const topSanction = sanctionsMatches.reduce(maxByScore);
    if (topSanction.matchScore >= CONFIRMED_THRESHOLD) {
      return {
        status: 'REJECTED',
        matchScore: topSanction.matchScore,
        isPep,
        listType: topSanction.listType,
        matches,
        blocked: true
      };
    }
    return {
      status: 'ESCALATED',
      matchScore: topSanction.matchScore,
      isPep,
      listType: topSanction.listType,
      matches,
      blocked: true
    };
  }

  // PEP-only.
  return {
    status: 'POTENTIAL_MATCH',
    matchScore: top.matchScore,
    isPep: true,
    listType: 'PEP',
    matches,
    blocked: true
  };
}

let defaultProvider: SanctionsProvider | null = null;

export function getSanctionsProvider(env: NodeJS.ProcessEnv = process.env): SanctionsProvider {
  if (!defaultProvider) {
    defaultProvider = new LocalDenylistProvider({ env });
  }
  return defaultProvider;
}

/** Test-only: reset the memoized provider so a subsequent call re-reads env. */
export function __resetSanctionsProviderForTests(): void {
  defaultProvider = null;
}

const RESCREEN_INTERVAL_DAYS = env().AML_RESCREEN_INTERVAL_DAYS ?? 90;

export type ScreenAndRecordInput = {
  subject: ScreeningSubject;
  investorId?: string | null;
  counterpartyId?: string | null;
  beneficialOwnerId?: string | null;
  /** 0x-prefixed on-chain wallet this screening covers (lower-cased on store). */
  wallet?: string | null;
};

/**
 * Screening statuses that must block onboarding / on-chain whitelisting. Mirrors
 * the eligibility gate; the only non-blocking status is `CLEAR`.
 */
export const BLOCKING_SCREENING_STATUSES: ReadonlySet<ScreeningStatus> = new Set([
  'POTENTIAL_MATCH',
  'CONFIRMED_MATCH',
  'ESCALATED',
  'REJECTED'
]);

export function isBlockingScreeningStatus(status: string | null | undefined): boolean {
  return BLOCKING_SCREENING_STATUSES.has((status ?? '').toUpperCase() as ScreeningStatus);
}

export type WalletScreeningGate = {
  cleared: boolean;
  status: ScreeningStatus | null;
  reason: 'CLEAR' | 'NOT_SCREENED' | 'SANCTIONS_BLOCKED';
};

/**
 * Fail-closed sanctions gate for a wallet: returns `cleared: true` only when the
 * latest `ScreeningResult` for the wallet exists and is non-blocking. No
 * screening on record → NOT_SCREENED (blocked), a blocking status → SANCTIONS_BLOCKED.
 */
export async function getWalletScreeningGate(
  wallet: string,
  db: Pick<PrismaClient, 'screeningResult'> = prisma
): Promise<WalletScreeningGate> {
  const normalized = wallet.trim().toLowerCase();
  const latest = await db.screeningResult.findFirst({
    where: { wallet: normalized },
    orderBy: { screenedAt: 'desc' },
    select: { status: true }
  });
  if (!latest) {
    return { cleared: false, status: null, reason: 'NOT_SCREENED' };
  }
  if (isBlockingScreeningStatus(latest.status)) {
    return {
      cleared: false,
      status: latest.status as ScreeningStatus,
      reason: 'SANCTIONS_BLOCKED'
    };
  }
  return { cleared: true, status: latest.status as ScreeningStatus, reason: 'CLEAR' };
}

/**
 * Screen a subject through the configured provider, evaluate the outcome, and
 * persist a `ScreeningResult` evidence record with the next re-screen due date
 * (ongoing-monitoring hook). Returns the outcome plus the created record.
 */
export async function screenAndRecord(
  input: ScreenAndRecordInput,
  deps: {
    db?: Pick<PrismaClient, 'screeningResult'>;
    provider?: SanctionsProvider;
  } = {}
): Promise<{ outcome: ScreeningOutcome; record: { id: string } }> {
  const db = deps.db ?? prisma;
  const provider = deps.provider ?? getSanctionsProvider();
  const matches = await provider.screen(input.subject);
  const outcome = evaluateScreening(matches);

  const rescreenDueAt = new Date(Date.now() + RESCREEN_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const subjectDob = toIsoDate(input.subject.dateOfBirth);

  const record = await db.screeningResult.create({
    data: {
      investorId: input.investorId ?? null,
      counterpartyId: input.counterpartyId ?? null,
      beneficialOwnerId: input.beneficialOwnerId ?? null,
      subjectName: input.subject.name,
      subjectDob: subjectDob ? new Date(subjectDob) : null,
      subjectCountry: input.subject.country ?? null,
      wallet: input.wallet?.trim().toLowerCase() ?? null,
      provider: provider.name,
      listType: outcome.listType,
      matchScore: outcome.matchScore,
      isPep: outcome.isPep,
      status: outcome.status,
      matchedEntries: outcome.matches as unknown as Prisma.InputJsonValue,
      rescreenDueAt
    }
  });

  return { outcome, record: { id: record.id } };
}

/**
 * Ongoing-monitoring entry point. Returns subjects whose `rescreenDueAt` has
 * elapsed so a scheduler can re-run `screenAndRecord`. Network/DB-light: the
 * caller owns batching + the actual re-screen loop.
 */
export async function findScreeningsDueForRescreen(
  asOf: Date = new Date(),
  db: Pick<PrismaClient, 'screeningResult'> = prisma
): Promise<Array<{ id: string; investorId: string | null; subjectName: string }>> {
  const rows = await db.screeningResult.findMany({
    where: { rescreenDueAt: { lte: asOf } },
    orderBy: { rescreenDueAt: 'asc' },
    select: { id: true, investorId: true, subjectName: true }
  });
  return rows;
}
