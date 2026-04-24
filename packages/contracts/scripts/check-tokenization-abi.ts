/**
 * CI guard: re-exports the tokenization ABI bundle into a temp file and
 * compares byte-for-byte against the committed
 * `apps/web/lib/blockchain/tokenization-abi.json`. Exits non-zero on drift.
 *
 * Usage:
 *   npm --workspace @dcqt/contracts run compile
 *   npm --workspace @dcqt/contracts run check:tokenization-abi
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONTRACTS = {
    assetToken: "src/tokenization/token/AssetToken.sol/AssetToken.json",
    identityRegistry: "src/tokenization/identity/IdentityRegistry.sol/IdentityRegistry.json",
    modularCompliance: "src/tokenization/compliance/ModularCompliance.sol/ModularCompliance.json",
    maxHolders:
        "src/tokenization/compliance/modules/MaxHoldersModule.sol/MaxHoldersModule.json",
    countryRestrict:
        "src/tokenization/compliance/modules/CountryRestrictModule.sol/CountryRestrictModule.json",
    lockup: "src/tokenization/compliance/modules/LockupModule.sol/LockupModule.json",
    navOracle: "src/tokenization/oracle/NavOracle.sol/NavOracle.json",
    dividendDistributor:
        "src/tokenization/distribution/DividendDistributor.sol/DividendDistributor.json",
    transferAgent: "src/tokenization/trading/TransferAgent.sol/TransferAgent.json",
} as const;

function main() {
    const contractsDir = path.resolve(__dirname, "..");
    const artifactsDir = path.join(contractsDir, "artifacts");
    const committedPath = path.resolve(
        contractsDir,
        "..",
        "..",
        "apps",
        "web",
        "lib",
        "blockchain",
        "tokenization-abi.json",
    );

    const bundle: Record<string, unknown[]> = {};
    for (const [key, relPath] of Object.entries(CONTRACTS)) {
        const file = path.join(artifactsDir, relPath);
        if (!fs.existsSync(file)) {
            console.error(`Artifact missing: ${file}`);
            console.error(`Run 'npm --workspace @dcqt/contracts run compile' first.`);
            process.exit(2);
        }
        const artifact = JSON.parse(fs.readFileSync(file, "utf-8")) as { abi: unknown[] };
        bundle[key] = artifact.abi;
    }
    const fresh = JSON.stringify(bundle, null, 2) + "\n";

    if (!fs.existsSync(committedPath)) {
        console.error(`Committed ABI bundle missing at ${committedPath}`);
        process.exit(2);
    }
    const committed = fs.readFileSync(committedPath, "utf-8");

    if (fresh === committed) {
        console.log(`OK: tokenization-abi.json matches ${Object.keys(CONTRACTS).length} artifacts.`);
        return;
    }

    const driftPath = path.join(os.tmpdir(), "tokenization-abi.fresh.json");
    fs.writeFileSync(driftPath, fresh, "utf-8");
    console.error(
        `DRIFT: committed ${committedPath} does not match the ABIs built from source.`,
    );
    console.error(`Re-run 'npm run contracts:export-abi' and commit the result.`);
    console.error(`Fresh bundle written for diff to: ${driftPath}`);
    process.exit(1);
}

main();
