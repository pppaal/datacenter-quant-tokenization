import { expect } from "chai";
import fc from "fast-check";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry } from "../../typechain-types";
import {
    arbBytes32,
    arbValidMetadata,
    arbOversizedMetadata,
    type Hex32,
} from "./arbitraries";

const ASSET_STATUS = { Unregistered: 0, Active: 1, Suspended: 2, Retired: 3 } as const;

// Number of fast-check runs per property. Kept modest so CI stays fast but
// wide enough to catch boundary bugs. Override via FAST_CHECK_RUNS env var.
const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS ?? 40);

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

describe("DataCenterAssetRegistry — property-based fuzz", () => {
    it("registerAsset accepts any non-zero assetId with metadata in [1, 512] bytes", async () => {
        const { registry, registrar } = await loadFixture(deployFixture);
        const used = new Set<string>();

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, async (assetId, meta) => {
                fc.pre(!used.has(assetId));
                used.add(assetId);

                await registry.connect(registrar).registerAsset(assetId, meta);
                const record = await registry.getAsset(assetId as Hex32);
                expect(record.status).to.equal(ASSET_STATUS.Active);
                expect(record.metadataRef).to.equal(meta);
                expect(record.documentCount).to.equal(0);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it("oversized metadata always reverts with MetadataTooLong", async () => {
        const { registry, registrar } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbOversizedMetadata, async (assetId, meta) => {
                await expect(
                    registry.connect(registrar).registerAsset(assetId, meta),
                ).to.be.revertedWithCustomError(registry, "MetadataTooLong");
            }),
            { numRuns: Math.min(NUM_RUNS, 20) },
        );
    });

    it("accounts without REGISTRAR_ROLE can never register an asset", async () => {
        const { registry, auditor, pauser, outsider } = await loadFixture(deployFixture);
        // Any signer that is not the REGISTRAR should fail regardless of other roles.
        const nonRegistrars = [auditor, pauser, outsider];

        await fc.assert(
            fc.asyncProperty(
                arbBytes32,
                arbValidMetadata,
                fc.integer({ min: 0, max: nonRegistrars.length - 1 }),
                async (assetId, meta, idx) => {
                    const signer = nonRegistrars[idx];
                    await expect(
                        registry.connect(signer).registerAsset(assetId, meta),
                    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    it("registered asset's metadata is always retrievable via getAsset", async () => {
        const { registry, registrar } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbValidMetadata, arbValidMetadata, async (assetId, m1, m2) => {
                const before = await registry.getAsset(assetId as Hex32);
                if (before.status !== BigInt(ASSET_STATUS.Unregistered)) return;

                await registry.connect(registrar).registerAsset(assetId, m1);
                expect((await registry.getAsset(assetId as Hex32)).metadataRef).to.equal(m1);

                if (m1 !== m2) {
                    await registry.connect(registrar).updateAssetMetadata(assetId, m2);
                    expect((await registry.getAsset(assetId as Hex32)).metadataRef).to.equal(m2);
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it("anchor → revoke → re-anchor roundtrip preserves consistency", async () => {
        const { registry, registrar, auditor } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(arbBytes32, arbBytes32, async (assetId, docHash) => {
                const assetRecord = await registry.getAsset(assetId as Hex32);
                if (assetRecord.status !== BigInt(ASSET_STATUS.Unregistered)) return;

                await registry.connect(registrar).registerAsset(assetId, "ipfs://meta");
                await registry.connect(auditor).anchorDocumentHash(assetId, docHash);
                expect(await registry.isDocumentAnchored(assetId as Hex32, docHash as Hex32)).to.equal(true);

                await registry.connect(auditor).revokeDocumentHash(assetId, docHash, "");
                expect(await registry.isDocumentAnchored(assetId as Hex32, docHash as Hex32)).to.equal(false);

                await registry.connect(auditor).anchorDocumentHash(assetId, docHash);
                expect(await registry.isDocumentAnchored(assetId as Hex32, docHash as Hex32)).to.equal(true);
            }),
            { numRuns: Math.min(NUM_RUNS, 20) },
        );
    });

    it("accounts without AUDITOR_ROLE can never anchor", async () => {
        const { registry, registrar, pauser, outsider } = await loadFixture(deployFixture);
        const nonAuditors = [registrar, pauser, outsider];

        await fc.assert(
            fc.asyncProperty(
                arbBytes32,
                arbBytes32,
                fc.integer({ min: 0, max: nonAuditors.length - 1 }),
                async (assetId, docHash, idx) => {
                    const assetRecord = await registry.getAsset(assetId as Hex32);
                    if (assetRecord.status === BigInt(ASSET_STATUS.Unregistered)) {
                        await registry.connect(registrar).registerAsset(assetId, "meta");
                    }
                    const signer = nonAuditors[idx];
                    await expect(
                        registry.connect(signer).anchorDocumentHash(assetId, docHash),
                    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
