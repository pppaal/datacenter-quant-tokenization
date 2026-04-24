import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { IdentityRegistry } from "../../typechain-types";

const KR = 410;
const US = 840;

async function deployFixture() {
    const [admin, identityManager, pauser, alice, bob, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("IdentityRegistry");
    const registry = (await Factory.deploy(
        admin.address,
        identityManager.address,
        pauser.address,
    )) as unknown as IdentityRegistry;
    await registry.waitForDeployment();
    return { registry, admin, identityManager, pauser, alice, bob, outsider };
}

describe("IdentityRegistry", () => {
    describe("deployment & roles", () => {
        it("grants DEFAULT_ADMIN_ROLE to initial admin", async () => {
            const { registry, admin } = await loadFixture(deployFixture);
            const role = await registry.DEFAULT_ADMIN_ROLE();
            expect(await registry.hasRole(role, admin.address)).to.equal(true);
        });

        it("grants operational roles to initial holders", async () => {
            const { registry, identityManager, pauser } = await loadFixture(deployFixture);
            expect(
                await registry.hasRole(await registry.IDENTITY_MANAGER_ROLE(), identityManager.address),
            ).to.equal(true);
            expect(await registry.hasRole(await registry.PAUSER_ROLE(), pauser.address)).to.equal(true);
        });

        it("enforces 3-day timelock on admin handoff", async () => {
            const { registry } = await loadFixture(deployFixture);
            expect(await registry.defaultAdminDelay()).to.equal(3n * 24n * 60n * 60n);
        });

        it("skips role grants when initial holder is address(0)", async () => {
            const [admin] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("IdentityRegistry");
            const bare = (await Factory.deploy(
                admin.address,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
            )) as unknown as IdentityRegistry;
            await bare.waitForDeployment();
            expect(await bare.hasRole(await bare.IDENTITY_MANAGER_ROLE(), ethers.ZeroAddress)).to.equal(false);
            expect(await bare.hasRole(await bare.PAUSER_ROLE(), ethers.ZeroAddress)).to.equal(false);
        });
    });

    describe("registerIdentity", () => {
        it("registers wallet and emits IdentityRegistered", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await expect(registry.connect(identityManager).registerIdentity(alice.address, KR))
                .to.emit(registry, "IdentityRegistered")
                .withArgs(alice.address, KR, identityManager.address);
            expect(await registry.isVerified(alice.address)).to.equal(true);
            expect(await registry.countryOf(alice.address)).to.equal(KR);
        });

        it("reverts when caller lacks IDENTITY_MANAGER_ROLE", async () => {
            const { registry, outsider, alice } = await loadFixture(deployFixture);
            await expect(
                registry.connect(outsider).registerIdentity(alice.address, KR),
            ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
        });

        it("reverts on zero wallet", async () => {
            const { registry, identityManager } = await loadFixture(deployFixture);
            await expect(
                registry.connect(identityManager).registerIdentity(ethers.ZeroAddress, KR),
            ).to.be.revertedWithCustomError(registry, "InvalidWallet");
        });

        it("reverts on zero country code", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await expect(
                registry.connect(identityManager).registerIdentity(alice.address, 0),
            ).to.be.revertedWithCustomError(registry, "InvalidCountryCode");
        });

        it("reverts when wallet already registered", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(
                registry.connect(identityManager).registerIdentity(alice.address, KR),
            ).to.be.revertedWithCustomError(registry, "IdentityAlreadyRegistered");
        });
    });

    describe("removeIdentity", () => {
        it("removes wallet and emits IdentityRemoved", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(registry.connect(identityManager).removeIdentity(alice.address))
                .to.emit(registry, "IdentityRemoved")
                .withArgs(alice.address, identityManager.address);
            expect(await registry.isVerified(alice.address)).to.equal(false);
            expect(await registry.countryOf(alice.address)).to.equal(0);
        });

        it("reverts when wallet not registered", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await expect(
                registry.connect(identityManager).removeIdentity(alice.address),
            ).to.be.revertedWithCustomError(registry, "IdentityNotRegistered");
        });
    });

    describe("updateCountry", () => {
        it("updates country and emits CountryUpdated", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(registry.connect(identityManager).updateCountry(alice.address, US))
                .to.emit(registry, "CountryUpdated")
                .withArgs(alice.address, KR, US);
            expect(await registry.countryOf(alice.address)).to.equal(US);
        });

        it("reverts on same country", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(
                registry.connect(identityManager).updateCountry(alice.address, KR),
            ).to.be.revertedWithCustomError(registry, "SameCountry");
        });

        it("reverts on unregistered wallet", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await expect(
                registry.connect(identityManager).updateCountry(alice.address, KR),
            ).to.be.revertedWithCustomError(registry, "IdentityNotRegistered");
        });

        it("reverts on zero country", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(
                registry.connect(identityManager).updateCountry(alice.address, 0),
            ).to.be.revertedWithCustomError(registry, "InvalidCountryCode");
        });
    });

    describe("pause", () => {
        it("pauser can pause and unpause", async () => {
            const { registry, pauser, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(pauser).pause();
            await expect(
                registry.connect(identityManager).registerIdentity(alice.address, KR),
            ).to.be.revertedWithCustomError(registry, "EnforcedPause");
            await registry.connect(pauser).unpause();
            await expect(registry.connect(identityManager).registerIdentity(alice.address, KR))
                .to.emit(registry, "IdentityRegistered");
        });

        it("rejects pause from non-pauser", async () => {
            const { registry, outsider } = await loadFixture(deployFixture);
            await expect(registry.connect(outsider).pause())
                .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
        });

        it("rejects unpause from non-pauser", async () => {
            const { registry, pauser, outsider } = await loadFixture(deployFixture);
            await registry.connect(pauser).pause();
            await expect(registry.connect(outsider).unpause())
                .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
        });

        it("pause gates removeIdentity and updateCountry", async () => {
            const { registry, pauser, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await registry.connect(pauser).pause();
            await expect(registry.connect(identityManager).removeIdentity(alice.address))
                .to.be.revertedWithCustomError(registry, "EnforcedPause");
            await expect(registry.connect(identityManager).updateCountry(alice.address, US))
                .to.be.revertedWithCustomError(registry, "EnforcedPause");
        });
    });

    describe("role gating on writes", () => {
        it("rejects removeIdentity from non-manager", async () => {
            const { registry, identityManager, outsider, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(registry.connect(outsider).removeIdentity(alice.address))
                .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
        });

        it("rejects updateCountry from non-manager", async () => {
            const { registry, identityManager, outsider, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            await expect(registry.connect(outsider).updateCountry(alice.address, US))
                .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
        });
    });

    describe("view helpers", () => {
        it("getIdentity returns the record for a registered wallet", async () => {
            const { registry, identityManager, alice } = await loadFixture(deployFixture);
            await registry.connect(identityManager).registerIdentity(alice.address, KR);
            const rec = await registry.getIdentity(alice.address);
            expect(rec.registered).to.equal(true);
            expect(rec.countryCode).to.equal(KR);
            expect(rec.registeredAt).to.be.greaterThan(0n);
        });

        it("getIdentity returns zero-record for unknown wallet", async () => {
            const { registry, outsider } = await loadFixture(deployFixture);
            const rec = await registry.getIdentity(outsider.address);
            expect(rec.registered).to.equal(false);
            expect(rec.countryCode).to.equal(0);
            expect(rec.registeredAt).to.equal(0n);
        });

        it("countryOf returns 0 for unknown wallet", async () => {
            const { registry, outsider } = await loadFixture(deployFixture);
            expect(await registry.countryOf(outsider.address)).to.equal(0);
        });

        it("isVerified returns false for unknown wallet", async () => {
            const { registry, outsider } = await loadFixture(deployFixture);
            expect(await registry.isVerified(outsider.address)).to.equal(false);
        });
    });
});
