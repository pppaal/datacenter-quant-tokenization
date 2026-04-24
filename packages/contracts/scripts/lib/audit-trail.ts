/**
 * Event-based forensic audit trail for the registry + council.
 *
 * Given a block range and the two contract addresses, this library:
 *   1. Pulls every emitted log via `eth_getLogs` (a single RPC round-trip per
 *      contract, no per-event filters).
 *   2. Decodes each log against the compiled ABI — events we don't care about
 *      (OZ internal role-admin plumbing) are captured verbatim but not
 *      interpreted.
 *   3. Produces a canonical, chronologically-ordered entry list. "Canonical"
 *      means: sorted by (blockNumber, logIndex), bigints serialized as base-10
 *      strings, hashes lowercased, timestamps ISO-8601 when available.
 *   4. Reconstructs per-asset state (status history, currently-anchored vs
 *      revoked documents) from the event stream alone. An auditor can compare
 *      this against `registry.getAsset()` / `isDocumentAnchored()` to detect
 *      state-log divergence — the signature of a contract-level bug or a
 *      storage write via a forgotten escape hatch.
 *   5. Runs a small suite of anomaly rules that surface suspicious patterns
 *      the contract itself can't prevent (e.g. threshold-lowered-while-paused,
 *      pause left open at the end of the audit window).
 *
 * Pure library, no CLI/process concerns.
 */
import { ethers } from "ethers";

export type Severity = "info" | "warn" | "fail";

export interface AuditEntry {
    blockNumber: number;
    blockTimestamp?: number;
    txHash: string;
    logIndex: number;
    source: "registry" | "council";
    type: string;
    /** Decoded event args, normalized to JSON-safe types (bigint → string). */
    args: Record<string, unknown>;
}

export type AssetStatus = "Unregistered" | "Active" | "Suspended" | "Retired";

export interface AssetReconstruction {
    assetId: string;
    status: AssetStatus;
    metadataRef: string;
    statusHistory: { status: AssetStatus; at: number }[];
    anchoredDocs: Set<string>;
    revokedDocs: Set<string>;
}

export interface Anomaly {
    severity: Severity;
    rule: string;
    detail: string;
    entry?: AuditEntry;
}

export interface AuditReport {
    fromBlock: number;
    toBlock: number;
    registryAddress: string;
    councilAddress?: string;
    entries: AuditEntry[];
    assets: Record<string, AssetReconstruction>;
    anomalies: Anomaly[];
    endState: {
        paused: boolean;
        unpauseThreshold: number | null;
        memberSet: string[];
    };
}

export interface AuditInputs {
    provider: ethers.Provider;
    registryAddress: string;
    registryAbi: ReadonlyArray<unknown>;
    councilAddress?: string;
    councilAbi?: ReadonlyArray<unknown>;
    fromBlock: number;
    toBlock?: number | "latest";
    /** Populate blockTimestamp on every entry (costs one `eth_getBlockByNumber` per unique block). */
    includeTimestamps?: boolean;
}

const STATUS_NAMES: AssetStatus[] = ["Unregistered", "Active", "Suspended", "Retired"];

function normalizeArg(value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map(normalizeArg);
    if (value && typeof value === "object" && "toString" in value) {
        // ethers Result sometimes exposes indexed + named access; prefer named.
        const asRecord = value as Record<string, unknown>;
        const keys = Object.keys(asRecord).filter((k) => isNaN(Number(k)));
        if (keys.length > 0) {
            const out: Record<string, unknown> = {};
            for (const k of keys) out[k] = normalizeArg(asRecord[k]);
            return out;
        }
    }
    return value;
}

async function fetchEntries(
    provider: ethers.Provider,
    address: string,
    iface: ethers.Interface,
    source: "registry" | "council",
    fromBlock: number,
    toBlock: number | "latest",
): Promise<AuditEntry[]> {
    const logs = await provider.getLogs({ address, fromBlock, toBlock });
    const out: AuditEntry[] = [];
    for (const log of logs) {
        let parsed: ethers.LogDescription | null = null;
        try {
            parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        } catch {
            // Unknown topic (e.g. a proxy upgrade event on a future revision).
            // Captured verbatim under type "Unknown" so it still shows up in reports.
        }
        const args: Record<string, unknown> = {};
        if (parsed) {
            for (const input of parsed.fragment.inputs) {
                args[input.name] = normalizeArg(parsed.args[input.name]);
            }
        }
        out.push({
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            logIndex: log.index,
            source,
            type: parsed?.name ?? "Unknown",
            args,
        });
    }
    return out;
}

async function attachTimestamps(provider: ethers.Provider, entries: AuditEntry[]): Promise<void> {
    const cache = new Map<number, number>();
    for (const entry of entries) {
        let ts = cache.get(entry.blockNumber);
        if (ts === undefined) {
            const block = await provider.getBlock(entry.blockNumber);
            ts = block ? Number(block.timestamp) : 0;
            cache.set(entry.blockNumber, ts);
        }
        entry.blockTimestamp = ts;
    }
}

function blankAsset(assetId: string): AssetReconstruction {
    return {
        assetId,
        status: "Unregistered",
        metadataRef: "",
        statusHistory: [],
        anchoredDocs: new Set(),
        revokedDocs: new Set(),
    };
}

function reconstruct(entries: AuditEntry[]): {
    assets: Record<string, AssetReconstruction>;
    endState: AuditReport["endState"];
    anomalies: Anomaly[];
} {
    const assets: Record<string, AssetReconstruction> = {};
    const anomalies: Anomaly[] = [];
    let paused = false;
    let pausedSince: number | null = null;
    let unpauseThreshold: number | null = null;
    const memberSet = new Set<string>();
    const memberRole = ethers.id("COUNCIL_MEMBER_ROLE");

    for (const entry of entries) {
        const { source, type, args } = entry;

        if (source === "registry") {
            const assetId = (args.assetId as string | undefined)?.toLowerCase();
            const asset = assetId ? (assets[assetId] ??= blankAsset(assetId)) : undefined;

            switch (type) {
                case "AssetRegistered":
                    if (asset) {
                        asset.status = "Active";
                        asset.metadataRef = (args.metadataRef as string) ?? "";
                        asset.statusHistory.push({ status: "Active", at: entry.blockNumber });
                    }
                    break;
                case "AssetMetadataUpdated":
                    if (asset) asset.metadataRef = (args.newMetadataRef as string) ?? asset.metadataRef;
                    break;
                case "AssetStatusChanged":
                    if (asset) {
                        const newStatus = STATUS_NAMES[Number(args.newStatus ?? 0)];
                        asset.status = newStatus ?? asset.status;
                        asset.statusHistory.push({ status: asset.status, at: entry.blockNumber });
                    }
                    break;
                case "DocumentAnchored": {
                    const h = ((args.documentHash as string) ?? "").toLowerCase();
                    if (asset && h) {
                        // Re-anchor after revoke is legitimate per contract — move it back.
                        asset.revokedDocs.delete(h);
                        asset.anchoredDocs.add(h);
                    }
                    break;
                }
                case "DocumentRevoked": {
                    const h = ((args.documentHash as string) ?? "").toLowerCase();
                    if (asset && h) {
                        if (!asset.anchoredDocs.has(h)) {
                            anomalies.push({
                                severity: "fail",
                                rule: "OrphanDocumentRevoke",
                                detail: `DocumentRevoked for (asset=${asset.assetId}, hash=${h}) with no prior DocumentAnchored in the window`,
                                entry,
                            });
                        }
                        asset.anchoredDocs.delete(h);
                        asset.revokedDocs.add(h);
                    }
                    break;
                }
                case "Paused":
                    paused = true;
                    pausedSince = entry.blockNumber;
                    break;
                case "Unpaused":
                    paused = false;
                    pausedSince = null;
                    break;
            }
        } else {
            switch (type) {
                case "UnpauseThresholdChanged": {
                    const prev = Number(args.previousThreshold ?? 0);
                    const next = Number(args.newThreshold ?? 0);
                    unpauseThreshold = next;
                    // Lowering the bar while the system is paused is suspicious:
                    // someone's trying to make unpause easier during an incident.
                    if (paused && next < prev) {
                        anomalies.push({
                            severity: "warn",
                            rule: "ThresholdLoweredWhilePaused",
                            detail: `UnpauseThresholdChanged ${prev}→${next} while registry paused since block ${pausedSince}`,
                            entry,
                        });
                    }
                    break;
                }
                case "RoleGranted": {
                    const role = (args.role as string)?.toLowerCase();
                    const account = (args.account as string)?.toLowerCase();
                    if (role === memberRole.toLowerCase() && account) memberSet.add(account);
                    break;
                }
                case "RoleRevoked": {
                    const role = (args.role as string)?.toLowerCase();
                    const account = (args.account as string)?.toLowerCase();
                    if (role === memberRole.toLowerCase() && account) memberSet.delete(account);
                    break;
                }
            }
        }
    }

    if (paused) {
        anomalies.push({
            severity: "warn",
            rule: "PausedAtEndOfWindow",
            detail: `Registry is paused at end of audit window (since block ${pausedSince})`,
        });
    }

    return {
        assets,
        anomalies,
        endState: { paused, unpauseThreshold, memberSet: [...memberSet] },
    };
}

export async function buildAuditTrail(inputs: AuditInputs): Promise<AuditReport> {
    const {
        provider,
        registryAddress,
        registryAbi,
        councilAddress,
        councilAbi,
        fromBlock,
        toBlock = "latest",
        includeTimestamps = false,
    } = inputs;

    const registryIface = new ethers.Interface(registryAbi as ethers.InterfaceAbi);
    const entries: AuditEntry[] = await fetchEntries(
        provider,
        registryAddress,
        registryIface,
        "registry",
        fromBlock,
        toBlock,
    );

    if (councilAddress && councilAbi) {
        const councilIface = new ethers.Interface(councilAbi as ethers.InterfaceAbi);
        const councilEntries = await fetchEntries(
            provider,
            councilAddress,
            councilIface,
            "council",
            fromBlock,
            toBlock,
        );
        entries.push(...councilEntries);
    }

    entries.sort((a, b) =>
        a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.logIndex - b.logIndex,
    );

    if (includeTimestamps) {
        await attachTimestamps(provider, entries);
    }

    const resolvedToBlock =
        toBlock === "latest" ? await provider.getBlockNumber() : toBlock;
    const { assets, anomalies, endState } = reconstruct(entries);

    return {
        fromBlock,
        toBlock: resolvedToBlock,
        registryAddress,
        councilAddress,
        entries,
        assets,
        anomalies,
        endState,
    };
}

export function formatAuditReport(report: AuditReport): string {
    const lines: string[] = [];
    lines.push(
        `Audit window: blocks ${report.fromBlock}..${report.toBlock} — ${report.entries.length} events`,
    );
    lines.push(
        `End state: paused=${report.endState.paused} threshold=${report.endState.unpauseThreshold ?? "unknown"} members=${report.endState.memberSet.length}`,
    );
    lines.push("");
    lines.push(`Assets observed: ${Object.keys(report.assets).length}`);
    for (const asset of Object.values(report.assets)) {
        lines.push(
            `  ${asset.assetId} — ${asset.status} — anchored=${asset.anchoredDocs.size} revoked=${asset.revokedDocs.size}`,
        );
    }
    lines.push("");
    if (report.anomalies.length === 0) {
        lines.push("Anomalies: none");
    } else {
        lines.push(`Anomalies: ${report.anomalies.length}`);
        for (const a of report.anomalies) {
            const tag = a.severity === "fail" ? "[FAIL]" : a.severity === "warn" ? "[WARN]" : "[INFO]";
            lines.push(`  ${tag} ${a.rule} — ${a.detail}`);
        }
    }
    return lines.join("\n");
}

/** JSON-safe serialization — Set objects convert to sorted string arrays. */
export function serializeReport(report: AuditReport): unknown {
    return {
        ...report,
        assets: Object.fromEntries(
            Object.entries(report.assets).map(([k, v]) => [
                k,
                {
                    ...v,
                    anchoredDocs: [...v.anchoredDocs].sort(),
                    revokedDocs: [...v.revokedDocs].sort(),
                },
            ]),
        ),
    };
}
