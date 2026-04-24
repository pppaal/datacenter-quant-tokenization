/**
 * CLI: post-deployment integrity verifier.
 *
 * Reads a JSON deployment manifest describing what SHOULD be true on-chain
 * (addresses, roles, threshold, bootstrap EOA to be revoked) and asserts that
 * reality matches. Intended to run:
 *   - immediately after a production deploy + Safe handoff batch execution,
 *   - as a scheduled CI job against the production chain (drift detection),
 *   - manually by any counterparty who wants to audit the live system.
 *
 * Usage:
 *   npx tsx scripts/verify-deployment.ts \
 *     --manifest deployment.json \
 *     --rpc https://sepolia.infura.io/v3/XXX
 *
 * Exit codes:
 *   0 — all checks passed (warnings allowed)
 *   1 — at least one check failed, or manifest could not be loaded
 */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

import {
    formatReport,
    loadArtifactWithImmutables,
    summarize,
    verifyDeployment,
    type DeploymentManifest,
} from "./lib/verification";

const BUILD_INFO_DIR = path.resolve(__dirname, "../artifacts/build-info");

function parseArgs(argv: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) continue;
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith("--")) {
            out[key] = "true";
        } else {
            out[key] = next;
            i++;
        }
    }
    return out;
}

function loadJson<T>(filePath: string, label: string): T {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`${label} not found at ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf8")) as T;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = args.manifest;
    const rpcUrl = args.rpc;
    const jsonOutPath = args["json-out"];

    if (!manifestPath) {
        console.error("Missing --manifest <path.json>");
        process.exit(1);
    }
    if (!rpcUrl) {
        console.error("Missing --rpc <url>");
        process.exit(1);
    }

    const manifest = loadJson<DeploymentManifest>(manifestPath, "manifest");
    const registryArtifact = loadArtifactWithImmutables(
        BUILD_INFO_DIR,
        "src/registry/DataCenterAssetRegistry.sol",
        "DataCenterAssetRegistry",
    );
    const councilArtifact = manifest.council
        ? loadArtifactWithImmutables(
              BUILD_INFO_DIR,
              "src/governance/EmergencyCouncil.sol",
              "EmergencyCouncil",
          )
        : undefined;
    const namespacedRegistrarArtifact = manifest.namespacedRegistrar
        ? loadArtifactWithImmutables(
              BUILD_INFO_DIR,
              "src/registry/NamespacedRegistrar.sol",
              "NamespacedRegistrar",
          )
        : undefined;

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    console.log(`Verifying deployment against chainId=${manifest.chainId} via ${rpcUrl}\n`);

    const results = await verifyDeployment({
        provider,
        manifest,
        registryArtifact,
        councilArtifact,
        namespacedRegistrarArtifact,
    });

    const report = formatReport(results);
    console.log(report);

    if (jsonOutPath) {
        fs.writeFileSync(
            path.resolve(jsonOutPath),
            JSON.stringify({ manifest, results, summary: summarize(results) }, null, 2),
        );
        console.log(`\nJSON report written to ${path.resolve(jsonOutPath)}`);
    }

    const { ok } = summarize(results);
    process.exit(ok ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
