import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { ModularCompliance, MaxHoldersModule } from "../../typechain-types";

async function deployFixture() {
    const [admin, complianceAdmin, fakeToken, outsider] = await ethers.getSigners();
    const Compliance = await ethers.getContractFactory("ModularCompliance");
    const compliance = (await Compliance.deploy(
        admin.address,
        complianceAdmin.address,
    )) as unknown as ModularCompliance;
    await compliance.waitForDeployment();
    return { compliance, admin, complianceAdmin, fakeToken, outsider };
}

describe("ModularCompliance", () => {
    describe("constructor", () => {
        it("skips COMPLIANCE_ADMIN_ROLE grant when initialComplianceAdmin is zero", async () => {
            const [admin] = await ethers.getSigners();
            const Compliance = await ethers.getContractFactory("ModularCompliance");
            const c = (await Compliance.deploy(
                admin.address,
                ethers.ZeroAddress,
            )) as unknown as ModularCompliance;
            await c.waitForDeployment();
            const role = await c.COMPLIANCE_ADMIN_ROLE();
            expect(await c.hasRole(role, ethers.ZeroAddress)).to.equal(false);
            expect(await c.hasRole(role, admin.address)).to.equal(false);
        });
    });

    describe("bindToken", () => {
        it("admin can bind once and emits TokenBound", async () => {
            const { compliance, complianceAdmin, fakeToken } = await loadFixture(deployFixture);
            await expect(compliance.connect(complianceAdmin).bindToken(fakeToken.address))
                .to.emit(compliance, "TokenBound")
                .withArgs(fakeToken.address);
            expect(await compliance.token()).to.equal(fakeToken.address);
        });

        it("rejects rebinding after first bind", async () => {
            const { compliance, complianceAdmin, fakeToken, outsider } =
                await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            await expect(
                compliance.connect(complianceAdmin).bindToken(outsider.address),
            ).to.be.revertedWithCustomError(compliance, "TokenAlreadyBound");
        });

        it("rejects zero token", async () => {
            const { compliance, complianceAdmin } = await loadFixture(deployFixture);
            await expect(
                compliance.connect(complianceAdmin).bindToken(ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(compliance, "InvalidToken");
        });

        it("rejects non-admin caller", async () => {
            const { compliance, outsider, fakeToken } = await loadFixture(deployFixture);
            await expect(
                compliance.connect(outsider).bindToken(fakeToken.address),
            ).to.be.revertedWithCustomError(compliance, "AccessControlUnauthorizedAccount");
        });
    });

    describe("modules", () => {
        async function withTokenBound() {
            const ctx = await loadFixture(deployFixture);
            await ctx.compliance.connect(ctx.complianceAdmin).bindToken(ctx.fakeToken.address);
            return ctx;
        }

        it("admin can add and list modules", async () => {
            const { compliance, complianceAdmin } = await withTokenBound();
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            const m = (await Module.deploy(
                await compliance.getAddress(),
                10n,
            )) as unknown as MaxHoldersModule;
            await m.waitForDeployment();

            await expect(compliance.connect(complianceAdmin).addModule(await m.getAddress()))
                .to.emit(compliance, "ModuleAdded")
                .withArgs(await m.getAddress());
            expect(await compliance.modules()).to.deep.equal([await m.getAddress()]);
            expect(await compliance.isModuleAttached(await m.getAddress())).to.equal(true);
        });

        it("rejects duplicate module", async () => {
            const { compliance, complianceAdmin } = await withTokenBound();
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            const m = (await Module.deploy(
                await compliance.getAddress(),
                10n,
            )) as unknown as MaxHoldersModule;
            await m.waitForDeployment();
            await compliance.connect(complianceAdmin).addModule(await m.getAddress());
            await expect(
                compliance.connect(complianceAdmin).addModule(await m.getAddress()),
            ).to.be.revertedWithCustomError(compliance, "ModuleAlreadyAttached");
        });

        it("admin can remove module", async () => {
            const { compliance, complianceAdmin } = await withTokenBound();
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            const m1 = (await Module.deploy(
                await compliance.getAddress(),
                10n,
            )) as unknown as MaxHoldersModule;
            await m1.waitForDeployment();
            const m2 = (await Module.deploy(
                await compliance.getAddress(),
                20n,
            )) as unknown as MaxHoldersModule;
            await m2.waitForDeployment();
            await compliance.connect(complianceAdmin).addModule(await m1.getAddress());
            await compliance.connect(complianceAdmin).addModule(await m2.getAddress());
            await expect(compliance.connect(complianceAdmin).removeModule(await m1.getAddress()))
                .to.emit(compliance, "ModuleRemoved")
                .withArgs(await m1.getAddress());
            expect(await compliance.isModuleAttached(await m1.getAddress())).to.equal(false);
            expect(await compliance.modules()).to.deep.equal([await m2.getAddress()]);
        });

        it("rejects removing non-attached module", async () => {
            const { compliance, complianceAdmin, outsider } = await withTokenBound();
            await expect(
                compliance.connect(complianceAdmin).removeModule(outsider.address),
            ).to.be.revertedWithCustomError(compliance, "ModuleNotAttached");
        });

        it("rejects addModule(0)", async () => {
            const { compliance, complianceAdmin } = await withTokenBound();
            await expect(
                compliance.connect(complianceAdmin).addModule(ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(compliance, "InvalidModule");
        });

        it("rejects addModule from non-admin", async () => {
            const { compliance, outsider } = await withTokenBound();
            await expect(
                compliance.connect(outsider).addModule(outsider.address),
            ).to.be.revertedWithCustomError(compliance, "AccessControlUnauthorizedAccount");
        });

        it("rejects removeModule from non-admin", async () => {
            const { compliance, outsider } = await withTokenBound();
            await expect(
                compliance.connect(outsider).removeModule(outsider.address),
            ).to.be.revertedWithCustomError(compliance, "AccessControlUnauthorizedAccount");
        });

        it("rejects addModule beyond MAX_MODULES cap", async () => {
            const { compliance, complianceAdmin } = await withTokenBound();
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            const cap = Number(await compliance.MAX_MODULES());
            for (let i = 0; i < cap; ++i) {
                const m = (await Module.deploy(
                    await compliance.getAddress(),
                    BigInt(i + 1),
                )) as unknown as MaxHoldersModule;
                await m.waitForDeployment();
                await compliance.connect(complianceAdmin).addModule(await m.getAddress());
            }
            const extra = (await Module.deploy(
                await compliance.getAddress(),
                999n,
            )) as unknown as MaxHoldersModule;
            await extra.waitForDeployment();
            await expect(
                compliance.connect(complianceAdmin).addModule(await extra.getAddress()),
            ).to.be.revertedWithCustomError(compliance, "TooManyModules");
        });

        it("removes the last module in the array (no swap, only pop)", async () => {
            const { compliance, complianceAdmin } = await withTokenBound();
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            const m1 = (await Module.deploy(
                await compliance.getAddress(),
                10n,
            )) as unknown as MaxHoldersModule;
            await m1.waitForDeployment();
            const m2 = (await Module.deploy(
                await compliance.getAddress(),
                20n,
            )) as unknown as MaxHoldersModule;
            await m2.waitForDeployment();
            await compliance.connect(complianceAdmin).addModule(await m1.getAddress());
            await compliance.connect(complianceAdmin).addModule(await m2.getAddress());
            // Remove the tail element (m2) so the loop's swap branch is NOT taken.
            await compliance.connect(complianceAdmin).removeModule(await m2.getAddress());
            expect(await compliance.modules()).to.deep.equal([await m1.getAddress()]);
        });
    });

    describe("hooks gating", () => {
        it("rejects transferred hook from non-token caller", async () => {
            const { compliance, complianceAdmin, fakeToken, outsider } =
                await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            await expect(
                compliance.connect(outsider).transferred(outsider.address, fakeToken.address, 1n),
            ).to.be.revertedWithCustomError(compliance, "CallerNotToken");
        });

        it("rejects hooks before binding", async () => {
            const { compliance, fakeToken } = await loadFixture(deployFixture);
            await expect(
                compliance.connect(fakeToken).transferred(fakeToken.address, fakeToken.address, 1n),
            ).to.be.revertedWithCustomError(compliance, "TokenNotBound");
        });
    });

    describe("canTransfer (no modules)", () => {
        it("returns true when no modules attached and token bound", async () => {
            const { compliance, complianceAdmin, fakeToken, outsider } =
                await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            expect(await compliance.canTransfer(fakeToken.address, outsider.address, 1n)).to.equal(true);
        });

        it("returns false when token not bound", async () => {
            const { compliance, fakeToken, outsider } = await loadFixture(deployFixture);
            expect(await compliance.canTransfer(fakeToken.address, outsider.address, 1n)).to.equal(
                false,
            );
        });
    });

    describe("canTransfer with modules", () => {
        it("returns false if any module rejects", async () => {
            const { compliance, complianceAdmin, fakeToken, outsider } =
                await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            // cap 1; first created() seats one holder. A canTransfer to a NEW
            // recipient would create a second → module returns false.
            const m = (await Module.deploy(
                await compliance.getAddress(),
                1n,
            )) as unknown as MaxHoldersModule;
            await m.waitForDeployment();
            await compliance.connect(complianceAdmin).addModule(await m.getAddress());
            const [, , , , seated] = await ethers.getSigners();
            await compliance.connect(fakeToken).created(seated.address, 10n);
            expect(
                await compliance.canTransfer(ethers.ZeroAddress, outsider.address, 1n),
            ).to.equal(false);
            // transfer among existing holders: seated→seated isn't adding a new
            // holder, so the module passes.
            expect(
                await compliance.canTransfer(seated.address, seated.address, 1n),
            ).to.equal(true);
        });
    });

    describe("hook forwarding", () => {
        it("created / transferred / destroyed reach every module", async () => {
            const { compliance, complianceAdmin, fakeToken } = await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            const Module = await ethers.getContractFactory("MaxHoldersModule");
            const m = (await Module.deploy(
                await compliance.getAddress(),
                10n,
            )) as unknown as MaxHoldersModule;
            await m.waitForDeployment();
            await compliance.connect(complianceAdmin).addModule(await m.getAddress());

            const [, , , , a, b] = await ethers.getSigners();
            await compliance.connect(fakeToken).created(a.address, 5n);
            expect(await m.holderCount(fakeToken.address)).to.equal(1);
            expect(await m.isHolder(fakeToken.address, a.address)).to.equal(true);

            // transferred → _onIn(b) adds b, _onOut(a) checks balanceOf(fakeToken, a).
            // fakeToken is an EOA so balanceOf staticcall returns no data → treated
            // as 0 → a is dropped. Net: holder count stays at 1, b is holder, a is not.
            await compliance.connect(fakeToken).transferred(a.address, b.address, 1n);
            expect(await m.isHolder(fakeToken.address, b.address)).to.equal(true);
            expect(await m.isHolder(fakeToken.address, a.address)).to.equal(false);
            expect(await m.holderCount(fakeToken.address)).to.equal(1);

            // destroyed short-circuits on a non-holder (_isHolder[a] already false),
            // exercising the early-return branch of _onOut.
            await compliance.connect(fakeToken).destroyed(a.address, 5n);
            expect(await m.isHolder(fakeToken.address, a.address)).to.equal(false);
        });

        it("created rejects non-token caller", async () => {
            const { compliance, complianceAdmin, fakeToken, outsider } =
                await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            await expect(compliance.connect(outsider).created(outsider.address, 1n))
                .to.be.revertedWithCustomError(compliance, "CallerNotToken");
        });

        it("destroyed rejects non-token caller", async () => {
            const { compliance, complianceAdmin, fakeToken, outsider } =
                await loadFixture(deployFixture);
            await compliance.connect(complianceAdmin).bindToken(fakeToken.address);
            await expect(compliance.connect(outsider).destroyed(outsider.address, 1n))
                .to.be.revertedWithCustomError(compliance, "CallerNotToken");
        });
    });
});
