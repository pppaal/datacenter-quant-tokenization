/**
 * Bundles tokenization ABIs from the Hardhat `artifacts/` tree into the
 * web app at `apps/web/lib/blockchain/tokenization-abi.json`. Run this
 * after compiling contracts so the Next.js layer stays in sync.
 *
 *   npm --workspace @dcqt/contracts run compile
 *   npm --workspace @dcqt/contracts run export:tokenization-abi
 */
import fs from "node:fs";
import path from "node:path";

type ArtifactShape = { abi: unknown[] };

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
    const outPath = path.resolve(
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
            throw new Error(
                `Artifact missing: ${file}\n` +
                    `  Run 'npm --workspace @dcqt/contracts run compile' first.`,
            );
        }
        const raw = fs.readFileSync(file, "utf-8");
        const artifact = JSON.parse(raw) as ArtifactShape;
        if (!Array.isArray(artifact.abi)) {
            throw new Error(`Artifact ${file} has no 'abi' array`);
        }
        bundle[key] = artifact.abi;
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2) + "\n", "utf-8");

    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`Wrote ${Object.keys(bundle).length} ABIs to ${outPath} (${sizeKb} KB)`);
}

main();
