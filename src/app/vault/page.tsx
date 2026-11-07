// Your own wallet, your own Vault: the money your agent spends sits in a contract you own, and the contract itself
// refuses anything outside the limits you signed. Aerar decides; your Vault has the last word.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/app-shell";
import { factoryAddress, mandateIdFor, operatorAddress } from "@/lib/vault/chain";
import { walletActivity } from "@/lib/wallet/activity";
import { decodeWalletSession, WALLET_COOKIE } from "@/lib/wallet/session";
import { ConnectWallet, VaultConsole } from "./vault-console";

export const metadata: Metadata = {
  title: "Your Vault",
  description: "Connect your wallet, open an Aerar Vault on Base Sepolia, sign its limits, and let your agent pay from it. The contract refuses anything outside your limits.",
};

export default function VaultPage() {
  return (
    <PublicShell active="/vault">
      <Suspense fallback={<div className="skeleton h-96 rounded-2xl" />}>
        <Body />
      </Suspense>
    </PublicShell>
  );
}

async function Body() {
  await connection();
  const s = decodeWalletSession((await cookies()).get(WALLET_COOKIE)?.value);
  const activity = s ? await walletActivity(s).catch(() => null) : null;
  if (!s || !activity) return <Intro />;
  let operator: `0x${string}`;
  try {
    operator = operatorAddress();
  } catch {
    return <p className="text-sm text-danger">This deployment has no operator wallet configured.</p>;
  }
  return (
    <>
      <Heading />
      <div className="mt-8">
        <VaultConsole
          owner={s.owner}
          factory={factoryAddress()}
          operator={operator}
          mandateId={mandateIdFor(s.taskId)}
          approvalAbove={activity.task.approvalAbove}
          purchases={activity.purchases}
          connectUrl={`${process.env.AERAR_PUBLIC_URL || "https://aerar.duckdns.org"}/api/mcp/k/${s.apiKey}`}
        />
      </div>
    </>
  );
}

function Heading() {
  return (
    <div className="max-w-2xl animate-fade-up">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[42px]">Your money. Your limits. On-chain.</h1>
      <p className="mt-3 text-[15px] leading-6 text-text-2">
        Your agent&apos;s budget sits in a Vault contract that you own. Aerar checks every purchase against your task, then asks the Vault to pay. The Vault
        checks your signed limits itself, so even Aerar can&apos;t overspend.
      </p>
    </div>
  );
}

function Intro() {
  const lines = [
    ["You own it", "A contract on Base Sepolia, created from your wallet. Only you can withdraw, pause or change its limits."],
    ["It checks every payment", "Who can be paid, how much each time, how much a day, until when. Enforced by the contract, not by a server."],
    ["Aerar does the thinking", "Rules per task, no paying twice, approvals for big buys, signed receipts. Then the Vault has the last word."],
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
      <div className="animate-fade-up">
        <h1 className="text-[36px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[48px]">
          Let your agent spend. <span className="text-text-2">From a vault only you control.</span>
        </h1>
        <p className="mt-4 max-w-[520px] text-[16px] leading-7 text-text-2">
          Connect a wallet, open your Aerar Vault, sign its limits, and watch your agent pay a real x402 shop with test USDC. Then try to make it misbehave.
        </p>
        <div className="mt-7">
          <ConnectWallet />
        </div>
        <p className="mt-3 text-[13px] text-text-3">Base Sepolia testnet. Signing in costs nothing. No wallet? The <a className="underline hover:text-text" href="/try">sandbox</a> shows the same rules without one.</p>
      </div>
      <dl className="vault-slip animate-fade-up p-6 [animation-delay:120ms]">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">How the Vault works</p>
        {lines.map(([k, v], i) => (
          <div key={k} className={i ? "mt-5 border-t border-dashed border-border-strong pt-5" : "mt-4"}>
            <dt className="text-[15px] font-semibold">{k}</dt>
            <dd className="mt-1 text-[13.5px] leading-5 text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
