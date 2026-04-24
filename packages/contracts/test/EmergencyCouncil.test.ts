import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, EmergencyCouncil } from "../typechain-types";

const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;

const deployT1 = () => deployWithThreshold(1n);
const deployT2 = () => deployWithThreshold(2n);
const deployT3 = () => deployWithThreshold(3n);

async function deployWithThreshold(threshold: bigint) {
    const [admin, registrarSigner, auditorSigner, pauserSigner, m1, m2, m3, outsider] =
        await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        registrarSigner.address,
        auditorSigner.address,
        pauserSigner.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();

    const Council = await ethers.getContractFactory("EmergencyCouncil");
    const council = (await Council.deploy(
        admin.address,
        await registry.getAddress(),
        threshold,
    )) as unknown as EmergencyCouncil;
    await council.waitForDeployment();

    const memberRole = await council.MEMBER_ROLE();
    await council.connect(admin).grantRole(memberRole, m1.address);
    await council.connect(admin).grantRole(memberRole, m2.address);
    await council.connect(admin).grantRole(memberRole, m3.address);

    const pauserRole = await registry.PAUSER_ROLE();
    await registry.connect(admin).grantRole(pauserRole, await council.getAddress());
    await registry.connect(admin).revokeRole(pauserRole, pauserSigner.address);

    return {
        registry,
        council,
        admin,
        registrarSigner,
        auditorSigner,
        pauserSigner,
        members: [m1, m2, m3],
        outsider,
    };
}

describe("EmergencyCouncil", () => {
    describe("construction", () => {
        it("stores target, threshold, and grants admin role", async () => {
            const { registry, council, admin } = await loadFixture(deployT2);
            expect(await council.protectedContract()).to.equal(await registry.getAddress());
            expect(await council.unpauseThreshold()).to.equal(2);
            expect(await council.hasRole(await council.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
        });

        it("reverts when target is zero address", async () => {
            const [admin] = await ethers.getSigners();
            const Council = await ethers.getContractFactory("EmergencyCouncil");
            await expect(Council.deploy(admin.address, ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(
                Council,
                "InvalidTarget",
            );
        });

        it("reverts when threshold is zero", async () => {
            const [admin, , , pauserSigner, , , , dummyTarget] = await ethers.getSigners();
            const Council = await ethers.getContractFactory("EmergencyCouncil");
            await expect(Council.deploy(admin.address, dummyTarget.address, 0n)).to.be.revertedWithCustomError(
                Council,
                "InvalidThreshold",
            );
            expect(pauserSigner).to.exist;
        });
    });

    describe("emergencyPause", () => {
        it("allows any single member to pause the target", async () => {
            const { registry, council, members } = await loadFixture(deployT2);
            await expect(council.connect(members[0]).emergencyPause())
                .to.emit(council, "EmergencyPause")
                .withArgs(members[0].address);
            expect(await registry.paused()).to.equal(true);
        });

        it("is idempotent when already paused", async () => {
            const { registry, council, members } = await loadFixture(deployT2);
            await council.connect(members[0]).emergencyPause();
            await expect(council.connect(members[1]).emergencyPause()).to.not.be.reverted;
            expect(await registry.paused()).to.equal(true);
        });

        it("rejects non-members", async () => {
            const { council, outsider } = await loadFixture(deployT2);
            await expect(council.connect(outsider).emergencyPause()).to.be.revertedWithCustomError(
                council,
                "AccessControlUnauthorizedAccount",
            );
        });

        it("rejects non-members on proposeUnpause", async () => {
            const { council, outsider } = await loadFixture(deployT2);
            await expect(
                council.connect(outsider).proposeUnpause(ONE_DAY),
            ).to.be.revertedWithCustomError(council, "AccessControlUnauthorizedAccount");
        });

        it("rejects non-members on approveUnpause", async () => {
            const { council, outsider } = await loadFixture(deployT2);
            await expect(council.connect(outsider).approveUnpause(0n)).to.be.revertedWithCustomError(
                council,
                "AccessControlUnauthorizedAccount",
            );
        });
    });

    describe("proposeUnpause / approveUnpause", () => {
        it("auto-executes when threshold == 1", async () => {
            const { registry, council, members } = await loadFixture(deployT1);
            await council.connect(members[0]).emergencyPause();
            const tx = await council.connect(members[1]).proposeUnpause(ONE_DAY);
            await expect(tx).to.emit(council, "UnpauseExecuted");
            expect(await registry.paused()).to.equal(false);
        });

        it("requires threshold approvals to execute", async () => {
            const { registry, council, members } = await loadFixture(deployT2);
            await council.connect(members[0]).emergencyPause();

            const tx = await council.connect(members[0]).proposeUnpause(ONE_DAY);
            const receipt = await tx.wait();
            const proposalId = 0n;
            expect(await registry.paused()).to.equal(true);
            const proposalAfterPropose = await council.getProposal(proposalId);
            expect(proposalAfterPropose.approvals).to.equal(1);
            expect(proposalAfterPropose.executed).to.equal(false);
            expect(receipt).to.exist;

            await expect(council.connect(members[1]).approveUnpause(proposalId))
                .to.emit(council, "UnpauseExecuted")
                .withArgs(proposalId, 2, 2);
            expect(await registry.paused()).to.equal(false);
        });

        it("proposer's vote cannot be double-counted", async () => {
            const { council, members } = await loadFixture(deployT3);
            await council.connect(members[0]).emergencyPause();
            await council.connect(members[0]).proposeUnpause(ONE_DAY);
            await expect(council.connect(members[0]).approveUnpause(0n)).to.be.revertedWithCustomError(
                council,
                "AlreadyApproved",
            );
        });

        it("rejects TTL below minimum or above maximum", async () => {
            const { council, members } = await loadFixture(deployT2);
            await expect(council.connect(members[0]).proposeUnpause(60)).to.be.revertedWithCustomError(
                council,
                "InvalidTtl",
            );
            await expect(
                council.connect(members[0]).proposeUnpause(31 * ONE_DAY),
            ).to.be.revertedWithCustomError(council, "InvalidTtl");
        });

        it("expired proposal cannot be approved", async () => {
            const { council, members } = await loadFixture(deployT3);
            await council.connect(members[0]).emergencyPause();
            await council.connect(members[0]).proposeUnpause(ONE_HOUR);
            await time.increase(ONE_HOUR + 1);
            await expect(council.connect(members[1]).approveUnpause(0n)).to.be.revertedWithCustomError(
                council,
                "ProposalExpired",
            );
        });

        it("executed proposal cannot be approved again", async () => {
            const { council, members } = await loadFixture(deployT2);
            await council.connect(members[0]).emergencyPause();
            await council.connect(members[0]).proposeUnpause(ONE_DAY);
            await council.connect(members[1]).approveUnpause(0n);
            await expect(council.connect(members[2]).approveUnpause(0n)).to.be.revertedWithCustomError(
                council,
                "ProposalAlreadyExecuted",
            );
        });

        it("unknown proposal id reverts", async () => {
            const { council, members } = await loadFixture(deployT2);
            await expect(council.connect(members[0]).approveUnpause(42n)).to.be.revertedWithCustomError(
                council,
                "ProposalNotFound",
            );
        });

        it("execution while target is no longer paused is a safe no-op", async () => {
            const { registry, council, admin, members } = await loadFixture(deployT2);
            await council.connect(members[0]).emergencyPause();
            await council.connect(members[0]).proposeUnpause(ONE_DAY);
            const pauserRole = await registry.PAUSER_ROLE();
            await registry.connect(admin).grantRole(pauserRole, admin.address);
            await registry.connect(admin).unpause();
            expect(await registry.paused()).to.equal(false);
            await expect(council.connect(members[1]).approveUnpause(0n)).to.emit(council, "UnpauseExecuted");
            expect(await registry.paused()).to.equal(false);
        });
    });

    describe("setUnpauseThreshold", () => {
        it("admin can lower or raise the threshold", async () => {
            const { council, admin } = await loadFixture(deployT2);
            await expect(council.connect(admin).setUnpauseThreshold(5))
                .to.emit(council, "UnpauseThresholdChanged")
                .withArgs(2, 5);
            expect(await council.unpauseThreshold()).to.equal(5);
        });

        it("non-admin cannot change threshold", async () => {
            const { council, members } = await loadFixture(deployT2);
            await expect(
                council.connect(members[0]).setUnpauseThreshold(1),
            ).to.be.revertedWithCustomError(council, "AccessControlUnauthorizedAccount");
        });

        it("zero threshold is rejected", async () => {
            const { council, admin } = await loadFixture(deployT2);
            await expect(council.connect(admin).setUnpauseThreshold(0)).to.be.revertedWithCustomError(
                council,
                "InvalidThreshold",
            );
        });
    });

    describe("view helpers", () => {
        it("hasApproved reflects proposer auto-vote, approver votes, and non-voters", async () => {
            const { council, members } = await loadFixture(deployT3);
            await council.connect(members[0]).emergencyPause();
            await council.connect(members[0]).proposeUnpause(ONE_DAY);
            expect(await council.hasApproved(0n, members[0].address)).to.equal(true);
            expect(await council.hasApproved(0n, members[1].address)).to.equal(false);

            await council.connect(members[1]).approveUnpause(0n);
            expect(await council.hasApproved(0n, members[1].address)).to.equal(true);
            expect(await council.hasApproved(0n, members[2].address)).to.equal(false);
        });

        it("hasApproved on unknown proposal id returns false", async () => {
            const { council, members } = await loadFixture(deployT2);
            expect(await council.hasApproved(999n, members[0].address)).to.equal(false);
        });
    });
});
