import fs from "node:fs";
import path from "node:path";

/**
 * Post-deployment integrity verification.
 *
 * Answers "is the deployed system actually what we said we shipped" across
 * three layers:
 *   1. Bytecode — deployed runtime code matches the compiled artifact
 *      (metadata hash stripped, since build-path differences bubble into it).
 *   2. Role topology — DEFAULT_ADMIN_ROLE, REGISTRAR_ROLE, AUDITOR_ROLE, and
 *      PAUSER_ROLE memberships match the declared manifest exactly. No extras,
 *      no missing, no EOA admin after handoff.
 *   3. Council wiring — council.protectedContract == registry, threshold is
 *      as declared, every declared member holds MEMBER_ROLE, PAUSER_ROLE on
 *      the registry was successfully handed off (council has it, bootstrap EOA
 *      does not).
 *
 * Pure library, no CLI or process concerns. Consumers: the verify-deployment
 * script, CI, and the verification unit tests.
 */
import { ethers } from "ethers";

export type Status = "pass" | "fail" | "warn";

export interface CheckResult {
    name: string;
    status: Status;
    detail?: string;
}

export interface CouncilManifest {
    address: string;
    expectedAdmin: string;
    expectedMembers: string[];
    expectedThreshold: number;
    /** See RegistryManifest.fromBlock — used to enumerate MEMBER_ROLE holders. */
    fromBlock?: number;
    /** Bootstrap PAUSER EOA that must no longer hold PAUSER_ROLE on the registry after handoff. */
    bootstrapPauser?: string;
}

export interface NamespacedRegistrarManifest {
    address: string;
    expectedAdmin: string;
    /** Addresses expected to hold NAMESPACE_ADMIN_ROLE on the adapter. */
    expectedNamespaceAdmins: string[];
    /**
     * Bootstrap REGISTRAR EOA that must no longer hold REGISTRAR_ROLE on the
     * registry. Presence of this field asserts the adapter handoff occurred.
     */
    bootstrapRegistrar?: string;
    /** See RegistryManifest.fromBlock — used to enumerate NAMESPACE_ADMIN_ROLE holders. */
    fromBlock?: number;
    /**
     * Optional: explicitly attest that specific (namespace, operator) pairs
     * ARE or ARE NOT permitted. Each entry is checked via `canOperate` view.
     * Note: like AccessControl, namespace operators aren't enumerable on-chain,
     * so we can only assert declared presences/absences, not completeness.
     */
    expectedOperators?: { namespace: string; operator: string; allowed: boolean }[];
}

export interface RegistryManifest {
    address: string;
    expectedAdmin: string;
    /**
     * Block number from which to replay `RoleGranted` events to enumerate
     * current role holders. Defaults to 0. For production chains pass the
     * deploy block to keep the `eth_getLogs` window bounded.
     */
    fromBlock?: number;
    /** Exact expected REGISTRAR_ROLE holder set. If omitted, that check is skipped. */
    expectedRegistrars?: string[];
    expectedAuditors?: string[];
    /**
     * Exact expected PAUSER_ROLE holders. If a council is present and
     * `council.bootstrapPauser` is set, we ALSO assert the bootstrap EOA is absent.
     * After handoff this is typically `[council.address]`.
     */
    expectedPausers?: string[];
}

export interface DeploymentManifest {
    chainId: number;
    registry: RegistryManifest;
    council?: CouncilManifest;
    namespacedRegistrar?: NamespacedRegistrarManifest;
}

export interface ImmutableRef {
    length: number;
    start: number;
}

/**
 * Position of every `immutable` variable in the deployed runtime bytecode.
 * Keyed by AST id (stringified). Comes from Hardhat's build-info.
 * When present, the verifier zeroes these regions on BOTH sides before
 * comparing — immutables are baked in at construction time and therefore
 * legitimately differ from the compiled artifact.
 */
export type ImmutableReferences = Record<string, ImmutableRef[]>;

export interface ContractArtifact {
    deployedBytecode: string;
    immutableReferences?: ImmutableReferences;
}

export interface VerifyInputs {
    provider: ethers.Provider;
    manifest: DeploymentManifest;
    registryArtifact: ContractArtifact;
    councilArtifact?: ContractArtifact;
    namespacedRegistrarArtifact?: ContractArtifact;
}

const REGISTRAR_ROLE = ethers.id("REGISTRAR_ROLE");
const AUDITOR_ROLE = ethers.id("AUDITOR_ROLE");
const PAUSER_ROLE = ethers.id("PAUSER_ROLE");
const MEMBER_ROLE = ethers.id("COUNCIL_MEMBER_ROLE");
const NAMESPACE_ADMIN_ROLE = ethers.id("NAMESPACE_ADMIN_ROLE");
const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);

const ACCESS_CONTROL_ABI = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function defaultAdmin() view returns (address)",
];
const COUNCIL_VIEW_ABI = [
    "function protectedContract() view returns (address)",
    "function unpauseThreshold() view returns (uint32)",
    "function MEMBER_ROLE() view returns (bytes32)",
];
const NAMESPACED_REGISTRAR_VIEW_ABI = [
    "function registry() view returns (address)",
    "function canOperate(bytes8 namespace, address operator) view returns (bool)",
    "function assetNamespace(bytes32 assetId) view returns (bytes8)",
];

/**
 * Strip the Solidity metadata CBOR trailer from deployed bytecode so two
 * builds that only differ in metadata (different source paths, different
 * compilation machines) still compare equal. The trailer's byte length is
 * encoded in the last two bytes as big-endian uint16; we drop those + the
 * trailer itself.
 */
export function stripMetadata(bytecode: string): string {
    const hex = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
    if (hex.length < 4) return "0x" + hex;
    const lengthHex = hex.slice(-4);
    const metadataBytes = parseInt(lengthHex, 16);
    if (Number.isNaN(metadataBytes) || metadataBytes <= 0) return "0x" + hex;
    const totalHexChars = metadataBytes * 2 + 4;
    if (hex.length < totalHexChars) return "0x" + hex;
    return "0x" + hex.slice(0, hex.length - totalHexChars);
}

/**
 * Zero out every immutable-reference region in a hex-encoded bytecode string.
 * Positions and lengths are byte offsets into the raw (0x-prefixed) runtime code.
 */
export function maskImmutables(bytecode: string, refs: ImmutableReferences | undefined): string {
    if (!refs) return bytecode;
    const hex = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
    const bytes = Buffer.from(hex, "hex");
    for (const entries of Object.values(refs)) {
        for (const { start, length } of entries) {
            if (start + length > bytes.length) continue;
            bytes.fill(0, start, start + length);
        }
    }
    return "0x" + bytes.toString("hex");
}

function normalizeAddrSet(addresses: string[]): Set<string> {
    return new Set(addresses.map((a) => ethers.getAddress(a)));
}

async function checkBytecode(
    provider: ethers.Provider,
    address: string,
    artifact: ContractArtifact,
    label: string,
): Promise<CheckResult> {
    const deployed = await provider.getCode(address);
    if (!deployed || deployed === "0x") {
        return { name: `${label}: bytecode present`, status: "fail", detail: `no code at ${address}` };
    }
    const expected = stripMetadata(
        maskImmutables(artifact.deployedBytecode, artifact.immutableReferences),
    ).toLowerCase();
    const actual = stripMetadata(
        maskImmutables(deployed, artifact.immutableReferences),
    ).toLowerCase();
    if (expected === actual) {
        return { name: `${label}: bytecode matches artifact`, status: "pass" };
    }
    return {
        name: `${label}: bytecode matches artifact`,
        status: "fail",
        detail: `stripped deployed length=${actual.length - 2}, expected=${expected.length - 2}`,
    };
}

/**
 * Enumerate current holders of a role by replaying `RoleGranted` events and
 * filtering to addresses that still return `hasRole(role, addr) == true`.
 * This is the only reliable way to discover rogue holders — `hasRole` alone
 * can only confirm addresses we already know to ask about.
 */
async function getCurrentRoleHolders(
    provider: ethers.Provider,
    contractAddress: string,
    role: string,
    fromBlock: number,
): Promise<string[]> {
    const grantedTopic = ethers.id("RoleGranted(bytes32,address,address)");
    const logs = await provider.getLogs({
        address: contractAddress,
        topics: [grantedTopic, role],
        fromBlock,
        toBlock: "latest",
    });
    const everGranted = new Set<string>();
    for (const log of logs) {
        // RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)
        // account is topics[2]; topics are 32-byte left-padded.
        const account = ethers.getAddress("0x" + log.topics[2].slice(-40));
        everGranted.add(account);
    }
    const contract = new ethers.Contract(
        contractAddress,
        ["function hasRole(bytes32,address) view returns (bool)"],
        provider,
    );
    const current: string[] = [];
    for (const candidate of everGranted) {
        const holds: boolean = await contract.hasRole(role, candidate);
        if (holds) current.push(candidate);
    }
    return current;
}

async function checkExactRoleMembership(
    provider: ethers.Provider,
    contractAddress: string,
    role: string,
    expected: string[],
    fromBlock: number,
    roleLabel: string,
    contractLabel: string,
): Promise<CheckResult> {
    const actualHolders = await getCurrentRoleHolders(provider, contractAddress, role, fromBlock);
    const expectedSet = normalizeAddrSet(expected);
    const actualSet = new Set(actualHolders);
    const missing = [...expectedSet].filter((a) => !actualSet.has(a));
    const extra = [...actualSet].filter((a) => !expectedSet.has(a));
    if (missing.length === 0 && extra.length === 0) {
        return {
            name: `${contractLabel}: ${roleLabel} membership matches manifest`,
            status: "pass",
            detail: `holders=${actualHolders.join(",") || "(empty)"}`,
        };
    }
    return {
        name: `${contractLabel}: ${roleLabel} membership matches manifest`,
        status: "fail",
        detail: `missing=${missing.join(",") || "(none)"}; extra=${extra.join(",") || "(none)"}`,
    };
}

async function checkAdminRole(
    contract: ethers.Contract,
    expectedAdmin: string,
    contractLabel: string,
): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const expected = ethers.getAddress(expectedAdmin);
    const holds: boolean = await contract.hasRole(DEFAULT_ADMIN_ROLE, expected);
    results.push({
        name: `${contractLabel}: expected admin holds DEFAULT_ADMIN_ROLE`,
        status: holds ? "pass" : "fail",
        detail: `admin=${expected}`,
    });

    // AccessControlDefaultAdminRules exposes defaultAdmin() — use it as a
    // second, independent check that no other address is the sole admin.
    try {
        const reported: string = await contract.defaultAdmin();
        const reportedNormalized = ethers.getAddress(reported);
        results.push({
            name: `${contractLabel}: defaultAdmin() == expected`,
            status: reportedNormalized === expected ? "pass" : "fail",
            detail: `reported=${reportedNormalized}`,
        });
    } catch {
        results.push({
            name: `${contractLabel}: defaultAdmin() == expected`,
            status: "warn",
            detail: "contract does not expose defaultAdmin() view",
        });
    }
    return results;
}

export async function verifyDeployment(inputs: VerifyInputs): Promise<CheckResult[]> {
    const { provider, manifest, registryArtifact, councilArtifact } = inputs;
    const results: CheckResult[] = [];

    // --- Registry --------------------------------------------------------
    results.push(await checkBytecode(provider, manifest.registry.address, registryArtifact, "registry"));

    const registry = new ethers.Contract(manifest.registry.address, ACCESS_CONTROL_ABI, provider);
    results.push(...(await checkAdminRole(registry, manifest.registry.expectedAdmin, "registry")));

    const council = manifest.council;
    const registryFromBlock = manifest.registry.fromBlock ?? 0;

    if (manifest.registry.expectedRegistrars) {
        results.push(
            await checkExactRoleMembership(
                provider,
                manifest.registry.address,
                REGISTRAR_ROLE,
                manifest.registry.expectedRegistrars,
                registryFromBlock,
                "REGISTRAR_ROLE",
                "registry",
            ),
        );
    }
    if (manifest.registry.expectedAuditors) {
        results.push(
            await checkExactRoleMembership(
                provider,
                manifest.registry.address,
                AUDITOR_ROLE,
                manifest.registry.expectedAuditors,
                registryFromBlock,
                "AUDITOR_ROLE",
                "registry",
            ),
        );
    }
    if (manifest.registry.expectedPausers) {
        results.push(
            await checkExactRoleMembership(
                provider,
                manifest.registry.address,
                PAUSER_ROLE,
                manifest.registry.expectedPausers,
                registryFromBlock,
                "PAUSER_ROLE",
                "registry",
            ),
        );
    }

    // --- Council (optional) ---------------------------------------------
    if (council && councilArtifact) {
        results.push(await checkBytecode(provider, council.address, councilArtifact, "council"));

        const councilContract = new ethers.Contract(
            council.address,
            [...ACCESS_CONTROL_ABI, ...COUNCIL_VIEW_ABI],
            provider,
        );
        results.push(...(await checkAdminRole(councilContract, council.expectedAdmin, "council")));

        try {
            const target: string = await councilContract.protectedContract();
            const targetNormalized = ethers.getAddress(target);
            const expected = ethers.getAddress(manifest.registry.address);
            results.push({
                name: `council: protectedContract == registry`,
                status: targetNormalized === expected ? "pass" : "fail",
                detail: `target=${targetNormalized}, registry=${expected}`,
            });
        } catch (err) {
            results.push({
                name: `council: protectedContract == registry`,
                status: "fail",
                detail: `call failed: ${(err as Error).message}`,
            });
        }

        try {
            const threshold: bigint = await councilContract.unpauseThreshold();
            results.push({
                name: `council: unpauseThreshold == ${council.expectedThreshold}`,
                status: threshold === BigInt(council.expectedThreshold) ? "pass" : "fail",
                detail: `reported=${threshold}`,
            });
        } catch (err) {
            results.push({
                name: `council: unpauseThreshold check`,
                status: "fail",
                detail: `call failed: ${(err as Error).message}`,
            });
        }

        results.push(
            await checkExactRoleMembership(
                provider,
                council.address,
                MEMBER_ROLE,
                council.expectedMembers,
                council.fromBlock ?? 0,
                "MEMBER_ROLE",
                "council",
            ),
        );

        // Handoff invariant: if a bootstrapPauser was declared, it MUST NOT
        // still hold PAUSER_ROLE on the registry. This is the key post-
        // deployment attestation that the admin Safe ran the handoff batch.
        if (council.bootstrapPauser) {
            const bootstrap = ethers.getAddress(council.bootstrapPauser);
            const stillHolds: boolean = await registry.hasRole(PAUSER_ROLE, bootstrap);
            results.push({
                name: "handoff: bootstrap PAUSER EOA revoked",
                status: stillHolds ? "fail" : "pass",
                detail: `bootstrap=${bootstrap}`,
            });
            const councilAddr = ethers.getAddress(council.address);
            const councilHolds: boolean = await registry.hasRole(PAUSER_ROLE, councilAddr);
            results.push({
                name: "handoff: council holds PAUSER_ROLE on registry",
                status: councilHolds ? "pass" : "fail",
                detail: `council=${councilAddr}`,
            });
        }
    }

    // --- NamespacedRegistrar (optional) ---------------------------------
    const adapterManifest = manifest.namespacedRegistrar;
    if (adapterManifest && inputs.namespacedRegistrarArtifact) {
        results.push(
            await checkBytecode(
                provider,
                adapterManifest.address,
                inputs.namespacedRegistrarArtifact,
                "namespaced-registrar",
            ),
        );

        const adapter = new ethers.Contract(
            adapterManifest.address,
            [...ACCESS_CONTROL_ABI, ...NAMESPACED_REGISTRAR_VIEW_ABI],
            provider,
        );
        results.push(
            ...(await checkAdminRole(adapter, adapterManifest.expectedAdmin, "namespaced-registrar")),
        );

        try {
            const target: string = await adapter.registry();
            const targetNormalized = ethers.getAddress(target);
            const expected = ethers.getAddress(manifest.registry.address);
            results.push({
                name: `namespaced-registrar: registry() == registry`,
                status: targetNormalized === expected ? "pass" : "fail",
                detail: `target=${targetNormalized}, registry=${expected}`,
            });
        } catch (err) {
            results.push({
                name: `namespaced-registrar: registry() == registry`,
                status: "fail",
                detail: `call failed: ${(err as Error).message}`,
            });
        }

        results.push(
            await checkExactRoleMembership(
                provider,
                adapterManifest.address,
                NAMESPACE_ADMIN_ROLE,
                adapterManifest.expectedNamespaceAdmins,
                adapterManifest.fromBlock ?? 0,
                "NAMESPACE_ADMIN_ROLE",
                "namespaced-registrar",
            ),
        );

        // Handoff invariant: adapter holds REGISTRAR_ROLE on the registry; the
        // bootstrap EOA (if declared) must NOT. These two lines are the
        // post-deployment attestation that the REGISTRAR handoff was executed.
        const adapterAddr = ethers.getAddress(adapterManifest.address);
        const adapterHolds: boolean = await registry.hasRole(REGISTRAR_ROLE, adapterAddr);
        results.push({
            name: "handoff: adapter holds REGISTRAR_ROLE on registry",
            status: adapterHolds ? "pass" : "fail",
            detail: `adapter=${adapterAddr}`,
        });
        if (adapterManifest.bootstrapRegistrar) {
            const bootstrap = ethers.getAddress(adapterManifest.bootstrapRegistrar);
            const stillHolds: boolean = await registry.hasRole(REGISTRAR_ROLE, bootstrap);
            results.push({
                name: "handoff: bootstrap REGISTRAR EOA revoked",
                status: stillHolds ? "fail" : "pass",
                detail: `bootstrap=${bootstrap}`,
            });
        }

        // Declared (namespace, operator) attestations — not exhaustive, but
        // catches drift between the manifest and on-chain grants.
        for (const { namespace, operator, allowed } of adapterManifest.expectedOperators ?? []) {
            try {
                const actual: boolean = await adapter.canOperate(namespace, operator);
                results.push({
                    name: `namespaced-registrar: canOperate(${namespace}, ${operator}) == ${allowed}`,
                    status: actual === allowed ? "pass" : "fail",
                    detail: `actual=${actual}`,
                });
            } catch (err) {
                results.push({
                    name: `namespaced-registrar: canOperate(${namespace}, ${operator})`,
                    status: "fail",
                    detail: `call failed: ${(err as Error).message}`,
                });
            }
        }
    }

    return results;
}

export function summarize(results: CheckResult[]): {
    passed: number;
    failed: number;
    warned: number;
    ok: boolean;
} {
    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    const warned = results.filter((r) => r.status === "warn").length;
    return { passed, failed, warned, ok: failed === 0 };
}

/**
 * Load a contract artifact WITH immutable references by scanning Hardhat's
 * build-info directory. Hardhat's per-contract JSON under artifacts/src/...
 * does not include immutableReferences — those live in the build-info blob.
 */
export function loadArtifactWithImmutables(
    buildInfoDir: string,
    sourceName: string,
    contractName: string,
): ContractArtifact {
    const files = fs.readdirSync(buildInfoDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
        const bi = JSON.parse(fs.readFileSync(path.join(buildInfoDir, file), "utf8")) as {
            output?: {
                contracts?: Record<
                    string,
                    Record<
                        string,
                        {
                            evm?: {
                                deployedBytecode?: {
                                    object?: string;
                                    immutableReferences?: ImmutableReferences;
                                };
                            };
                        }
                    >
                >;
            };
        };
        const contract = bi.output?.contracts?.[sourceName]?.[contractName];
        const object = contract?.evm?.deployedBytecode?.object;
        if (object) {
            return {
                deployedBytecode: "0x" + object,
                immutableReferences: contract?.evm?.deployedBytecode?.immutableReferences,
            };
        }
    }
    throw new Error(`Contract ${contractName} (${sourceName}) not found in build-info at ${buildInfoDir}`);
}

export function formatReport(results: CheckResult[]): string {
    const lines: string[] = [];
    for (const r of results) {
        const marker = r.status === "pass" ? "[PASS]" : r.status === "warn" ? "[WARN]" : "[FAIL]";
        const detail = r.detail ? ` — ${r.detail}` : "";
        lines.push(`${marker} ${r.name}${detail}`);
    }
    const { passed, failed, warned, ok } = summarize(results);
    lines.push("");
    lines.push(`Summary: ${passed} pass, ${failed} fail, ${warned} warn — overall ${ok ? "OK" : "FAIL"}`);
    return lines.join("\n");
}
