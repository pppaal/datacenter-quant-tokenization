/**
 * Deploy a minimal RWA stack for a single asset:
 *   1. NavOracle (per-token NAV publisher)
 *   2. Waterfall  (4-tier distribution engine)
 *
 * Usage:
 *   PRIVATE_KEY=0x... \
 *   BASE_SEPOLIA_RPC_URL=... \
 *   STABLE_TOKEN_ADDRESS=0x...USDC... \
 *   GP_ADDRESS=0x... \
 *   ASSET_TOKEN_ADDRESS=0x... \
 *   ASSET_QUOTE_SYMBOL=KRW \
 *   HURDLE_BPS=1000 \
 *   PROMOTE_BPS=1500 \
 *   npx hardhat run scripts/deploy-rwa-stack.ts --network baseSepolia
 *
 * Outputs deployed addresses to stdout in JSON. Pipe to a manifest
 * file to feed downstream apps/web/lib/blockchain config.
 */
import hre from "hardhat";

function requireEnv(key: string): string {
    const v = process.env[key];
    if (!v) {
        throw new Error(`Missing required env: ${key}`);
    }
    return v;
}

function envOrDefault(key: string, fallback: string): string {
    return process.env[key] ?? fallback;
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    console.log(JSON.stringify({
        step: "preflight",
        network,
        chainId: chainId.toString(),
        deployer: deployer.address,
    }, null, 2));

    if (chainId === 8453n || chainId === 42161n) {
        if (process.env.DEPLOY_MAINNET !== "1") {
            throw new Error(
                "Mainnet deploy detected but DEPLOY_MAINNET is not set to 1. " +
                "Set DEPLOY_MAINNET=1 to confirm.",
            );
        }
    }

    const stable = requireEnv("STABLE_TOKEN_ADDRESS");
    const gp = requireEnv("GP_ADDRESS");
    const assetToken = requireEnv("ASSET_TOKEN_ADDRESS");
    const quoteSymbol = envOrDefault("ASSET_QUOTE_SYMBOL", "KRW");
    const hurdleBps = BigInt(envOrDefault("HURDLE_BPS", "1000")); // 10%
    const promoteBps = BigInt(envOrDefault("PROMOTE_BPS", "1500")); // 15%
    const writer = envOrDefault("ORACLE_WRITER", deployer.address);
    const pauser = envOrDefault("ORACLE_PAUSER", deployer.address);

    // Convert symbol to bytes32 (right-padded ASCII).
    const symbolBytes = hre.ethers.encodeBytes32String(quoteSymbol);

    console.log(JSON.stringify({
        step: "params",
        stable,
        gp,
        assetToken,
        quoteSymbol,
        hurdleBps: hurdleBps.toString(),
        promoteBps: promoteBps.toString(),
    }, null, 2));

    // ------- 1. NavOracle -------
    const NavOracle = await hre.ethers.getContractFactory("NavOracle");
    const oracle = await NavOracle.deploy(
        assetToken,
        symbolBytes,
        deployer.address, // admin
        writer,
        pauser,
    );
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    console.log(JSON.stringify({ step: "nav-oracle-deployed", address: oracleAddress }, null, 2));

    // ------- 2. Waterfall -------
    const Waterfall = await hre.ethers.getContractFactory("Waterfall");
    const waterfall = await Waterfall.deploy(
        stable,
        gp,
        hurdleBps,
        promoteBps,
        deployer.address, // admin
    );
    await waterfall.waitForDeployment();
    const waterfallAddress = await waterfall.getAddress();
    console.log(JSON.stringify({ step: "waterfall-deployed", address: waterfallAddress }, null, 2));

    // ------- Final manifest -------
    const manifest = {
        network,
        chainId: chainId.toString(),
        deployer: deployer.address,
        contracts: {
            navOracle: oracleAddress,
            waterfall: waterfallAddress,
        },
        params: {
            assetToken,
            stable,
            gp,
            quoteSymbol,
            hurdleBps: hurdleBps.toString(),
            promoteBps: promoteBps.toString(),
        },
        timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify({ step: "manifest", manifest }, null, 2));
    console.log("\nMANIFEST_JSON_BEGIN");
    console.log(JSON.stringify(manifest, null, 2));
    console.log("MANIFEST_JSON_END");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
