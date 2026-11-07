#!/usr/bin/env node
// Deploy the Aerar Vault factory, Morning Seal and Escrow factory to Base Sepolia from the operator key, create the demo
// shop's escrow, then print the lines to add to .env. Safe to rerun: anything already deployed is skipped.
// Usage (on the VPS, in /opt/aerar):  sudo -u aerar node scripts/deploy-vault-factory.mjs
// Reads PAYER_PRIVATE_KEY and BASE_SEPOLIA_RPC_URL from .env (or the environment). Needs a little Base Sepolia ETH.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const env = { ...process.env };
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  /* no .env: use the environment */
}

const key = env.PAYER_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("PAYER_PRIVATE_KEY is missing");
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const src = readFileSync(new URL("../src/lib/vault/artifacts.ts", import.meta.url), "utf8");
const bin = readFileSync(new URL("../src/lib/vault/bytecode.ts", import.meta.url), "utf8");
const abi = JSON.parse(/export const factoryAbi = (\[.*\]) as const;/.exec(src)[1]);
const bytecode = /export const factoryBytecode = "(0x[0-9a-f]+)"/.exec(bin)[1];

const account = privateKeyToAccount(key);
const transport = http(env.BASE_SEPOLIA_RPC_URL || undefined);
const pub = createPublicClient({ chain: baseSepolia, transport });
const wallet = createWalletClient({ account, chain: baseSepolia, transport });

const chainId = await pub.getChainId();
if (chainId !== 84532) throw new Error(`Expected Base Sepolia (84532), got ${chainId}`);
const eth = await pub.getBalance({ address: account.address });
console.log(`Operator ${account.address} has ${formatEther(eth)} ETH on Base Sepolia`);
if (eth === 0n) throw new Error("The operator needs a little Base Sepolia ETH for gas (deploy + settling Vault payments). Use a faucet, then rerun.");

const sealAbi = JSON.parse(/export const sealAbi = (\[.*\]) as const;/.exec(src)[1]);
const sealBytecode = /export const sealBytecode = "(0x[0-9a-f]+)"/.exec(bin)[1];

async function deploy(name, envKey, a, code, args) {
  if (env[envKey] && (await pub.getCode({ address: env[envKey] }))) {
    console.log(`${name}: already deployed at ${env[envKey]}`);
    return null;
  }
  const hash = await wallet.deployContract({ abi: a, bytecode: code, args });
  console.log(`${name}: deploying… tx ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${name} deploy failed`);
  console.log(`${name}: https://sepolia.basescan.org/address/${r.contractAddress}`);
  return `${envKey}=${r.contractAddress}`;
}

const escrowFactoryAbi = JSON.parse(/export const escrowFactoryAbi = (\[.*\]) as const;/.exec(src)[1]);
const escrowFactoryBytecode = /export const escrowFactoryBytecode = "(0x[0-9a-f]+)"/.exec(bin)[1];

const lines = [
  await deploy("Vault factory", "VAULT_FACTORY_ADDRESS", abi, bytecode, [USDC]),
  await deploy("Morning Seal", "SEAL_ADDRESS", sealAbi, sealBytecode, []),
  await deploy("Escrow factory", "ESCROW_FACTORY_ADDRESS", escrowFactoryAbi, escrowFactoryBytecode, [USDC]),
].filter(Boolean);

// The demo shop's escrow: releases to DEMO_PAYTO_ADDRESS, judged by Aerar's operator key, 1-hour delivery window.
const escrowFactory = (lines.find((l) => l.startsWith("ESCROW_FACTORY_ADDRESS=")) ?? `=${env.ESCROW_FACTORY_ADDRESS}`).split("=")[1];
const shop = env.DEMO_PAYTO_ADDRESS;
if (escrowFactory && /^0x[0-9a-fA-F]{40}$/.test(shop ?? "")) {
  const WINDOW = 3600n;
  const key = await pub.readContract({ address: escrowFactory, abi: escrowFactoryAbi, functionName: "key", args: [shop, account.address, WINDOW] });
  let escrow = await pub.readContract({ address: escrowFactory, abi: escrowFactoryAbi, functionName: "escrowOf", args: [key] });
  if (/^0x0{40}$/.test(escrow)) {
    const hash = await wallet.writeContract({ address: escrowFactory, abi: escrowFactoryAbi, functionName: "create", args: [shop, account.address, WINDOW] });
    console.log(`Demo shop escrow: creating… tx ${hash}`);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("Escrow creation failed");
    escrow = await pub.readContract({ address: escrowFactory, abi: escrowFactoryAbi, functionName: "escrowOf", args: [key] });
  }
  console.log(`Demo shop escrow: https://sepolia.basescan.org/address/${escrow} (pays ${shop}, judged by ${account.address}, 1 h window)`);
  if (env.DEMO_ESCROW_ADDRESS?.toLowerCase() !== escrow.toLowerCase()) lines.push(`DEMO_ESCROW_ADDRESS=${escrow}`);
} else console.log("Skipping the demo shop escrow: DEMO_PAYTO_ADDRESS isn't set.");
if (lines.length) console.log(`\nAdd to /opt/aerar/.env:\n${lines.join("\n")}${env.X402_FACILITATOR_URL === "local" ? "" : "\nX402_FACILITATOR_URL=local"}`);
else console.log("\nNothing to deploy.");
