/**
 * Deploy the tokenization stack for ONE asset.
 *
 * Inputs (env):
 *   ASSET_REGISTRY    — DataCenterAssetRegistry address (must already exist)
 *   REGISTRY_ASSET_ID — bytes32 id under which the asset is registered
 *   TOKEN_NAME        — ERC-20 name (e.g. "Apgujeong DC One")
 *   TOKEN_SYMBOL      — ERC-20 symbol (e.g. "APDC1")
 *   TOKEN_DECIMALS    — typically 0 for share tokens
 *
 *   ADMIN_ADDRESS              — DEFAULT_ADMIN on every contract (Safe on non-local)
 *   IDENTITY_MANAGER_ADDRESS   — KYC bridge operator
 *   COMPLIANCE_ADMIN_ADDRESS   — adds/removes modules
 *   AGENT_ADDRESS              — mints / burns / forceTransfer on the token
 *   PAUSER_ADDRESS             — pauses every contract
 *
 *   MAX_HOLDERS        (optional, default 99)            — Reg D 506(b) ceiling
 *   LOCKUP_SECONDS     (optional, default 0)             — outbound lockup
 *   BLOCKED_COUNTRIES  (optional, comma-separated ISO numeric, e.g. "408,364")
 *
 * Outputs:
 *   Prints every deployed address + deployment block; emits one JSON object on
 *   the LAST line for easy machine parsing by ops scripts and the web app.
 */
import { ethers, network } from "hardhat";

function requireAddress(value: string | undefined, label: string): string {
    if (!value) throw new Error(`${label} env var is required`);
    if (!ethers.isAddress(value)) throw new Error(`${label} is not a valid address: ${value}`);
    return value;
}

function requireBytes32(value: string | undefined, label: string): string {
    if (!value) throw new Error(`${label} env var is required`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new Error(`${label} must be a 32-byte hex string, got "${value}"`);
    }
    return value;
}

function requireString(value: string | undefined, label: string, maxLen?: number): string {
    if (value === undefined || value === "") throw new Error(`${label} env var is required`);
    if (maxLen !== undefined && value.length > maxLen) {
        throw new Error(`${label} too long (${value.length} > ${maxLen})`);
    }
    return value;
}

function parseUintEnv(value: string | undefined, fallback: bigint): bigint {
    if (value === undefined || value === "") return fallback;
    const n = BigInt(value);
    if (n < 0n) throw new Error(`expected non-negative integer, got "${value}"`);
    return n;
}

function parseCountryList(value: string | undefined): number[] {
    if (!value) return [];
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => {
            const n = Number(s);
            if (!Number.isInteger(n) || n <= 0 || n > 65535) {
                throw new Error(`Invalid country code "${s}" (expect 1..65535)`);
            }
            return n;
        });
}

async function main() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const isLocal = network.name === "hardhat" || network.name === "localhost";

    const admin = isLocal
        ? process.env.ADMIN_ADDRESS ?? deployerAddress
        : requireAddress(process.env.ADMIN_ADDRESS, "ADMIN_ADDRESS");
    const identityManager = requireAddress(
        process.env.IDENTITY_MANAGER_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "IDENTITY_MANAGER_ADDRESS",
    );
    const complianceAdmin = requireAddress(
        process.env.COMPLIANCE_ADMIN_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "COMPLIANCE_ADMIN_ADDRESS",
    );
    const agent = requireAddress(
        process.env.AGENT_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "AGENT_ADDRESS",
    );
    const pauser = requireAddress(
        process.env.PAUSER_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "PAUSER_ADDRESS",
    );

    const assetRegistry = requireAddress(process.env.ASSET_REGISTRY, "ASSET_REGISTRY");
    const registryAssetId = requireBytes32(process.env.REGISTRY_ASSET_ID, "REGISTRY_ASSET_ID");
    const tokenName = requireString(process.env.TOKEN_NAME, "TOKEN_NAME", 64);
    const tokenSymbol = requireString(process.env.TOKEN_SYMBOL, "TOKEN_SYMBOL", 16);
    const tokenDecimalsRaw = parseUintEnv(process.env.TOKEN_DECIMALS, 0n);
    if (tokenDecimalsRaw > 18n) throw new Error("TOKEN_DECIMALS > 18 not supported");
    const tokenDecimals = Number(tokenDecimalsRaw);

    const maxHolders = parseUintEnv(process.env.MAX_HOLDERS, 99n);
    const lockupSeconds = parseUintEnv(process.env.LOCKUP_SECONDS, 0n);
    const blockedCountries = parseCountryList(process.env.BLOCKED_COUNTRIES);

    if (!isLocal && admin.toLowerCase() === deployerAddress.toLowerCase()) {
        throw new Error(
            `Refusing to deploy: ADMIN_ADDRESS equals deployer EOA on network "${network.name}". ` +
                `Use a Safe multisig for institutional deployments.`,
        );
    }

    console.log(`Network         : ${network.name}`);
    console.log(`Deployer        : ${deployerAddress}`);
    console.log(`Admin           : ${admin}${isLocal ? "" : " (multisig-verified)"}`);
    console.log(`AssetRegistry   : ${assetRegistry}`);
    console.log(`RegistryAssetId : ${registryAssetId}`);
    console.log(`Token           : ${tokenName} (${tokenSymbol}, ${tokenDecimals} decimals)`);
    console.log(`MaxHolders      : ${maxHolders}`);
    console.log(`Lockup          : ${lockupSeconds}s`);
    console.log(`BlockedCountries: [${blockedCountries.join(", ")}]`);

    const Identity = await ethers.getContractFactory("IdentityRegistry");
    const identity = await Identity.deploy(admin, identityManager, pauser);
    await identity.waitForDeployment();
    const identityAddress = await identity.getAddress();
    console.log(`\nIdentityRegistry deployed at ${identityAddress}`);

    const Compliance = await ethers.getContractFactory("ModularCompliance");
    const compliance = await Compliance.deploy(admin, complianceAdmin);
    await compliance.waitForDeployment();
    const complianceAddress = await compliance.getAddress();
    console.log(`ModularCompliance deployed at ${complianceAddress}`);

    const Token = await ethers.getContractFactory("AssetToken");
    const token = await Token.deploy(
        tokenName,
        tokenSymbol,
        tokenDecimals,
        assetRegistry,
        registryAssetId,
        identityAddress,
        complianceAddress,
        admin,
        agent,
        pauser,
    );
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const tokenDeployTx = token.deploymentTransaction();
    const deploymentBlock = tokenDeployTx ? (await tokenDeployTx.wait())?.blockNumber ?? 0 : 0;
    console.log(`AssetToken deployed at ${tokenAddress} (block ${deploymentBlock})`);

    // Bind compliance and attach modules. On local networks the deployer is the
    // compliance admin; on prod the Safe must perform these calls separately.
    if (isLocal && complianceAdmin.toLowerCase() === deployerAddress.toLowerCase()) {
        console.log(`\nBinding compliance and attaching modules (local-only convenience)`);

        await (await compliance.bindToken(tokenAddress)).wait();

        const MaxHolders = await ethers.getContractFactory("MaxHoldersModule");
        const maxHoldersModule = await MaxHolders.deploy(complianceAddress, maxHolders);
        await maxHoldersModule.waitForDeployment();
        const maxHoldersAddress = await maxHoldersModule.getAddress();
        await (await compliance.addModule(maxHoldersAddress)).wait();
        console.log(`  MaxHoldersModule (cap=${maxHolders}) at ${maxHoldersAddress}`);

        const CountryRestrict = await ethers.getContractFactory("CountryRestrictModule");
        const countryRestrict = await CountryRestrict.deploy(
            complianceAddress,
            identityAddress,
            complianceAdmin,
        );
        await countryRestrict.waitForDeployment();
        const countryRestrictAddress = await countryRestrict.getAddress();
        await (await compliance.addModule(countryRestrictAddress)).wait();
        for (const country of blockedCountries) {
            await (await countryRestrict.blockCountry(country)).wait();
        }
        console.log(
            `  CountryRestrictModule (blocked=[${blockedCountries.join(", ")}]) at ${countryRestrictAddress}`,
        );

        const Lockup = await ethers.getContractFactory("LockupModule");
        const lockupModule = await Lockup.deploy(complianceAddress, lockupSeconds);
        await lockupModule.waitForDeployment();
        const lockupAddress = await lockupModule.getAddress();
        await (await compliance.addModule(lockupAddress)).wait();
        console.log(`  LockupModule (seconds=${lockupSeconds}) at ${lockupAddress}`);

        const manifest = {
            network: network.name,
            assetRegistry,
            registryAssetId,
            token: tokenAddress,
            identityRegistry: identityAddress,
            compliance: complianceAddress,
            modules: {
                maxHolders: { address: maxHoldersAddress, cap: maxHolders.toString() },
                countryRestrict: {
                    address: countryRestrictAddress,
                    blocked: blockedCountries,
                },
                lockup: { address: lockupAddress, seconds: lockupSeconds.toString() },
            },
            deploymentBlock,
        };
        console.log(`\nDEPLOYMENT_MANIFEST=${JSON.stringify(manifest)}`);
    } else {
        console.log(`\nNon-local deploy: compliance binding + module attach must be performed by`);
        console.log(`the COMPLIANCE_ADMIN safe via Safe Transaction Builder. Required calls:`);
        console.log(`  1. compliance.bindToken(${tokenAddress})`);
        console.log(`  2. <deploy MaxHoldersModule(${complianceAddress}, ${maxHolders})>`);
        console.log(`     compliance.addModule(<maxHolders>)`);
        console.log(`  3. <deploy CountryRestrictModule(${complianceAddress}, ${identityAddress}, ${complianceAdmin})>`);
        console.log(`     compliance.addModule(<countryRestrict>)`);
        console.log(`     for c in [${blockedCountries.join(", ")}]: countryRestrict.blockCountry(c)`);
        console.log(`  4. <deploy LockupModule(${complianceAddress}, ${lockupSeconds})>`);
        console.log(`     compliance.addModule(<lockup>)`);

        const manifest = {
            network: network.name,
            assetRegistry,
            registryAssetId,
            token: tokenAddress,
            identityRegistry: identityAddress,
            compliance: complianceAddress,
            deploymentBlock,
        };
        console.log(`\nDEPLOYMENT_MANIFEST=${JSON.stringify(manifest)}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
