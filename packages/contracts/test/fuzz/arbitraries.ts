/**
 * Shared fast-check arbitraries for fuzzing DataCenterAssetRegistry.
 *
 * Keeping them in one place means every property/invariant test draws from
 * the same distributions, which makes shrinking behavior and CI coverage
 * stats comparable across files.
 */
import fc from "fast-check";
import { ethers } from "hardhat";

export type Hex32 = `0x${string}`;

/** Uniform non-zero 32-byte hex (biased toward edge values). */
export const arbBytes32: fc.Arbitrary<Hex32> = fc
    .uint8Array({ minLength: 32, maxLength: 32 })
    .filter((bytes) => bytes.some((b) => b !== 0))
    .map((bytes) => ("0x" + Buffer.from(bytes).toString("hex")) as Hex32);

/** A metadata string the contract will accept (1..512 bytes UTF-8). */
export const arbValidMetadata: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 512 })
    .filter((s) => {
        const len = Buffer.byteLength(s, "utf8");
        return len >= 1 && len <= 512;
    });

/** A metadata string that exceeds MAX_METADATA_LENGTH (513..2048 bytes). */
export const arbOversizedMetadata: fc.Arbitrary<string> = fc
    .integer({ min: 513, max: 2048 })
    .map((n) => "a".repeat(n));

/** A revocation reason within the 256-byte limit. */
export const arbValidReason: fc.Arbitrary<string> = fc
    .string({ minLength: 0, maxLength: 256 })
    .filter((s) => Buffer.byteLength(s, "utf8") <= 256);

/** Asset status transition targets that the contract accepts. */
export const arbActiveOrSuspendedOrRetired: fc.Arbitrary<1 | 2 | 3> = fc.constantFrom(1, 2, 3) as fc.Arbitrary<
    1 | 2 | 3
>;

/** Produce a fast-check Random that is derived from the Hardhat signer set. */
export async function pickSigner<T>(arb: fc.Arbitrary<number>, bucket: T[]): Promise<T> {
    const i = fc.sample(arb, { numRuns: 1 })[0] % bucket.length;
    return bucket[i];
}

export function toHex32(value: string): Hex32 {
    return ethers.id(value) as Hex32;
}
