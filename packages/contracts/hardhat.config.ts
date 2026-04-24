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
