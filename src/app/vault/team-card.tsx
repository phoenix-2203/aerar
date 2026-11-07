"use client";
// Teammates by wallet: approvers can decide held purchases, viewers can watch. Only the owner's wallet controls the Vault.
import { Loader2, UserPlus, Users, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { addMember, removeMember, switchWorkspace, teamState, type TeamView } from "./actions";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ROLE_TEXT = { owner: "controls the Vault and the rules", approver: "approves or declines held purchases", viewer: "sees everything, changes nothing" };

export function TeamCard() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamView | null>(null);
  const [addr, setAddr] = useState("");
  const [role, setRole] = useState<"approver" | "viewer">("approver");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => teamState().then(setTeam), []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  if (!team) return null;
  const isOwner = team.role === "owner";
  const others = team.workspaces.filter((w) => !w.current);
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card" aria-labelledby="team">
      <h2 id="team" className="flex items-center gap-2 text-[15px] font-semibold">
        <Users className="size-4 text-accent" aria-hidden /> Team
      </h2>
      <p className="mt-1 text-[12.5px] text-text-3">Invite teammates by wallet address. They sign in at this page with their own wallet.</p>

      <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
        <li className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
          <span className="font-mono">{short(team.workspaceOwner)}</span>
          <span className="text-[12px] text-text-3">owner · {ROLE_TEXT.owner}</span>
        </li>
        {team.members.map((m) => (
          <li key={m.address} className="group flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span className="font-mono">{short(m.address)}</span>
            <span className="flex items-center gap-2 text-[12px] text-text-3">
              {m.role} · {ROLE_TEXT[m.role]}
              {isOwner && (
                <button
                  aria-label={`Remove ${m.address}`}
                  onClick={async () => {
                    await removeMember(m.address);
                    load();
                  }}
                  className="opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100"
                >
                  <XCircle className="size-4" aria-hidden />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {isOwner && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await addMember(addr, role);
            setBusy(false);
            setMsg(r?.error ?? r?.done ?? null);
            if (!r?.error) {
              setAddr("");
              load();
            }
          }}
        >
          <label htmlFor="member" className="sr-only">
            Teammate wallet address
          </label>
          <input id="member" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x… teammate's wallet" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg/40 px-3 font-mono text-[12px] outline-none focus:border-border-strong" />
          <label htmlFor="member-role" className="sr-only">
            Role
          </label>
          <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as "approver" | "viewer")} className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]">
            <option value="approver">Approver</option>
            <option value="viewer">Viewer</option>
          </select>
          <button disabled={busy || !addr} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:border-border-strong disabled:opacity-50">
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UserPlus className="size-3.5" aria-hidden />}
            Invite
          </button>
        </form>
      )}
      {msg && <p className="mt-2 text-[12.5px] text-text-2">{msg}</p>}

      {others.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-3">Switch workspace</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {others.map((w) => (
              <button
                key={w.orgId}
                onClick={async () => {
                  await switchWorkspace(w.orgId);
                  router.refresh();
                }}
                className="rounded-full border border-border px-3 py-1 text-[12.5px] hover:border-border-strong"
              >
                {w.role === "owner" ? "My workspace" : `${short(w.owner)} · ${w.role}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
