/**
 * Generate a Safe Transaction Builder batch JSON for common admin operations
 * on the registry and the EmergencyCouncil (role grants/revokes, pause toggles,
 * member management, threshold tuning, and the registry↔council PAUSER handoff).
 *
 * The output file can be imported directly into the Safe Transaction Builder
 * app (Safe{Wallet} -> Apps -> Transaction Builder -> Import) without needing
 * to run the Safe SDK locally. This keeps the deployment workflow simple for
 * institutional signers who manage their own key material.
 *
 * Usage examples:
 *   # Grant operational roles on the registry
 *   npx tsx scripts/prepare-safe-batch.ts --registry 0x... --chainId 11155111 \
 *     --grant REGISTRAR_ROLE=0xop1,AUDITOR_ROLE=0xop2 --out grants.json
 *
 *   # Handoff PAUSER_ROLE from bootstrap EOA to a newly-deployed council
 *   npx tsx scripts/prepare-safe-batch.ts --registry 0xReg --council 0xCouncil \
 *     --bootstrap-pauser 0xEOA --handoff --chainId 11155111 --out handoff.json
 *
 *   # Add / remove council members and retune threshold
 *   npx tsx scripts/prepare-safe-batch.ts --council 0xCouncil \
 *     --council-grant 0xM1,0xM2 --council-threshold 3 --out council-ops.json
 *
 *   # Handoff REGISTRAR_ROLE from bootstrap EOA to a NamespacedRegistrar adapter
 *   npx tsx scripts/prepare-safe-batch.ts --registry 0xReg \
 *     --namespaced-registrar 0xAdapter --bootstrap-registrar 0xEOA \
 *     --registrar-handoff --chainId 11155111 --out registrar-handoff.json
 *
 *   # Grant per-(namespace, operator) permissions on a NamespacedRegistrar
 *   npx tsx scripts/prepare-safe-batch.ts --namespaced-registrar 0xAdapter \
 *     --namespace-grant seoul=0xOp1,tokyo=0xOp2 --out ns-grants.json
 */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

type GrantSpec = { role: string; account: string };

type SafeTx = {
    to: string;
    value: string;
    data: string;
    contractMethod: null;
    contractInputsValues: null;
};

type SafeBatch = {
    version: string;
    chainId: string;
    createdAt: number;
    meta: {
        name: string;
        description: string;
        txBuilderVersion: string;
        createdFromSafeAddress: string;
        createdFromOwnerAddress: string;
    };
    transactions: SafeTx[];
};

const ROLE_NAMES = ["REGISTRAR_ROLE", "AUDITOR_ROLE", "PAUSER_ROLE"] as const;
const COUNCIL_MEMBER_ROLE_NAME = "COUNCIL_MEMBER_ROLE";

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

function parseGrants(spec: string | undefined): GrantSpec[] {
    if (!spec) return [];
    return spec.split(",").map((entry) => {
        const [role, account] = entry.split("=").map((s) => s.trim());
        if (!role || !account) throw new Error(`Invalid grant spec "${entry}", expected ROLE=0xaddress`);
        if (!ROLE_NAMES.includes(role as (typeof ROLE_NAMES)[number])) {
            throw new Error(`Unknown role "${role}". Expected one of: ${ROLE_NAMES.join(", ")}`);
        }
        if (!ethers.isAddress(account)) throw new Error(`Invalid address for ${role}: ${account}`);
        return { role, account };
    });
}

function roleId(name: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(name));
}

function parseAddressList(spec: string | undefined, label: string): string[] {
    if (!spec) return [];
    return spec.split(",").map((raw) => {
        const addr = raw.trim();
        if (!ethers.isAddress(addr)) throw new Error(`Invalid address in ${label}: "${addr}"`);
        return addr;
    });
}

/**
 * Parse a comma-separated "namespace=0xOp" list into (bytes8, address) pairs.
 * Namespace strings are UTF-8 encoded and truncated/left-padded to 8 bytes
 * exactly the way the adapter expects (matching the web app's helper).
 */
function parseNamespaceGrants(spec: string | undefined): { namespace: string; operator: string }[] {
    if (!spec) return [];
    return spec.split(",").map((entry) => {
        const [nsRaw, operator] = entry.split("=").map((s) => s.trim());
        if (!nsRaw || !operator) {
            throw new Error(`Invalid namespace-grant spec "${entry}", expected NAMESPACE=0xaddress`);
        }
        if (!ethers.isAddress(operator)) throw new Error(`Invalid operator address: ${operator}`);
        const bytes = ethers.toUtf8Bytes(nsRaw);
        if (bytes.length === 0 || bytes.length > 8) {
            throw new Error(`Namespace "${nsRaw}" must be 1..8 UTF-8 bytes (got ${bytes.length})`);
        }
        const padded = new Uint8Array(8);
        padded.set(bytes, 0);
        const namespace = ethers.hexlify(padded);
        if (namespace === "0x0000000000000000") {
            throw new Error(`Namespace must be non-zero: "${nsRaw}"`);
        }
        return { namespace, operator };
    });
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const registry = args.registry;
    const council = args.council;
    const chainId = args.chainId ?? "1";
    const grantSpec = args.grant;
    const revokeSpec = args.revoke;
    const pauseAction = args.pause;
    const handoff = args.handoff === "true";
    const bootstrapPauser = args["bootstrap-pauser"];
    const councilGrantSpec = args["council-grant"];
    const councilRevokeSpec = args["council-revoke"];
    const councilThreshold = args["council-threshold"];
    const namespacedRegistrar = args["namespaced-registrar"];
    const registrarHandoff = args["registrar-handoff"] === "true";
    const bootstrapRegistrar = args["bootstrap-registrar"];
    const namespaceGrantSpec = args["namespace-grant"];
    const namespaceRevokeSpec = args["namespace-revoke"];
    const nsAdminGrantSpec = args["ns-admin-grant"];
    const out = args.out ?? "safe-batch.json";
    const safeAddress = args.safe ?? "";

    const needsRegistry = Boolean(grantSpec || revokeSpec || pauseAction || handoff || registrarHandoff);
    const needsCouncil =
        Boolean(councilGrantSpec || councilRevokeSpec || councilThreshold || handoff);
    const needsAdapter = Boolean(
        namespaceGrantSpec || namespaceRevokeSpec || nsAdminGrantSpec || registrarHandoff,
    );

    if (needsRegistry && (!registry || !ethers.isAddress(registry))) {
        console.error("Missing or invalid --registry 0x... argument");
        process.exit(1);
    }
    if (needsCouncil && (!council || !ethers.isAddress(council))) {
        console.error("Missing or invalid --council 0x... argument");
        process.exit(1);
    }
    if (needsAdapter && (!namespacedRegistrar || !ethers.isAddress(namespacedRegistrar))) {
        console.error("Missing or invalid --namespaced-registrar 0x... argument");
        process.exit(1);
    }
    if (handoff && (!bootstrapPauser || !ethers.isAddress(bootstrapPauser))) {
        console.error("--handoff requires --bootstrap-pauser 0x... (EOA to revoke)");
        process.exit(1);
    }
    if (registrarHandoff && (!bootstrapRegistrar || !ethers.isAddress(bootstrapRegistrar))) {
        console.error(
            "--registrar-handoff requires --bootstrap-registrar 0x... (EOA to revoke)",
        );
        process.exit(1);
    }

    const iface = new ethers.Interface([
        "function grantRole(bytes32 role, address account)",
        "function revokeRole(bytes32 role, address account)",
        "function pause()",
        "function unpause()",
        "function setUnpauseThreshold(uint32 newThreshold)",
        "function grantNamespaceOperator(bytes8 namespace, address operator)",
        "function revokeNamespaceOperator(bytes8 namespace, address operator)",
    ]);

    const grants = parseGrants(grantSpec);
    const revokes = parseGrants(revokeSpec);
    const councilGrants = parseAddressList(councilGrantSpec, "--council-grant");
    const councilRevokes = parseAddressList(councilRevokeSpec, "--council-revoke");
    const memberRoleId = roleId(COUNCIL_MEMBER_ROLE_NAME);
    const txs: SafeTx[] = [];

    for (const { role, account } of grants) {
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("grantRole", [roleId(role), account]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }
    for (const { role, account } of revokes) {
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("revokeRole", [roleId(role), account]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }
    if (pauseAction === "pause") {
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("pause", []),
            contractMethod: null,
            contractInputsValues: null,
        });
    } else if (pauseAction === "unpause") {
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("unpause", []),
            contractMethod: null,
            contractInputsValues: null,
        });
    }

    // Council member management.
    for (const member of councilGrants) {
        txs.push({
            to: council as string,
            value: "0",
            data: iface.encodeFunctionData("grantRole", [memberRoleId, member]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }
    for (const member of councilRevokes) {
        txs.push({
            to: council as string,
            value: "0",
            data: iface.encodeFunctionData("revokeRole", [memberRoleId, member]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }
    if (councilThreshold) {
        const n = Number(councilThreshold);
        if (!Number.isInteger(n) || n <= 0) {
            throw new Error(`--council-threshold must be a positive integer, got "${councilThreshold}"`);
        }
        txs.push({
            to: council as string,
            value: "0",
            data: iface.encodeFunctionData("setUnpauseThreshold", [n]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }

    // Registry↔council PAUSER_ROLE handoff: grant to council first, then
    // revoke from the bootstrap EOA. Atomic within the Safe batch, so there is
    // no intermediate state where PAUSER_ROLE is held by two entities longer
    // than the single batch execution.
    if (handoff) {
        const pauserRoleId = roleId("PAUSER_ROLE");
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("grantRole", [pauserRoleId, council as string]),
            contractMethod: null,
            contractInputsValues: null,
        });
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("revokeRole", [pauserRoleId, bootstrapPauser as string]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }

    // Registry↔NamespacedRegistrar REGISTRAR_ROLE handoff. Same atomic
    // grant-then-revoke pattern as the council PAUSER handoff.
    if (registrarHandoff) {
        const registrarRoleId = roleId("REGISTRAR_ROLE");
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("grantRole", [registrarRoleId, namespacedRegistrar as string]),
            contractMethod: null,
            contractInputsValues: null,
        });
        txs.push({
            to: registry as string,
            value: "0",
            data: iface.encodeFunctionData("revokeRole", [
                registrarRoleId,
                bootstrapRegistrar as string,
            ]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }

    // Adapter-side: grant NAMESPACE_ADMIN_ROLE to an ops lead.
    const nsAdminGrants = parseAddressList(nsAdminGrantSpec, "--ns-admin-grant");
    const nsAdminRoleId = roleId("NAMESPACE_ADMIN_ROLE");
    for (const account of nsAdminGrants) {
        txs.push({
            to: namespacedRegistrar as string,
            value: "0",
            data: iface.encodeFunctionData("grantRole", [nsAdminRoleId, account]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }

    // Adapter-side: per-(namespace, operator) grants/revokes. These are
    // normally signed by the ops lead holding NAMESPACE_ADMIN_ROLE, but the
    // admin Safe can do the same under DEFAULT_ADMIN_ROLE if needed.
    for (const { namespace, operator } of parseNamespaceGrants(namespaceGrantSpec)) {
        txs.push({
            to: namespacedRegistrar as string,
            value: "0",
            data: iface.encodeFunctionData("grantNamespaceOperator", [namespace, operator]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }
    for (const { namespace, operator } of parseNamespaceGrants(namespaceRevokeSpec)) {
        txs.push({
            to: namespacedRegistrar as string,
            value: "0",
            data: iface.encodeFunctionData("revokeNamespaceOperator", [namespace, operator]),
            contractMethod: null,
            contractInputsValues: null,
        });
    }

    if (txs.length === 0) {
        console.error(
            "No actions specified. Pass one of: --grant, --revoke, --pause, " +
                "--council-grant, --council-revoke, --council-threshold, --handoff, " +
                "--registrar-handoff, --namespace-grant, --namespace-revoke, --ns-admin-grant.",
        );
        process.exit(1);
    }

    const batch: SafeBatch = {
        version: "1.0",
        chainId,
        createdAt: Date.now(),
        meta: {
            name: registrarHandoff
                ? "Registry REGISTRAR handoff to NamespacedRegistrar"
                : handoff
                    ? "Registry PAUSER handoff to EmergencyCouncil"
                    : "DataCenterAssetRegistry admin batch",
            description: [registry, council, namespacedRegistrar]
                .filter((v): v is string => Boolean(v))
                .join(" + "),
            txBuilderVersion: "1.16.3",
            createdFromSafeAddress: safeAddress,
            createdFromOwnerAddress: "",
        },
        transactions: txs,
    };

    const outPath = path.resolve(out);
    fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
    console.log(`Wrote Safe batch (${txs.length} tx) -> ${outPath}`);
    console.log("Import via Safe Wallet -> Apps -> Transaction Builder -> Import.");
}

main();
