#!/usr/bin/env node
// Deploy the Aerar Vault factory to Base Sepolia from the operator key, then print the line to add to .env.
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

if (env.VAULT_FACTORY_ADDRESS && (await pub.getCode({ address: env.VAULT_FACTORY_ADDRESS }))) {
  console.log(`Already deployed: VAULT_FACTORY_ADDRESS=${env.VAULT_FACTORY_ADDRESS}`);
  process.exit(0);
}

const hash = await wallet.deployContract({ abi, bytecode, args: [USDC] });
console.log(`Deploying… tx ${hash}`);
const r = await pub.waitForTransactionReceipt({ hash });
if (r.status !== "success" || !r.contractAddress) throw new Error("Deploy failed");
console.log(`\nFactory deployed: https://sepolia.basescan.org/address/${r.contractAddress}`);
console.log(`\nAdd to /opt/aerar/.env:\nVAULT_FACTORY_ADDRESS=${r.contractAddress}\nX402_FACILITATOR_URL=local`);
