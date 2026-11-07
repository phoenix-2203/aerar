"use client";
// The wallet side of Aerar: connect, create your Vault, fund it, sign its limits, let your agent buy, and try to make
// the Vault misbehave. Every wallet transaction is signed here, in the visitor's own wallet.
import { ArrowUpRight, Ban, CheckCircle2, Loader2, LogOut, Pause, Play, ShieldAlert, Wallet, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbi, parseUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { ConnectAi } from "@/components/connect-ai";
import { NotifyCard } from "@/components/notify-card";
import { ReceiptButton } from "@/components/receipt-slip";
import { TeamCard } from "./team-card";
import { FRESHNESS } from "@/lib/memory/freshness";
import { factoryAbi, vaultAbi } from "@/lib/vault/artifacts";
import {
  attackOwnVault,
  getSignInMessage,
  inspectProvider,
  signIn,
  signOut,
  trustProvider,
  untrustProvider,
  vaultBuy,
  vaultBuyUrl,
  setFreshness,
  vaultDecide,
  vaultState,
  type ProviderView,
  type VaultView,
} from "./actions";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const usdcAbi = parseAbi(["function transfer(address to, uint256 value) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const CHAIN_HEX = "0x14a34";
const scan = (kind: "address" | "tx", v: string) => `https://sepolia.basescan.org/${kind}/${v}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const $ = (units: string | bigint) => {
  const n = Number(units) / 1e6;
  return `$${n.toFixed(n !== 0 && n < 0.1 ? 3 : 2)}`;
};

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eth }).ethereum : undefined);
const pub = createPublicClient({ chain: baseSepolia, transport: http() });

async function wallet() {
  const e = eth();
  if (!e) throw new Error("No wallet found. Install MetaMask, Coinbase Wallet or Rabby and reload. On a phone, open this page in your wallet app's browser.");
  const [account] = (await e.request({ method: "eth_requestAccounts" })) as Hex[];
  try {
    await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if ((err as { code?: number }).code === 4902)
      await e.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: CHAIN_HEX, chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"], blockExplorerUrls: ["https://sepolia.basescan.org"] }],
      });
    else throw err;
  }
  return { account, client: createWalletClient({ account, chain: baseSepolia, transport: custom(e) }) };
}

function niceError(e: unknown): string {
  const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "Something went wrong";
  if (/user (rejected|denied)/i.test(m)) return "You cancelled it in your wallet.";
  if (/insufficient funds/i.test(m)) return "Your wallet needs a little Base Sepolia ETH for gas. Get some from a faucet, then try again.";
  return m.split("\n")[0];
}

// ------------------------------------------------------------------ sign in

export function ConnectWallet() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const { account, client } = await wallet();
            const message = await getSignInMessage(account);
            const signature = await client.signMessage({ account, message });
            const r = await signIn(message, signature);
            if (r?.error) setErr(r.error);
            else router.refresh();
          } catch (e) {
            setErr(niceError(e));
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-on-primary transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
        Connect wallet
      </button>
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ console

type Purchase = {
  id: string;
  status: string;
  url: string;
  purpose: string;
  amount: string | null;
  paid: string;
  txHash: string | null;
  error: string | null;
  reasons: { code: string; text: string }[];
  at: string;
};

export function VaultConsole(props: {
  owner: Hex;
  factory: Hex | null;
  operator: Hex;
  mandateId: Hex;
  approvalAbove: string;
  reuseWindowSeconds: number;
  purchases: Purchase[];
  connectUrl: string;
  role: "owner" | "approver" | "viewer";
  workspaceOwner: Hex;
}) {
  const router = useRouter();
  const isOwner = props.role === "owner";
  const [view, setView] = useState<VaultView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string; tx?: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setView(await vaultState());
    setLoading(false);
  }, []);
  useEffect(() => {
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [reload]);

  /** Send one wallet transaction, wait for it, then re-read the chain. */
  async function tx(label: string, send: (w: Awaited<ReturnType<typeof wallet>>) => Promise<Hex>) {
    setBusy(label);
    setNote(null);
    try {
      const w = await wallet();
      if (w.account.toLowerCase() !== props.owner.toLowerCase()) throw new Error(`Switch your wallet to ${short(props.owner)}, the account you signed in with.`);
      const hash = await send(w);
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The transaction reverted.");
      setNote({ tone: "ok", text: `${label}: confirmed on Base Sepolia.`, tx: hash });
      await reload();
    } catch (e) {
      setNote({ tone: "bad", text: niceError(e) });
    } finally {
      setBusy(null);
    }
  }

  const [now] = useState(() => Date.now());
  const v = view?.vault ?? null;
  const m = v?.mandate;
  const mandateLive = !!m?.active && m.expiresAt * 1000 > now;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-text-2">
        <span>
          Signed in as{" "}
          <a href={scan("address", props.owner)} target="_blank" rel="noreferrer" className="font-mono text-text hover:underline">
            {short(props.owner)}
          </a>{" "}
          · {isOwner ? "your workspace" : `${props.role} in ${short(props.workspaceOwner)}'s workspace`}
        </span>
        <button onClick={() => signOut().then(() => router.refresh())} className="inline-flex items-center gap-1.5 hover:text-text">
          <LogOut className="size-3.5" aria-hidden /> Sign out
        </button>
      </div>

      {note && (
        <p className={`animate-arrive rounded-xl border px-4 py-3 text-sm ${note.tone === "ok" ? "border-success/30 bg-success-tint text-success" : "border-danger/30 bg-danger-tint text-danger"}`} role="status">
          {note.text}{" "}
          {note.tx && (
            <a href={scan("tx", note.tx)} target="_blank" rel="noreferrer" className="underline">
              View transaction
            </a>
          )}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        {/* ---------------------------------------------------------------- the Vault */}
        <section className="vault-slip min-w-0" aria-label="Your Vault">
          {loading && !view ? (
            <div className="space-y-3 p-6">
              <div className="skeleton h-5 w-32 rounded" />
              <div className="skeleton h-10 w-40 rounded" />
              <div className="skeleton h-24 rounded" />
            </div>
          ) : view?.error ? (
            <div className="p-6 text-sm text-danger">{view.error}</div>
          ) : !props.factory ? (
            <div className="p-6 text-sm text-text-2">Vaults aren&apos;t switched on for this deployment yet (no factory address).</div>
          ) : !v && !isOwner ? (
            <div className="p-6 text-sm text-text-2">The owner hasn&apos;t opened a Vault yet.</div>
          ) : !v ? (
            <CreateVault busy={busy} onCreate={() => tx("Vault created", (w) => w.client.writeContract({ address: props.factory!, abi: factoryAbi, functionName: "create", args: [props.operator] }))} />
          ) : (
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">Aerar Vault</p>
                  <a href={scan("address", v.address)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[13px] hover:underline">
                    {short(v.address)} <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider ${v.paused ? "bg-warning-tint text-warning" : "bg-success-tint text-success"}`}>
                  {v.paused ? "PAUSED" : "OPEN"}
                </span>
              </div>
              <p className="tabular mt-5 text-[40px] font-semibold leading-none tracking-tight">{$(v.balance)}</p>
              <p className="mt-1 text-[13px] text-text-3">test USDC in your Vault · only you can withdraw</p>

              {isOwner && <Fund busy={busy} onFund={(amt) => tx("Funded", (w) => w.client.writeContract({ address: USDC, abi: usdcAbi, functionName: "transfer", args: [v.address, parseUnits(amt, 6)] }))} />}

              <hr className="receipt-rule my-5" />
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">Mandate · your research task</p>
              {mandateLive && m ? (
                <dl className="mt-3 space-y-1.5 font-mono text-[12.5px]">
                  <Line k="Per payment" v={`≤ ${$(m.maxPerPayment)}`} />
                  <Line k="Per day" v={`≤ ${$(m.periodLimit)} · ${$(m.leftInPeriod)} left`} />
                  <Line k="Spent so far" v={$(m.spentTotal)} />
                  <Line k="Expires" v={new Date(m.expiresAt * 1000).toUTCString().slice(5, 22)} />
                  <Line k="Operator" v={v.operatorIsAerar ? `Aerar ${short(v.operator)}` : `⚠ ${short(v.operator)}`} />
                </dl>
              ) : !isOwner ? (
                <p className="mt-3 text-[13px] text-text-2">No active limits: the Vault pays nothing until the owner signs some.</p>
              ) : (
                <SignMandate
                  busy={busy}
                  revoked={!!m && m.maxPerPayment !== "0"}
                  onSign={(per, day, days) =>
                    tx("Limits signed", (w) =>
                      w.client.writeContract({
                        address: v.address,
                        abi: vaultAbi,
                        functionName: "setMandate",
                        args: [props.mandateId, view!.providers.map((p) => p.payTo), parseUnits(per, 6), parseUnits(day, 6), 86_400n, BigInt(Math.floor(Date.now() / 1000) + Number(days) * 86_400)],
                      }),
                    )
                  }
                />
              )}

              <hr className="receipt-rule my-5" />
              <Providers
                view={view!}
                busy={busy}
                canSign={mandateLive && isOwner}
                onTrust={(p) =>
                  tx(`Trusted ${p.host}`, async (w) => {
                    const h = await w.client.writeContract({ address: v.address, abi: vaultAbi, functionName: "setPayee", args: [props.mandateId, p.payTo, true] });
                    await pub.waitForTransactionReceipt({ hash: h });
                    const r = await trustProvider(p.host, p.payTo);
                    if (r?.error) throw new Error(r.error);
                    router.refresh();
                    return h;
                  })
                }
                onRemove={(p) =>
                  tx(`Removed ${p.host}`, async (w) => {
                    const h = await w.client.writeContract({ address: v.address, abi: vaultAbi, functionName: "setPayee", args: [props.mandateId, p.payTo, false] });
                    await pub.waitForTransactionReceipt({ hash: h });
                    const r = await untrustProvider(p.host);
                    if (r?.error) throw new Error(r.error);
                    router.refresh();
                    return h;
                  })
                }
              />

              {isOwner && <hr className="receipt-rule my-5" />}
              {isOwner && <div className="flex flex-wrap gap-2">
                <SlipButton busy={busy === "Paused" || busy === "Resumed"} onClick={() => tx(v.paused ? "Resumed" : "Paused", (w) => w.client.writeContract({ address: v.address, abi: vaultAbi, functionName: "setPaused", args: [!v.paused] }))}>
                  {v.paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
                  {v.paused ? "Resume" : "Pause all"}
                </SlipButton>
                {mandateLive && (
                  <SlipButton busy={busy === "Mandate revoked"} onClick={() => tx("Mandate revoked", (w) => w.client.writeContract({ address: v.address, abi: vaultAbi, functionName: "revoke", args: [props.mandateId] }))}>
                    <Ban className="size-3.5" aria-hidden /> Revoke
                  </SlipButton>
                )}
                {v.balance !== "0" && (
                  <SlipButton busy={busy === "Withdrawn"} onClick={() => tx("Withdrawn", (w) => w.client.writeContract({ address: v.address, abi: vaultAbi, functionName: "withdraw", args: [props.owner, BigInt(v.balance)] }))}>
                    <ArrowUpRight className="size-3.5" aria-hidden /> Withdraw all
                  </SlipButton>
                )}
              </div>}
              <p className="mt-3 text-[12px] leading-5 text-text-3">
                {isOwner
                  ? "These run in your wallet. Aerar can't pause, change limits or withdraw. It can only ask the Vault to pay, and the Vault checks your limits itself."
                  : "Only the owner's wallet can fund, pause, change limits or withdraw. The Vault enforces that on-chain."}
              </p>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- the agent */}
        <div className="min-w-0 space-y-6">
          <Agent canBuy={isOwner} canDecide={props.role !== "viewer"} ready={!!v && !!m && m.maxPerPayment !== "0" && v.balance !== "0"} stopped={!!v && (v.paused || !mandateLive)} approvalAbove={props.approvalAbove} reuseWindowSeconds={props.reuseWindowSeconds} purchases={props.purchases} onChange={reload} />
          {isOwner && <BreakIt ready={!!v} />}
          {isOwner && (
            <ConnectAi
              url={props.connectUrl}
              examples={["How much is left in my Vault task?", "Buy this hour's market update", "What did you buy, and what did my Vault refuse?"]}
            />
          )}
          {isOwner && <NotifyCard where="vault" />}
          <TeamCard />
        </div>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-3">{k}</dt>
      <dd className="text-right [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}

function SlipButton({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-medium transition hover:border-border-strong active:scale-[0.98] disabled:opacity-60">
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : children}
    </button>
  );
}

function CreateVault({ busy, onCreate }: { busy: string | null; onCreate: () => void }) {
  return (
    <div className="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">No Vault yet</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">Open your Vault</h2>
      <p className="mt-2 text-[13.5px] leading-5 text-text-2">
        A contract on Base Sepolia that you own. Your agent&apos;s money sits in it, and it only pays inside limits you sign. One transaction; you&apos;ll need
        a little Base Sepolia ETH for gas.
      </p>
      <button onClick={onCreate} disabled={!!busy} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition active:scale-[0.98] disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Create my Vault
      </button>
      <p className="mt-4 text-[12.5px] text-text-3">
        Need test funds?{" "}
        <a className="underline hover:text-text" href="https://portal.cdp.coinbase.com/products/faucet" target="_blank" rel="noreferrer">
          ETH faucet
        </a>{" "}
        ·{" "}
        <a className="underline hover:text-text" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          USDC faucet
        </a>
      </p>
    </div>
  );
}

function Fund({ busy, onFund }: { busy: string | null; onFund: (amount: string) => void }) {
  const [amt, setAmt] = useState("1.00");
  return (
    <form
      className="mt-4 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(amt) > 0) onFund(amt);
      }}
    >
      <label htmlFor="fund" className="sr-only">
        Amount of USDC to move into your Vault
      </label>
      <div className="flex h-9 items-center rounded-lg border border-border bg-bg/40 px-2.5 font-mono text-[13px] focus-within:border-border-strong">
        $
        <input id="fund" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" className="w-16 bg-transparent pl-1 outline-none" />
      </div>
      <button disabled={!!busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium hover:border-border-strong disabled:opacity-60">
        {busy === "Funded" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        Move into Vault
      </button>
      <a className="ml-auto text-[12px] text-text-3 underline hover:text-text" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
        Get test USDC
      </a>
    </form>
  );
}

function SignMandate({ busy, revoked, onSign }: { busy: string | null; revoked: boolean; onSign: (per: string, day: string, days: string) => void }) {
  const [per, setPer] = useState("0.50");
  const [day, setDay] = useState("1.00");
  const [days, setDays] = useState("7");
  const field = (id: string, label: string, val: string, set: (v: string) => void, unit: string) => (
    <label htmlFor={id} className="flex items-center justify-between gap-3">
      <span className="text-text-3">{label}</span>
      <span className="flex h-8 items-center rounded-md border border-border bg-bg/40 px-2 focus-within:border-border-strong">
        {unit === "$" && "$"}
        <input id={id} value={val} onChange={(e) => set(e.target.value)} inputMode="decimal" className="w-14 bg-transparent px-1 text-right outline-none" />
        {unit !== "$" && <span className="text-text-3">{unit}</span>}
      </span>
    </label>
  );
  return (
    <form
      className="mt-3 space-y-2 font-mono text-[12.5px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSign(per, day, days);
      }}
    >
      <p className="font-sans text-[13px] text-text-2">
        {revoked ? "You revoked the limits, so the Vault pays nothing. Sign new ones to let your agent buy again." : "Sign the limits your Vault will enforce. Aerar can't change them."}
      </p>
      <div className="flex justify-between gap-4 pt-1">
        <span className="text-text-3">Pays only</span>
        <span>the providers you trust (below)</span>
      </div>
      {field("per", "Per payment", per, setPer, "$")}
      {field("day", "Per day", day, setDay, "$")}
      {field("days", "For", days, setDays, " days")}
      <button disabled={!!busy} className="!mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary font-sans text-sm font-medium text-on-primary active:scale-[0.99] disabled:opacity-60">
        {busy === "Limits signed" && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Sign these limits
      </button>
    </form>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  delivered: { label: "Paid", tone: "text-success" },
  reused: { label: "Reused", tone: "text-info" },
  awaiting_approval: { label: "Waiting for you", tone: "text-warning" },
  declined: { label: "Declined", tone: "text-danger" },
  rejected: { label: "You declined", tone: "text-text-2" },
  payment_failed: { label: "Not paid", tone: "text-danger" },
  unknown: { label: "Checking", tone: "text-warning" },
};

function Agent({ canBuy, canDecide, ready, stopped, approvalAbove, reuseWindowSeconds, purchases, onChange }: { canBuy: boolean; canDecide: boolean; ready: boolean; stopped: boolean; approvalAbove: string; reuseWindowSeconds: number; purchases: Purchase[]; onChange: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<{ error?: string } | undefined>) => {
    setWhich(key);
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
      router.refresh();
      onChange();
      setWhich(null);
    });
  };
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6" aria-labelledby="agent">
      <h2 id="agent" className="text-[15px] font-semibold">
        Your agent
      </h2>
      <p className="mt-1 text-[13.5px] text-text-2">
        It buys from a real x402 shop. Aerar checks the task rules first (anything over {approvalAbove} waits for you), then asks your Vault to pay.
      </p>
      {canBuy && <div className="mt-4 flex flex-wrap gap-2">
        {[
          { key: "report", label: "Buy a market report · $0.10" },
          { key: "premium", label: "Buy the premium report · $0.50" },
          { key: "fresh", label: "Buy this hour's update · $0.10" },
        ].map((b) => (
          <button
            key={b.key}
            disabled={!ready || pending}
            onClick={() => run(b.key, () => vaultBuy(b.key))}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3.5 text-[13px] font-medium transition hover:border-border-strong active:scale-[0.98] disabled:opacity-50"
          >
            {pending && which === b.key && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {b.label}
          </button>
        ))}
      </div>}
      {canBuy && <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const url = new FormData(e.currentTarget).get("url") as string;
          if (url) run("url", () => vaultBuyUrl(url, "Requested by you from the Vault page"));
        }}
      >
        <label htmlFor="buy-url" className="sr-only">
          Any x402 URL
        </label>
        <input id="buy-url" name="url" placeholder="Or paste any x402 URL from a provider you trust" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg/40 px-3 font-mono text-[12px] outline-none focus:border-border-strong" />
        <button disabled={!ready || pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-[13px] font-medium hover:border-border-strong disabled:opacity-50">
          {pending && which === "url" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Buy
        </button>
      </form>}
      {canBuy && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-text-2">
          Reuse what was already bought for
          <select
            value={reuseWindowSeconds}
            disabled={pending}
            onChange={(e) => run("fresh-window", () => setFreshness(Number(e.target.value)))}
            className="h-8 rounded-md border border-border bg-surface px-2 text-[12.5px]"
          >
            {FRESHNESS.map((f) => (
              <option key={f.seconds} value={f.seconds}>
                {f.label}
              </option>
            ))}
            {!FRESHNESS.some((f) => f.seconds === reuseWindowSeconds) && <option value={reuseWindowSeconds}>{Math.round(reuseWindowSeconds / 60)} minutes</option>}
          </select>
        </label>
      )}
      {canBuy && !ready && <p className="mt-2 text-[12.5px] text-text-3">Open, fund and sign limits on your Vault first.</p>}
      {ready && stopped && (
        <p className="mt-2 text-[12.5px] text-warning">Your Vault is paused or its limits are revoked. Let the agent try anyway: Aerar will pass it, and the Vault will refuse.</p>
      )}
      {pending && which && <p className="mt-2 text-[12.5px] text-text-3">Quoting, checking rules, asking your Vault on-chain, settling… about 10–20 seconds.</p>}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}

      <ol className="mt-5 divide-y divide-border border-t border-border">
        {purchases.length === 0 && <li className="py-6 text-center text-[13px] text-text-3">Nothing bought yet.</li>}
        {purchases.map((p) => {
          const s = STATUS[p.status] ?? { label: p.status, tone: "text-text-2" };
          const why = p.reasons.filter((r) => !(p.error && r.code === "VAULT_REFUSED")).slice(0, 2);
          return (
            <li key={p.id} className="animate-arrive py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[13.5px]">{p.purpose}</p>
                <span className={`shrink-0 font-mono text-[12px] font-semibold ${s.tone}`}>{s.label.toUpperCase()}</span>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-text-3">
                <span className="tabular">{p.amount ?? "—"}</span>
                {p.txHash && /^0x[0-9a-fA-F]{64}$/.test(p.txHash) && (
                  <a className="hover:text-text hover:underline" href={scan("tx", p.txHash)} target="_blank" rel="noreferrer">
                    paid from your Vault ↗
                  </a>
                )}
                {p.status !== "awaiting_approval" && (
                  <ReceiptButton id={p.id} className="hover:text-text hover:underline">
                    receipt
                  </ReceiptButton>
                )}
              </p>
              {why.map((r) => (
                <p key={r.code} className="mt-1 text-[12.5px] text-text-2">
                  {r.text}
                </p>
              ))}
              {p.error && <p className="mt-1 text-[12.5px] text-danger [overflow-wrap:anywhere]">{p.error}</p>}
              {p.status === "awaiting_approval" && canDecide && (
                <div className="mt-2 flex gap-2">
                  <button disabled={pending} onClick={() => run("a" + p.id, () => vaultDecide(p.id, "approve"))} className="h-8 rounded-lg bg-primary px-3 text-[12.5px] font-medium text-on-primary disabled:opacity-60">
                    Approve
                  </button>
                  <button disabled={pending} onClick={() => run("r" + p.id, () => vaultDecide(p.id, "reject"))} className="h-8 rounded-lg border border-border px-3 text-[12.5px] font-medium disabled:opacity-60">
                    Decline
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BreakIt({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ ok: boolean; title: string; text: string } | null>(null);
  const go = async (kind: "attacker" | "too-big") => {
    setBusy(kind);
    setOut(null);
    const r = await attackOwnVault(kind);
    setBusy(null);
    if (r?.code && r.code !== "ALLOWED") setOut({ ok: true, title: `Refused on-chain · ${r.code}`, text: `Your Vault said no: ${r.done}. Nothing moved, and Aerar's server had no say.` });
    else setOut({ ok: false, title: "Not refused", text: r?.error ?? "Unexpected result." });
  };
  return (
    <section className="rounded-2xl border border-dashed border-border-strong p-5 sm:p-6" aria-labelledby="break">
      <h2 id="break" className="flex items-center gap-2 text-[15px] font-semibold">
        <ShieldAlert className="size-4 text-danger" aria-hidden /> Pretend Aerar got hacked
      </h2>
      <p className="mt-1 text-[13.5px] text-text-2">
        Skip every rule Aerar has. Use Aerar&apos;s real operator key to ask your Vault for a payment directly. It&apos;s a dry run against the live
        contract, so nothing is sent.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={!ready || !!busy} onClick={() => go("attacker")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/40 px-3.5 text-[13px] font-medium text-danger hover:bg-danger-tint disabled:opacity-50">
          {busy === "attacker" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Pay $0.40 to an attacker
        </button>
        <button disabled={!ready || !!busy} onClick={() => go("too-big")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/40 px-3.5 text-[13px] font-medium text-danger hover:bg-danger-tint disabled:opacity-50">
          {busy === "too-big" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Pay the shop $50
        </button>
      </div>
      {out && (
        <div className={`mt-4 flex animate-arrive gap-3 rounded-xl p-4 ${out.ok ? "bg-success-tint" : "bg-danger-tint"}`} role="status">
          {out.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 animate-pop text-success" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />}
          <div>
            <p className={`font-mono text-[12.5px] font-semibold ${out.ok ? "text-success" : "text-danger"}`}>{out.title}</p>
            <p className="mt-0.5 text-[13px] text-text">{out.text}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Providers({ view, busy, canSign, onTrust, onRemove }: { view: VaultView; busy: string | null; canSign: boolean; onTrust: (p: ProviderView) => void; onRemove: (p: ProviderView) => void }) {
  const [url, setUrl] = useState("");
  const [found, setFound] = useState<{ host: string; payTo: Hex; price: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onChain = view.vault?.mandate.payees ?? {};
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">Providers you trust</p>
      <ul className="mt-3 space-y-2">
        {view.providers.length === 0 && <li className="text-[12.5px] text-text-3">None yet: the Vault pays no one.</li>}
        {view.providers.map((p) => {
          const live = !!onChain[p.payTo.toLowerCase()];
          return (
            <li key={p.host} className="group flex items-center justify-between gap-3 font-mono text-[12.5px]">
              <span className="min-w-0">
                <span className="block truncate">{p.demo ? `${p.host} (demo shop)` : p.host}</span>
                <a href={scan("address", p.payTo)} target="_blank" rel="noreferrer" className="text-[11.5px] text-text-3 hover:underline">
                  pays {short(p.payTo)}
                </a>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${live ? "bg-success-tint text-success" : "bg-warning-tint text-warning"}`} title={live ? "Allowed in your Vault" : "Not allowed in your Vault yet"}>
                  {live ? "ON-CHAIN" : "NOT IN VAULT"}
                </span>
                {!p.demo && (
                  <button onClick={() => onRemove(p)} disabled={!!busy} className="text-text-3 opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Stop trusting ${p.host}`}>
                    <XCircle className="size-4" aria-hidden />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {canSign && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setFound(null);
            setChecking(true);
            const r = await inspectProvider(url);
            setChecking(false);
            if (r.error || !r.host || !r.payTo || !r.price) setErr(r.error ?? "No quote.");
            else setFound({ host: r.host, payTo: r.payTo, price: r.price });
          }}
        >
          <label htmlFor="trust-url" className="sr-only">
            URL of a paid resource from the provider
          </label>
          <input id="trust-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://provider.example/paid-endpoint" className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg/40 px-2 font-mono text-[11.5px] outline-none focus:border-border-strong" />
          <button disabled={checking || !url} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] font-medium hover:border-border-strong disabled:opacity-50">
            {checking && <Loader2 className="size-3 animate-spin" aria-hidden />}
            Check
          </button>
        </form>
      )}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      {found && (
        <div className="mt-2 animate-arrive rounded-lg border border-border bg-bg/40 p-3 text-[12.5px]">
          <p>
            <b>{found.host}</b> asks {found.price} and is paid at <span className="font-mono">{short(found.payTo)}</span>.
          </p>
          <button
            disabled={!!busy}
            onClick={() => {
              onTrust({ host: found.host, payTo: found.payTo, demo: false });
              setFound(null);
              setUrl("");
            }}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-on-primary disabled:opacity-60"
          >
            Trust it · sign in wallet
          </button>
        </div>
      )}
    </div>
  );
}
