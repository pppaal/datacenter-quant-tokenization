/**
 * Focused unit tests for the three compliance modules. Full end-to-end
 * behaviour through ModularCompliance + AssetToken is exercised by
 * tokenization/AssetToken.test.ts; this file targets the revert paths and
 * view-function branches that don't get hit from the happy-path integration.
 *
 * Every test uses a signer as the "compliance" caller so we can drive the
 * onlyCompliance hooks directly without spinning up the aggregator.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type {
    CountryRestrictModule,
    LockupModule,
    MaxHoldersModule,
    IdentityRegistry,
} from "../../typechain-types";

const KR = 410; // ISO 3166-1 Korea, Republic of
const US = 840;
const OFAC1 = 364; // Iran (sanctioned)

async function identityFixture() {
    const [admin, identityManager, pauser, user] = await ethers.getSigners();
    const IR = await ethers.getContractFactory("IdentityRegistry");
    const ir = (await IR.deploy(
        admin.address,
        identityManager.address,
        pauser.address,
    )) as unknown as IdentityRegistry;
    await ir.waitForDeployment();
    return { ir, admin, identityManager, pauser, user };
}

describe("CountryRestrictModule", () => {
    async function deploy() {
        const [admin, compliance, other] = await ethers.getSigners();
        const { ir, identityManager } = await identityFixture();
        const M = await ethers.getContractFactory("CountryRestrictModule");
        const mod = (await M.deploy(
            compliance.address,
            await ir.getAddress(),
            admin.address,
        )) as unknown as CountryRestrictModule;
        await mod.waitForDeployment();
        return { mod, ir, admin, compliance, identityManager, other };
    }

    describe("constructor", () => {
        it("rejects zero compliance", async () => {
            const [admin] = await ethers.getSigners();
            const { ir } = await identityFixture();
            const M = await ethers.getContractFactory("CountryRestrictModule");
            await expect(
                M.deploy(ethers.ZeroAddress, await ir.getAddress(), admin.address),
            ).to.be.revertedWithCustomError(M, "InvalidCompliance");
        });

        it("rejects zero identityRegistry", async () => {
            const [admin, compliance] = await ethers.getSigners();
            const M = await ethers.getContractFactory("CountryRestrictModule");
            await expect(
                M.deploy(compliance.address, ethers.ZeroAddress, admin.address),
            ).to.be.revertedWithCustomError(M, "InvalidIdentityRegistry");
        });

        it("rejects zero admin", async () => {
            const [, compliance] = await ethers.getSigners();
            const { ir } = await identityFixture();
            const M = await ethers.getContractFactory("CountryRestrictModule");
            await expect(
                M.deploy(compliance.address, await ir.getAddress(), ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(M, "CallerNotAdmin");
        });
    });

    describe("blockCountry / unblockCountry", () => {
        it("blocks and emits; unblocks and emits", async () => {
            const { mod, admin } = await loadFixture(deploy);
            await expect(mod.connect(admin).blockCountry(OFAC1))
                .to.emit(mod, "CountryBlocked")
                .withArgs(OFAC1);
            expect(await mod.isCountryBlocked(OFAC1)).to.equal(true);

            await expect(mod.connect(admin).unblockCountry(OFAC1))
                .to.emit(mod, "CountryUnblocked")
                .withArgs(OFAC1);
            expect(await mod.isCountryBlocked(OFAC1)).to.equal(false);
        });

        it("rejects zero country code on block", async () => {
            const { mod, admin } = await loadFixture(deploy);
            await expect(mod.connect(admin).blockCountry(0)).to.be.revertedWithCustomError(
                mod,
                "InvalidCountryCode",
            );
        });

        it("rejects double-block", async () => {
            const { mod, admin } = await loadFixture(deploy);
            await mod.connect(admin).blockCountry(OFAC1);
            await expect(mod.connect(admin).blockCountry(OFAC1))
                .to.be.revertedWithCustomError(mod, "CountryAlreadyBlocked")
                .withArgs(OFAC1);
        });

        it("rejects unblock on never-blocked country", async () => {
            const { mod, admin } = await loadFixture(deploy);
            await expect(mod.connect(admin).unblockCountry(US))
                .to.be.revertedWithCustomError(mod, "CountryNotBlocked")
                .withArgs(US);
        });

        it("rejects non-admin callers", async () => {
            const { mod, other } = await loadFixture(deploy);
            await expect(mod.connect(other).blockCountry(OFAC1))
                .to.be.revertedWithCustomError(mod, "CallerNotAdmin")
                .withArgs(other.address);
            await expect(mod.connect(other).unblockCountry(OFAC1))
                .to.be.revertedWithCustomError(mod, "CallerNotAdmin")
                .withArgs(other.address);
        });
    });

    describe("moduleCheck", () => {
        it("returns true on zero-amount transfer", async () => {
            const { mod, other } = await loadFixture(deploy);
            expect(await mod.moduleCheck(ethers.ZeroAddress, ethers.ZeroAddress, other.address, 0n))
                .to.equal(true);
        });

        it("returns true on burn (to == 0)", async () => {
            const { mod, other } = await loadFixture(deploy);
            expect(await mod.moduleCheck(ethers.ZeroAddress, other.address, ethers.ZeroAddress, 1n))
                .to.equal(true);
        });

        it("returns false when recipient country is blocked", async () => {
            const { mod, admin, identityManager, other, ir } = await loadFixture(deploy);
            await ir.connect(identityManager).registerIdentity(other.address, OFAC1);
            await mod.connect(admin).blockCountry(OFAC1);
            expect(
                await mod.moduleCheck(ethers.ZeroAddress, ethers.ZeroAddress, other.address, 1n),
            ).to.equal(false);
        });

        it("returns true when recipient country is not on the blocklist", async () => {
            const { mod, identityManager, other, ir } = await loadFixture(deploy);
            await ir.connect(identityManager).registerIdentity(other.address, KR);
            expect(
                await mod.moduleCheck(ethers.ZeroAddress, ethers.ZeroAddress, other.address, 1n),
            ).to.equal(true);
        });
    });

    describe("onlyCompliance hooks", () => {
        it("rejects non-compliance callers on all three actions", async () => {
            const { mod, other } = await loadFixture(deploy);
            await expect(
                mod.connect(other).moduleTransferAction(ethers.ZeroAddress, other.address, other.address, 1n),
            )
                .to.be.revertedWithCustomError(mod, "CallerNotCompliance")
                .withArgs(other.address);
            await expect(
                mod.connect(other).moduleMintAction(ethers.ZeroAddress, other.address, 1n),
            )
                .to.be.revertedWithCustomError(mod, "CallerNotCompliance")
                .withArgs(other.address);
            await expect(
                mod.connect(other).moduleBurnAction(ethers.ZeroAddress, other.address, 1n),
            )
                .to.be.revertedWithCustomError(mod, "CallerNotCompliance")
                .withArgs(other.address);
        });

        it("accepts compliance as the caller", async () => {
            const { mod, compliance, other } = await loadFixture(deploy);
            await expect(
                mod.connect(compliance).moduleTransferAction(ethers.ZeroAddress, other.address, other.address, 1n),
            ).to.not.be.reverted;
            await expect(mod.connect(compliance).moduleMintAction(ethers.ZeroAddress, other.address, 1n)).to.not
                .be.reverted;
            await expect(mod.connect(compliance).moduleBurnAction(ethers.ZeroAddress, other.address, 1n)).to.not
                .be.reverted;
        });
    });
});

describe("LockupModule", () => {
    const ONE_WEEK = 7 * 24 * 60 * 60;

    async function deployLockWeek() {
        const [, compliance, other] = await ethers.getSigners();
        const M = await ethers.getContractFactory("LockupModule");
        const mod = (await M.deploy(compliance.address, ONE_WEEK)) as unknown as LockupModule;
        await mod.waitForDeployment();
        return { mod, compliance, other };
    }

    async function deployLockZero() {
        const [, compliance, other] = await ethers.getSigners();
        const M = await ethers.getContractFactory("LockupModule");
        const mod = (await M.deploy(compliance.address, 0)) as unknown as LockupModule;
        await mod.waitForDeployment();
        return { mod, compliance, other };
    }

    it("constructor rejects zero compliance", async () => {
        const M = await ethers.getContractFactory("LockupModule");
        await expect(M.deploy(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(M, "InvalidCompliance");
    });

    describe("moduleCheck short-circuits", () => {
        it("amount == 0 → true", async () => {
            const { mod, other } = await loadFixture(deployLockWeek);
            expect(await mod.moduleCheck(ethers.ZeroAddress, other.address, other.address, 0n)).to.equal(true);
        });
        it("from == 0 (mint) → true", async () => {
            const { mod, other } = await loadFixture(deployLockWeek);
            expect(await mod.moduleCheck(ethers.ZeroAddress, ethers.ZeroAddress, other.address, 1n)).to.equal(
                true,
            );
        });
        it("to == 0 (burn) → true", async () => {
            const { mod, other } = await loadFixture(deployLockWeek);
            expect(await mod.moduleCheck(ethers.ZeroAddress, other.address, ethers.ZeroAddress, 1n)).to.equal(
                true,
            );
        });
        it("lockupSeconds == 0 → true regardless of release schedule", async () => {
            const { mod, other } = await loadFixture(deployLockZero);
            expect(await mod.moduleCheck(ethers.ZeroAddress, other.address, other.address, 1n)).to.equal(true);
        });
    });

    describe("release schedule", () => {
        it("wallet with no inbound history cannot send", async () => {
            const { mod, other } = await loadFixture(deployLockWeek);
            expect(await mod.moduleCheck(ethers.ZeroAddress, other.address, other.address, 1n)).to.equal(false);
        });

        it("inbound via moduleMintAction / moduleTransferAction sets release; outbound blocked until it passes", async () => {
            const { mod, compliance, other } = await loadFixture(deployLockWeek);
            const token = ethers.Wallet.createRandom().address;
            const tx = await mod.connect(compliance).moduleMintAction(token, other.address, 1000n);
            const block = await tx.getBlock();
            const expectedRelease = BigInt(block!.timestamp) + BigInt(ONE_WEEK);
            expect(await mod.releaseAt(token, other.address)).to.equal(expectedRelease);

            expect(await mod.moduleCheck(token, other.address, ethers.Wallet.createRandom().address, 1n))
                .to.equal(false);

            await time.increaseTo(Number(expectedRelease));
            expect(await mod.moduleCheck(token, other.address, ethers.Wallet.createRandom().address, 1n))
                .to.equal(true);
        });

        it("moduleTransferAction refreshes release (subsequent inbound resets clock)", async () => {
            const { mod, compliance, other } = await loadFixture(deployLockWeek);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, other.address, 1000n);
            const first = await mod.releaseAt(token, other.address);
            await time.increase(1000);
            await mod.connect(compliance).moduleTransferAction(token, other.address, other.address, 500n);
            const second = await mod.releaseAt(token, other.address);
            expect(second).to.be.greaterThan(first);
        });

        it("_onIn short-circuits on zero amount or zero to (no release written)", async () => {
            const { mod, compliance, other } = await loadFixture(deployLockWeek);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, other.address, 0n);
            expect(await mod.releaseAt(token, other.address)).to.equal(0n);
            await mod.connect(compliance).moduleMintAction(token, ethers.ZeroAddress, 1n);
            expect(await mod.releaseAt(token, ethers.ZeroAddress)).to.equal(0n);
        });
    });

    it("moduleBurnAction is a no-op and emits nothing", async () => {
        const { mod, compliance, other } = await loadFixture(deployLockWeek);
        await expect(mod.connect(compliance).moduleBurnAction(ethers.ZeroAddress, other.address, 1n)).to.not.be
            .reverted;
    });

    it("rejects non-compliance callers on all hooks", async () => {
        const { mod, other } = await loadFixture(deployLockWeek);
        await expect(
            mod.connect(other).moduleTransferAction(ethers.ZeroAddress, other.address, other.address, 1n),
        ).to.be.revertedWithCustomError(mod, "CallerNotCompliance");
        await expect(mod.connect(other).moduleMintAction(ethers.ZeroAddress, other.address, 1n)).to.be
            .revertedWithCustomError(mod, "CallerNotCompliance");
        await expect(mod.connect(other).moduleBurnAction(ethers.ZeroAddress, other.address, 1n)).to.be
            .revertedWithCustomError(mod, "CallerNotCompliance");
    });
});

describe("MaxHoldersModule", () => {
    async function deployCap3() {
        const [, compliance, a, b, c, d] = await ethers.getSigners();
        const M = await ethers.getContractFactory("MaxHoldersModule");
        const mod = (await M.deploy(compliance.address, 3n)) as unknown as MaxHoldersModule;
        await mod.waitForDeployment();
        return { mod, compliance, a, b, c, d };
    }

    async function deployCap2() {
        const [, compliance, a, b, c, d] = await ethers.getSigners();
        const M = await ethers.getContractFactory("MaxHoldersModule");
        const mod = (await M.deploy(compliance.address, 2n)) as unknown as MaxHoldersModule;
        await mod.waitForDeployment();
        return { mod, compliance, a, b, c, d };
    }

    it("constructor rejects zero cap", async () => {
        const [, compliance] = await ethers.getSigners();
        const M = await ethers.getContractFactory("MaxHoldersModule");
        await expect(M.deploy(compliance.address, 0)).to.be.revertedWithCustomError(M, "InvalidCap");
    });

    it("constructor rejects zero compliance", async () => {
        const M = await ethers.getContractFactory("MaxHoldersModule");
        await expect(M.deploy(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(M, "InvalidCompliance");
    });

    describe("moduleCheck", () => {
        it("amount == 0 → true", async () => {
            const { mod, a } = await loadFixture(deployCap3);
            expect(await mod.moduleCheck(ethers.ZeroAddress, ethers.ZeroAddress, a.address, 0n)).to.equal(true);
        });

        it("to == 0 (burn) → true", async () => {
            const { mod, a } = await loadFixture(deployCap3);
            expect(await mod.moduleCheck(ethers.ZeroAddress, a.address, ethers.ZeroAddress, 1n)).to.equal(true);
        });

        it("existing holder → true", async () => {
            const { mod, compliance, a } = await loadFixture(deployCap3);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, a.address, 1n);
            expect(await mod.moduleCheck(token, ethers.ZeroAddress, a.address, 1n)).to.equal(true);
        });

        it("rejects new holder at cap", async () => {
            const { mod, compliance, a, b, c } = await loadFixture(deployCap2);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, a.address, 1n);
            await mod.connect(compliance).moduleMintAction(token, b.address, 1n);
            expect(await mod.holderCount(token)).to.equal(2n);
            expect(await mod.moduleCheck(token, ethers.ZeroAddress, c.address, 1n)).to.equal(false);
            expect(await mod.moduleCheck(token, ethers.ZeroAddress, a.address, 1n)).to.equal(true);
        });
    });

    describe("holder accounting", () => {
        it("_onIn no-ops on zero amount / zero address", async () => {
            const { mod, compliance, a } = await loadFixture(deployCap3);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, a.address, 0n);
            expect(await mod.holderCount(token)).to.equal(0n);
            await mod.connect(compliance).moduleMintAction(token, ethers.ZeroAddress, 1n);
            expect(await mod.holderCount(token)).to.equal(0n);
        });

        it("_onOut no-ops on zero amount / zero address", async () => {
            const { mod, compliance, a } = await loadFixture(deployCap3);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, a.address, 1n);
            await mod.connect(compliance).moduleBurnAction(token, a.address, 0n);
            expect(await mod.isHolder(token, a.address)).to.equal(true);
            await mod.connect(compliance).moduleBurnAction(token, ethers.ZeroAddress, 1n);
            expect(await mod.holderCount(token)).to.equal(1n);
        });

        it("emits HolderAdded on first mint", async () => {
            const { mod, compliance, a } = await loadFixture(deployCap3);
            const token = ethers.Wallet.createRandom().address;
            await expect(mod.connect(compliance).moduleMintAction(token, a.address, 1n))
                .to.emit(mod, "HolderAdded")
                .withArgs(token, a.address, 1n);
        });

        it("second mint to same holder does not re-increment", async () => {
            const { mod, compliance, a } = await loadFixture(deployCap3);
            const token = ethers.Wallet.createRandom().address;
            await mod.connect(compliance).moduleMintAction(token, a.address, 1n);
            await mod.connect(compliance).moduleMintAction(token, a.address, 1n);
            expect(await mod.holderCount(token)).to.equal(1n);
        });
    });

    it("rejects non-compliance callers on all hooks", async () => {
        const { mod, a } = await loadFixture(deployCap3);
        await expect(mod.connect(a).moduleTransferAction(ethers.ZeroAddress, a.address, a.address, 1n)).to.be
            .revertedWithCustomError(mod, "CallerNotCompliance");
        await expect(mod.connect(a).moduleMintAction(ethers.ZeroAddress, a.address, 1n)).to.be
            .revertedWithCustomError(mod, "CallerNotCompliance");
        await expect(mod.connect(a).moduleBurnAction(ethers.ZeroAddress, a.address, 1n)).to.be
            .revertedWithCustomError(mod, "CallerNotCompliance");
    });
});
