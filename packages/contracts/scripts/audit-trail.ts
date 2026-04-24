/**
 * CLI: build a forensic event audit trail over a block range.
 *
 * Usage:
 *   npx tsx scripts/audit-trail.ts \
 *     --registry 0x... [--council 0x...] \
 *     --rpc https://... \
 *     --from-block 1234567 [--to-block latest] \
 *     [--json-out audit.json] [--timestamps]
 *
 * Exit codes:
 *   0 — audit completed (anomalies printed; presence alone does not fail the CLI)
 *   1 — missing args or RPC failure
 *   2 — at least one `fail`-severity anomaly
 */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

import registryArtifact from "../artifacts/src/registry/DataCenterAssetRegistry.sol/DataCenterAssetRegistry.json";
import councilArtifact from "../artifacts/src/governance/EmergencyCouncil.sol/EmergencyCouncil.json";

import { buildAuditTrail, formatAuditReport, serializeReport } from "./lib/audit-trail";

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

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const registryAddress = args.registry;
    const councilAddress = args.council;
    const rpcUrl = args.rpc;
    const fromBlock = Number(args["from-block"] ?? "0");
    const toBlockRaw = args["to-block"] ?? "latest";
    const jsonOutPath = args["json-out"];
    const includeTimestamps = args.timestamps === "true";

    if (!registryAddress || !ethers.isAddress(registryAddress)) {
        console.error("Missing or invalid --registry 0x...");
        process.exit(1);
    }
    if (!rpcUrl) {
        console.error("Missing --rpc <url>");
        process.exit(1);
    }
    if (!Number.isInteger(fromBlock) || fromBlock < 0) {
        console.error(`Invalid --from-block ${args["from-block"]}`);
        process.exit(1);
    }
    const toBlock = toBlockRaw === "latest" ? "latest" : Number(toBlockRaw);

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const report = await buildAuditTrail({
        provider,
        registryAddress,
        registryAbi: registryArtifact.abi,
        councilAddress: councilAddress && ethers.isAddress(councilAddress) ? councilAddress : undefined,
        councilAbi: councilAddress ? councilArtifact.abi : undefined,
        fromBlock,
        toBlock,
        includeTimestamps,
    });

    console.log(formatAuditReport(report));

    if (jsonOutPath) {
        fs.writeFileSync(path.resolve(jsonOutPath), JSON.stringify(serializeReport(report), null, 2));
        console.log(`\nJSON report written to ${path.resolve(jsonOutPath)}`);
    }

    const hasFail = report.anomalies.some((a) => a.severity === "fail");
    process.exit(hasFail ? 2 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
