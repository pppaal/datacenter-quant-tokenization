/**
 * Deploy DataCenterAssetRegistry and (optionally) EmergencyCouncil and
 * NamespacedRegistrar.
 *
 * For any non-local network we REQUIRE ADMIN_ADDRESS to be an explicit Safe /
 * multisig — the EOA used for deployment must not hold admin privileges
 * post-deploy. AccessControlDefaultAdminRules grants DEFAULT_ADMIN_ROLE solely
 * to the address passed in the constructor, so setting ADMIN_ADDRESS to the
 * multisig yields a deploy with no EOA admin footprint.
 *
 * Set COUNCIL_THRESHOLD=N to additionally deploy an EmergencyCouncil pointed at
 * the new registry with unpause threshold N. The script does NOT grant the
 * council PAUSER_ROLE — that role handoff must come from the admin Safe so
 * that no EOA has custody of the pause authority mid-flight. Use
 * `scripts/prepare-safe-batch.ts --handoff` to generate the handoff batch.
 *
 * Set NAMESPACED_REGISTRAR=1 to additionally deploy a NamespacedRegistrar
 * adapter pointed at the new registry. As with the council, the script does
 * NOT grant the adapter REGISTRAR_ROLE — the handoff batch must be signed by
 * the admin Safe. Use `scripts/prepare-safe-batch.ts --registrar-handoff` for
 * that batch.
 */
import { ethers, network } from "hardhat";

function requireAddress(value: string | undefined, label: string): string {
    if (!value) throw new Error(`${label} env var is required`);
    if (!ethers.isAddress(value)) throw new Error(`${label} is not a valid address: ${value}`);
    return value;
}

function parseThreshold(value: string | undefined): bigint | null {
    if (value === undefined || value === "") return null;
    const n = BigInt(value);
    if (n <= 0n) throw new Error(`COUNCIL_THRESHOLD must be a positive integer, got "${value}"`);
    return n;
}

async function main() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const isLocal = network.name === "hardhat" || network.name === "localhost";

    const admin = isLocal
        ? process.env.ADMIN_ADDRESS ?? deployerAddress
        : requireAddress(process.env.ADMIN_ADDRESS, "ADMIN_ADDRESS");
    const registrar = requireAddress(
        process.env.REGISTRAR_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "REGISTRAR_ADDRESS"
    );
    const auditor = requireAddress(
        process.env.AUDITOR_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "AUDITOR_ADDRESS"
    );
    const pauser = requireAddress(
        process.env.PAUSER_ADDRESS ?? (isLocal ? deployerAddress : undefined),
        "PAUSER_ADDRESS"
    );

    if (!isLocal && admin.toLowerCase() === deployerAddress.toLowerCase()) {
        throw new Error(
            `Refusing to deploy: ADMIN_ADDRESS equals deployer EOA on network "${network.name}". ` +
                `Use a Safe multisig for institutional deployments.`
        );
    }

    console.log(`Network : ${network.name}`);
    console.log(`Deployer: ${deployerAddress}`);
    console.log(`Admin   : ${admin}${isLocal ? "" : " (multisig-verified)"}`);
    console.log(`Registrar: ${registrar}`);
    console.log(`Auditor  : ${auditor}`);
    console.log(`Pauser   : ${pauser}`);

    const Registry = await ethers.getContractFactory("DataCenterAssetRegistry");
    const registry = await Registry.deploy(admin, registrar, auditor, pauser);
    await registry.waitForDeployment();
    const address = await registry.getAddress();

    console.log(`\nDataCenterAssetRegistry deployed at ${address}`);

    const councilThreshold = parseThreshold(process.env.COUNCIL_THRESHOLD);
    if (councilThreshold !== null) {
        console.log(`\nDeploying EmergencyCouncil (threshold = ${councilThreshold})`);
        const Council = await ethers.getContractFactory("EmergencyCouncil");
        const council = await Council.deploy(admin, address, councilThreshold);
        await council.waitForDeployment();
        const councilAddress = await council.getAddress();
        console.log(`EmergencyCouncil deployed at ${councilAddress}`);

        console.log(`\nNext steps — admin Safe (${admin}) must execute:`);
        console.log(`  1. council.grantRole(MEMBER_ROLE, <member_address>)  × N`);
        console.log(`  2. registry.grantRole(PAUSER_ROLE, ${councilAddress})`);
        console.log(`  3. registry.revokeRole(PAUSER_ROLE, ${pauser})  # bootstrap EOA`);
        console.log(
            `\nGenerate the handoff batch JSON with:`,
        );
        console.log(
            `  npm run safe:batch -- --registry ${address} --council ${councilAddress} \\\n` +
                `    --bootstrap-pauser ${pauser} --chainId <id> --handoff --out handoff.json`,
        );
    }

    if (process.env.NAMESPACED_REGISTRAR === "1") {
        console.log(`\nDeploying NamespacedRegistrar`);
        const Adapter = await ethers.getContractFactory("NamespacedRegistrar");
        const adapter = await Adapter.deploy(admin, address);
        await adapter.waitForDeployment();
        const adapterAddress = await adapter.getAddress();
        console.log(`NamespacedRegistrar deployed at ${adapterAddress}`);

        console.log(`\nNext steps — admin Safe (${admin}) must execute:`);
        console.log(`  1. registry.grantRole(REGISTRAR_ROLE, ${adapterAddress})`);
        console.log(`  2. registry.revokeRole(REGISTRAR_ROLE, ${registrar})  # bootstrap EOA`);
        console.log(`  3. adapter.grantRole(NAMESPACE_ADMIN_ROLE, <ops_lead>)`);
        console.log(`  4. adapter.grantNamespaceOperator(<ns>, <op>)  × N (via ops_lead)`);
        console.log(`\nGenerate the handoff batch JSON with:`);
        console.log(
            `  npm run safe:batch -- --registry ${address} --namespaced-registrar ${adapterAddress} \\\n` +
                `    --bootstrap-registrar ${registrar} --chainId <id> --registrar-handoff --out registrar-handoff.json`,
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
