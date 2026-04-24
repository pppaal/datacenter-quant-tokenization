/**
 * Deterministic JSON serialization for on-chain document hashing.
 *
 * Two different processes must produce byte-identical output for the same
 * logical value, or the resulting hashes will not match. We therefore:
 *   - sort object keys
 *   - reject `undefined` and function values (force the caller to be explicit)
 *   - stringify bigint as a decimal string, prefixed so the payload round-trips
 *   - reject NaN / ±Infinity (not JSON-representable)
 *   - pass through strings / booleans / null / finite numbers as-is
 */
export function canonicalizeToJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) {
    throw new Error('canonicalizeToJson: undefined is not representable');
  }

  if (typeof value === 'bigint') {
    return { $bigint: value.toString(10) };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalizeToJson: non-finite number (${value})`);
    }
    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const v = input[key];
      if (v === undefined) continue;
      out[key] = normalize(v);
    }
    return out;
  }

  throw new Error(`canonicalizeToJson: unsupported value of type ${typeof value}`);
}
