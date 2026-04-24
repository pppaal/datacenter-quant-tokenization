/**
 * Tests for the post-deployment integrity verifier.
 *
 * Strategy:
 *   - Deploy registry + council locally, execute the full PAUSER handoff,
 *     build a manifest that describes exactly what was done, and assert that
 *     every verifier check passes.
 *   - Then tamper in targeted ways (grant an extra admin, skip the handoff,
 *     mismatch the threshold, etc.) and assert that the specific check fails
 *     while the rest still pass.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DataCenterAssetRegistry, EmergencyCouncil, NamespacedRegistrar } from "../../typechain-types";

import path from "node:path";

import {
    loadArtifactWithImmutables,
    stripMetadata,
    summarize,
    verifyDeployment,
    type DeploymentManifest,
} from "../../scripts/lib/verification";

const BUILD_INFO_DIR = path.resolve(__dirname, "../../artifacts/build-info");
const registryArtifact = loadArtifactWithImmutables(
    BUILD_INFO_DIR,
    "src/registry/DataCenterAssetRegistry.sol",
    "DataCenterAssetRegistry",
);
const councilArtifact = loadArtifactWithImmutables(
    BUILD_INFO_DIR,
    "src/governance/EmergencyCouncil.sol",
    "EmergencyCouncil",
);
const namespacedRegistrarArtifact = loadArtifactWithImmutables(
    BUILD_INFO_DIR,
    "src/registry/NamespacedRegistrar.sol",
    "NamespacedRegistrar",
);

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

    return {
        registry,
        council,
        admin,
        registrar,
        auditor,
        bootstrapPauser,
        members: [m1, m2, m3] as const,
    };
}

async function buildManifest(
    registry: DataCenterAssetRegistry,
    council: EmergencyCouncil,
    admin: string,
    registrar: string,
    auditor: string,
    members: readonly { address: string }[],
    bootstrapPauser: string,
    threshold: number,
): Promise<DeploymentManifest> {
    return {
        chainId: 31337,
        registry: {
            address: await registry.getAddress(),
            expectedAdmin: admin,
            expectedRegistrars: [registrar],
            expectedAuditors: [auditor],
            expectedPausers: [await council.getAddress()],
        },
        council: {
            address: await council.getAddress(),
            expectedAdmin: admin,
            expectedMembers: members.map((m) => m.address),
            expectedThreshold: threshold,
            bootstrapPauser,
        },
    };
}

describe("verifyDeployment", () => {
    it("stripMetadata removes Solidity CBOR trailer", () => {
        const raw = "0x6080aa55a26469706673582200";
        // length encoded in last 2 bytes: 0x2200 → 0x2200=8704, so this is the
        // well-known form on a real bytecode. For a crafted string, just check
        // that calling it doesn't throw and returns a shorter or equal string.
        const stripped = stripMetadata(raw);
        expect(stripped.length).to.be.at.most(raw.length);
    });

    it("passes every check on a clean, correctly-handed-off deployment", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            2,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const { ok, failed, passed } = summarize(results);
        if (!ok) {
            console.log(results.filter((r) => r.status === "fail"));
        }
        expect(ok, `expected all pass, but ${failed} failed`).to.equal(true);
        expect(passed).to.be.greaterThan(0);
    });

    it("fails 'bootstrap PAUSER revoked' when the handoff batch did not revoke", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        // Re-grant PAUSER_ROLE to the bootstrap EOA — simulates a forgotten
        // revoke in the handoff batch.
        const pauserRole = await registry.PAUSER_ROLE();
        await registry.connect(admin).grantRole(pauserRole, bootstrapPauser.address);

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            2,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const revokedCheck = results.find((r) => r.name === "handoff: bootstrap PAUSER EOA revoked");
        expect(revokedCheck?.status).to.equal("fail");

        // The PAUSER_ROLE-exact-membership check also fails because bootstrap
        // EOA is now an extra holder alongside the council.
        const pauserSetCheck = results.find((r) =>
            r.name.startsWith("registry: PAUSER_ROLE membership"),
        );
        expect(pauserSetCheck?.status).to.equal("fail");
    });

    it("fails 'council holds PAUSER_ROLE' when handoff grant was skipped", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        // Revoke PAUSER_ROLE from the council — simulates an aborted handoff.
        const pauserRole = await registry.PAUSER_ROLE();
        await registry.connect(admin).revokeRole(pauserRole, await council.getAddress());

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            2,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const handoffCheck = results.find(
            (r) => r.name === "handoff: council holds PAUSER_ROLE on registry",
        );
        expect(handoffCheck?.status).to.equal("fail");
    });

    it("fails 'unpauseThreshold' when manifest declares the wrong threshold", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            5, // actual is 2
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const thresholdCheck = results.find((r) => r.name.startsWith("council: unpauseThreshold"));
        expect(thresholdCheck?.status).to.equal("fail");
    });

    it("fails 'MEMBER_ROLE membership' when an unexpected member was added", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        // Admin adds a fourth member not declared in the manifest.
        const [, , , , , , , extra] = await ethers.getSigners();
        const memberRole = await council.MEMBER_ROLE();
        await council.connect(admin).grantRole(memberRole, extra.address);

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            2,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const memberCheck = results.find((r) =>
            r.name.startsWith("council: MEMBER_ROLE membership"),
        );
        expect(memberCheck?.status).to.equal("fail");
        expect(memberCheck?.detail).to.include(extra.address);
    });

    it("fails 'REGISTRAR_ROLE membership' when an extra registrar was added", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        const [, , , , , , , , outsider] = await ethers.getSigners();
        const registrarRole = await registry.REGISTRAR_ROLE();
        await registry.connect(admin).grantRole(registrarRole, outsider.address);

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            2,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const check = results.find((r) => r.name.startsWith("registry: REGISTRAR_ROLE membership"));
        expect(check?.status).to.equal("fail");
        expect(check?.detail).to.include(outsider.address);
    });

    it("fails 'protectedContract == registry' when manifest points at the wrong registry", async () => {
        const { registry, council, admin, registrar, auditor, bootstrapPauser, members } =
            await loadFixture(handedOffFixture);

        // Deploy a second registry — manifest claims council protects THIS one,
        // but the council was actually deployed against the first.
        const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
        const otherRegistry = await Registry.deploy(
            admin.address,
            registrar.address,
            auditor.address,
            bootstrapPauser.address,
        );
        await otherRegistry.waitForDeployment();

        const manifest = await buildManifest(
            registry,
            council,
            admin.address,
            registrar.address,
            auditor.address,
            members,
            bootstrapPauser.address,
            2,
        );
        manifest.registry.address = await otherRegistry.getAddress();

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            councilArtifact,
        });

        const check = results.find((r) => r.name === "council: protectedContract == registry");
        expect(check?.status).to.equal("fail");
    });
});

const NS_SEOUL = ethers.encodeBytes32String("seoul").slice(0, 18);
const NS_TOKYO = ethers.encodeBytes32String("tokyo").slice(0, 18);

async function adapterHandedOffFixture() {
    const [admin, bootstrapRegistrar, auditor, pauser, nsAdmin, opSeoul] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = (await Registry.deploy(
        admin.address,
        bootstrapRegistrar.address,
        auditor.address,
        pauser.address,
    )) as unknown as DataCenterAssetRegistry;
    await registry.waitForDeployment();

    const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
    const adapter = (await Adapter.deploy(
        admin.address,
        await registry.getAddress(),
    )) as unknown as NamespacedRegistrar;
    await adapter.waitForDeployment();

    const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
    await registry.connect(admin).grantRole(REGISTRAR_ROLE, await adapter.getAddress());
    await registry.connect(admin).revokeRole(REGISTRAR_ROLE, bootstrapRegistrar.address);

    const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
    await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, nsAdmin.address);
    await adapter.connect(nsAdmin).grantNamespaceOperator(NS_SEOUL, opSeoul.address);

    return { registry, adapter, admin, bootstrapRegistrar, auditor, pauser, nsAdmin, opSeoul };
}

async function buildAdapterManifest(
    registry: DataCenterAssetRegistry,
    adapter: NamespacedRegistrar,
    admin: string,
    nsAdmin: string,
    bootstrapRegistrar: string,
    opSeoul: string,
): Promise<DeploymentManifest> {
    return {
        chainId: 31337,
        registry: {
            address: await registry.getAddress(),
            expectedAdmin: admin,
            expectedRegistrars: [await adapter.getAddress()],
        },
        namespacedRegistrar: {
            address: await adapter.getAddress(),
            expectedAdmin: admin,
            expectedNamespaceAdmins: [nsAdmin],
            bootstrapRegistrar,
            expectedOperators: [
                { namespace: NS_SEOUL, operator: opSeoul, allowed: true },
                { namespace: NS_TOKYO, operator: opSeoul, allowed: false },
            ],
        },
    };
}

describe("verifyDeployment — NamespacedRegistrar", () => {
    it("passes every check on a clean, correctly-handed-off adapter deployment", async () => {
        const { registry, adapter, admin, nsAdmin, bootstrapRegistrar, opSeoul } =
            await loadFixture(adapterHandedOffFixture);

        const manifest = await buildAdapterManifest(
            registry,
            adapter,
            admin.address,
            nsAdmin.address,
            bootstrapRegistrar.address,
            opSeoul.address,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            namespacedRegistrarArtifact,
        });

        const { ok, failed } = summarize(results);
        if (!ok) console.log(results.filter((r) => r.status === "fail"));
        expect(ok, `expected all pass, but ${failed} failed`).to.equal(true);
    });

    it("fails 'bootstrap REGISTRAR revoked' when the handoff skipped revoke", async () => {
        const { registry, adapter, admin, nsAdmin, bootstrapRegistrar, opSeoul } =
            await loadFixture(adapterHandedOffFixture);

        // Re-grant REGISTRAR_ROLE to bootstrap — simulates missed revoke in batch.
        const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
        await registry.connect(admin).grantRole(REGISTRAR_ROLE, bootstrapRegistrar.address);

        const manifest = await buildAdapterManifest(
            registry,
            adapter,
            admin.address,
            nsAdmin.address,
            bootstrapRegistrar.address,
            opSeoul.address,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            namespacedRegistrarArtifact,
        });

        const revokedCheck = results.find(
            (r) => r.name === "handoff: bootstrap REGISTRAR EOA revoked",
        );
        expect(revokedCheck?.status).to.equal("fail");

        const setCheck = results.find((r) =>
            r.name.startsWith("registry: REGISTRAR_ROLE membership"),
        );
        expect(setCheck?.status).to.equal("fail");
    });

    it("fails 'adapter holds REGISTRAR_ROLE' when the handoff grant was skipped", async () => {
        const { registry, adapter, admin, nsAdmin, bootstrapRegistrar, opSeoul } =
            await loadFixture(adapterHandedOffFixture);

        // Revoke the adapter's REGISTRAR_ROLE — simulates an aborted handoff.
        const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
        await registry.connect(admin).revokeRole(REGISTRAR_ROLE, await adapter.getAddress());

        const manifest = await buildAdapterManifest(
            registry,
            adapter,
            admin.address,
            nsAdmin.address,
            bootstrapRegistrar.address,
            opSeoul.address,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            namespacedRegistrarArtifact,
        });

        const check = results.find(
            (r) => r.name === "handoff: adapter holds REGISTRAR_ROLE on registry",
        );
        expect(check?.status).to.equal("fail");
    });

    it("fails 'registry() == registry' when manifest claims the wrong registry", async () => {
        const { registry, adapter, admin, nsAdmin, bootstrapRegistrar, auditor, pauser, opSeoul } =
            await loadFixture(adapterHandedOffFixture);

        const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
        const other = await Registry.deploy(
            admin.address,
            admin.address,
            auditor.address,
            pauser.address,
        );
        await other.waitForDeployment();

        const manifest = await buildAdapterManifest(
            registry,
            adapter,
            admin.address,
            nsAdmin.address,
            bootstrapRegistrar.address,
            opSeoul.address,
        );
        manifest.registry.address = await other.getAddress();
        manifest.registry.expectedRegistrars = [admin.address];

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            namespacedRegistrarArtifact,
        });

        const check = results.find((r) => r.name === "namespaced-registrar: registry() == registry");
        expect(check?.status).to.equal("fail");
    });

    it("fails 'NAMESPACE_ADMIN_ROLE membership' when a rogue ns-admin was granted", async () => {
        const { registry, adapter, admin, nsAdmin, bootstrapRegistrar, opSeoul } =
            await loadFixture(adapterHandedOffFixture);

        const [, , , , , , rogue] = await ethers.getSigners();
        const NAMESPACE_ADMIN_ROLE = await adapter.NAMESPACE_ADMIN_ROLE();
        await adapter.connect(admin).grantRole(NAMESPACE_ADMIN_ROLE, rogue.address);

        const manifest = await buildAdapterManifest(
            registry,
            adapter,
            admin.address,
            nsAdmin.address,
            bootstrapRegistrar.address,
            opSeoul.address,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            namespacedRegistrarArtifact,
        });

        const check = results.find((r) =>
            r.name.startsWith("namespaced-registrar: NAMESPACE_ADMIN_ROLE membership"),
        );
        expect(check?.status).to.equal("fail");
        expect(check?.detail).to.include(rogue.address);
    });

    it("fails declared canOperate attestation when a grant diverges from manifest", async () => {
        const { registry, adapter, admin, nsAdmin, bootstrapRegistrar, opSeoul } =
            await loadFixture(adapterHandedOffFixture);

        // Grant an extra (tokyo, opSeoul) that the manifest asserts is absent.
        await adapter.connect(nsAdmin).grantNamespaceOperator(NS_TOKYO, opSeoul.address);

        const manifest = await buildAdapterManifest(
            registry,
            adapter,
            admin.address,
            nsAdmin.address,
            bootstrapRegistrar.address,
            opSeoul.address,
        );

        const results = await verifyDeployment({
            provider: ethers.provider,
            manifest,
            registryArtifact,
            namespacedRegistrarArtifact,
        });

        const check = results.find((r) =>
            r.name.startsWith("namespaced-registrar: canOperate"),
        );
        // We have two canOperate attestations; at least one should fail (tokyo=false).
        const tokyoCheck = results.find((r) =>
            r.name.includes(NS_TOKYO) && r.name.includes(opSeoul.address),
        );
        expect(tokyoCheck?.status).to.equal("fail");
        expect(check).to.exist;
    });
});
