/**
 * Tests for the event-based audit trail library.
 *
 * Strategy:
 *   - Deploy registry + council locally.
 *   - Drive a scripted sequence of mutating operations that exercises every
 *     decoded event type.
 *   - Rebuild the audit trail from block 0 and assert that:
 *       - Entries are chronologically ordered.
 *       - Per-asset reconstruction matches the on-chain state (status, doc counts).
 *       - Every expected event type appears at least once.
 *   - Then trigger each anomaly rule in isolation and assert it fires.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, EmergencyCouncil } from "../../typechain-types";

import registryArtifact from "../../artifacts/src/registry/DataCenterAssetRegistry.sol/DataCenterAssetRegistry.json";
import councilArtifact from "../../artifacts/src/governance/EmergencyCouncil.sol/EmergencyCouncil.json";

import { buildAuditTrail } from "../../scripts/lib/audit-trail";

const ONE_DAY = 24 * 60 * 60;

async function handedOffFixture() {
    const [admin, registrar, auditor, bootstrapPauser, m1, m2, m3] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        registrar.address,
        auditor.address,
        bootstrapPauser.address,
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

    const pauserRole = await registry.PAUSER_ROLE();
    await registry.connect(admin).grantRole(pauserRole, await council.getAddress());
    await registry.connect(admin).revokeRole(pauserRole, bootstrapPauser.address);

    return { registry, council, admin, registrar, auditor, members: [m1, m2, m3] as const };
}

async function runAudit(registry: DataCenterAssetRegistry, council: EmergencyCouncil) {
    return buildAuditTrail({
        provider: ethers.provider,
        registryAddress: await registry.getAddress(),
        registryAbi: registryArtifact.abi,
        councilAddress: await council.getAddress(),
        councilAbi: councilArtifact.abi,
        fromBlock: 0,
    });
}

describe("audit-trail", () => {
    it("captures every emitted event type in chronological order", async () => {
        const { registry, council, registrar, auditor, members } = await loadFixture(handedOffFixture);

        // Drive a representative sequence.
        const assetA = ethers.id("dc-seoul-A");
        const assetB = ethers.id("dc-seoul-B");
        const docA1 = ethers.id("doc-A-1");

        await registry.connect(registrar).registerAsset(assetA, "ipfs://a-v1");
        await registry.connect(registrar).registerAsset(assetB, "ipfs://b-v1");
        await registry.connect(registrar).updateAssetMetadata(assetA, "ipfs://a-v2");
        await registry.connect(auditor).anchorDocumentHash(assetA, docA1);
        await registry.connect(auditor).revokeDocumentHash(assetA, docA1, "superseded");
        await registry.connect(auditor).anchorDocumentHash(assetA, docA1); // re-anchor
        await registry.connect(registrar).setAssetStatus(assetB, 2); // Suspended

        // Pause + threshold-gated unpause via council.
        await council.connect(members[0]).emergencyPause();
        await council.connect(members[0]).proposeUnpause(ONE_DAY);
        const pid = (await council.nextProposalId()) - 1n;
        await council.connect(members[1]).approveUnpause(pid);

        const report = await runAudit(registry, council);

        const types = new Set(report.entries.map((e) => e.type));
        for (const expected of [
            "AssetRegistered",
            "AssetMetadataUpdated",
            "AssetStatusChanged",
            "DocumentAnchored",
            "DocumentRevoked",
            "Paused",
            "Unpaused",
            "EmergencyPause",
            "UnpauseProposed",
            "UnpauseApproved",
            "UnpauseExecuted",
            "RoleGranted",
        ]) {
            expect(types, `missing event type: ${expected}`).to.include(expected);
        }

        // Chronological order: block numbers monotonically non-decreasing and
        // within a block, logIndex monotonically increasing.
        for (let i = 1; i < report.entries.length; i++) {
            const prev = report.entries[i - 1];
            const cur = report.entries[i];
            if (cur.blockNumber === prev.blockNumber) {
                expect(cur.logIndex).to.be.greaterThan(prev.logIndex);
            } else {
                expect(cur.blockNumber).to.be.greaterThan(prev.blockNumber);
            }
        }

        // End state reflects reality: registry should be unpaused after the
        // successful 2-of-3 unpause execution.
        expect(report.endState.paused).to.equal(false);
        expect(report.endState.memberSet).to.have.lengthOf(3);
    });

    it("per-asset reconstruction matches on-chain getAsset() + isDocumentAnchored()", async () => {
        const { registry, council, registrar, auditor } = await loadFixture(handedOffFixture);

        const assetA = ethers.id("asset-reconcile");
        const doc1 = ethers.id("doc-1");
        const doc2 = ethers.id("doc-2");

        await registry.connect(registrar).registerAsset(assetA, "ipfs://initial");
        await registry.connect(registrar).updateAssetMetadata(assetA, "ipfs://final");
        await registry.connect(auditor).anchorDocumentHash(assetA, doc1);
        await registry.connect(auditor).anchorDocumentHash(assetA, doc2);
        await registry.connect(auditor).revokeDocumentHash(assetA, doc1, "");
        await registry.connect(registrar).setAssetStatus(assetA, 3); // Retired

        const report = await runAudit(registry, council);
        const reconstructed = report.assets[assetA.toLowerCase()];
        expect(reconstructed).to.exist;
        expect(reconstructed.status).to.equal("Retired");
        expect(reconstructed.metadataRef).to.equal("ipfs://final");
        expect(reconstructed.anchoredDocs.has(doc2.toLowerCase())).to.equal(true);
        expect(reconstructed.revokedDocs.has(doc1.toLowerCase())).to.equal(true);

        // Cross-check against on-chain state.
        const chain = await registry.getAsset(assetA);
        expect(Number(chain.status)).to.equal(3); // Retired enum
        expect(chain.metadataRef).to.equal("ipfs://final");
        expect(await registry.isDocumentAnchored(assetA, doc2)).to.equal(true);
        expect(await registry.isDocumentAnchored(assetA, doc1)).to.equal(false);
    });

    it("re-anchor after revoke updates reconstruction correctly (not flagged)", async () => {
        const { registry, council, registrar, auditor } = await loadFixture(handedOffFixture);

        const assetA = ethers.id("asset-reanchor");
        const doc = ethers.id("doc-r");
        await registry.connect(registrar).registerAsset(assetA, "meta");
        await registry.connect(auditor).anchorDocumentHash(assetA, doc);
        await registry.connect(auditor).revokeDocumentHash(assetA, doc, "");
        await registry.connect(auditor).anchorDocumentHash(assetA, doc);

        const report = await runAudit(registry, council);
        const a = report.assets[assetA.toLowerCase()];
        expect(a.anchoredDocs.has(doc.toLowerCase())).to.equal(true);
        expect(a.revokedDocs.has(doc.toLowerCase())).to.equal(false);
        expect(report.anomalies.filter((x) => x.rule === "OrphanDocumentRevoke")).to.have.lengthOf(0);
    });

    it("flags 'PausedAtEndOfWindow' when the registry is left paused", async () => {
        const { registry, council, members } = await loadFixture(handedOffFixture);
        await council.connect(members[0]).emergencyPause();

        const report = await runAudit(registry, council);
        const anomaly = report.anomalies.find((a) => a.rule === "PausedAtEndOfWindow");
        expect(anomaly).to.exist;
        expect(anomaly!.severity).to.equal("warn");
        expect(report.endState.paused).to.equal(true);
    });

    it("flags 'ThresholdLoweredWhilePaused' when admin lowers threshold during an active pause", async () => {
        const { registry, council, admin, members } = await loadFixture(handedOffFixture);

        await council.connect(members[0]).emergencyPause();
        // Admin lowers threshold from 2 → 1 while paused — suspicious.
        await council.connect(admin).setUnpauseThreshold(1);

        const report = await runAudit(registry, council);
        const anomaly = report.anomalies.find((a) => a.rule === "ThresholdLoweredWhilePaused");
        expect(anomaly).to.exist;
        expect(anomaly!.severity).to.equal("warn");
        expect(anomaly!.detail).to.include("2→1");
    });

    it("does not flag ThresholdLoweredWhilePaused when raising threshold or when unpaused", async () => {
        const { registry, council, admin, members } = await loadFixture(handedOffFixture);

        // Raising while paused — not suspicious.
        await council.connect(members[0]).emergencyPause();
        await council.connect(admin).setUnpauseThreshold(5);

        // Unpause via the old 2-of-3 mechanism (approvals >= 5 is impossible
        // with only 3 members, so drop threshold back down first? No — that
        // would re-trigger the warn. Instead do a direct unpause path: admin
        // grants itself PAUSER temporarily and unpauses.
        const pauserRole = await registry.PAUSER_ROLE();
        await registry.connect(admin).grantRole(pauserRole, admin.address);
        await registry.connect(admin).unpause();
        await registry.connect(admin).revokeRole(pauserRole, admin.address);

        // Lowering while unpaused — not suspicious either.
        await council.connect(admin).setUnpauseThreshold(2);

        const report = await runAudit(registry, council);
        const raisedAnomalies = report.anomalies.filter((a) => a.rule === "ThresholdLoweredWhilePaused");
        expect(raisedAnomalies).to.have.lengthOf(0);
    });

    it("serializes bigints as strings in args so output is JSON-safe", async () => {
        const { registry, council, members } = await loadFixture(handedOffFixture);
        await council.connect(members[0]).emergencyPause();
        await council.connect(members[0]).proposeUnpause(ONE_DAY);

        const report = await runAudit(registry, council);
        const proposed = report.entries.find((e) => e.type === "UnpauseProposed");
        expect(proposed).to.exist;
        // expiresAt is a uint64 — must serialize as a string, not bigint.
        expect(typeof proposed!.args.expiresAt).to.equal("string");
        // round-trips through JSON without throwing
        expect(() => JSON.stringify(report.entries)).to.not.throw();
    });
});
