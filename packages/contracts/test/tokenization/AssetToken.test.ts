import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type {
    AssetToken,
    DataCenterAssetRegistry,
    IdentityRegistry,
    ModularCompliance,
    MaxHoldersModule,
    CountryRestrictModule,
    LockupModule,
} from "../../typechain-types";

const ASSET_ID = ethers.id("token-asset-1");
const META = "ipfs://bafytoken-asset-1";
const KR = 410;
const US = 840;
const KP = 408; // sanctioned example
const NAME = "DataCenter Asset One";
const SYMBOL = "DCA1";
const DECIMALS = 0;
const MAX_HOLDERS = 3n;
const LOCKUP_SECONDS = 7n * 24n * 60n * 60n; // 7 days
const REASON = ethers.id("court-order-2026-04");

enum AssetStatus {
    Unregistered = 0,
    Active = 1,
    Suspended = 2,
    Retired = 3,
}

async function deployFixture() {
    const [admin, identityManager, pauser, agent, alice, bob, carol, dave, sanctioned, outsider] =
        await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        admin.address, // registrar
        admin.address, // auditor
        admin.address, // pauser
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
        admin.address, // compliance admin
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

    const MaxHolders = await ethers.getContractFactory("MaxHoldersModule");
    const maxHolders = (await MaxHolders.deploy(
        await compliance.getAddress(),
        MAX_HOLDERS,
    )) as unknown as MaxHoldersModule;
    await maxHolders.waitForDeployment();
    await compliance.connect(admin).addModule(await maxHolders.getAddress());

    const CountryRestrict = await ethers.getContractFactory("CountryRestrictModule");
    const countryRestrict = (await CountryRestrict.deploy(
        await compliance.getAddress(),
        await identity.getAddress(),
        admin.address,
    )) as unknown as CountryRestrictModule;
    await countryRestrict.waitForDeployment();
    await compliance.connect(admin).addModule(await countryRestrict.getAddress());

    const Lockup = await ethers.getContractFactory("LockupModule");
    const lockup = (await Lockup.deploy(
        await compliance.getAddress(),
        LOCKUP_SECONDS,
    )) as unknown as LockupModule;
    await lockup.waitForDeployment();
    await compliance.connect(admin).addModule(await lockup.getAddress());

    // KYC: alice (KR), bob (US), carol (KR), dave (US), sanctioned (KP)
    await identity.connect(identityManager).registerIdentity(alice.address, KR);
    await identity.connect(identityManager).registerIdentity(bob.address, US);
    await identity.connect(identityManager).registerIdentity(carol.address, KR);
    await identity.connect(identityManager).registerIdentity(dave.address, US);
    await identity.connect(identityManager).registerIdentity(sanctioned.address, KP);

    return {
        registry,
        identity,
        compliance,
        token,
        maxHolders,
        countryRestrict,
        lockup,
        admin,
        identityManager,
        pauser,
        agent,
        alice,
        bob,
        carol,
        dave,
        sanctioned,
        outsider,
    };
}

describe("AssetToken", () => {
    describe("deployment", () => {
        it("anchors immutable asset metadata", async () => {
            const { token, registry } = await loadFixture(deployFixture);
            expect(await token.assetRegistry()).to.equal(await registry.getAddress());
            expect(await token.registryAssetId()).to.equal(ASSET_ID);
            expect(await token.name()).to.equal(NAME);
            expect(await token.symbol()).to.equal(SYMBOL);
            expect(await token.decimals()).to.equal(DECIMALS);
        });

        it("rejects zero asset registry", async () => {
            const { identity, compliance, admin, agent, pauser } = await loadFixture(deployFixture);
            const Token = await ethers.getContractFactory("AssetToken");
            await expect(
                Token.deploy(
                    NAME,
                    SYMBOL,
                    DECIMALS,
                    ethers.ZeroAddress,
                    ASSET_ID,
                    await identity.getAddress(),
                    await compliance.getAddress(),
                    admin.address,
                    agent.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Token, "InvalidAssetRegistry");
        });

        it("rejects zero registry asset id", async () => {
            const { registry, identity, compliance, admin, agent, pauser } =
                await loadFixture(deployFixture);
            const Token = await ethers.getContractFactory("AssetToken");
            await expect(
                Token.deploy(
                    NAME,
                    SYMBOL,
                    DECIMALS,
                    await registry.getAddress(),
                    ethers.ZeroHash,
                    await identity.getAddress(),
                    await compliance.getAddress(),
                    admin.address,
                    agent.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Token, "InvalidRegistryAssetId");
        });

        it("rejects zero identity registry", async () => {
            const { registry, compliance, admin, agent, pauser } = await loadFixture(deployFixture);
            const Token = await ethers.getContractFactory("AssetToken");
            await expect(
                Token.deploy(
                    NAME,
                    SYMBOL,
                    DECIMALS,
                    await registry.getAddress(),
                    ASSET_ID,
                    ethers.ZeroAddress,
                    await compliance.getAddress(),
                    admin.address,
                    agent.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Token, "InvalidIdentityRegistry");
        });

        it("rejects zero compliance", async () => {
            const { registry, identity, admin, agent, pauser } = await loadFixture(deployFixture);
            const Token = await ethers.getContractFactory("AssetToken");
            await expect(
                Token.deploy(
                    NAME,
                    SYMBOL,
                    DECIMALS,
                    await registry.getAddress(),
                    ASSET_ID,
                    await identity.getAddress(),
                    ethers.ZeroAddress,
                    admin.address,
                    agent.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Token, "InvalidCompliance");
        });

        it("skips AGENT_ROLE grant when initialAgent is zero", async () => {
            const { registry, identity, compliance, admin, pauser } = await loadFixture(deployFixture);
            const Token = await ethers.getContractFactory("AssetToken");
            const t = (await Token.deploy(
                NAME,
                SYMBOL,
                DECIMALS,
                await registry.getAddress(),
                ASSET_ID,
                await identity.getAddress(),
                await compliance.getAddress(),
                admin.address,
                ethers.ZeroAddress,
                pauser.address,
            )) as unknown as AssetToken;
            await t.waitForDeployment();
            expect(await t.hasRole(await t.AGENT_ROLE(), ethers.ZeroAddress)).to.equal(false);
        });

        it("skips PAUSER_ROLE grant when initialPauser is zero", async () => {
            const { registry, identity, compliance, admin, agent } = await loadFixture(deployFixture);
            const Token = await ethers.getContractFactory("AssetToken");
            const t = (await Token.deploy(
                NAME,
                SYMBOL,
                DECIMALS,
                await registry.getAddress(),
                ASSET_ID,
                await identity.getAddress(),
                await compliance.getAddress(),
                admin.address,
                agent.address,
                ethers.ZeroAddress,
            )) as unknown as AssetToken;
            await t.waitForDeployment();
            expect(await t.hasRole(await t.PAUSER_ROLE(), ethers.ZeroAddress)).to.equal(false);
        });
    });

    describe("mint", () => {
        it("agent can mint to verified wallet, hooks compliance.created", async () => {
            const { token, agent, alice, maxHolders } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            expect(await token.balanceOf(alice.address)).to.equal(100);
            expect(await token.totalSupply()).to.equal(100);
            expect(await maxHolders.holderCount(await token.getAddress())).to.equal(1);
            expect(await maxHolders.isHolder(await token.getAddress(), alice.address)).to.equal(true);
        });

        it("rejects mint to unverified wallet", async () => {
            const { token, agent, outsider } = await loadFixture(deployFixture);
            await expect(token.connect(agent).mint(outsider.address, 100))
                .to.be.revertedWithCustomError(token, "RecipientNotVerified")
                .withArgs(outsider.address);
        });

        it("rejects mint when caller lacks AGENT_ROLE", async () => {
            const { token, outsider, alice } = await loadFixture(deployFixture);
            await expect(
                token.connect(outsider).mint(alice.address, 100),
            ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("rejects zero amount", async () => {
            const { token, agent, alice } = await loadFixture(deployFixture);
            await expect(token.connect(agent).mint(alice.address, 0)).to.be.revertedWithCustomError(
                token,
                "ZeroAmount",
            );
        });

        it("rejects mint when registry asset is suspended", async () => {
            const { token, registry, agent, admin, alice } = await loadFixture(deployFixture);
            await registry.connect(admin).setAssetStatus(ASSET_ID, AssetStatus.Suspended);
            await expect(token.connect(agent).mint(alice.address, 100)).to.be.revertedWithCustomError(
                token,
                "AssetNotActiveOnRegistry",
            );
        });

        it("rejects mint that would fail compliance (country blocked)", async () => {
            const { token, countryRestrict, admin, agent, sanctioned } =
                await loadFixture(deployFixture);
            await countryRestrict.connect(admin).blockCountry(KP);
            await expect(token.connect(agent).mint(sanctioned.address, 100))
                .to.be.revertedWithCustomError(token, "ComplianceRejected")
                .withArgs(ethers.ZeroAddress, sanctioned.address, 100);
        });

        it("rejects mint when token is paused", async () => {
            const { token, pauser, agent, alice } = await loadFixture(deployFixture);
            await token.connect(pauser).pause();
            await expect(token.connect(agent).mint(alice.address, 100)).to.be.revertedWithCustomError(
                token,
                "EnforcedPause",
            );
        });
    });

    describe("transfer", () => {
        it("verified holder can transfer to verified recipient after lockup", async () => {
            const { token, agent, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await time.increase(LOCKUP_SECONDS);
            await token.connect(alice).transfer(bob.address, 40);
            expect(await token.balanceOf(alice.address)).to.equal(60);
            expect(await token.balanceOf(bob.address)).to.equal(40);
        });

        it("rejects transfer during lockup window", async () => {
            const { token, agent, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await expect(token.connect(alice).transfer(bob.address, 40))
                .to.be.revertedWithCustomError(token, "ComplianceRejected");
        });

        it("rejects transfer to unverified wallet", async () => {
            const { token, agent, alice, outsider } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await time.increase(LOCKUP_SECONDS);
            await expect(token.connect(alice).transfer(outsider.address, 1))
                .to.be.revertedWithCustomError(token, "RecipientNotVerified")
                .withArgs(outsider.address);
        });

        it("rejects transfer to sanctioned country", async () => {
            const { token, countryRestrict, admin, agent, alice, sanctioned } =
                await loadFixture(deployFixture);
            await countryRestrict.connect(admin).blockCountry(KP);
            await token.connect(agent).mint(alice.address, 100);
            await time.increase(LOCKUP_SECONDS);
            await expect(token.connect(alice).transfer(sanctioned.address, 1))
                .to.be.revertedWithCustomError(token, "ComplianceRejected");
        });

        it("rejects transfer that would breach MaxHolders cap", async () => {
            const { token, agent, alice, bob, carol, dave } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 10);
            await token.connect(agent).mint(bob.address, 10);
            await token.connect(agent).mint(carol.address, 10);
            await time.increase(LOCKUP_SECONDS);
            // 3 holders, cap=3, transferring to dave would create a 4th holder
            await expect(token.connect(alice).transfer(dave.address, 1))
                .to.be.revertedWithCustomError(token, "ComplianceRejected");
            // transferring between existing holders is fine
            await expect(token.connect(alice).transfer(bob.address, 1)).to.not.be.reverted;
        });

        it("rejects transfer when token is paused", async () => {
            const { token, pauser, agent, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await time.increase(LOCKUP_SECONDS);
            await token.connect(pauser).pause();
            await expect(token.connect(alice).transfer(bob.address, 1)).to.be.revertedWithCustomError(
                token,
                "EnforcedPause",
            );
        });

        it("rejects transfer when registry asset retired", async () => {
            const { token, registry, admin, agent, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await time.increase(LOCKUP_SECONDS);
            await registry.connect(admin).setAssetStatus(ASSET_ID, AssetStatus.Retired);
            await expect(token.connect(alice).transfer(bob.address, 1)).to.be.revertedWithCustomError(
                token,
                "AssetNotActiveOnRegistry",
            );
        });
    });

    describe("burn", () => {
        it("agent can burn from holder, decrements MaxHolders count when balance hits zero", async () => {
            const { token, agent, alice, maxHolders } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            expect(await maxHolders.holderCount(await token.getAddress())).to.equal(1);
            await token.connect(agent).burn(alice.address, 100);
            expect(await token.balanceOf(alice.address)).to.equal(0);
            expect(await token.totalSupply()).to.equal(0);
            expect(await maxHolders.holderCount(await token.getAddress())).to.equal(0);
        });

        it("partial burn keeps holder in MaxHolders set", async () => {
            const { token, agent, alice, maxHolders } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await token.connect(agent).burn(alice.address, 30);
            expect(await maxHolders.holderCount(await token.getAddress())).to.equal(1);
            expect(await maxHolders.isHolder(await token.getAddress(), alice.address)).to.equal(true);
        });

        it("rejects burn of zero amount", async () => {
            const { token, agent, alice } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await expect(token.connect(agent).burn(alice.address, 0))
                .to.be.revertedWithCustomError(token, "ZeroAmount");
        });

        it("rejects burn when caller lacks AGENT_ROLE", async () => {
            const { token, agent, outsider, alice } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await expect(token.connect(outsider).burn(alice.address, 10))
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("rejects burn when token is paused", async () => {
            const { token, agent, pauser, alice } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await token.connect(pauser).pause();
            await expect(token.connect(agent).burn(alice.address, 10))
                .to.be.revertedWithCustomError(token, "EnforcedPause");
        });
    });

    describe("forceTransfer", () => {
        it("agent can force-transfer bypassing lockup with reason event", async () => {
            const { token, agent, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            // deliberately do NOT advance past lockup
            await expect(token.connect(agent).forceTransfer(alice.address, bob.address, 40, REASON))
                .to.emit(token, "ForcedTransfer")
                .withArgs(alice.address, bob.address, 40, agent.address, REASON);
            expect(await token.balanceOf(alice.address)).to.equal(60);
            expect(await token.balanceOf(bob.address)).to.equal(40);
        });

        it("force-transfer still requires verified recipient", async () => {
            const { token, agent, alice, outsider } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await expect(
                token.connect(agent).forceTransfer(alice.address, outsider.address, 40, REASON),
            ).to.be.revertedWithCustomError(token, "RecipientNotVerified");
        });

        it("rejects force-transfer of zero amount", async () => {
            const { token, agent, alice, bob } = await loadFixture(deployFixture);
            await expect(token.connect(agent).forceTransfer(alice.address, bob.address, 0, REASON))
                .to.be.revertedWithCustomError(token, "ZeroAmount");
        });

        it("rejects force-transfer to zero address", async () => {
            const { token, agent, alice } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await expect(
                token.connect(agent).forceTransfer(alice.address, ethers.ZeroAddress, 10, REASON),
            ).to.be.revertedWithCustomError(token, "InvalidRecoveryAddress");
        });

        it("rejects force-transfer when caller lacks AGENT_ROLE", async () => {
            const { token, agent, outsider, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await expect(
                token.connect(outsider).forceTransfer(alice.address, bob.address, 10, REASON),
            ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("rejects force-transfer when registry asset retired", async () => {
            const { token, registry, admin, agent, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await registry.connect(admin).setAssetStatus(ASSET_ID, AssetStatus.Retired);
            await expect(
                token.connect(agent).forceTransfer(alice.address, bob.address, 10, REASON),
            ).to.be.revertedWithCustomError(token, "AssetNotActiveOnRegistry");
        });

        it("rejects force-transfer when paused", async () => {
            const { token, agent, pauser, alice, bob } = await loadFixture(deployFixture);
            await token.connect(agent).mint(alice.address, 100);
            await token.connect(pauser).pause();
            await expect(
                token.connect(agent).forceTransfer(alice.address, bob.address, 10, REASON),
            ).to.be.revertedWithCustomError(token, "EnforcedPause");
        });
    });

    describe("admin updates", () => {
        it("admin can swap identity registry", async () => {
            const { token, admin } = await loadFixture(deployFixture);
            const Identity = await ethers.getContractFactory("IdentityRegistry");
            const fresh = (await Identity.deploy(
                admin.address,
                admin.address,
                admin.address,
            )) as unknown as IdentityRegistry;
            await fresh.waitForDeployment();
            await expect(token.connect(admin).setIdentityRegistry(await fresh.getAddress()))
                .to.emit(token, "IdentityRegistryUpdated");
            expect(await token.identityRegistry()).to.equal(await fresh.getAddress());
        });

        it("non-admin cannot swap identity registry", async () => {
            const { token, outsider } = await loadFixture(deployFixture);
            await expect(
                token.connect(outsider).setIdentityRegistry(outsider.address),
            ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("rejects setIdentityRegistry(0)", async () => {
            const { token, admin } = await loadFixture(deployFixture);
            await expect(token.connect(admin).setIdentityRegistry(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(token, "InvalidIdentityRegistry");
        });

        it("admin can swap compliance", async () => {
            const { token, admin } = await loadFixture(deployFixture);
            const Compliance = await ethers.getContractFactory("ModularCompliance");
            const fresh = (await Compliance.deploy(
                admin.address,
                admin.address,
            )) as unknown as ModularCompliance;
            await fresh.waitForDeployment();
            await expect(token.connect(admin).setCompliance(await fresh.getAddress()))
                .to.emit(token, "ComplianceUpdated");
            expect(await token.compliance()).to.equal(await fresh.getAddress());
        });

        it("rejects setCompliance(0)", async () => {
            const { token, admin } = await loadFixture(deployFixture);
            await expect(token.connect(admin).setCompliance(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(token, "InvalidCompliance");
        });

        it("non-admin cannot swap compliance", async () => {
            const { token, outsider } = await loadFixture(deployFixture);
            await expect(token.connect(outsider).setCompliance(outsider.address))
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });
    });

    describe("pause / unpause", () => {
        it("pauser can pause and unpause", async () => {
            const { token, pauser } = await loadFixture(deployFixture);
            await token.connect(pauser).pause();
            expect(await token.paused()).to.equal(true);
            await token.connect(pauser).unpause();
            expect(await token.paused()).to.equal(false);
        });

        it("rejects pause from non-pauser", async () => {
            const { token, outsider } = await loadFixture(deployFixture);
            await expect(token.connect(outsider).pause())
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("rejects unpause from non-pauser", async () => {
            const { token, pauser, outsider } = await loadFixture(deployFixture);
            await token.connect(pauser).pause();
            await expect(token.connect(outsider).unpause())
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });
    });
});
