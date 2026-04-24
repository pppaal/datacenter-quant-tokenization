/**
 * End-to-end integration: registry + NamespacedRegistrar with full
 * REGISTRAR_ROLE handoff.
 *
 * Simulates the production deployment sequence:
 *   1. Admin deploys registry with bootstrap REGISTRAR (EOA).
 *   2. Admin deploys NamespacedRegistrar adapter pointing at registry.
 *   3. Admin grants REGISTRAR_ROLE on registry to the adapter.
 *   4. Admin revokes REGISTRAR_ROLE from bootstrap EOA.
 *   5. Admin grants NAMESPACE_ADMIN_ROLE on the adapter to the ops lead.
 *   6. Ops lead grants per-(namespace, operator) permissions.
 *   7. Operators drive asset lifecycle strictly through the adapter; bootstrap
 *      EOA and outsiders are shut out of the registry's mutating surface.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, NamespacedRegistrar } from "../../typechain-types";

const NS_SEOUL = ethers.encodeBytes32String("seoul").slice(0, 18);
const NS_TOKYO = ethers.encodeBytes32String("tokyo").slice(0, 18);

async function handoffFixture() {
    const [admin, bootstrapRegistrar, auditor, pauser, nsAdmin, opSeoul, opTokyo, outsider] =
        await ethers.getSigners();

    // (1) deploy registry — bootstrapRegistrar holds REGISTRAR_ROLE temporarily
    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        bootstrapRegistrar.address,
        auditor.address,
        pauser.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();

    // (2) deploy namespaced registrar adapter
    const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
    const adapter = (await Adapter.deploy(
        admin.address,
        await registry.getAddress(),
    )) as unknown as NamespacedRegistrar;
    await adapter.waitForDeployment();

    // (3) hand over REGISTRAR_ROLE to the adapter
    const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
    await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());

    // (4) revoke bootstrap EOA
    await registry.connect(admin).revokeRole(REGISTRAR_ROLE, bootstrapRegistrar.address);

    // (5) grant NAMESPACE_ADMIN_ROLE on adapter to ops lead
    const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
    await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, nsAdmin.address);

    // (6) per-namespace operator grants
    await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
    await adapter.connect(nsAdmin).grantNamespaceOperator(NS_TOKYO, opTokyo.address);

    return {
        registry,
        adapter,
        admin,
        bootstrapRegistrar,
        auditor,
        nsAdmin,
        opSeoul,
        opTokyo,
        outsider,
        REGISTRAR_ROLE,
    };
}

describe("Integration: registry + NamespacedRegistrar REGISTRAR handoff", () => {
    it("bootstrap EOA loses REGISTRAR after handoff; adapter holds it", async () => {
        const { registry, adapter, bootstrapRegistrar, REGISTRAR_ROLE } =
            await loadFixture(handoffFixture);

        expect(await registry.hasRole(REGISTRAR_ROLE, bootstrapRegistrar.address)).to.equal(false);
        expect(await registry.hasRole(REGISTRAR_ROLE, await adapter.getAddress())).to.equal(true);

        // Bootstrap EOA can no longer mutate the registry directly.
        await expect(
            registry.connect(bootstrapRegistrar).registerAsset(ethers.id("orphan"), "ipfs://x"),
        ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("asset lifecycle is usable end-to-end only through the adapter", async () => {
        const { registry, adapter, opSeoul } = await loadFixture(handoffFixture);

        const assetA = ethers.id("dc-seoul-apgujeong-01");

        // Register via adapter — registry's event records the adapter as the registrar.
        await expect(adapter.connect(opSeoul).registerAsset(NS_SEOUL, assetA, "ipfs://a-v1"))
            .to.emit(registry, "AssetRegistered")
            .withArgs(assetA, "ipfs://a-v1", await adapter.getAddress());

        // Update + status-change routed through the adapter.
        await adapter.connect(opSeoul).updateAssetMetadata(assetA, "ipfs://a-v2");
        await adapter.connect(opSeoul).setAssetStatus(assetA, 2); // Suspended

        const rec = await registry.getAsset(assetA);
        expect(rec.metadataRef).to.equal("ipfs://a-v2");
        expect(Number(rec.status)).to.equal(2);
        expect(await adapter.assetNamespace(assetA)).to.equal(NS_SEOUL);
    });

    it("compromise of a seoul operator cannot reach tokyo assets", async () => {
        const { adapter, opSeoul, opTokyo } = await loadFixture(handoffFixture);

        const assetSeoul = ethers.id("dc-seoul-01");
        const assetTokyo = ethers.id("dc-tokyo-01");

        await adapter.connect(opSeoul).registerAsset(NS_SEOUL, assetSeoul, "ipfs://s");
        await adapter.connect(opTokyo).registerAsset(NS_TOKYO, assetTokyo, "ipfs://t");

        // Compromised seoul operator cannot touch tokyo asset metadata or status.
        await expect(
            adapter.connect(opSeoul).updateAssetMetadata(assetTokyo, "ipfs://compromise"),
        ).to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace");
        await expect(
            adapter.connect(opSeoul).setAssetStatus(assetTokyo, 3),
        ).to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace");

        // And cannot re-claim the tokyo assetId under nsSeoul to launder it.
        await expect(adapter.connect(opSeoul).registerAsset(NS_SEOUL, assetTokyo, "ipfs://s2"))
            .to.be.revertedWithCustomError(adapter, "AlreadyBound")
            .withArgs(assetTokyo, NS_TOKYO);
    });

    it("outsider (no namespace grant) cannot register new assets under any namespace", async () => {
        const { adapter, outsider } = await loadFixture(handoffFixture);
        await expect(
            adapter.connect(outsider).registerAsset(NS_SEOUL, ethers.id("rogue"), "ipfs://r"),
        )
            .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
            .withArgs(NS_SEOUL, outsider.address);
    });

    it("admin failsafe: revoking the adapter's REGISTRAR_ROLE severs the write path", async () => {
        const { registry, adapter, admin, opSeoul, REGISTRAR_ROLE } =
            await loadFixture(handoffFixture);

        await registry.connect(admin).revokeRole(REGISTRAR_ROLE, await adapter.getAddress());

        // Previously-valid operator now fails because the adapter can't forward.
        await expect(
            adapter.connect(opSeoul).registerAsset(NS_SEOUL, ethers.id("post-revoke"), "ipfs://x"),
        ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("auditor role is untouched by the adapter (document anchoring still direct)", async () => {
        const { registry, adapter, auditor, opSeoul } = await loadFixture(handoffFixture);

        const assetA = ethers.id("dc-audit-test");
        await adapter.connect(opSeoul).registerAsset(NS_SEOUL, assetA, "ipfs://a");

        const doc = ethers.id("doc-1");
        await registry.connect(auditor).anchorDocumentHash(assetA, doc);
        expect(await registry.isDocumentAnchored(assetA, doc)).to.equal(true);
    });
});
