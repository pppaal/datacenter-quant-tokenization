/**
 * Unit tests for NamespacedRegistrar — a forwarding adapter that holds
 * REGISTRAR_ROLE on the main registry and enforces bytes8-namespace
 * permissions on every mutating call.
 *
 * Coverage:
 *   - construction (stores registry, rejects zero registry, timelock set)
 *   - namespace permission grant/revoke (role gating, zero-namespace guard)
 *   - registerAsset: happy path, unauthorized namespace, double-bind, zero-namespace,
 *                    zero-namespace grant rejected
 *   - updateAssetMetadata / setAssetStatus: require existing binding + matching namespace
 *   - cross-namespace isolation (seoul operator cannot touch tokyo assets)
 *   - full wiring through to underlying DataCenterAssetRegistry
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, NamespacedRegistrar } from "../typechain-types";

enum AssetStatus {
  Unregistered = 0,
  Active = 1,
  Suspended = 2,
  Retired = 3,
}

const NS_SEOUL = ethers.encodeBytes32String("seoul").slice(0, 18); // bytes8 = 16 hex + 0x
const NS_TOKYO = ethers.encodeBytes32String("tokyo").slice(0, 18);
const NS_ZERO = "0x0000000000000000";

const ASSET_A = ethers.id("asset-a");
const ASSET_B = ethers.id("asset-b");

async function deployFixture() {
  const [admin, bootstrapRegistrar, auditor, pauser, nsAdmin, opSeoul, opTokyo, outsider] =
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

  // Handoff: grant REGISTRAR_ROLE on registry to the adapter, revoke from bootstrap EOA.
  const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
  await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());
  await registry.connect(admin).revokeRole(REGISTRAR_ROLE, bootstrapRegistrar.address);

  // Grant NAMESPACE_ADMIN_ROLE on the adapter to nsAdmin.
  const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
  await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, nsAdmin.address);

  return {
    registry,
    adapter,
    admin,
    auditor,
    pauser,
    nsAdmin,
    opSeoul,
    opTokyo,
    outsider,
    bootstrapRegistrar,
  };
}

describe("NamespacedRegistrar", () => {
  describe("deployment", () => {
    it("stores the target registry address", async () => {
      const { registry, adapter } = await loadFixture(deployFixture);
      expect(await adapter.registry()).to.equal(await registry.getAddress());
    });

    it("reverts on zero-address registry", async () => {
      const [admin] = await ethers.getSigners();
      const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
      await expect(Adapter.deploy(admin.address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(Adapter, "InvalidRegistry");
    });

    it("grants DEFAULT_ADMIN_ROLE to initialAdmin and enforces 2-day timelock", async () => {
      const { adapter, admin } = await loadFixture(deployFixture);
      const DEFAULT_ADMIN_ROLE = await adapter.DEFAULT_ADMIN_ROLE();
      expect(await adapter.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await adapter.defaultAdminDelay()).to.equal(2n * 24n * 60n * 60n);
    });

    it("adapter holds REGISTRAR_ROLE on the registry (bootstrap EOA does not)", async () => {
      const { registry, adapter, bootstrapRegistrar } = await loadFixture(deployFixture);
      const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
      expect(await registry.hasRole(REGISTRAR_ROLE, await adapter.getAddress())).to.equal(true);
      expect(await registry.hasRole(REGISTRAR_ROLE, bootstrapRegistrar.address)).to.equal(false);
    });
  });

  describe("namespace permission management", () => {
    it("NAMESPACE_ADMIN can grant operator and emits event", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await expect(adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address))
        .to.emit(adapter, "NamespaceOperatorGranted")
        .withArgs(NS_SEOUL, opSeoul.address);
      expect(await adapter.canOperate(NS_SEOUL, opSeoul.address)).to.equal(true);
    });

    it("NAMESPACE_ADMIN can revoke operator and emits event", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await expect(adapter.connect(nsAdmin).revokeNamespaceOperator(NS_SEOUL, opSeoul.address))
        .to.emit(adapter, "NamespaceOperatorRevoked")
        .withArgs(NS_SEOUL, opSeoul.address);
      expect(await adapter.canOperate(NS_SEOUL, opSeoul.address)).to.equal(false);
    });

    it("non-admin cannot grant", async () => {
      const { adapter, outsider, opSeoul } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(outsider).grantNamespaceOperator(NS_SEOUL, opSeoul.address),
      ).to.be.revertedWithCustomError(adapter, "AccessControlUnauthorizedAccount");
    });

    it("non-admin cannot revoke", async () => {
      const { adapter, nsAdmin, outsider, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await expect(
        adapter.connect(outsider).revokeNamespaceOperator(NS_SEOUL, opSeoul.address),
      ).to.be.revertedWithCustomError(adapter, "AccessControlUnauthorizedAccount");
    });

    it("rejects zero namespace on grant", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(nsAdmin).grantNamespaceOperator(NS_ZERO, opSeoul.address),
      ).to.be.revertedWithCustomError(adapter, "InvalidNamespace");
    });
  });

  describe("registerAsset", () => {
    it("registers an asset, binds namespace, emits events, and forwards to registry", async () => {
      const { registry, adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);

      const tx = await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");
      await expect(tx)
        .to.emit(adapter, "AssetBound")
        .withArgs(ASSET_A, NS_SEOUL, opSeoul.address);
      await expect(tx)
        .to.emit(registry, "AssetRegistered")
        .withArgs(ASSET_A, "ipfs://a", await adapter.getAddress());

      expect(await adapter.assetNamespace(ASSET_A)).to.equal(NS_SEOUL);
      const rec = await registry.getAsset(ASSET_A);
      expect(rec.metadataRef).to.equal("ipfs://a");
      expect(Number(rec.status)).to.equal(AssetStatus.Active);
    });

    it("rejects unauthorized namespace caller", async () => {
      const { adapter, outsider } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(outsider).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a"),
      )
        .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
        .withArgs(NS_SEOUL, outsider.address);
    });

    it("rejects double-bind of same assetId (same or cross namespace)", async () => {
      const { adapter, nsAdmin, opSeoul, opTokyo } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_TOKYO, opTokyo.address);
      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");

      await expect(adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a2"))
        .to.be.revertedWithCustomError(adapter, "AlreadyBound")
        .withArgs(ASSET_A, NS_SEOUL);

      await expect(adapter.connect(opTokyo).registerAsset(NS_TOKYO, ASSET_A, "ipfs://a3"))
        .to.be.revertedWithCustomError(adapter, "AlreadyBound")
        .withArgs(ASSET_A, NS_SEOUL);
    });

    it("rejects zero namespace", async () => {
      const { adapter, opSeoul } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(opSeoul).registerAsset(NS_ZERO, ASSET_A, "ipfs://a"),
      ).to.be.revertedWithCustomError(adapter, "InvalidNamespace");
    });

    it("operator whose permission was revoked cannot register new assets", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(nsAdmin).revokeNamespaceOperator(NS_SEOUL, opSeoul.address);
      await expect(
        adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a"),
      ).to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace");
    });
  });

  describe("updateAssetMetadata", () => {
    it("forwards update when caller belongs to the bound namespace", async () => {
      const { registry, adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");
      await adapter.connect(opSeoul).updateAssetMetadata(ASSET_A, "ipfs://a2");
      expect((await registry.getAsset(ASSET_A)).metadataRef).to.equal("ipfs://a2");
    });

    it("reverts if asset was never bound through the adapter", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await expect(adapter.connect(opSeoul).updateAssetMetadata(ASSET_A, "ipfs://a2"))
        .to.be.revertedWithCustomError(adapter, "NotBound")
        .withArgs(ASSET_A);
    });

    it("reverts when caller belongs to a different namespace (cross-namespace isolation)", async () => {
      const { adapter, nsAdmin, opSeoul, opTokyo } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_TOKYO, opTokyo.address);
      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");

      await expect(adapter.connect(opTokyo).updateAssetMetadata(ASSET_A, "ipfs://hijack"))
        .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
        .withArgs(NS_SEOUL, opTokyo.address);
    });

    it("reverts when an operator's permission was revoked after registration", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");
      await adapter.connect(nsAdmin).revokeNamespaceOperator(NS_SEOUL, opSeoul.address);

      await expect(adapter.connect(opSeoul).updateAssetMetadata(ASSET_A, "ipfs://a2"))
        .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
        .withArgs(NS_SEOUL, opSeoul.address);
    });
  });

  describe("setAssetStatus", () => {
    it("forwards status change when caller belongs to the bound namespace", async () => {
      const { registry, adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");

      await adapter.connect(opSeoul).setAssetStatus(ASSET_A, AssetStatus.Suspended);
      expect(Number((await registry.getAsset(ASSET_A)).status)).to.equal(AssetStatus.Suspended);
    });

    it("reverts if asset was never bound", async () => {
      const { adapter, nsAdmin, opSeoul } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await expect(
        adapter.connect(opSeoul).setAssetStatus(ASSET_A, AssetStatus.Retired),
      )
        .to.be.revertedWithCustomError(adapter, "NotBound")
        .withArgs(ASSET_A);
    });

    it("reverts under cross-namespace caller", async () => {
      const { adapter, nsAdmin, opSeoul, opTokyo } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_TOKYO, opTokyo.address);
      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://a");

      await expect(
        adapter.connect(opTokyo).setAssetStatus(ASSET_A, AssetStatus.Retired),
      )
        .to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace")
        .withArgs(NS_SEOUL, opTokyo.address);
    });
  });

  describe("cross-namespace isolation end-to-end", () => {
    it("seoul operator can manage seoul assets; tokyo operator can manage tokyo assets; neither can touch the other", async () => {
      const { registry, adapter, nsAdmin, opSeoul, opTokyo } = await loadFixture(deployFixture);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);
      await adapter.connect(nsAdmin).grantNamespaceOperator(NS_TOKYO, opTokyo.address);

      await adapter.connect(opSeoul).registerAsset(NS_SEOUL, ASSET_A, "ipfs://seoul-a");
      await adapter.connect(opTokyo).registerAsset(NS_TOKYO, ASSET_B, "ipfs://tokyo-b");

      // Each can operate their own.
      await adapter.connect(opSeoul).updateAssetMetadata(ASSET_A, "ipfs://seoul-a2");
      await adapter.connect(opTokyo).updateAssetMetadata(ASSET_B, "ipfs://tokyo-b2");

      // Cross-namespace attempts revert.
      await expect(
        adapter.connect(opSeoul).updateAssetMetadata(ASSET_B, "ipfs://compromise"),
      ).to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace");
      await expect(
        adapter.connect(opTokyo).setAssetStatus(ASSET_A, AssetStatus.Retired),
      ).to.be.revertedWithCustomError(adapter, "UnauthorizedNamespace");

      // Underlying registry sees the independent updates.
      expect((await registry.getAsset(ASSET_A)).metadataRef).to.equal("ipfs://seoul-a2");
      expect((await registry.getAsset(ASSET_B)).metadataRef).to.equal("ipfs://tokyo-b2");
    });
  });
});
