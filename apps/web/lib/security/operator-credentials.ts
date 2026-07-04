/**
 * DB-backed operator password credentials.
 *
 * Complements (does not replace) the env-configured basic-auth credential list:
 * the bootstrap ADMIN still comes from `ADMIN_BASIC_AUTH_*` env vars, but every
 * additional operator can be provisioned from /admin/security with a password
 * stored as a scrypt hash on the canonical `User` seat — no env edit or
 * redeploy. Login (`POST /api/admin/session`) tries the env credential list
 * first and falls back to the seat's `passwordHash`.
 *
 * Node-only (uses node:crypto scrypt); never import from Edge middleware.
 * PURE parameters-in/result-out so hash/verify are fully unit-testable.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16384; // N
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELIZATION = 1; // p
const HASH_PREFIX = 'scrypt';

export const OPERATOR_PASSWORD_MIN_LENGTH = 12;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Hash a password into a self-describing `scrypt$N$r$p$salt$hash` string. */
export async function hashOperatorPassword(password: string): Promise<string> {
  if (password.length < OPERATOR_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Operator passwords must be at least ${OPERATOR_PASSWORD_MIN_LENGTH} characters.`
    );
  }
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION
  });
  return [
    HASH_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    derived.toString('base64url')
  ].join('$');
}

/**
 * Verify a password against a stored hash. Returns false (never throws) on a
 * malformed/foreign hash so a corrupted row degrades to "invalid credentials".
 */
export async function verifyOperatorPassword(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!storedHash) return false;
  const segments = storedHash.split('$');
  if (segments.length !== 6 || segments[0] !== HASH_PREFIX) return false;

  const cost = Number(segments[1]);
  const blockSize = Number(segments[2]);
  const parallelization = Number(segments[3]);
  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost < 2 ||
    blockSize < 1 ||
    parallelization < 1
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(segments[4], 'base64url');
    expected = Buffer.from(segments[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Burn comparable CPU when the login identifier matches no seat, so response
 * timing does not reveal whether an operator email exists.
 */
export async function burnOperatorPasswordVerification(password: string): Promise<void> {
  const salt = Buffer.alloc(16);
  await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION
  }).catch(() => undefined);
}
