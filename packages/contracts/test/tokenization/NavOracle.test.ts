import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { NavOracle } from "../../typechain-types";

async function deployFixture() {
    const [admin, writer, pauser, outsider] = await ethers.getSigners();
    const tokenAddress = ethers.Wallet.createRandom().address;
    const quoteSymbol = ethers.encodeBytes32String("KRW");
    const Factory = await ethers.getContractFactory("NavOracle");
    const oracle = (await Factory.deploy(
        tokenAddress,
        quoteSymbol,
        admin.address,
        writer.address,
        pauser.address,
    )) as unknown as NavOracle;
    await oracle.waitForDeployment();
    return { oracle, admin, writer, pauser, outsider, tokenAddress, quoteSymbol };
}

describe("NavOracle", () => {
    describe("deployment", () => {
        it("rejects zero token address", async () => {
            const [admin, writer, pauser] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("NavOracle");
            await expect(
                Factory.deploy(
                    ethers.ZeroAddress,
                    ethers.encodeBytes32String("KRW"),
                    admin.address,
                    writer.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Factory, "InvalidToken");
        });

        it("rejects empty quote symbol", async () => {
            const [admin, writer, pauser] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("NavOracle");
            await expect(
                Factory.deploy(
                    ethers.Wallet.createRandom().address,
                    ethers.ZeroHash,
                    admin.address,
                    writer.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Factory, "InvalidQuoteSymbol");
        });

        it("exposes token + quote symbol immutables", async () => {
            const { oracle, tokenAddress, quoteSymbol } = await loadFixture(deployFixture);
            expect(await oracle.token()).to.equal(tokenAddress);
            expect(await oracle.quoteSymbol()).to.equal(quoteSymbol);
        });

        it("starts at epoch 0 with zero NAV", async () => {
            const { oracle } = await loadFixture(deployFixture);
            const [epoch, navPerShare, navTimestamp] = await oracle.latest();
            expect(epoch).to.equal(0n);
            expect(navPerShare).to.equal(0n);
            expect(navTimestamp).to.equal(0n);
        });
    });

    describe("publish", () => {
        it("only WRITER_ROLE may publish", async () => {
            const { oracle, outsider } = await loadFixture(deployFixture);
            await expect(oracle.connect(outsider).publish(1n, 1n))
                .to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
        });

        it("rejects zero NAV", async () => {
            const { oracle, writer } = await loadFixture(deployFixture);
            await expect(oracle.connect(writer).publish(0n, 1n))
                .to.be.revertedWithCustomError(oracle, "InvalidNav");
        });

        it("increments epoch and stores latest values", async () => {
            const { oracle, writer } = await loadFixture(deployFixture);
            const ts1 = BigInt(await time.latest());
            await oracle.connect(writer).publish(1_000n, ts1);
            let [epoch, navPerShare, navTimestamp] = await oracle.latest();
            expect(epoch).to.equal(1n);
            expect(navPerShare).to.equal(1_000n);
            expect(navTimestamp).to.equal(ts1);

            const ts2 = ts1 + 100n;
            await oracle.connect(writer).publish(1_500n, ts2);
            [epoch, navPerShare, navTimestamp] = await oracle.latest();
            expect(epoch).to.equal(2n);
            expect(navPerShare).to.equal(1_500n);
            expect(navTimestamp).to.equal(ts2);
        });

        it("rejects stale (non-monotonic) timestamps", async () => {
            const { oracle, writer } = await loadFixture(deployFixture);
            const ts = BigInt(await time.latest());
            await oracle.connect(writer).publish(1_000n, ts);
            await expect(oracle.connect(writer).publish(2_000n, ts))
                .to.be.revertedWithCustomError(oracle, "NavStale");
            await expect(oracle.connect(writer).publish(2_000n, ts - 1n))
                .to.be.revertedWithCustomError(oracle, "NavStale");
        });

        it("emits NavPublished event", async () => {
            const { oracle, writer } = await loadFixture(deployFixture);
            const ts = BigInt(await time.latest());
            await expect(oracle.connect(writer).publish(1_234n, ts))
                .to.emit(oracle, "NavPublished")
                .withArgs(1n, 1_234n, ts, writer.address);
        });
    });

    describe("pause", () => {
        it("blocks publishes while paused", async () => {
            const { oracle, writer, pauser } = await loadFixture(deployFixture);
            await oracle.connect(pauser).pause();
            const ts = BigInt(await time.latest());
            await expect(oracle.connect(writer).publish(1n, ts))
                .to.be.revertedWithCustomError(oracle, "EnforcedPause");
        });

        it("preserves last-good values across pause", async () => {
            const { oracle, writer, pauser } = await loadFixture(deployFixture);
            const ts = BigInt(await time.latest());
            await oracle.connect(writer).publish(7n, ts);
            await oracle.connect(pauser).pause();
            const [, navPerShare] = await oracle.latest();
            expect(navPerShare).to.equal(7n);
        });

        it("only PAUSER_ROLE may pause/unpause", async () => {
            const { oracle, outsider } = await loadFixture(deployFixture);
            await expect(oracle.connect(outsider).pause())
                .to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
        });
    });
});
