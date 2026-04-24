/**
 * Stateful invariant campaign — registry + NamespacedRegistrar adapter.
 *
 * Extends the single-contract campaign (invariant.test.ts) to the full
 * post-handoff topology:
 *   - Registry REGISTRAR_ROLE held ONLY by the adapter
 *   - All mutating asset lifecycle calls routed through the adapter
 *   - Auditor writes still direct
 *   - Two fixed namespaces with one operator each
 *
 * This is the test that catches a whole class of "the individual contracts
 * look fine but their composition drifts" bugs: stale bindings, pause-only-
 * affecting-one-side, metadata divergence between adapter's expectation and
 * registry's actual state.
 *
 * Invariants checked after every command:
 *   I1  registry.getAsset(assetId).status matches mirror
 *   I2  registry.getAsset(assetId).metadataRef matches mirror
 *   I3  registry.getAsset(assetId).documentCount == count(anchored ∧ !revoked)
 *   I4  registry.isDocumentAnchored(assetId, docHash) matches mirror
 *   I5  adapter.assetNamespace(assetId) matches mirror (0x0 iff not bound)
 *   I6  while paused, no mutating command was executed (enforced by mirror guards)
 */
import { expect } from "chai";
import fc from "fast-check";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { DataCenterAssetRegistry, NamespacedRegistrar } from "../../typechain-types";

const ASSET_STATUS = { Unregistered: 0, Active: 1, Suspended: 2, Retired: 3 } as const;
type Status = (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS];

const NUM_RUNS = Number(process.env.FAST_CHECK_INVARIANT_RUNS ?? 8);
const COMMANDS_PER_RUN = Number(process.env.FAST_CHECK_INVARIANT_DEPTH ?? 25);
const ASSET_POOL_SIZE = 4;
const DOCUMENT_POOL_SIZE = 6;
const NS_BYTES8_ZERO = "0x0000000000000000";
const NS_POOL = [
    ethers.encodeBytes32String("seoul").slice(0, 18),
    ethers.encodeBytes32String("tokyo").slice(0, 18),
];

type DocMirror = { anchored: boolean; revoked: boolean };
type AssetMirror = { status: Status; metadata: string; documentCount: number; namespace: string };

type Mirror = {
    assets: Map<string, AssetMirror>;
    documents: Map<string, Map<string, DocMirror>>;
    paused: boolean;
};

type Real = {
    registry: DataCenterAssetRegistry;
    adapter: NamespacedRegistrar;
    signers: {
        admin: HardhatEthersSigner;
        auditor: HardhatEthersSigner;
        pauser: HardhatEthersSigner;
        operators: readonly [HardhatEthersSigner, HardhatEthersSigner];
    };
    assetPool: string[];
    docPool: string[];
};

function emptyMirror(): Mirror {
    return { assets: new Map(), documents: new Map(), paused: false };
}

function ensureAssetEntry(mirror: Mirror, assetId: string): AssetMirror {
    let entry = mirror.assets.get(assetId);
    if (!entry) {
        entry = {
            status: ASSET_STATUS.Unregistered,
            metadata: "",
            documentCount: 0,
            namespace: NS_BYTES8_ZERO,
        };
        mirror.assets.set(assetId, entry);
    }
    return entry;
}

function ensureDocEntry(mirror: Mirror, assetId: string, docHash: string): DocMirror {
    let byAsset = mirror.documents.get(assetId);
    if (!byAsset) {
        byAsset = new Map();
        mirror.documents.set(assetId, byAsset);
    }
    let entry = byAsset.get(docHash);
    if (!entry) {
        entry = { anchored: false, revoked: false };
        byAsset.set(docHash, entry);
    }
    return entry;
}

async function assertAllInvariants(mirror: Mirror, real: Real) {
    for (const assetId of real.assetPool) {
        const record = await real.registry.getAsset(assetId);
        const model = mirror.assets.get(assetId);
        const expectedStatus = model?.status ?? ASSET_STATUS.Unregistered;
        expect(Number(record.status)).to.equal(expectedStatus, `I1 status for ${assetId}`);
        if (expectedStatus !== ASSET_STATUS.Unregistered) {
            expect(record.metadataRef).to.equal(model!.metadata, `I2 metadata for ${assetId}`);
        }
        expect(Number(record.documentCount)).to.equal(
            model?.documentCount ?? 0,
            `I3 documentCount for ${assetId}`,
        );
        for (const docHash of real.docPool) {
            const expectedActive =
                (mirror.documents.get(assetId)?.get(docHash)?.anchored ?? false) &&
                !(mirror.documents.get(assetId)?.get(docHash)?.revoked ?? false);
            const actual = await real.registry.isDocumentAnchored(assetId, docHash);
            expect(actual).to.equal(
                expectedActive,
                `I4 isDocumentAnchored for ${assetId}/${docHash}`,
            );
        }
        const expectedNs = model?.namespace ?? NS_BYTES8_ZERO;
        const actualNs = await real.adapter.assetNamespace(assetId);
        expect(actualNs).to.equal(expectedNs, `I5 assetNamespace for ${assetId}`);
    }
}

interface Command {
    readonly tag: string;
    check(m: Mirror, r: Real): boolean;
    run(m: Mirror, r: Real): Promise<void>;
}

function makeAdapterRegister(nsIdx: 0 | 1, assetIdx: number, metadata: string): Command {
    return {
        tag: "adapter.register",
        check(m, r) {
            const assetId = r.assetPool[assetIdx];
            const entry = m.assets.get(assetId);
            return !m.paused && (!entry || entry.status === ASSET_STATUS.Unregistered);
        },
        async run(m, r) {
            const assetId = r.assetPool[assetIdx];
            const ns = NS_POOL[nsIdx];
            await r.adapter.connect(r.signers.operators[nsIdx]).registerAsset(ns, assetId, metadata);
            const entry = ensureAssetEntry(m, assetId);
            entry.status = ASSET_STATUS.Active;
            entry.metadata = metadata;
            entry.namespace = ns;
        },
    };
}

function makeAdapterUpdate(assetIdx: number, metadata: string): Command {
    return {
        tag: "adapter.updateMetadata",
        check(m, r) {
            const entry = m.assets.get(r.assetPool[assetIdx]);
            return !m.paused && !!entry && entry.status !== ASSET_STATUS.Unregistered;
        },
        async run(m, r) {
            const assetId = r.assetPool[assetIdx];
            const entry = m.assets.get(assetId)!;
            const opIdx = NS_POOL.indexOf(entry.namespace);
            await r.adapter.connect(r.signers.operators[opIdx]).updateAssetMetadata(assetId, metadata);
            entry.metadata = metadata;
        },
    };
}

function makeAdapterSetStatus(assetIdx: number, target: Status): Command {
    return {
        tag: "adapter.setStatus",
        check(m, r) {
            const entry = m.assets.get(r.assetPool[assetIdx]);
            return (
                !m.paused &&
                !!entry &&
                entry.status !== ASSET_STATUS.Unregistered &&
                target !== ASSET_STATUS.Unregistered &&
                entry.status !== target
            );
        },
        async run(m, r) {
            const assetId = r.assetPool[assetIdx];
            const entry = m.assets.get(assetId)!;
            const opIdx = NS_POOL.indexOf(entry.namespace);
            await r.adapter.connect(r.signers.operators[opIdx]).setAssetStatus(assetId, target);
            entry.status = target;
        },
    };
}

function makeAnchor(assetIdx: number, docIdx: number): Command {
    return {
        tag: "anchor",
        check(m, r) {
            const assetEntry = m.assets.get(r.assetPool[assetIdx]);
            if (m.paused || !assetEntry || assetEntry.status !== ASSET_STATUS.Active) return false;
            const doc = m.documents.get(r.assetPool[assetIdx])?.get(r.docPool[docIdx]);
            return !doc || !doc.anchored || doc.revoked;
        },
        async run(m, r) {
            const assetId = r.assetPool[assetIdx];
            const docHash = r.docPool[docIdx];
            await r.registry.connect(r.signers.auditor).anchorDocumentHash(assetId, docHash);
            const doc = ensureDocEntry(m, assetId, docHash);
            doc.anchored = true;
            doc.revoked = false;
            m.assets.get(assetId)!.documentCount += 1;
        },
    };
}

function makeRevoke(assetIdx: number, docIdx: number): Command {
    return {
        tag: "revoke",
        check(m, r) {
            if (m.paused) return false;
            const doc = m.documents.get(r.assetPool[assetIdx])?.get(r.docPool[docIdx]);
            return !!doc && doc.anchored && !doc.revoked;
        },
        async run(m, r) {
            const assetId = r.assetPool[assetIdx];
            const docHash = r.docPool[docIdx];
            await r.registry.connect(r.signers.auditor).revokeDocumentHash(assetId, docHash, "");
            const doc = m.documents.get(assetId)!.get(docHash)!;
            doc.revoked = true;
            m.assets.get(assetId)!.documentCount -= 1;
        },
    };
}

function makePause(): Command {
    return {
        tag: "pause",
        check(m) {
            return !m.paused;
        },
        async run(m, r) {
            await r.registry.connect(r.signers.pauser).pause();
            m.paused = true;
        },
    };
}

function makeUnpause(): Command {
    return {
        tag: "unpause",
        check(m) {
            return m.paused;
        },
        async run(m, r) {
            await r.registry.connect(r.signers.pauser).unpause();
            m.paused = false;
        },
    };
}

const commandArb: fc.Arbitrary<Command> = fc.oneof(
    fc
        .tuple(
            fc.constantFrom<0 | 1>(0, 1),
            fc.integer({ min: 0, max: ASSET_POOL_SIZE - 1 }),
            fc.string({ minLength: 1, maxLength: 64 }),
        )
        .map(([ns, i, m]) => makeAdapterRegister(ns, i, m)),
    fc
        .tuple(
            fc.integer({ min: 0, max: ASSET_POOL_SIZE - 1 }),
            fc.string({ minLength: 1, maxLength: 64 }),
        )
        .map(([i, m]) => makeAdapterUpdate(i, m)),
    fc
        .tuple(
            fc.integer({ min: 0, max: ASSET_POOL_SIZE - 1 }),
            fc.constantFrom<Status>(
                ASSET_STATUS.Active,
                ASSET_STATUS.Suspended,
                ASSET_STATUS.Retired,
            ),
        )
        .map(([i, s]) => makeAdapterSetStatus(i, s)),
    fc
        .tuple(
            fc.integer({ min: 0, max: ASSET_POOL_SIZE - 1 }),
            fc.integer({ min: 0, max: DOCUMENT_POOL_SIZE - 1 }),
        )
        .map(([a, d]) => makeAnchor(a, d)),
    fc
        .tuple(
            fc.integer({ min: 0, max: ASSET_POOL_SIZE - 1 }),
            fc.integer({ min: 0, max: DOCUMENT_POOL_SIZE - 1 }),
        )
        .map(([a, d]) => makeRevoke(a, d)),
    fc.constant(makePause()),
    fc.constant(makeUnpause()),
);

async function freshReal(): Promise<Real> {
    const [admin, bootstrapRegistrar, auditor, pauser, nsAdmin, opSeoul, opTokyo] =
        await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        bootstrapRegistrar.address,
        auditor.address,
        pauser.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();

    const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
    const adapter = (await Adapter.deploy(
        admin.address,
        await registry.getAddress(),
    )) as unknown as NamespacedRegistrar;
    await adapter.waitForDeployment();

    const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
    await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());
    await registry.connect(admin).revokeRole(REGISTRAR_ROLE, bootstrapRegistrar.address);

    const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
    await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, nsAdmin.address);
    await adapter.connect(nsAdmin).grantNamespaceOperator(NS_POOL[0], opSeoul.address);
    await adapter.connect(nsAdmin).grantNamespaceOperator(NS_POOL[1], opTokyo.address);

    const assetPool = Array.from({ length: ASSET_POOL_SIZE }, (_, i) => ethers.id(`asset-${i}`));
    const docPool = Array.from({ length: DOCUMENT_POOL_SIZE }, (_, i) => ethers.id(`doc-${i}`));

    return {
        registry,
        adapter,
        signers: {
            admin,
            auditor,
            pauser,
            operators: [opSeoul, opTokyo] as const,
        },
        assetPool,
        docPool,
    };
}

describe("Registry + NamespacedRegistrar — stateful invariant campaign", function () {
    this.timeout(5 * 60 * 1000);

    it(
        `maintains all invariants across ${NUM_RUNS} runs × ${COMMANDS_PER_RUN} commands`,
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(commandArb, {
                        minLength: COMMANDS_PER_RUN,
                        maxLength: COMMANDS_PER_RUN,
                    }),
                    async (commands) => {
                        const real = await freshReal();
                        const mirror = emptyMirror();
                        for (const cmd of commands) {
                            if (!cmd.check(mirror, real)) continue;
                            await cmd.run(mirror, real);
                            await assertAllInvariants(mirror, real);
                        }
                    },
                ),
                { numRuns: NUM_RUNS, endOnFailure: true },
            );
        },
    );
});
