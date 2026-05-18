import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { NavAttestor, NavOracle } from "../../typechain-types";

const KRW_BYTES32 = "0x4b52570000000000000000000000000000000000000000000000000000000000";
const ASSET_ID = ethers.keccak256(ethers.toUtf8Bytes("SEOUL-GANGSEO-01"));

const NAV_TYPES = {
    NavAttestation: [
        { name: "assetId", type: "bytes32" },
        { name: "quoteSymbol", type: "bytes32" },
        { name: "navPerShare", type: "uint256" },
        { name: "navTimestamp", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "runRef", type: "bytes32" },
    ],
} as const;

async function deployFixture() {
    const [admin, writer, pauser, signer, outsider] = await ethers.getSigners();
    const tokenAddress = ethers.Wallet.createRandom().address;

    const OracleFactory = await ethers.getContractFactory("NavOracle");
    const oracle = (await OracleFactory.deploy(
        tokenAddress,
        KRW_BYTES32,
        admin.address,
        writer.address, // writer placeholder; actual writes routed via attestor
        pauser.address,
    )) as unknown as NavOracle;
    await oracle.waitForDeployment();

    const AttestorFactory = await ethers.getContractFactory("NavAttestor");
    const attestor = (await AttestorFactory.deploy(
        await oracle.getAddress(),
        ASSET_ID,
        admin.address,
        signer.address,
        pauser.address,
    )) as unknown as NavAttestor;
    await attestor.waitForDeployment();

    // Grant NavOracle's ORACLE_WRITER_ROLE to the attestor so its
    // forwarded `publish` calls succeed.
    const writerRole = await oracle.ORACLE_WRITER_ROLE();
    await oracle.connect(admin).grantRole(writerRole, await attestor.getAddress());

    return { attestor, oracle, admin, writer, pauser, signer, outsider, tokenAddress };
}

async function buildSignature(
    attestor: NavAttestor,
    signer: any,
    overrides: Partial<{
        assetId: string;
        quoteSymbol: string;
        navPerShare: bigint;
        navTimestamp: bigint;
        nonce: bigint;
        runRef: string;
    }> = {},
) {
    const att = {
        assetId: overrides.assetId ?? ASSET_ID,
        quoteSymbol: overrides.quoteSymbol ?? KRW_BYTES32,
        navPerShare: overrides.navPerShare ?? ethers.parseUnits("1000", 18),
        navTimestamp: overrides.navTimestamp ?? BigInt(Math.floor(Date.now() / 1000)),
        nonce: overrides.nonce ?? 1n,
        runRef: overrides.runRef ?? ethers.keccak256(ethers.toUtf8Bytes("run-1")),
    };
    const network = await ethers.provider.getNetwork();
    const domain = {
        name: "NavAttestor",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: await attestor.getAddress(),
    };
    const signature = await signer.signTypedData(domain, NAV_TYPES, att);
    return { att, signature };
}

describe("NavAttestor", () => {
    describe("deployment", () => {
        it("rejects zero oracle address", async () => {
            const [admin, signer, pauser] = await ethers.getSigners();
            const Factory = await ethers.getContractFactory("NavAttestor");
            await expect(
                Factory.deploy(
                    ethers.ZeroAddress,
                    ASSET_ID,
                    admin.address,
                    signer.address,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Factory, "InvalidOracle");
        });

        it("rejects zero signer address", async () => {
            const { oracle, admin, pauser } = await loadFixture(deployFixture);
            const Factory = await ethers.getContractFactory("NavAttestor");
            await expect(
                Factory.deploy(
                    await oracle.getAddress(),
                    ASSET_ID,
                    admin.address,
                    ethers.ZeroAddress,
                    pauser.address,
                ),
            ).to.be.revertedWithCustomError(Factory, "InvalidSigner");
        });

        it("authorizes the constructor signer", async () => {
            const { attestor, signer } = await loadFixture(deployFixture);
            expect(await attestor.authorizedSigners(signer.address)).to.equal(true);
        });
    });

    describe("publish", () => {
        it("verifies signature and forwards to NavOracle", async () => {
            const { attestor, oracle, signer } = await loadFixture(deployFixture);
            const { att, signature } = await buildSignature(attestor, signer);
            await expect(
                attestor.publish(
                    att.assetId,
                    att.quoteSymbol,
                    att.navPerShare,
                    att.navTimestamp,
                    att.nonce,
                    att.runRef,
                    signature,
                ),
            ).to.emit(attestor, "AttestationPublished");
            const [, navPerShare, navTimestamp] = await oracle.latest();
            expect(navPerShare).to.equal(att.navPerShare);
            expect(navTimestamp).to.equal(att.navTimestamp);
        });

        it("rejects mismatched assetId", async () => {
            const { attestor, signer } = await loadFixture(deployFixture);
            const wrongAssetId = ethers.keccak256(ethers.toUtf8Bytes("WRONG"));
            const { att, signature } = await buildSignature(attestor, signer, {
                assetId: wrongAssetId,
            });
            await expect(
                attestor.publish(
                    att.assetId,
                    att.quoteSymbol,
                    att.navPerShare,
                    att.navTimestamp,
                    att.nonce,
                    att.runRef,
                    signature,
                ),
            ).to.be.revertedWithCustomError(attestor, "AssetMismatch");
        });

        it("rejects unauthorized signer", async () => {
            const { attestor, outsider } = await loadFixture(deployFixture);
            const { att, signature } = await buildSignature(attestor, outsider);
            await expect(
                attestor.publish(
                    att.assetId,
                    att.quoteSymbol,
                    att.navPerShare,
                    att.navTimestamp,
                    att.nonce,
                    att.runRef,
                    signature,
                ),
            ).to.be.revertedWithCustomError(attestor, "UnauthorizedSigner");
        });

        it("rejects nonce replay", async () => {
            const { attestor, signer } = await loadFixture(deployFixture);
            const ts1 = BigInt(Math.floor(Date.now() / 1000));
            const { att: att1, signature: sig1 } = await buildSignature(
                attestor,
                signer,
                { nonce: 42n, navTimestamp: ts1 },
            );
            await attestor.publish(
                att1.assetId,
                att1.quoteSymbol,
                att1.navPerShare,
                att1.navTimestamp,
                att1.nonce,
                att1.runRef,
                sig1,
            );
            // Same nonce again should revert even with a fresh timestamp.
            const { att: att2, signature: sig2 } = await buildSignature(
                attestor,
                signer,
                { nonce: 42n, navTimestamp: ts1 + 60n },
            );
            await expect(
                attestor.publish(
                    att2.assetId,
                    att2.quoteSymbol,
                    att2.navPerShare,
                    att2.navTimestamp,
                    att2.nonce,
                    att2.runRef,
                    sig2,
                ),
            ).to.be.revertedWithCustomError(attestor, "NonceUsed");
        });

        it("rejects zero navPerShare", async () => {
            const { attestor, signer } = await loadFixture(deployFixture);
            const { att, signature } = await buildSignature(attestor, signer, {
                navPerShare: 0n,
            });
            await expect(
                attestor.publish(
                    att.assetId,
                    att.quoteSymbol,
                    att.navPerShare,
                    att.navTimestamp,
                    att.nonce,
                    att.runRef,
                    signature,
                ),
            ).to.be.revertedWithCustomError(attestor, "InvalidNav");
        });
    });

    describe("signer management", () => {
        it("admin can add and remove signers", async () => {
            const { attestor, admin, outsider } = await loadFixture(deployFixture);
            await attestor
                .connect(admin)
                .setSignerAuthorization(outsider.address, true);
            expect(await attestor.authorizedSigners(outsider.address)).to.equal(true);
            await attestor
                .connect(admin)
                .setSignerAuthorization(outsider.address, false);
            expect(await attestor.authorizedSigners(outsider.address)).to.equal(false);
        });

        it("non-admin cannot manage signers", async () => {
            const { attestor, outsider } = await loadFixture(deployFixture);
            await expect(
                attestor
                    .connect(outsider)
                    .setSignerAuthorization(outsider.address, true),
            ).to.be.reverted;
        });
    });

    describe("pause", () => {
        it("pauses publish path", async () => {
            const { attestor, pauser, signer } = await loadFixture(deployFixture);
            await attestor.connect(pauser).pause();
            const { att, signature } = await buildSignature(attestor, signer);
            await expect(
                attestor.publish(
                    att.assetId,
                    att.quoteSymbol,
                    att.navPerShare,
                    att.navTimestamp,
                    att.nonce,
                    att.runRef,
                    signature,
                ),
            ).to.be.reverted;
        });
    });
});
