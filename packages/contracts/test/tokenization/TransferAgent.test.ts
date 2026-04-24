import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type {
    AssetToken,
    DataCenterAssetRegistry,
    IdentityRegistry,
    ModularCompliance,
    TransferAgent,
} from "../../typechain-types";

const ASSET_ID = ethers.id("transfer-agent-asset-1");
const META = "ipfs://bafy-transfer-agent";
const KR = 410;
const US = 840;
const NAME = "DataCenter Asset Trading";
const SYMBOL = "DCAT";
const DECIMALS = 0;
const RFQ_REF = ethers.id("rfq-2026-0001");
const REJECT_REASON = ethers.id("kyc-mismatch");
const CANCEL_REASON = ethers.id("buyer-withdrew");

async function deployFixture() {
    const [admin, identityManager, pauser, agent, operator, issuer, seller, buyer, outsider] =
        await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        admin.address,
        admin.address,
        admin.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();
    await registry.connect(admin).registerAsset(ASSET_ID, META);

    const Identity = await ethers.getContractFactory("IdentityRegistry");
    const identity = (await Identity.deploy(
        admin.address,
        identityManager.address,
        pauser.address,
    )) as unknown as IdentityRegistry;
    await identity.waitForDeployment();

    const Compliance = await ethers.getContractFactory("ModularCompliance");
    const compliance = (await Compliance.deploy(
        admin.address,
        admin.address,
    )) as unknown as ModularCompliance;
    await compliance.waitForDeployment();

    const Token = await ethers.getContractFactory("AssetToken");
    const token = (await Token.deploy(
        NAME,
        SYMBOL,
        DECIMALS,
        await registry.getAddress(),
        ASSET_ID,
        await identity.getAddress(),
        await compliance.getAddress(),
        admin.address,
        agent.address,
        pauser.address,
    )) as unknown as AssetToken;
    await token.waitForDeployment();
    await compliance.connect(admin).bindToken(await token.getAddress());

    await identity.connect(identityManager).registerIdentity(seller.address, KR);
    await identity.connect(identityManager).registerIdentity(buyer.address, US);

    // Seed the seller with 100 shares (AGENT_ROLE held by `agent`).
    await token.connect(agent).mint(seller.address, 100n);

    const Agent = await ethers.getContractFactory("TransferAgent");
    const transferAgent = (await Agent.deploy(admin.address)) as unknown as TransferAgent;
    await transferAgent.waitForDeployment();

    // Wire roles. AGENT_ROLE on the token is what allows forceTransfer.
    const AGENT_ROLE = await token.AGENT_ROLE();
    await token.connect(admin).grantRole(AGENT_ROLE, await transferAgent.getAddress());

    const OPERATOR_ROLE = await transferAgent.OPERATOR_ROLE();
    const ISSUER_ROLE = await transferAgent.ISSUER_ROLE();
    const PAUSER_ROLE = await transferAgent.PAUSER_ROLE();
    await transferAgent.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
    await transferAgent.connect(admin).grantRole(ISSUER_ROLE, issuer.address);
    await transferAgent.connect(admin).grantRole(PAUSER_ROLE, pauser.address);

    return {
        registry,
        identity,
        compliance,
        token,
        transferAgent,
        admin,
        identityManager,
        agent,
        pauser,
        operator,
        issuer,
        seller,
        buyer,
        outsider,
    };
}

describe("TransferAgent", () => {
    describe("openTicket", () => {
        it("rejects zero token", async () => {
            const { transferAgent, operator, seller, buyer } = await loadFixture(deployFixture);
            await expect(
                transferAgent
                    .connect(operator)
                    .openTicket(
                        ethers.ZeroAddress,
                        seller.address,
                        buyer.address,
                        10n,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        0,
                        RFQ_REF,
                    ),
            ).to.be.revertedWithCustomError(transferAgent, "InvalidToken");
        });

        it("rejects seller == buyer", async () => {
            const { transferAgent, token, operator, seller } = await loadFixture(deployFixture);
            await expect(
                transferAgent
                    .connect(operator)
                    .openTicket(
                        await token.getAddress(),
                        seller.address,
                        seller.address,
                        10n,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        0,
                        RFQ_REF,
                    ),
            ).to.be.revertedWithCustomError(transferAgent, "InvalidParty");
        });

        it("rejects zero amount", async () => {
            const { transferAgent, token, operator, seller, buyer } = await loadFixture(deployFixture);
            await expect(
                transferAgent
                    .connect(operator)
                    .openTicket(
                        await token.getAddress(),
                        seller.address,
                        buyer.address,
                        0,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        0,
                        RFQ_REF,
                    ),
            ).to.be.revertedWithCustomError(transferAgent, "InvalidAmount");
        });

        it("rejects past expiry", async () => {
            const { transferAgent, token, operator, seller, buyer } = await loadFixture(deployFixture);
            const past = (await time.latest()) - 1;
            await expect(
                transferAgent
                    .connect(operator)
                    .openTicket(
                        await token.getAddress(),
                        seller.address,
                        buyer.address,
                        10n,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        past,
                        RFQ_REF,
                    ),
            ).to.be.revertedWithCustomError(transferAgent, "InvalidExpiry");
        });

        it("rejects non-operators", async () => {
            const { transferAgent, token, outsider, seller, buyer } = await loadFixture(deployFixture);
            await expect(
                transferAgent
                    .connect(outsider)
                    .openTicket(
                        await token.getAddress(),
                        seller.address,
                        buyer.address,
                        10n,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        0,
                        RFQ_REF,
                    ),
            ).to.be.reverted;
        });

        it("opens a pending ticket and increments count", async () => {
            const { transferAgent, token, operator, seller, buyer } = await loadFixture(deployFixture);
            await expect(
                transferAgent
                    .connect(operator)
                    .openTicket(
                        await token.getAddress(),
                        seller.address,
                        buyer.address,
                        10n,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        0,
                        RFQ_REF,
                    ),
            )
                .to.emit(transferAgent, "TicketOpened")
                .withArgs(
                    1n,
                    await token.getAddress(),
                    seller.address,
                    buyer.address,
                    10n,
                    RFQ_REF,
                    operator.address,
                );
            expect(await transferAgent.ticketCount()).to.equal(1n);
            const ticket = await transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(0); // Pending
            expect(ticket.openedBy).to.equal(operator.address);
        });
    });

    describe("approveTicket", () => {
        async function openedFixture() {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            return ctx;
        }

        it("requires issuer role", async () => {
            const ctx = await openedFixture();
            await expect(ctx.transferAgent.connect(ctx.operator).approveTicket(1n)).to.be.reverted;
        });

        it("approves a pending ticket", async () => {
            const ctx = await openedFixture();
            await expect(ctx.transferAgent.connect(ctx.issuer).approveTicket(1n))
                .to.emit(ctx.transferAgent, "TicketApproved")
                .withArgs(1n, ctx.issuer.address, 0n);
            const ticket = await ctx.transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(1); // Approved
            expect(ticket.decidedBy).to.equal(ctx.issuer.address);
        });

        it("rejects buyer who is not KYC-verified", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.outsider.address, // not registered
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await expect(
                ctx.transferAgent.connect(ctx.issuer).approveTicket(1n),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "BuyerNotVerified");
        });

        it("refuses double-approval", async () => {
            const ctx = await openedFixture();
            await ctx.transferAgent.connect(ctx.issuer).approveTicket(1n);
            await expect(
                ctx.transferAgent.connect(ctx.issuer).approveTicket(1n),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "TicketNotPending");
        });

        it("refuses to approve past expiresAt and leaves state Pending", async () => {
            const ctx = await deployFixture();
            const expiresAt = (await time.latest()) + 60;
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    expiresAt,
                    RFQ_REF,
                );
            await time.increase(120);
            await expect(
                ctx.transferAgent.connect(ctx.issuer).approveTicket(1n),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "TicketExpired");
            // Revert rolled back any state change; status stays Pending until
            // someone explicitly calls expireTicket().
            const ticket = await ctx.transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(0); // Pending
        });

        it("expireTicket persists Expired terminal state", async () => {
            const ctx = await deployFixture();
            const expiresAt = (await time.latest()) + 60;
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    expiresAt,
                    RFQ_REF,
                );
            await time.increase(120);
            await expect(ctx.transferAgent.connect(ctx.outsider).expireTicket(1n))
                .to.emit(ctx.transferAgent, "TicketExpiredExplicit")
                .withArgs(1n, ctx.outsider.address);
            const ticket = await ctx.transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(4); // Expired
        });

        it("expireTicket refuses if not yet past expiresAt", async () => {
            const ctx = await deployFixture();
            const expiresAt = (await time.latest()) + 3600;
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    expiresAt,
                    RFQ_REF,
                );
            await expect(
                ctx.transferAgent.connect(ctx.outsider).expireTicket(1n),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "InvalidExpiry");
        });
    });

    describe("rejectTicket / cancelTicket", () => {
        it("issuer can reject a pending ticket", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await expect(ctx.transferAgent.connect(ctx.issuer).rejectTicket(1n, REJECT_REASON))
                .to.emit(ctx.transferAgent, "TicketRejected")
                .withArgs(1n, ctx.issuer.address, REJECT_REASON);
            const ticket = await ctx.transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(2); // Rejected
        });

        it("operator who opened can cancel", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await expect(ctx.transferAgent.connect(ctx.operator).cancelTicket(1n, CANCEL_REASON))
                .to.emit(ctx.transferAgent, "TicketCancelled")
                .withArgs(1n, ctx.operator.address, CANCEL_REASON);
            const ticket = await ctx.transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(5); // Cancelled
        });

        it("outsider cannot cancel", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await expect(
                ctx.transferAgent.connect(ctx.outsider).cancelTicket(1n, CANCEL_REASON),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "NotAuthorized");
        });
    });

    describe("settle", () => {
        async function approvedFixture() {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await ctx.transferAgent.connect(ctx.issuer).approveTicket(1n);
            return ctx;
        }

        it("moves shares from seller to buyer", async () => {
            const ctx = await approvedFixture();
            await expect(ctx.transferAgent.connect(ctx.outsider).settle(1n))
                .to.emit(ctx.transferAgent, "TicketSettled")
                .withArgs(1n, ctx.outsider.address);
            expect(await ctx.token.balanceOf(ctx.seller.address)).to.equal(90n);
            expect(await ctx.token.balanceOf(ctx.buyer.address)).to.equal(10n);
            const ticket = await ctx.transferAgent.getTicket(1n);
            expect(ticket.status).to.equal(3); // Settled
        });

        it("reverts if the agent does not hold AGENT_ROLE on the token", async () => {
            const ctx = await approvedFixture();
            const AGENT_ROLE = await ctx.token.AGENT_ROLE();
            await ctx.token
                .connect(ctx.admin)
                .revokeRole(AGENT_ROLE, await ctx.transferAgent.getAddress());
            await expect(ctx.transferAgent.connect(ctx.outsider).settle(1n)).to.be.reverted;
        });

        it("refuses to settle a pending (un-approved) ticket", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await expect(
                ctx.transferAgent.connect(ctx.outsider).settle(1n),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "TicketNotApproved");
        });

        it("refuses to settle twice", async () => {
            const ctx = await approvedFixture();
            await ctx.transferAgent.connect(ctx.outsider).settle(1n);
            await expect(
                ctx.transferAgent.connect(ctx.outsider).settle(1n),
            ).to.be.revertedWithCustomError(ctx.transferAgent, "TicketNotApproved");
        });
    });

    describe("canSettle preflight", () => {
        it("reports approved + verified ticket as ok", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            await ctx.transferAgent.connect(ctx.issuer).approveTicket(1n);
            const [ok, reason] = await ctx.transferAgent.canSettle(1n);
            expect(ok).to.equal(true);
            expect(reason).to.equal(ethers.ZeroHash);
        });

        it("returns NOT_APPROVED for pending ticket", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent
                .connect(ctx.operator)
                .openTicket(
                    await ctx.token.getAddress(),
                    ctx.seller.address,
                    ctx.buyer.address,
                    10n,
                    1000n,
                    ethers.encodeBytes32String("KRW"),
                    0,
                    RFQ_REF,
                );
            const [ok, reason] = await ctx.transferAgent.canSettle(1n);
            expect(ok).to.equal(false);
            expect(ethers.decodeBytes32String(reason)).to.equal("NOT_APPROVED");
        });

        it("returns TICKET_NOT_FOUND for unknown id", async () => {
            const ctx = await deployFixture();
            const [ok, reason] = await ctx.transferAgent.canSettle(999n);
            expect(ok).to.equal(false);
            expect(ethers.decodeBytes32String(reason)).to.equal("TICKET_NOT_FOUND");
        });
    });

    describe("pause", () => {
        it("blocks openTicket while paused", async () => {
            const ctx = await deployFixture();
            await ctx.transferAgent.connect(ctx.pauser).pause();
            await expect(
                ctx.transferAgent
                    .connect(ctx.operator)
                    .openTicket(
                        await ctx.token.getAddress(),
                        ctx.seller.address,
                        ctx.buyer.address,
                        10n,
                        1000n,
                        ethers.encodeBytes32String("KRW"),
                        0,
                        RFQ_REF,
                    ),
            ).to.be.reverted;
        });
    });
});
