import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { MockERC20, Waterfall } from "../../typechain-types";

const HURDLE_BPS = 1000n; // 10%
const PROMOTE_BPS = 1500n; // 15%

async function deployFixture() {
    const [admin, gp, lp1, lp2, lp3, outsider] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory("MockERC20");
    const stable = (await MockFactory.deploy("Mock USDC", "mUSDC")) as unknown as MockERC20;
    await stable.waitForDeployment();

    const Factory = await ethers.getContractFactory("Waterfall");
    const waterfall = (await Factory.deploy(
        await stable.getAddress(),
        gp.address,
        HURDLE_BPS,
        PROMOTE_BPS,
        admin.address,
    )) as unknown as Waterfall;
    await waterfall.waitForDeployment();

    return { waterfall, stable, admin, gp, lp1, lp2, lp3, outsider };
}

async function fundDistribution(stable: MockERC20, waterfall: Waterfall, amount: bigint) {
    const addr = await waterfall.getAddress();
    await stable.mint(addr, amount);
}

describe("Waterfall", () => {
    describe("deployment", () => {
        it("rejects zero stable / gp / hurdle / promote", async () => {
            const [admin, gp] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("Waterfall");
            await expect(
                Factory.deploy(ethers.ZeroAddress, gp.address, HURDLE_BPS, PROMOTE_BPS, admin.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidStable");
            const MockFactory = await ethers.getContractFactory("MockERC20");
            const stable = await MockFactory.deploy("X", "X");
            await expect(
                Factory.deploy(await stable.getAddress(), ethers.ZeroAddress, HURDLE_BPS, PROMOTE_BPS, admin.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidGp");
            await expect(
                Factory.deploy(await stable.getAddress(), gp.address, 0n, PROMOTE_BPS, admin.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidHurdle");
            await expect(
                Factory.deploy(await stable.getAddress(), gp.address, HURDLE_BPS, 0n, admin.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidPromote");
        });
    });

    describe("commitments", () => {
        it("registers LP on first non-zero commitment + tracks total", async () => {
            const { waterfall, admin, lp1, lp2 } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            await waterfall.connect(admin).setCommitment(lp2.address, 200n);
            expect(await waterfall.totalCommitments()).to.equal(300n);
            expect(await waterfall.lpCount()).to.equal(2);
            expect(await waterfall.lpAt(0)).to.equal(lp1.address);
            expect(await waterfall.lpAt(1)).to.equal(lp2.address);
        });

        it("non-config role cannot set commitment", async () => {
            const { waterfall, outsider, lp1 } = await loadFixture(deployFixture);
            await expect(
                waterfall.connect(outsider).setCommitment(lp1.address, 100n),
            ).to.be.reverted;
        });
    });

    describe("distribute — tier 1 (return of capital)", () => {
        it("LP gets full distribution pro-rata until totalCommitments returned", async () => {
            const { waterfall, stable, admin, lp1, lp2 } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            await waterfall.connect(admin).setCommitment(lp2.address, 300n);
            // total commitment = 400, distribute 200 → still in tier 1
            await fundDistribution(stable, waterfall, 200n);
            await waterfall.connect(admin).distribute(200n);
            // tier 1 cap = 400, so all 200 goes to return-of-capital
            // pro-rata: lp1 gets 50, lp2 gets 150
            expect(await waterfall.claimable(lp1.address)).to.equal(50n);
            expect(await waterfall.claimable(lp2.address)).to.equal(150n);
            expect(await waterfall.gpAccrued()).to.equal(0n);
        });
    });

    describe("distribute — tier 2 (preferred return)", () => {
        it("after capital returned, hurdle pool fills before catch-up", async () => {
            const { waterfall, stable, admin, lp1 } = await loadFixture(deployFixture);
            // single LP, 100 commitment, 10% hurdle = 10 units in tier 2
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            // distribute 100 (tier 1) + 5 (partial tier 2) = 105
            await fundDistribution(stable, waterfall, 105n);
            await waterfall.connect(admin).distribute(105n);
            // claimable = 100 (cap return) + 5 (partial preferred)
            expect(await waterfall.claimable(lp1.address)).to.equal(105n);
            expect(await waterfall.cumPreferred()).to.equal(5n);
            expect(await waterfall.gpAccrued()).to.equal(0n);
        });
    });

    describe("distribute — tier 3+4 (catch-up + carry)", () => {
        it("GP catch-up engages once hurdle filled, carry split applies", async () => {
            const { waterfall, stable, admin, lp1 } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            // tier 1 = 100, tier 2 = 10, tier 3 desired catchup = 10 * 1500/8500 ≈ 1
            // distribute 200: 100 cap + 10 hurdle + ~1 catchup + ~89 carry
            await fundDistribution(stable, waterfall, 200n);
            await waterfall.connect(admin).distribute(200n);
            // GP must have non-zero accrual after carry
            const gpAccrued = await waterfall.gpAccrued();
            expect(gpAccrued).to.be.greaterThan(0n);
            // LP claim = 100 (cap) + 10 (hurdle) + (carry pool * 8500/10000)
            const lp1Claim = await waterfall.claimable(lp1.address);
            expect(lp1Claim).to.be.greaterThan(100n + 10n);
        });
    });

    describe("withdraw", () => {
        it("LP pulls their balance and zeroes claimable", async () => {
            const { waterfall, stable, admin, lp1 } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            await fundDistribution(stable, waterfall, 50n);
            await waterfall.connect(admin).distribute(50n);
            expect(await waterfall.claimable(lp1.address)).to.equal(50n);
            await waterfall.connect(lp1).withdraw();
            expect(await waterfall.claimable(lp1.address)).to.equal(0n);
            expect(await stable.balanceOf(lp1.address)).to.equal(50n);
        });

        it("GP pulls accrued promote", async () => {
            const { waterfall, stable, admin, gp, lp1 } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            await fundDistribution(stable, waterfall, 200n);
            await waterfall.connect(admin).distribute(200n);
            const gpAccrued = await waterfall.gpAccrued();
            expect(gpAccrued).to.be.greaterThan(0n);
            await waterfall.connect(gp).withdrawGp();
            expect(await waterfall.gpAccrued()).to.equal(0n);
            expect(await stable.balanceOf(gp.address)).to.equal(gpAccrued);
        });

        it("non-GP cannot call withdrawGp", async () => {
            const { waterfall, outsider } = await loadFixture(deployFixture);
            await expect(
                waterfall.connect(outsider).withdrawGp(),
            ).to.be.revertedWithCustomError(waterfall, "InvalidGp");
        });
    });

    describe("pause", () => {
        it("paused state blocks distribute + withdraw", async () => {
            const { waterfall, stable, admin, lp1 } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setCommitment(lp1.address, 100n);
            await fundDistribution(stable, waterfall, 50n);
            await waterfall.connect(admin).distribute(50n);
            await waterfall.connect(admin).pause();
            await expect(waterfall.connect(lp1).withdraw()).to.be.reverted;
            await expect(
                waterfall.connect(admin).distribute(10n),
            ).to.be.reverted;
        });
    });

    describe("setWaterfallParams", () => {
        it("admin can update hurdle / promote", async () => {
            const { waterfall, admin } = await loadFixture(deployFixture);
            await waterfall.connect(admin).setWaterfallParams(800n, 2000n);
            expect(await waterfall.hurdleBps()).to.equal(800n);
            expect(await waterfall.promoteBps()).to.equal(2000n);
        });

        it("rejects out-of-band params", async () => {
            const { waterfall, admin } = await loadFixture(deployFixture);
            await expect(
                waterfall.connect(admin).setWaterfallParams(0n, 1500n),
            ).to.be.revertedWithCustomError(waterfall, "InvalidHurdle");
            await expect(
                waterfall.connect(admin).setWaterfallParams(1000n, 0n),
            ).to.be.revertedWithCustomError(waterfall, "InvalidPromote");
        });
    });
});
