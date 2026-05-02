import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { KrHoldingLimitModule, MockERC20 } from "../../typechain-types";

const RETAIL_BPS = 100n; // 1%
const QUALIFIED_BPS = 1000n; // 10%

async function deployFixture() {
    // owner manages module config; compliance is the address allowed to
    // invoke write-side hooks; retail / qualified are the LP tiers.
    const [owner, compliance, retail, qualified, anotherRetail, outsider] =
        await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory("MockERC20");
    const token = (await MockFactory.deploy("Asset Token", "ASSET")) as unknown as MockERC20;
    await token.waitForDeployment();

    const ModuleFactory = await ethers.getContractFactory("KrHoldingLimitModule");
    const module = (await ModuleFactory.deploy(
        compliance.address,
        RETAIL_BPS,
        QUALIFIED_BPS,
        owner.address,
    )) as unknown as KrHoldingLimitModule;
    await module.waitForDeployment();

    // Mint a baseline 1,000,000 supply so the bps math is easy:
    //   retail cap   = 1,000,000 × 1%  = 10,000
    //   qualified cap = 1,000,000 × 10% = 100,000
    await token.mint(outsider.address, 1_000_000n);

    return { module, token, owner, compliance, retail, qualified, anotherRetail, outsider };
}

describe("KrHoldingLimitModule", () => {
    describe("deployment", () => {
        it("rejects out-of-band limit bps", async () => {
            const [owner, compliance] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("KrHoldingLimitModule");
            await expect(
                Factory.deploy(compliance.address, 0n, QUALIFIED_BPS, owner.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidLimits");
            await expect(
                Factory.deploy(compliance.address, RETAIL_BPS, 0n, owner.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidLimits");
            await expect(
                Factory.deploy(compliance.address, 10_001n, QUALIFIED_BPS, owner.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidLimits");
        });

        it("rejects qualified limit below retail limit", async () => {
            const [owner, compliance] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("KrHoldingLimitModule");
            await expect(
                Factory.deploy(compliance.address, 200n, 100n, owner.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidLimits");
        });

        it("name() returns the module identifier", async () => {
            const { module } = await loadFixture(deployFixture);
            expect(await module.name()).to.equal("KrHoldingLimitModule");
        });
    });

    describe("moduleCheck — retail tier", () => {
        it("allows transfer below retail cap", async () => {
            const { module, token, retail } = await loadFixture(deployFixture);
            // retail cap = 1% of 1,000,000 = 10,000. Transfer 5,000 → allowed.
            const allowed = await module.moduleCheck(
                await token.getAddress(),
                ethers.ZeroAddress,
                retail.address,
                5_000n,
            );
            expect(allowed).to.equal(true);
        });

        it("rejects transfer that would exceed retail cap", async () => {
            const { module, token, retail } = await loadFixture(deployFixture);
            // 11,000 > 10,000 cap → false (no revert; check is a view)
            const allowed = await module.moduleCheck(
                await token.getAddress(),
                ethers.ZeroAddress,
                retail.address,
                11_000n,
            );
            expect(allowed).to.equal(false);
        });

        it("accumulates against existing balance", async () => {
            const { module, token, retail } = await loadFixture(deployFixture);
            await token.mint(retail.address, 8_000n);
            // existing 8,000 + incoming 3,000 = 11,000 > cap 10,000 → false
            const allowed = await module.moduleCheck(
                await token.getAddress(),
                ethers.ZeroAddress,
                retail.address,
                3_000n,
            );
            expect(allowed).to.equal(false);
        });
    });

    describe("moduleCheck — qualified tier", () => {
        it("allows higher amount once flagged qualified", async () => {
            const { module, token, owner, qualified } = await loadFixture(deployFixture);
            // Without flag, 50,000 fails the retail 10,000 cap
            expect(
                await module.moduleCheck(
                    await token.getAddress(),
                    ethers.ZeroAddress,
                    qualified.address,
                    50_000n,
                ),
            ).to.equal(false);
            // After flag, qualified cap = 100,000 → 50,000 allowed
            await module.connect(owner).setQualifiedInvestor(qualified.address, true);
            expect(
                await module.moduleCheck(
                    await token.getAddress(),
                    ethers.ZeroAddress,
                    qualified.address,
                    50_000n,
                ),
            ).to.equal(true);
        });

        it("still rejects above qualified cap", async () => {
            const { module, token, owner, qualified } = await loadFixture(deployFixture);
            await module.connect(owner).setQualifiedInvestor(qualified.address, true);
            expect(
                await module.moduleCheck(
                    await token.getAddress(),
                    ethers.ZeroAddress,
                    qualified.address,
                    101_000n,
                ),
            ).to.equal(false);
        });
    });

    describe("moduleCheck — burn / zero supply", () => {
        it("allows transfer to zero address (burn)", async () => {
            const { module, token } = await loadFixture(deployFixture);
            const allowed = await module.moduleCheck(
                await token.getAddress(),
                ethers.Wallet.createRandom().address,
                ethers.ZeroAddress,
                100_000n,
            );
            expect(allowed).to.equal(true);
        });

        it("allows any transfer when supply is zero", async () => {
            const { owner, compliance, retail } = await loadFixture(deployFixture);
            const MockFactory = await ethers.getContractFactory("MockERC20");
            const emptyToken = (await MockFactory.deploy("Empty", "EMPTY")) as unknown as MockERC20;
            await emptyToken.waitForDeployment();
            const ModuleFactory = await ethers.getContractFactory("KrHoldingLimitModule");
            const module = (await ModuleFactory.deploy(
                compliance.address,
                RETAIL_BPS,
                QUALIFIED_BPS,
                owner.address,
            )) as unknown as KrHoldingLimitModule;
            await module.waitForDeployment();
            const allowed = await module.moduleCheck(
                await emptyToken.getAddress(),
                ethers.ZeroAddress,
                retail.address,
                999_999n,
            );
            expect(allowed).to.equal(true);
        });
    });

    describe("admin operations", () => {
        it("owner can update limit bands", async () => {
            const { module, owner } = await loadFixture(deployFixture);
            await expect(module.connect(owner).setLimits(50n, 500n))
                .to.emit(module, "LimitsUpdated")
                .withArgs(50n, 500n);
            expect(await module.retailLimitBps()).to.equal(50n);
            expect(await module.qualifiedLimitBps()).to.equal(500n);
        });

        it("non-owner cannot update limits or qualified flag", async () => {
            const { module, outsider } = await loadFixture(deployFixture);
            await expect(
                module.connect(outsider).setLimits(50n, 500n),
            ).to.be.reverted;
            await expect(
                module
                    .connect(outsider)
                    .setQualifiedInvestor(outsider.address, true),
            ).to.be.reverted;
        });

        it("setLimits rejects out-of-band bps", async () => {
            const { module, owner } = await loadFixture(deployFixture);
            await expect(
                module.connect(owner).setLimits(0n, 500n),
            ).to.be.revertedWithCustomError(module, "InvalidLimits");
            await expect(
                module.connect(owner).setLimits(200n, 100n),
            ).to.be.revertedWithCustomError(module, "InvalidLimits");
        });
    });

    describe("post-action hooks", () => {
        it("onlyCompliance gates the action hooks", async () => {
            const { module, token, retail, outsider } = await loadFixture(deployFixture);
            // outsider is NOT the compliance address → reverts
            await expect(
                module
                    .connect(outsider)
                    .moduleTransferAction(
                        await token.getAddress(),
                        ethers.ZeroAddress,
                        retail.address,
                        100n,
                    ),
            ).to.be.revertedWithCustomError(module, "CallerNotCompliance");
        });

        it("compliance address can invoke action hooks (no-op)", async () => {
            const { module, token, compliance, retail } = await loadFixture(deployFixture);
            await expect(
                module
                    .connect(compliance)
                    .moduleTransferAction(
                        await token.getAddress(),
                        ethers.ZeroAddress,
                        retail.address,
                        100n,
                    ),
            ).to.not.be.reverted;
        });
    });
});
