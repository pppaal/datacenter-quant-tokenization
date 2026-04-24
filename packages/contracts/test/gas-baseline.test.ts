/**
 * Gas regression baselines.
 *
 * Budgets are deliberate ceilings on per-operation gas, not observations. They
 * are tuned with a small slop over the current measured cost so that routine
 * compiler/runtime changes don't trip CI, but any unexpected storage write,
 * extra SSTORE, or logic addition DOES. If a legitimate change makes a budget
 * genuinely too tight, update the number here in the same PR — reviewers will
 * see the new ceiling and can assess whether the increase is justified.
 *
 * Each case:
 *   - exercises the operation under a realistic (not minimal) payload
 *   - asserts gasUsed <= BUDGET
 *   - logs actual gas so regressions are easy to diagnose in CI logs
 *
 * Configure REPORT_GAS_DRIFT=1 to fail when actual is MORE THAN 15% below
 * budget — catches budgets that have drifted upward without the contracts
 * actually getting cheaper. (Opt-in; off by default so unrelated PRs don't
 * churn the numbers.)
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, EmergencyCouncil, NamespacedRegistrar } from "../typechain-types";

const CHECK_DRIFT = process.env.REPORT_GAS_DRIFT === "1";
const DRIFT_THRESHOLD = 0.15; // fail if >15% under budget

/**
 * Budgets (approximate — updated when intentional changes happen).
 * Values pinned after the initial measurement pass on solc 0.8.24, viaIR,
 * optimizer runs=200, evmVersion cancun.
 */
const BUDGETS = {
    // DataCenterAssetRegistry
    "registry.registerAsset": 175_000,
    "registry.updateAssetMetadata": 60_000,
    "registry.setAssetStatus": 39_000,
    "registry.anchorDocumentHash": 110_000,
    "registry.revokeDocumentHash": 46_500,
    "registry.pause": 50_000,
    "registry.unpause": 27_000,
    // EmergencyCouncil
    "council.emergencyPause": 60_500,
    "council.proposeUnpause": 105_000,
    "council.approveUnpause.nonExecuting": 62_500,
    "council.approveUnpause.executing": 73_000,
    // NamespacedRegistrar (adapter wrapping overhead baked in)
    "adapter.registerAsset": 212_000,
    "adapter.updateAssetMetadata": 71_500,
    "adapter.setAssetStatus": 49_500,
    "adapter.grantNamespaceOperator": 51_000,
    "adapter.revokeNamespaceOperator": 28_500,
} as const;

type BudgetKey = keyof typeof BUDGETS;

function assertBudget(key: BudgetKey, gasUsed: bigint) {
    const budget = BigInt(BUDGETS[key]);
    const actual = gasUsed;
    console.log(`    [gas] ${key}: ${actual} (budget ${budget})`);
    expect(actual, `${key} gas ${actual} exceeds budget ${budget}`).to.be.lessThanOrEqual(budget);
    if (CHECK_DRIFT) {
        const lowerBound = (budget * BigInt(Math.round((1 - DRIFT_THRESHOLD) * 1000))) / 1000n;
        expect(
            actual,
            `${key} gas ${actual} is >15% under budget ${budget}; tighten the budget`,
        ).to.be.greaterThanOrEqual(lowerBound);
    }
}

async function fullStackFixture() {
    const [admin, registrar, auditor, pauser, nsAdmin, opSeoul, opTokyo, m1, m2, m3] =
        await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        registrar.address,
        auditor.address,
        pauser.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();

    const Council = await ethers.getContractFactory("EmergencyCouncil");
    const council = (await Council.deploy(
        admin.address,
        await registry.getAddress(),
        2n,
    )) as unknown as EmergencyCouncil;
    await council.waitForDeployment();

    const memberRole = await council.MEMBER_ROLE();
    for (const m of [m1, m2, m3]) {
        await council.connect(admin).grantRole(memberRole, m.address);
    }

    const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
    const adapter = (await Adapter.deploy(
        admin.address,
        await registry.getAddress(),
    )) as unknown as NamespacedRegistrar;
    await adapter.waitForDeployment();

    const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
    await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, nsAdmin.address);

    return {
        registry,
        council,
        adapter,
        admin,
        registrar,
        auditor,
        pauser,
        nsAdmin,
        opSeoul,
        opTokyo,
        members: [m1, m2, m3] as const,
    };
}

async function gasUsed(txPromise: Promise<{ wait: () => Promise<{ gasUsed: bigint }> }>): Promise<bigint> {
    const tx = await txPromise;
    const receipt = await tx.wait();
    return receipt.gasUsed;
}

const META = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

// solidity-coverage instruments bytecode and inflates gas measurements;
// budgets are meaningless under coverage so skip the whole suite there.
// `npm run coverage` sets COVERAGE_RUN=1 so this stays correct whether the
// plugin exposes its own env var or not.
const UNDER_COVERAGE =
    process.env.COVERAGE_RUN === "1" ||
    process.env.SOLIDITY_COVERAGE === "true" ||
    process.env.SOLIDITY_COVERAGE === "1";
const suite = UNDER_COVERAGE ? describe.skip : describe;

suite("gas-baseline", () => {
    it("registry.registerAsset", async () => {
        const { registry, registrar } = await loadFixture(fullStackFixture);
        const used = await gasUsed(
            registry.connect(registrar).registerAsset(ethers.id("asset-1"), META),
        );
        assertBudget("registry.registerAsset", used);
    });

    it("registry.updateAssetMetadata", async () => {
        const { registry, registrar } = await loadFixture(fullStackFixture);
        const assetId = ethers.id("asset-u");
        await registry.connect(registrar).registerAsset(assetId, META);
        const used = await gasUsed(
            registry.connect(registrar).updateAssetMetadata(assetId, META + "-v2"),
        );
        assertBudget("registry.updateAssetMetadata", used);
    });

    it("registry.setAssetStatus", async () => {
        const { registry, registrar } = await loadFixture(fullStackFixture);
        const assetId = ethers.id("asset-s");
        await registry.connect(registrar).registerAsset(assetId, META);
        const used = await gasUsed(registry.connect(registrar).setAssetStatus(assetId, 2));
        assertBudget("registry.setAssetStatus", used);
    });

    it("registry.anchorDocumentHash", async () => {
        const { registry, registrar, auditor } = await loadFixture(fullStackFixture);
        const assetId = ethers.id("asset-a");
        await registry.connect(registrar).registerAsset(assetId, META);
        const used = await gasUsed(
            registry.connect(auditor).anchorDocumentHash(assetId, ethers.id("doc-1")),
        );
        assertBudget("registry.anchorDocumentHash", used);
    });

    it("registry.revokeDocumentHash", async () => {
        const { registry, registrar, auditor } = await loadFixture(fullStackFixture);
        const assetId = ethers.id("asset-r");
        const docHash = ethers.id("doc-r");
        await registry.connect(registrar).registerAsset(assetId, META);
        await registry.connect(auditor).anchorDocumentHash(assetId, docHash);
        const used = await gasUsed(
            registry.connect(auditor).revokeDocumentHash(assetId, docHash, "superseded"),
        );
        assertBudget("registry.revokeDocumentHash", used);
    });

    it("registry.pause + unpause", async () => {
        const { registry, pauser } = await loadFixture(fullStackFixture);
        const pauseGas = await gasUsed(registry.connect(pauser).pause());
        assertBudget("registry.pause", pauseGas);
        const unpauseGas = await gasUsed(registry.connect(pauser).unpause());
        assertBudget("registry.unpause", unpauseGas);
    });

    it("council.emergencyPause", async () => {
        const { registry, council, admin, pauser, members } = await loadFixture(fullStackFixture);
        // Grant PAUSER to council so emergencyPause can actually fire.
        const pauserRole = await registry.PAUSER_ROLE();
        await registry.connect(admin).grantRole(pauserRole, await council.getAddress());
        await registry.connect(admin).revokeRole(pauserRole, pauser.address);

        const used = await gasUsed(council.connect(members[0]).emergencyPause());
        assertBudget("council.emergencyPause", used);
    });

    it("council.proposeUnpause + approveUnpause (non-executing + executing)", async () => {
        const { registry, council, admin, pauser, members } = await loadFixture(fullStackFixture);
        const pauserRole = await registry.PAUSER_ROLE();
        await registry.connect(admin).grantRole(pauserRole, await council.getAddress());
        await registry.connect(admin).revokeRole(pauserRole, pauser.address);

        // Raise threshold to 3 so the second call is non-executing.
        await council.connect(admin).setUnpauseThreshold(3);
        await council.connect(members[0]).emergencyPause();

        const proposeGas = await gasUsed(council.connect(members[0]).proposeUnpause(24 * 60 * 60));
        assertBudget("council.proposeUnpause", proposeGas);

        const pid = (await council.nextProposalId()) - 1n;
        // Non-executing approve: proposer auto-voted (1), this is 2, threshold is 3.
        const nonExecGas = await gasUsed(council.connect(members[1]).approveUnpause(pid));
        assertBudget("council.approveUnpause.nonExecuting", nonExecGas);

        // Executing approve: this brings approvals to 3, which equals threshold -> executes.
        const execGas = await gasUsed(council.connect(members[2]).approveUnpause(pid));
        assertBudget("council.approveUnpause.executing", execGas);
    });

    it("adapter.registerAsset (with full handoff)", async () => {
        const { registry, adapter, admin, registrar, nsAdmin, opSeoul } =
            await loadFixture(fullStackFixture);
        const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
        await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());
        await registry.connect(admin).revokeRole(REGISTRAR_ROLE, registrar.address);

        const NS = ethers.encodeBytes32String("seoul").slice(0, 18);
        await adapter.connect(nsAdmin).grantNamespaceOperator(NS, opSeoul.address);

        const used = await gasUsed(
            adapter.connect(opSeoul).registerAsset(NS, ethers.id("asset-ns-1"), META),
        );
        assertBudget("adapter.registerAsset", used);
    });

    it("adapter.updateAssetMetadata", async () => {
        const { registry, adapter, admin, registrar, nsAdmin, opSeoul } =
            await loadFixture(fullStackFixture);
        const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
        await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());
        await registry.connect(admin).revokeRole(REGISTRAR_ROLE, registrar.address);
        const NS = ethers.encodeBytes32String("seoul").slice(0, 18);
        await adapter.connect(nsAdmin).grantNamespaceOperator(NS, opSeoul.address);
        const assetId = ethers.id("asset-ns-u");
        await adapter.connect(opSeoul).registerAsset(NS, assetId, META);

        const used = await gasUsed(
            adapter.connect(opSeoul).updateAssetMetadata(assetId, META + "-v2"),
        );
        assertBudget("adapter.updateAssetMetadata", used);
    });

    it("adapter.setAssetStatus", async () => {
        const { registry, adapter, admin, registrar, nsAdmin, opSeoul } =
            await loadFixture(fullStackFixture);
        const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
        await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());
        await registry.connect(admin).revokeRole(REGISTRAR_ROLE, registrar.address);
        const NS = ethers.encodeBytes32String("seoul").slice(0, 18);
        await adapter.connect(nsAdmin).grantNamespaceOperator(NS, opSeoul.address);
        const assetId = ethers.id("asset-ns-s");
        await adapter.connect(opSeoul).registerAsset(NS, assetId, META);

        const used = await gasUsed(adapter.connect(opSeoul).setAssetStatus(assetId, 2));
        assertBudget("adapter.setAssetStatus", used);
    });

    it("adapter.grantNamespaceOperator + revokeNamespaceOperator", async () => {
        const { adapter, nsAdmin, opTokyo } = await loadFixture(fullStackFixture);
        const NS = ethers.encodeBytes32String("tokyo").slice(0, 18);

        const grantGas = await gasUsed(
            adapter.connect(nsAdmin).grantNamespaceOperator(NS, opTokyo.address),
        );
        assertBudget("adapter.grantNamespaceOperator", grantGas);

        const revokeGas = await gasUsed(
            adapter.connect(nsAdmin).revokeNamespaceOperator(NS, opTokyo.address),
        );
        assertBudget("adapter.revokeNamespaceOperator", revokeGas);
    });
});
