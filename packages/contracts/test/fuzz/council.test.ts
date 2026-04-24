/**
 * Property-based fuzz for EmergencyCouncil.
 *
 * Verifies asymmetric-governance invariants under randomized member choice,
 * TTL inputs, and proposal order:
 *   - any single MEMBER can pause instantly (circuit breaker)
 *   - non-MEMBERs can never pause / propose / approve
 *   - TTLs outside [MIN_PROPOSAL_TTL, MAX_PROPOSAL_TTL] always revert
 *   - an executed proposal stays executed (no re-execution)
 *   - approvals monotonically increase up to threshold, then execute flips pause
 */
import { expect } from "chai";
import fc from "fast-check";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, EmergencyCouncil } from "../../typechain-types";

const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS ?? 30);
const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;

async function deployFixture() {
    const [admin, registrarSigner, auditorSigner, pauserSigner, m1, m2, m3, m4, outsider] =
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
    // Threshold 3-of-4 so we can fuzz approval order without auto-executing on propose.
    const council = (await Council.deploy(
        admin.address,
        await registry.getAddress(),
        3n,
    )) as unknown as EmergencyCouncil;
    await council.waitForDeployment();

    const memberRole = await council.MEMBER_ROLE();
    for (const m of [m1, m2, m3, m4]) {
        await council.connect(admin).grantRole(memberRole, m.address);
    }

    const pauserRole = await registry.PAUSER_ROLE();
    await registry.connect(admin).grantRole(pauserRole, await council.getAddress());
    await registry.connect(admin).revokeRole(pauserRole, pauserSigner.address);

    return {
        registry,
        council,
        admin,
        members: [m1, m2, m3, m4],
        outsider,
    };
}

describe("EmergencyCouncil — property-based fuzz", () => {
    it("any single MEMBER can pause instantly regardless of identity", async () => {
        const { registry, council, members } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 0, max: members.length - 1 }), async (idx) => {
                // Unpause first if a previous iteration left it paused.
                if (await registry.paused()) {
                    // threshold is 3, so we need 3 approvals to unpause
                    await council.connect(members[0]).proposeUnpause(ONE_DAY);
                    const pid = (await council.nextProposalId()) - 1n;
                    await council.connect(members[1]).approveUnpause(pid);
                    await council.connect(members[2]).approveUnpause(pid);
                    expect(await registry.paused()).to.equal(false);
                }

                await council.connect(members[idx]).emergencyPause();
                expect(await registry.paused()).to.equal(true);
            }),
            { numRuns: Math.min(NUM_RUNS, 12) },
        );
    });

    it("non-MEMBERs can never pause, propose, or approve", async () => {
        const { council, outsider, admin } = await loadFixture(deployFixture);
        // admin has DEFAULT_ADMIN_ROLE but NOT MEMBER_ROLE by construction.
        const nonMembers = [outsider, admin];

        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: nonMembers.length - 1 }),
                fc.integer({ min: ONE_HOUR, max: ONE_DAY }),
                fc.bigInt({ min: 0n, max: 20n }),
                async (idx, ttl, proposalId) => {
                    const signer = nonMembers[idx];
                    await expect(council.connect(signer).emergencyPause()).to.be.revertedWithCustomError(
                        council,
                        "AccessControlUnauthorizedAccount",
                    );
                    await expect(council.connect(signer).proposeUnpause(ttl)).to.be.revertedWithCustomError(
                        council,
                        "AccessControlUnauthorizedAccount",
                    );
                    await expect(
                        council.connect(signer).approveUnpause(proposalId),
                    ).to.be.revertedWithCustomError(council, "AccessControlUnauthorizedAccount");
                },
            ),
            { numRuns: Math.min(NUM_RUNS, 15) },
        );
    });

    it("TTLs outside [MIN, MAX] always revert with InvalidTtl", async () => {
        const { council, members } = await loadFixture(deployFixture);

        // Below minimum (0 .. 3599)
        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 0, max: ONE_HOUR - 1 }), async (ttl) => {
                await expect(council.connect(members[0]).proposeUnpause(ttl)).to.be.revertedWithCustomError(
                    council,
                    "InvalidTtl",
                );
            }),
            { numRuns: Math.min(NUM_RUNS, 15) },
        );

        // Above maximum (30 days + 1 .. 60 days)
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 30 * ONE_DAY + 1, max: 60 * ONE_DAY }),
                async (ttl) => {
                    await expect(
                        council.connect(members[0]).proposeUnpause(ttl),
                    ).to.be.revertedWithCustomError(council, "InvalidTtl");
                },
            ),
            { numRuns: Math.min(NUM_RUNS, 15) },
        );
    });

    it("an executed proposal stays executed — all further approveUnpause revert", async () => {
        const { council, registry, members } = await loadFixture(deployFixture);

        // Pause and drive a proposal to execution.
        await council.connect(members[0]).emergencyPause();
        await council.connect(members[0]).proposeUnpause(ONE_DAY);
        const pid = (await council.nextProposalId()) - 1n;
        await council.connect(members[1]).approveUnpause(pid);
        await council.connect(members[2]).approveUnpause(pid);
        expect(await registry.paused()).to.equal(false);

        // From here on, any further member's approve call must revert.
        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 0, max: members.length - 1 }), async (idx) => {
                await expect(
                    council.connect(members[idx]).approveUnpause(pid),
                ).to.be.revertedWithCustomError(council, "ProposalAlreadyExecuted");
            }),
            { numRuns: Math.min(NUM_RUNS, 10) },
        );
    });

    it("approvals from the same member are always rejected (idempotency)", async () => {
        const { council, members } = await loadFixture(deployFixture);
        await council.connect(members[0]).emergencyPause();
        await council.connect(members[0]).proposeUnpause(ONE_DAY);
        const pid = (await council.nextProposalId()) - 1n;
        // members[0] already counted; members[1] approves once.
        await council.connect(members[1]).approveUnpause(pid);

        await fc.assert(
            fc.asyncProperty(fc.constantFrom(0, 1), async (idx) => {
                await expect(
                    council.connect(members[idx]).approveUnpause(pid),
                ).to.be.revertedWithCustomError(council, "AlreadyApproved");
            }),
            { numRuns: Math.min(NUM_RUNS, 10) },
        );
    });

    it("approvals monotonically increase and paused→false exactly when approvals == threshold", async () => {
        const { registry, council, members } = await loadFixture(deployFixture);

        await fc.assert(
            fc.asyncProperty(
                fc.shuffledSubarray([0, 1, 2, 3], { minLength: 3, maxLength: 3 }),
                async (order) => {
                    // Reset: pause fresh for every iteration.
                    if (!(await registry.paused())) {
                        await council.connect(members[0]).emergencyPause();
                    }

                    // propose with first member in order
                    await council.connect(members[order[0]]).proposeUnpause(ONE_DAY);
                    const pid = (await council.nextProposalId()) - 1n;

                    // After propose: approvals=1, still paused
                    let p = await council.getProposal(pid);
                    expect(p.approvals).to.equal(1);
                    expect(await registry.paused()).to.equal(true);

                    // 2nd approval: approvals=2, still paused
                    await council.connect(members[order[1]]).approveUnpause(pid);
                    p = await council.getProposal(pid);
                    expect(p.approvals).to.equal(2);
                    expect(await registry.paused()).to.equal(true);

                    // 3rd approval: approvals=3, executed, unpaused
                    await council.connect(members[order[2]]).approveUnpause(pid);
                    p = await council.getProposal(pid);
                    expect(p.approvals).to.equal(3);
                    expect(p.executed).to.equal(true);
                    expect(await registry.paused()).to.equal(false);
                },
            ),
            { numRuns: Math.min(NUM_RUNS, 12) },
        );
    });
});
