import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { DividendDistributor, MockERC20 } from "../../typechain-types";

type Leaf = { holder: string; amount: bigint };

/**
 * OZ StandardMerkleTree for `(address, uint256)` builds leaves as
 *   keccak256( bytes.concat( keccak256( abi.encode(addr, amount) ) ) )
 * The contract verifies with the same scheme, so we replicate it manually
 * here to avoid bringing in the JS dependency for one test fixture.
 */
function leafHash(l: Leaf): string {
    const inner = ethers.solidityPackedKeccak256(["bytes"], [
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [l.holder, l.amount]),
    ]);
    return ethers.solidityPackedKeccak256(["bytes32"], [inner]);
}

function buildTree(leaves: Leaf[]): { root: string; proofs: Map<string, string[]> } {
    const hashed = leaves.map(leafHash);
    // Sort-pair Merkle (matches OpenZeppelin MerkleProof.verify default).
    type Layer = string[];
    const layers: Layer[] = [hashed.slice()];
    while (layers[layers.length - 1].length > 1) {
        const prev = layers[layers.length - 1];
        const next: Layer = [];
        for (let i = 0; i < prev.length; i += 2) {
            if (i + 1 === prev.length) {
                next.push(prev[i]);
            } else {
                const [a, b] = [prev[i], prev[i + 1]].sort();
                next.push(ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [a, b]));
            }
        }
        layers.push(next);
    }
    const root = layers[layers.length - 1][0];
    const proofs = new Map<string, string[]>();
    for (let i = 0; i < hashed.length; i++) {
        const proof: string[] = [];
        let idx = i;
        for (let level = 0; level < layers.length - 1; level++) {
            const layer = layers[level];
            const sibling = idx ^ 1;
            if (sibling < layer.length) proof.push(layer[sibling]);
            idx = idx >> 1;
        }
        proofs.set(leaves[i].holder.toLowerCase(), proof);
    }
    return { root, proofs };
}

async function deployFixture() {
    const [admin, distributor, pauser, alice, bob, carol, outsider] = await ethers.getSigners();
    const QuoteFactory = await ethers.getContractFactory("MockERC20");
    const quote = (await QuoteFactory.deploy("Stable", "USDX")) as unknown as MockERC20;
    await quote.waitForDeployment();
    const tokenAddress = ethers.Wallet.createRandom().address;

    const Factory = await ethers.getContractFactory("DividendDistributor");
    const dist = (await Factory.deploy(
        tokenAddress,
        await quote.getAddress(),
        admin.address,
        distributor.address,
        pauser.address,
    )) as unknown as DividendDistributor;
    await dist.waitForDeployment();

    // Fund the distributor EOA with quote asset and pre-approve the contract
    // for the high-water amount used across tests.
    await quote.mint(distributor.address, ethers.parseUnits("1000000", 18));
    await quote
        .connect(distributor)
        .approve(await dist.getAddress(), ethers.parseUnits("1000000", 18));

    return { dist, quote, admin, distributor, pauser, alice, bob, carol, outsider, tokenAddress };
}

describe("DividendDistributor", () => {
    describe("deployment", () => {
        it("rejects zero token / quote", async () => {
            const [admin, distributor, pauser] = await ethers.getSigners();
            const QuoteFactory = await ethers.getContractFactory("MockERC20");
            const quote = await QuoteFactory.deploy("S", "S");
            await quote.waitForDeployment();
            const Factory = await ethers.getContractFactory("DividendDistributor");
            await expect(
                Factory.deploy(ethers.ZeroAddress, await quote.getAddress(), admin.address, distributor.address, pauser.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidToken");
            await expect(
                Factory.deploy(ethers.Wallet.createRandom().address, ethers.ZeroAddress, admin.address, distributor.address, pauser.address),
            ).to.be.revertedWithCustomError(Factory, "InvalidQuote");
        });

        it("grants roles correctly", async () => {
            const { dist, admin, distributor, pauser } = await loadFixture(deployFixture);
            expect(await dist.hasRole(await dist.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await dist.hasRole(await dist.DISTRIBUTOR_ROLE(), distributor.address)).to.equal(true);
            expect(await dist.hasRole(await dist.PAUSER_ROLE(), pauser.address)).to.equal(true);
        });
    });

    describe("createDistribution", () => {
        it("only DISTRIBUTOR_ROLE may create", async () => {
            const { dist, outsider } = await loadFixture(deployFixture);
            const now = BigInt(await time.latest());
            await expect(
                dist.connect(outsider).createDistribution(ethers.id("any"), 1n, now, now + 86400n),
            ).to.be.revertedWithCustomError(dist, "AccessControlUnauthorizedAccount");
        });

        it("rejects zero root and zero amount", async () => {
            const { dist, distributor } = await loadFixture(deployFixture);
            const now = BigInt(await time.latest());
            await expect(
                dist.connect(distributor).createDistribution(ethers.ZeroHash, 1n, now, now + 86400n),
            ).to.be.revertedWithCustomError(dist, "InvalidRoot");
            await expect(
                dist.connect(distributor).createDistribution(ethers.id("r"), 0n, now, now + 86400n),
            ).to.be.revertedWithCustomError(dist, "InvalidAmount");
        });

        it("rejects reclaimAfter <= recordDate", async () => {
            const { dist, distributor } = await loadFixture(deployFixture);
            const now = BigInt(await time.latest());
            await expect(
                dist.connect(distributor).createDistribution(ethers.id("r"), 1n, now, now),
            ).to.be.revertedWithCustomError(dist, "InvalidReclaim");
        });

        it("pulls quote asset and emits event", async () => {
            const { dist, quote, distributor } = await loadFixture(deployFixture);
            const now = BigInt(await time.latest());
            const total = ethers.parseUnits("100", 18);
            await expect(
                dist.connect(distributor).createDistribution(ethers.id("r"), total, now, now + 86400n),
            )
                .to.emit(dist, "DistributionCreated")
                .withArgs(0n, ethers.id("r"), total, now, now + 86400n);
            expect(await quote.balanceOf(await dist.getAddress())).to.equal(total);
            expect(await dist.nextDistId()).to.equal(1n);
        });
    });

    describe("claim", () => {
        it("verifies proofs and pays out", async () => {
            const { dist, quote, distributor, alice, bob } = await loadFixture(deployFixture);
            const leaves: Leaf[] = [
                { holder: alice.address, amount: ethers.parseUnits("60", 18) },
                { holder: bob.address, amount: ethers.parseUnits("40", 18) },
            ];
            const { root, proofs } = buildTree(leaves);
            const total = leaves.reduce((s, l) => s + l.amount, 0n);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(root, total, now, now + 86400n);

            const aliceProof = proofs.get(alice.address.toLowerCase())!;
            await expect(dist.connect(alice).claim(0n, leaves[0].amount, aliceProof))
                .to.emit(dist, "Claimed")
                .withArgs(0n, alice.address, leaves[0].amount);
            expect(await quote.balanceOf(alice.address)).to.equal(leaves[0].amount);

            const bobProof = proofs.get(bob.address.toLowerCase())!;
            await dist.connect(bob).claim(0n, leaves[1].amount, bobProof);
            expect(await quote.balanceOf(bob.address)).to.equal(leaves[1].amount);
        });

        it("rejects double-claim", async () => {
            const { dist, distributor, alice, bob } = await loadFixture(deployFixture);
            const leaves: Leaf[] = [
                { holder: alice.address, amount: 100n },
                { holder: bob.address, amount: 200n },
            ];
            const { root, proofs } = buildTree(leaves);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(root, 300n, now, now + 86400n);
            const aliceProof = proofs.get(alice.address.toLowerCase())!;
            await dist.connect(alice).claim(0n, 100n, aliceProof);
            await expect(dist.connect(alice).claim(0n, 100n, aliceProof))
                .to.be.revertedWithCustomError(dist, "AlreadyClaimed");
        });

        it("rejects bad proofs and bad amounts", async () => {
            const { dist, distributor, alice, bob, carol } = await loadFixture(deployFixture);
            const leaves: Leaf[] = [
                { holder: alice.address, amount: 100n },
                { holder: bob.address, amount: 200n },
            ];
            const { root, proofs } = buildTree(leaves);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(root, 300n, now, now + 86400n);
            // wrong amount
            await expect(
                dist.connect(alice).claim(0n, 999n, proofs.get(alice.address.toLowerCase())!),
            ).to.be.revertedWithCustomError(dist, "BadProof");
            // outsider claiming someone else's amount
            await expect(
                dist.connect(carol).claim(0n, 100n, proofs.get(alice.address.toLowerCase())!),
            ).to.be.revertedWithCustomError(dist, "BadProof");
        });
    });

    describe("reclaim", () => {
        it("rejects reclaim before reclaimAfter", async () => {
            const { dist, distributor } = await loadFixture(deployFixture);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(ethers.id("r"), 100n, now, now + 86400n);
            await expect(
                dist.connect(distributor).reclaim(0n, distributor.address),
            ).to.be.revertedWithCustomError(dist, "NotReclaimable");
        });

        it("returns unclaimed remainder and freezes further claims", async () => {
            const { dist, quote, distributor, alice, bob } = await loadFixture(deployFixture);
            const leaves: Leaf[] = [
                { holder: alice.address, amount: 100n },
                { holder: bob.address, amount: 200n },
            ];
            const { root, proofs } = buildTree(leaves);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(root, 300n, now, now + 86400n);
            await dist.connect(alice).claim(0n, 100n, proofs.get(alice.address.toLowerCase())!);

            await time.increase(86400 + 1);
            const before = await quote.balanceOf(distributor.address);
            await expect(dist.connect(distributor).reclaim(0n, distributor.address))
                .to.emit(dist, "Reclaimed")
                .withArgs(0n, distributor.address, 200n);
            const after = await quote.balanceOf(distributor.address);
            expect(after - before).to.equal(200n);

            // bob can no longer claim
            await expect(
                dist.connect(bob).claim(0n, 200n, proofs.get(bob.address.toLowerCase())!),
            ).to.be.revertedWithCustomError(dist, "DistributionFrozen");
        });

        it("rejects double-reclaim", async () => {
            const { dist, distributor } = await loadFixture(deployFixture);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(ethers.id("r"), 100n, now, now + 86400n);
            await time.increase(86400 + 1);
            await dist.connect(distributor).reclaim(0n, distributor.address);
            // distribution is now frozen
            await expect(
                dist.connect(distributor).reclaim(0n, distributor.address),
            ).to.be.revertedWithCustomError(dist, "DistributionFrozen");
        });
    });

    describe("pause", () => {
        it("blocks createDistribution and claim", async () => {
            const { dist, distributor, pauser, alice } = await loadFixture(deployFixture);
            const leaves: Leaf[] = [{ holder: alice.address, amount: 100n }];
            const { root, proofs } = buildTree(leaves);
            const now = BigInt(await time.latest());
            await dist.connect(distributor).createDistribution(root, 100n, now, now + 86400n);

            await dist.connect(pauser).pause();
            await expect(
                dist.connect(distributor).createDistribution(ethers.id("r2"), 1n, now, now + 86400n),
            ).to.be.revertedWithCustomError(dist, "EnforcedPause");
            await expect(
                dist.connect(alice).claim(0n, 100n, proofs.get(alice.address.toLowerCase())!),
            ).to.be.revertedWithCustomError(dist, "EnforcedPause");
        });
    });
});
