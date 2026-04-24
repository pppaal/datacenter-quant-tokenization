/**
 * Property fuzz tests for NamespacedRegistrar.
 *
 * Universal invariants verified under randomized inputs:
 *   - Cross-namespace isolation: an operator permitted for namespace A cannot
 *     mutate an asset bound to namespace B, for arbitrary A != B and
 *     arbitrary assetIds/metadata.
 *   - Zero namespace always rejected on grant and register.
 *   - Non-operator callers always rejected on register, for arbitrary
 *     (namespace, assetId) pairs.
 *   - Binding is monotonic: once bound to a namespace, re-register reverts
 *     regardless of the caller / new namespace.
 *   - assetNamespace view agrees with actual binding after register.
 */
import { expect } from "chai";
import fc from "fast-check";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, NamespacedRegistrar } from "../../typechain-types";
import { arbBytes32, arbValidMetadata, type Hex32 } from "./arbitraries";

const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS ?? 25);
const NS_ZERO = "0x0000000000000000";

/** Arbitrary non-zero bytes8. */
const arbNamespace: fc.Arbitrary<string> = fc
    .uint8Array({ minLength: 8, maxLength: 8 })
    .filter((bytes) => bytes.some((b) => b !== 0))
    .map((bytes) => "0x" + Buffer.from(bytes).toString("hex"));

/** Two distinct non-zero namespaces. */
const arbDistinctNamespaces: fc.Arbitrary<[string, string]> = fc
    .tuple(arbNamespace, arbNamespace)
    .filter(([a, b]) => a !== b) as fc.Arbitrary<[string, string]>;

async function deployFixture() {
    const [admin, bootstrapRegistrar, auditor, pauser, nsAdmin, opA, opB, outsider] =
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

    return { registry, adapter, admin, nsAdmin, opA, opB, outsider };
}

describe("NamespacedRegistrar — property invariants", () => {
    it("zero namespace is always rejected on register and on grant", async () => {
        const { adapter, nsAdmin, opA } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, async (assetId: Hex32, meta) => {
                await expect(
                    adapter.connect(opA).registerAsset(NS_ZERO, assetId, meta),
                ).to.be.revertedWithCustomError(adapter, "InvalidNamespace");
            }),
            { numRuns: NUM_RUNS },
        );

        await fc.assert(
            fc.asyncProperty(fc.constantFrom(0, 1), async () => {
                await expect(
                    adapter.connect(nsAdmin).grantNamespaceOperator(NS_ZERO, opA.address),
                ).to.be.revertedWithCustomError(adapter, "InvalidNamespace");
            }),
            { numRuns: 3 },
        );
    });

    it("non-operator callers are always rejected on registerAsset", async () => {
        const { adapter, outsider } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbNamespace, arbBytes32, arbValidMetadata, async (ns, assetId: Hex32, meta) => {
                await expect(adapter.connect(outsider).registerAsset(ns, assetId, meta))
                    .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
                    .withArgs(ns, outsider.address);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it("cross-namespace isolation: operator A cannot mutate namespace-B asset, for any A != B", async () => {
        // One fixture reused across all runs; we draw a fresh asset + namespace pair per run.
        const { adapter, nsAdmin, opA, opB } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(
                arbDistinctNamespaces,
                arbBytes32,
                arbValidMetadata,
                arbValidMetadata,
                async ([nsA, nsB], assetId: Hex32, metaInit, metaHijack) => {
                    // Fresh permissions per run.
                    await adapter.connect(nsAdmin).grantNamespaceOperator(nsA, opA.address);
                    await adapter.connect(nsAdmin).grantNamespaceOperator(nsB, opB.address);

                    // opA registers an asset under nsA. Skip if already bound (assetId reused).
                    const existing = await adapter.assetNamespace(assetId);
                    if (existing !== "0x0000000000000000") return;
                    await adapter.connect(opA).registerAsset(nsA, assetId, metaInit);

                    // opB (nsB only) cannot update or change status on nsA-bound asset.
                    await expect(adapter.connect(opB).updateAssetMetadata(assetId, metaHijack))
                        .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
                        .withArgs(nsA, opB.address);
                    await expect(adapter.connect(opB).setAssetStatus(assetId, 3))
                        .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
                        .withArgs(nsA, opB.address);

                    // opA can, confirming the opposite branch is live and not universally-reverting.
                    await adapter.connect(opA).updateAssetMetadata(assetId, metaHijack);

                    // Cleanup: revoke so next run starts from a blank grant state.
                    await adapter.connect(nsAdmin).revokeNamespaceOperator(nsA, opA.address);
                    await adapter.connect(nsAdmin).revokeNamespaceOperator(nsB, opB.address);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    it("double-bind is impossible: once registered, re-register always reverts AlreadyBound", async () => {
        const { adapter, nsAdmin, opA, opB } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(
                arbDistinctNamespaces,
                arbBytes32,
                arbValidMetadata,
                async ([nsA, nsB], assetId: Hex32, meta) => {
                    const existing = await adapter.assetNamespace(assetId);
                    if (existing !== "0x0000000000000000") return;

                    await adapter.connect(nsAdmin).grantNamespaceOperator(nsA, opA.address);
                    await adapter.connect(nsAdmin).grantNamespaceOperator(nsB, opB.address);

                    await adapter.connect(opA).registerAsset(nsA, assetId, meta);

                    // Same namespace, same operator.
                    await expect(adapter.connect(opA).registerAsset(nsA, assetId, meta))
                        .to.be.revertedWithCustomError(adapter, "AlreadyBound")
                        .withArgs(assetId, nsA);

                    // Different namespace, different operator.
                    await expect(adapter.connect(opB).registerAsset(nsB, assetId, meta))
                        .to.be.revertedWithCustomError(adapter, "AlreadyBound")
                        .withArgs(assetId, nsA);

                    expect(await adapter.assetNamespace(assetId)).to.equal(nsA);

                    await adapter.connect(nsAdmin).revokeNamespaceOperator(nsA, opA.address);
                    await adapter.connect(nsAdmin).revokeNamespaceOperator(nsB, opB.address);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    it("updateAssetMetadata and setAssetStatus on unknown asset always revert NotBound", async () => {
        const { adapter, nsAdmin, opA } = await loadFixture(deployFixture);
        await adapter.connect(nsAdmin).grantNamespaceOperator(
            "0x1111111111111111",
            opA.address,
        );

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, async (assetId: Hex32, meta) => {
                // Skip collisions with any asset registered by a previous run.
                const existing = await adapter.assetNamespace(assetId);
                if (existing !== "0x0000000000000000") return;

                await expect(adapter.connect(opA).updateAssetMetadata(assetId, meta))
                    .to.be.revertedWithCustomError(adapter, "NotBound")
                    .withArgs(assetId);
                await expect(adapter.connect(opA).setAssetStatus(assetId, 2))
                    .to.be.revertedWithCustomError(adapter, "NotBound")
                    .withArgs(assetId);
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
