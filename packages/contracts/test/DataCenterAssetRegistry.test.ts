import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry } from "../typechain-types";

enum AssetStatus {
  Unregistered = 0,
  Active = 1,
  Suspended = 2,
  Retired = 3,
}

const ASSET_A = ethers.id("asset-a");
const ASSET_B = ethers.id("asset-b");
const DOC_1 = ethers.id("document-1");
const DOC_2 = ethers.id("document-2");
const META = "ipfs://bafyasset-a-metadata";
const META_V2 = "ipfs://bafyasset-a-metadata-v2";

async function deployFixture() {
  const [admin, registrar, auditor, pauser, outsider] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
  const registry = (await Registry.deploy(
    admin.address,
    registrar.address,
    auditor.address,
    pauser.address,
  )) as unknown as DataCenterAssetRegistry;
  await registry.waitForDeployment();
  return { registry, admin, registrar, auditor, pauser, outsider };
}

describe("DataCenterAssetRegistry", () => {
  describe("deployment & roles", () => {
    it("grants DEFAULT_ADMIN_ROLE to initial admin", async () => {
      const { registry, admin } = await loadFixture(deployFixture);
      const DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    });

    it("grants operational roles to initial holders", async () => {
      const { registry, registrar, auditor, pauser } = await loadFixture(deployFixture);
      expect(await registry.hasRole(await registry.REGISTRAR_ROLE(), registrar.address)).to.equal(true);
      expect(await registry.hasRole(await registry.AUDITOR_ROLE(), auditor.address)).to.equal(true);
      expect(await registry.hasRole(await registry.PAUSER_ROLE(), pauser.address)).to.equal(true);
    });

    it("enforces 3-day timelock on admin handoff", async () => {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.defaultAdminDelay()).to.equal(3n * 24n * 60n * 60n);
    });

    it("skips role grants when initial holder is address(0)", async () => {
      const [admin] = await ethers.getSigners();
      const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
      const bare = (await Registry.deploy(
        admin.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      )) as unknown as DataCenterAssetRegistry;
      await bare.waitForDeployment();

      // admin still receives DEFAULT_ADMIN_ROLE
      expect(await bare.hasRole(await bare.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);

      // but no operational role is auto-assigned to address(0)
      expect(await bare.hasRole(await bare.REGISTRAR_ROLE(), ethers.ZeroAddress)).to.equal(false);
      expect(await bare.hasRole(await bare.AUDITOR_ROLE(), ethers.ZeroAddress)).to.equal(false);
      expect(await bare.hasRole(await bare.PAUSER_ROLE(), ethers.ZeroAddress)).to.equal(false);
    });
  });

  describe("registerAsset", () => {
    it("registers a new asset and emits AssetRegistered", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await expect(registry.connect(registrar).registerAsset(ASSET_A, META))
        .to.emit(registry, "AssetRegistered")
        .withArgs(ASSET_A, META, registrar.address);

      const record = await registry.getAsset(ASSET_A);
      expect(record.status).to.equal(AssetStatus.Active);
      expect(record.metadataRef).to.equal(META);
      expect(record.documentCount).to.equal(0);
    });

    it("reverts when outsider tries to register", async () => {
      const { registry, outsider } = await loadFixture(deployFixture);
      await expect(
        registry.connect(outsider).registerAsset(ASSET_A, META),
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts on zero assetId", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await expect(
        registry.connect(registrar).registerAsset(ethers.ZeroHash, META),
      ).to.be.revertedWithCustomError(registry, "InvalidAssetId");
    });

    it("reverts on empty metadata", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await expect(
        registry.connect(registrar).registerAsset(ASSET_A, ""),
      ).to.be.revertedWithCustomError(registry, "InvalidMetadata");
    });

    it("reverts on metadata over MAX_METADATA_LENGTH", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      const tooLong = "x".repeat(513);
      await expect(
        registry.connect(registrar).registerAsset(ASSET_A, tooLong),
      ).to.be.revertedWithCustomError(registry, "MetadataTooLong");
    });

    it("reverts when asset already registered", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(
        registry.connect(registrar).registerAsset(ASSET_A, META),
      ).to.be.revertedWithCustomError(registry, "AssetAlreadyRegistered");
    });
  });

  describe("updateAssetMetadata", () => {
    it("updates metadata and emits with previous value", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(registry.connect(registrar).updateAssetMetadata(ASSET_A, META_V2))
        .to.emit(registry, "AssetMetadataUpdated")
        .withArgs(ASSET_A, META, META_V2, registrar.address);
      expect((await registry.getAsset(ASSET_A)).metadataRef).to.equal(META_V2);
    });

    it("reverts when asset not registered", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await expect(
        registry.connect(registrar).updateAssetMetadata(ASSET_B, META),
      ).to.be.revertedWithCustomError(registry, "AssetNotRegistered");
    });
  });

  describe("setAssetStatus", () => {
    it("transitions Active -> Suspended -> Retired", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(registry.connect(registrar).setAssetStatus(ASSET_A, AssetStatus.Suspended))
        .to.emit(registry, "AssetStatusChanged")
        .withArgs(ASSET_A, AssetStatus.Active, AssetStatus.Suspended);
      await expect(registry.connect(registrar).setAssetStatus(ASSET_A, AssetStatus.Retired))
        .to.emit(registry, "AssetStatusChanged")
        .withArgs(ASSET_A, AssetStatus.Suspended, AssetStatus.Retired);
    });

    it("rejects setting status to Unregistered", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(
        registry.connect(registrar).setAssetStatus(ASSET_A, AssetStatus.Unregistered),
      ).to.be.revertedWithCustomError(registry, "InvalidAssetId");
    });

    it("rejects no-op transitions", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(
        registry.connect(registrar).setAssetStatus(ASSET_A, AssetStatus.Active),
      ).to.be.revertedWithCustomError(registry, "SameStatus");
    });

    it("reverts AssetNotRegistered on an unknown asset", async () => {
      const { registry, registrar } = await loadFixture(deployFixture);
      await expect(
        registry.connect(registrar).setAssetStatus(ASSET_B, AssetStatus.Suspended),
      ).to.be.revertedWithCustomError(registry, "AssetNotRegistered");
    });
  });

  describe("document anchoring", () => {
    it("anchors a document and increments documentCount", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1))
        .to.emit(registry, "DocumentAnchored")
        .withArgs(ASSET_A, DOC_1, auditor.address);
      const record = await registry.getAsset(ASSET_A);
      expect(record.documentCount).to.equal(1);
      expect(await registry.isDocumentAnchored(ASSET_A, DOC_1)).to.equal(true);
    });

    it("prevents double-anchoring an active document", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      await expect(
        registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1),
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyAnchored");
    });

    it("blocks anchoring on non-Active assets", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(registrar).setAssetStatus(ASSET_A, AssetStatus.Suspended);
      await expect(
        registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1),
      ).to.be.revertedWithCustomError(registry, "AssetNotActive");
    });

    it("rejects zero document hash", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(
        registry.connect(auditor).anchorDocumentHash(ASSET_A, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(registry, "InvalidDocumentHash");
    });

    it("anchorDocumentHash reverts AssetNotRegistered on unknown asset", async () => {
      const { registry, auditor } = await loadFixture(deployFixture);
      await expect(
        registry.connect(auditor).anchorDocumentHash(ASSET_B, DOC_1),
      ).to.be.revertedWithCustomError(registry, "AssetNotRegistered");
    });

    it("revokeDocumentHash reverts DocumentNotAnchored on unknown document", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await expect(
        registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "n/a"),
      ).to.be.revertedWithCustomError(registry, "DocumentNotAnchored");
    });

    it("revokeDocumentHash reverts DocumentAlreadyRevoked on a re-revoke", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      await registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "superseded");
      await expect(
        registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "again"),
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyRevoked");
    });

    it("revokes a document and allows re-anchoring later", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      await expect(registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "superseded"))
        .to.emit(registry, "DocumentRevoked")
        .withArgs(ASSET_A, DOC_1, auditor.address, "superseded");
      expect(await registry.isDocumentAnchored(ASSET_A, DOC_1)).to.equal(false);

      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      expect(await registry.isDocumentAnchored(ASSET_A, DOC_1)).to.equal(true);
    });

    it("documentCount tracks active (non-revoked) anchors, not lifetime anchors", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      expect((await registry.getAsset(ASSET_A)).documentCount).to.equal(1);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_2);
      expect((await registry.getAsset(ASSET_A)).documentCount).to.equal(2);
      await registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "err");
      expect((await registry.getAsset(ASSET_A)).documentCount).to.equal(1);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      expect((await registry.getAsset(ASSET_A)).documentCount).to.equal(2);
    });

    it("refuses double-revoke", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);
      await registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "err");
      await expect(
        registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "again"),
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyRevoked");
    });
  });

  describe("pause", () => {
    it("halts mutating entrypoints when paused", async () => {
      const { registry, registrar, auditor, pauser } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(pauser).pause();

      await expect(
        registry.connect(registrar).registerAsset(ASSET_B, META),
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
      await expect(
        registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_2),
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");

      await registry.connect(pauser).unpause();
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_2);
    });

    it("rejects non-pauser pause attempts", async () => {
      const { registry, outsider } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).pause()).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("rejects non-pauser unpause attempts", async () => {
      const { registry, pauser, outsider } = await loadFixture(deployFixture);
      await registry.connect(pauser).pause();
      await expect(registry.connect(outsider).unpause()).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("input-length guards", () => {
    it("revokeDocumentHash reverts ReasonTooLong when reason exceeds MAX_REASON_LENGTH", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);

      const max = Number(await registry.MAX_REASON_LENGTH());
      const tooLong = "x".repeat(max + 1);
      await expect(
        registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, tooLong),
      )
        .to.be.revertedWithCustomError(registry, "ReasonTooLong")
        .withArgs(max + 1, max);

      // boundary: exactly MAX_REASON_LENGTH must succeed
      const atLimit = "y".repeat(max);
      await registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, atLimit);
    });
  });

  describe("view helpers", () => {
    it("getDocument on unknown (asset, hash) returns the zero record", async () => {
      const { registry } = await loadFixture(deployFixture);
      const doc = await registry.getDocument(ASSET_A, DOC_1);
      expect(doc.anchoredAt).to.equal(0n);
      expect(doc.revokedAt).to.equal(0n);
      expect(doc.anchoredBy).to.equal(ethers.ZeroAddress);
    });

    it("getDocument round-trips an anchored document and reflects revocation", async () => {
      const { registry, registrar, auditor } = await loadFixture(deployFixture);
      await registry.connect(registrar).registerAsset(ASSET_A, META);
      await registry.connect(auditor).anchorDocumentHash(ASSET_A, DOC_1);

      const anchored = await registry.getDocument(ASSET_A, DOC_1);
      expect(anchored.anchoredAt).to.be.greaterThan(0n);
      expect(anchored.revokedAt).to.equal(0n);
      expect(anchored.anchoredBy).to.equal(auditor.address);

      await registry.connect(auditor).revokeDocumentHash(ASSET_A, DOC_1, "superseded");
      const revoked = await registry.getDocument(ASSET_A, DOC_1);
      expect(revoked.revokedAt).to.be.greaterThan(0n);
    });
  });
});
