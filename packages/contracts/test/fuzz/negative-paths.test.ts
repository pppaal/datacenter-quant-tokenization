/**
 * Negative-path invariants: ensure that pause and role separation are
 * unbypassable under random conditions. These would have caught the classic
 * bugs where a specific role-holder can still mutate while paused, or where a
 * role check is off by one (e.g. uses `hasRole` on the wrong role id).
 */
import { expect } from "chai";
import fc from "fast-check";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry } from "../../typechain-types";
import { arbBytes32, arbValidMetadata, type Hex32 } from "./arbitraries";

const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS ?? 30);

async function deployFixture() {
    const [admin, registrar, auditor, pauser, outsider, outsider2] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        registrar.address,
        auditor.address,
        pauser.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();
    return { registry, admin, registrar, auditor, pauser, outsider, outsider2 };
}

describe("DataCenterAssetRegistry — pause & role invariants", () => {
    it("while paused, NO mutating entrypoint succeeds regardless of caller", async () => {
        const { registry, registrar, auditor, pauser } = await loadFixture(deployFixture);
        await registry.connect(registrar).registerAsset(ethers.id("seed"), "meta");
        await registry.connect(pauser).pause();

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, arbBytes32, async (assetId, meta, docHash) => {
                await expect(
                    registry.connect(registrar).registerAsset(assetId, meta),
                ).to.be.revertedWithCustomError(registry, "EnforcedPause");
                await expect(
                    registry.connect(registrar).updateAssetMetadata(ethers.id("seed"), meta),
                ).to.be.revertedWithCustomError(registry, "EnforcedPause");
                await expect(
                    registry.connect(auditor).anchorDocumentHash(ethers.id("seed"), docHash),
                ).to.be.revertedWithCustomError(registry, "EnforcedPause");
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it("pauser role cannot register or anchor", async () => {
        const { registry, pauser } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, async (assetId, meta) => {
                await expect(
                    registry.connect(pauser).registerAsset(assetId, meta),
                ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
                await expect(
                    registry.connect(pauser).anchorDocumentHash(assetId, assetId),
                ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it("registrar role cannot anchor or pause", async () => {
        const { registry, registrar } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, async (docHash) => {
                await expect(
                    registry.connect(registrar).anchorDocumentHash(ethers.id("asset"), docHash),
                ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
                await expect(registry.connect(registrar).pause()).to.be.revertedWithCustomError(
                    registry,
                    "AccessControlUnauthorizedAccount",
                );
            }),
            { numRuns: Math.min(NUM_RUNS, 15) },
        );
    });

    it("auditor role cannot register or pause", async () => {
        const { registry, auditor } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, async (assetId, meta) => {
                await expect(
                    registry.connect(auditor).registerAsset(assetId, meta),
                ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
                await expect(registry.connect(auditor).pause()).to.be.revertedWithCustomError(
                    registry,
                    "AccessControlUnauthorizedAccount",
                );
            }),
            { numRuns: Math.min(NUM_RUNS, 15) },
        );
    });

    it("non-admin accounts cannot grant or revoke roles", async () => {
        const { registry, registrar, auditor, pauser, outsider, outsider2 } = await loadFixture(deployFixture);
        const roleId = await registry.REGISTRAR_ROLE();
        const signers = [registrar, auditor, pauser, outsider];

        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: signers.length - 1 }),
                async (idx) => {
                    await expect(
                        registry.connect(signers[idx]).grantRole(roleId, outsider2.address),
                    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
                },
            ),
            { numRuns: Math.min(NUM_RUNS, 15) },
        );
    });

    it("getAsset of never-registered ids always returns Unregistered state", async () => {
        const { registry } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, async (assetId) => {
                const record = await registry.getAsset(assetId as Hex32);
                expect(Number(record.status)).to.equal(0);
                expect(record.metadataRef).to.equal("");
                expect(Number(record.documentCount)).to.equal(0);
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
