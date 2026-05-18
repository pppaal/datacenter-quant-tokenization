/**
 * Bundles tokenization ABIs and the registry ABI from the Hardhat
 * `artifacts/` tree into the web app under `apps/web/lib/blockchain/`. Run
 * this after compiling contracts so the Next.js layer stays in sync.
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

const REGISTRY_ARTIFACT =
    "src/registry/DataCenterAssetRegistry.sol/DataCenterAssetRegistry.json";

function readArtifact(artifactsDir: string, relPath: string): unknown[] {
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
    return artifact.abi;
}

function main() {
    const contractsDir = path.resolve(__dirname, "..");
    const artifactsDir = path.join(contractsDir, "artifacts");
    const blockchainDir = path.resolve(
        contractsDir,
        "..",
        "..",
        "apps",
        "web",
        "lib",
        "blockchain",
    );
    fs.mkdirSync(blockchainDir, { recursive: true });

    // Tokenization stack bundle.
    const tokenizationBundle: Record<string, unknown[]> = {};
    for (const [key, relPath] of Object.entries(CONTRACTS)) {
        tokenizationBundle[key] = readArtifact(artifactsDir, relPath);
    }
    const tokenizationOut = path.join(blockchainDir, "tokenization-abi.json");
    fs.writeFileSync(
        tokenizationOut,
        JSON.stringify(tokenizationBundle, null, 2) + "\n",
        "utf-8",
    );
    const tokenizationSizeKb = (fs.statSync(tokenizationOut).size / 1024).toFixed(1);
    console.log(
        `Wrote ${Object.keys(tokenizationBundle).length} tokenization ABIs to ${tokenizationOut} (${tokenizationSizeKb} KB)`,
    );

    // Registry ABI as a flat array (consumed via abi.json by the web app).
    const registryAbi = readArtifact(artifactsDir, REGISTRY_ARTIFACT);
    const registryOut = path.join(blockchainDir, "abi.json");
    fs.writeFileSync(
        registryOut,
        JSON.stringify(registryAbi, null, 2) + "\n",
        "utf-8",
    );
    const registrySizeKb = (fs.statSync(registryOut).size / 1024).toFixed(1);
    console.log(`Wrote registry ABI to ${registryOut} (${registrySizeKb} KB)`);
}

main();
