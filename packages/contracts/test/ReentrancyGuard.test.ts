import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { NamespacedRegistrar, ReentrantRegistry } from "../typechain-types";

/**
 * Proves that NamespacedRegistrar's `nonReentrant` modifier intercepts a
 * hostile registry. We deploy a mock registry that calls back into the
 * adapter during its own `registerAsset`/`updateAssetMetadata`/`setAssetStatus`
 * hooks — the guard must revert with ReentrancyGuardReentrantCall before any
 * inner state write.
 */
const NS = ethers.encodeBytes32String("seoul").slice(0, 18) as `0x${string}`;
const ASSET_A = ethers.id("asset-a");
const ASSET_B = ethers.id("asset-b");
const META = "ipfs://bafya";

async function deployFixture() {
    const [admin, nsAdmin, operator] = await ethers.getSigners();

    const Reentrant = await ethers.getContractFactory("ReentrantRegistry");
    const fakeRegistry = (await Reentrant.deploy()) as unknown as ReentrantRegistry;
    await fakeRegistry.waitForDeployment();

    const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
    const adapter = (await Adapter.deploy(
        admin.address,
        await fakeRegistry.getAddress(),
    )) as unknown as NamespacedRegistrar;
    await adapter.waitForDeployment();

    const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
    await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, nsAdmin.address);
    await adapter.connect(nsAdmin).grantNamespaceOperator(NS, operator.address);

    return { adapter, fakeRegistry, admin, nsAdmin, operator };
}

describe("NamespacedRegistrar — reentrancy guard", () => {
    it("reverts when the registry re-enters registerAsset during registerAsset", async () => {
        const { adapter, fakeRegistry, operator } = await loadFixture(deployFixture);
        await fakeRegistry.arm(await adapter.getAddress(), NS, ASSET_B, META, 1);
        await expect(
            adapter.connect(operator).registerAsset(NS, ASSET_A, META),
        ).to.be.revertedWithCustomError(adapter, "ReentrancyGuardReentrantCall");
    });

    it("reverts when the registry re-enters updateAssetMetadata during registerAsset", async () => {
        const { adapter, fakeRegistry, operator } = await loadFixture(deployFixture);
        // Bind ASSET_B first through a non-reentering call.
        await fakeRegistry.arm(await adapter.getAddress(), NS, ASSET_B, META, 0);
        await adapter.connect(operator).registerAsset(NS, ASSET_B, META);
        // Now arm the callback to re-enter updateAssetMetadata on ASSET_B.
        await fakeRegistry.arm(await adapter.getAddress(), NS, ASSET_B, META, 2);
        await expect(
            adapter.connect(operator).registerAsset(NS, ASSET_A, META),
        ).to.be.revertedWithCustomError(adapter, "ReentrancyGuardReentrantCall");
    });

    it("reverts when the registry re-enters setAssetStatus during registerAsset", async () => {
        const { adapter, fakeRegistry, operator } = await loadFixture(deployFixture);
        await fakeRegistry.arm(await adapter.getAddress(), NS, ASSET_B, META, 0);
        await adapter.connect(operator).registerAsset(NS, ASSET_B, META);
        await fakeRegistry.arm(await adapter.getAddress(), NS, ASSET_B, META, 3);
        await expect(
            adapter.connect(operator).registerAsset(NS, ASSET_A, META),
        ).to.be.revertedWithCustomError(adapter, "ReentrancyGuardReentrantCall");
    });
});
