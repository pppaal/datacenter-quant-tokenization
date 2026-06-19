/**
 * Resolve a numeric assumption value regardless of how the strategy nested it.
 *
 * The stabilized-income strategies (office/retail/industrial/hotel/mixed-use)
 * write operating inputs as FLAT top-level keys on `assumptions`. The
 * data-center strategy nests them under `assumptions.metrics.*`,
 * `assumptions.leasing.*`, and `assumptions.debt.*` (see
 * `data-center-sections.ts`). Display components historically read only the
 * flat keys, so every DC run showed N/A for cap rate, occupancy, NOI, etc.
 *
 * This resolver checks the flat key first, then the known nested groups, and
 * returns the first finite number — making readers work for both shapes.
 */
const NESTED_GROUPS = ['metrics', 'leasing', 'debt', 'comparables'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function resolveAssumptionNumber(
  assumptions: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const root = asRecord(assumptions);
  if (!root) return null;

  const flat = finite(root[key]);
  if (flat !== null) return flat;

  for (const group of NESTED_GROUPS) {
    const nested = finite(asRecord(root[group])?.[key]);
    if (nested !== null) return nested;
  }

  // stabilizedNoiKrw is also mirrored in the stored proforma summary.
  const summary = asRecord(asRecord(asRecord(root.proForma)?.baseCase)?.summary);
  return finite(summary?.[key]);
}
