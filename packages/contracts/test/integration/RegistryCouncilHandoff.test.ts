/**
 * End-to-end integration: registry + council with full PAUSER_ROLE handoff.
 *
 * Simulates the production deployment sequence:
 *   1. Admin deploys registry with bootstrap PAUSER (EOA).
 *   2. Admin deploys council pointing at registry, 2-of-3 threshold.
 *   3. Admin grants PAUSER_ROLE on registry to council.
 *   4. Admin revokes PAUSER_ROLE from bootstrap EOA.
 *   5. Council members drive pause/unpause through the registry.
 *   6. Under pause, registry writes are blocked; reads succeed.
 *   7. After threshold unpause, the registrar can write again.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, EmergencyCouncil } from "../../typechain-types";

const ONE_DAY = 24 * 60 * 60;

async function handoffFixture() {
    const [admin, registrar, auditor, bootstrapPauser, m1, m2, m3] = await ethers.getSigners();

    // (1) deploy registry — bootstrapPauser holds PAUSER_ROLE temporarily
    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        registrar.address,
        auditor.address,
        bootstrapPauser.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();

    // (2) deploy council, 2-of-3
    const Council = await ethers.getContractFactory("EmergencyCouncil");
    const council = (await Council.deploy(
        admin.address,
        await registry.getAddress(),
        2n,
    )) as unknown as EmergencyCouncil;
    await council.waitForDeployment();

    // Grant MEMBER_ROLE to m1..m3
    const memberRole = await council.MEMBER_ROLE();
    for (const m of [m1, m2, m3]) {
        await council.connect(admin).grantRole(memberRole, m.address);
    }

    // (3) hand over PAUSER_ROLE to council
    const pauserRole = await registry.PAUSER_ROLE();
    await registry.connect(admin).grantRole(pauserRole, await council.getAddress());

    // (4) revoke bootstrap EOA
    await registry.connect(admin).revokeRole(pauserRole, bootstrapPauser.address);

    return {
        registry,
        council,
        admin,
        registrar,
        auditor,
        bootstrapPauser,
        members: [m1, m2, m3] as const,
        pauserRole,
    };
}

describe("Integration: registry + council PAUSER handoff", () => {
    it("bootstrap EOA loses PAUSER after handoff; council holds it", async () => {
        const { registry, council, bootstrapPauser, pauserRole } = await loadFixture(handoffFixture);

        expect(await registry.hasRole(pauserRole, bootstrapPauser.address)).to.equal(false);
        expect(await registry.hasRole(pauserRole, await council.getAddress())).to.equal(true);

        // Bootstrap EOA can no longer pause directly.
        await expect(registry.connect(bootstrapPauser).pause()).to.be.revertedWithCustomError(
            registry,
            "AccessControlUnauthorizedAccount",
        );
    });

    it("council MEMBER can pause, and registry blocks writes while paused", async () => {
        const { registry, council, registrar, auditor, members } = await loadFixture(handoffFixture);

        // Seed one asset so we can try to update/anchor against it later.
        const assetId = ethers.id("dc-seoul-apgujeong-01");
        await registry.connect(registrar).registerAsset(assetId, "ipfs://meta-v1");

        // MEMBER triggers pause via council.
        await council.connect(members[0]).emergencyPause();
        expect(await registry.paused()).to.equal(true);

        // Writes are blocked for everyone.
        await expect(
            registry.connect(registrar).registerAsset(ethers.id("other"), "ipfs://m"),
        ).to.be.revertedWithCustomError(registry, "EnforcedPause");
        await expect(
            registry.connect(registrar).updateAssetMetadata(assetId, "ipfs://meta-v2"),
        ).to.be.revertedWithCustomError(registry, "EnforcedPause");
        await expect(
            registry.connect(auditor).anchorDocumentHash(assetId, ethers.id("doc")),
        ).to.be.revertedWithCustomError(registry, "EnforcedPause");

        // Reads still work (that's the whole point of pause-not-freeze).
        const record = await registry.getAsset(assetId);
        expect(record.metadataRef).to.equal("ipfs://meta-v1");
    });

    it("2-of-3 unpause via council restores write capability end-to-end", async () => {
        const { registry, council, registrar, members } = await loadFixture(handoffFixture);

        const assetId = ethers.id("dc-seoul-apgujeong-02");
        await registry.connect(registrar).registerAsset(assetId, "ipfs://meta-v1");

        // Pause, propose unpause, approve — counts propose as 1, approve as 2.
        await council.connect(members[0]).emergencyPause();
        await council.connect(members[0]).proposeUnpause(ONE_DAY);
        const pid = (await council.nextProposalId()) - 1n;
        await expect(council.connect(members[1]).approveUnpause(pid))
            .to.emit(council, "UnpauseExecuted")
            .withArgs(pid, 2, 2);

        expect(await registry.paused()).to.equal(false);

        // Registrar can now update again — full roundtrip.
        await registry.connect(registrar).updateAssetMetadata(assetId, "ipfs://meta-v2");
        expect((await registry.getAsset(assetId)).metadataRef).to.equal("ipfs://meta-v2");
    });

    it("council cannot be unilaterally bypassed: a single member cannot unpause alone", async () => {
        const { registry, council, members } = await loadFixture(handoffFixture);

        await council.connect(members[0]).emergencyPause();
        await council.connect(members[0]).proposeUnpause(ONE_DAY);
        const pid = (await council.nextProposalId()) - 1n;

        // Proposer already auto-voted, so second vote from same address reverts.
        await expect(
            council.connect(members[0]).approveUnpause(pid),
        ).to.be.revertedWithCustomError(council, "AlreadyApproved");

        // Registry is still paused — no unilateral unpause possible.
        expect(await registry.paused()).to.equal(true);
    });

    it("revoking the council's PAUSER_ROLE severs its control (admin failsafe)", async () => {
        const { registry, council, admin, members, pauserRole } = await loadFixture(handoffFixture);

        // Admin revokes council's PAUSER_ROLE (worst-case: compromised council).
        await registry.connect(admin).revokeRole(pauserRole, await council.getAddress());

        // Members now have no on-chain pathway to pause the registry.
        await expect(council.connect(members[0]).emergencyPause()).to.be.revertedWithCustomError(
            registry,
            "AccessControlUnauthorizedAccount",
        );
    });
});
