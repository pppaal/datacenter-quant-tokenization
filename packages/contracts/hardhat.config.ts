import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

/**
 * SMTChecker is run opt-in via the `SMT=1` env var because the CHC engine is
 * slow (minutes) and pulls in the `z3` solver which is not always available on
 * local dev machines. CI invokes it on a dedicated job so normal test runs
 * stay fast.
 */
const smtEnabled = process.env.SMT === "1" || process.env.SMT === "true";

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: { enabled: true, runs: 200 },
            viaIR: true,
            evmVersion: "cancun",
            ...(smtEnabled
                ? {
                      modelChecker: {
                          engine: "chc",
                          solvers: ["z3"],
                          timeout: 180000,
                          targets: [
                              "assert",
                              "underflow",
                              "overflow",
                              "divByZero",
                              "constantCondition",
                              "popEmptyArray",
                              "outOfBounds",
                          ],
                          showUnproved: true,
                      },
                  }
                : {}),
        },
    },
    paths: {
        sources: "./src",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: false,
        },
        // Public L2 testnets for RWA deploys. Each entry pulls its
        // private key from PRIVATE_KEY (deployer EOA) — never commit
        // a real key. RPC URLs default to public providers; replace
        // with Alchemy / Infura URLs for production-grade RPS.
        baseSepolia: {
            url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
            chainId: 84532,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
        arbitrumSepolia: {
            url:
                process.env.ARBITRUM_SEPOLIA_RPC_URL ??
                "https://sepolia-rollup.arbitrum.io/rpc",
            chainId: 421614,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
        optimismSepolia: {
            url:
                process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io",
            chainId: 11155420,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
        // Mainnets — wired but require explicit env opt-in via DEPLOY_MAINNET=1
        // before scripts will use them. Keeps casual test commands away
        // from billable RPC calls.
        base: {
            url: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
            chainId: 8453,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
        arbitrumOne: {
            url: process.env.ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
            chainId: 42161,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
    },
    etherscan: {
        // Block-explorer verification keys per-chain. Each chain has
        // its own scanner — Basescan, Arbiscan, etc.
        apiKey: {
            baseSepolia: process.env.BASESCAN_API_KEY ?? "",
            arbitrumSepolia: process.env.ARBISCAN_API_KEY ?? "",
            optimisticSepolia: process.env.OPTIMISTIC_ETHERSCAN_API_KEY ?? "",
            base: process.env.BASESCAN_API_KEY ?? "",
            arbitrumOne: process.env.ARBISCAN_API_KEY ?? "",
        },
        customChains: [
            {
                network: "baseSepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org",
                },
            },
            {
                network: "arbitrumSepolia",
                chainId: 421614,
                urls: {
                    apiURL: "https://api-sepolia.arbiscan.io/api",
                    browserURL: "https://sepolia.arbiscan.io",
                },
            },
        ],
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v6",
    },
};

export default config;
