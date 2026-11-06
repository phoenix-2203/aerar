"use client";
// Recompute the whole hash chain on demand and say plainly whether history is intact.
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { verifyAuditChain } from "@/app/actions";
import { Button } from "@/components/button";

type Result = Awaited<ReturnType<typeof verifyAuditChain>>;

export function VerifyChain({ initial }: { initial: { ok: boolean; count: number; brokenAt: number | null } }) {
  const [result, setResult] = useState<Result>({ ...initial, at: "" });
  const [pending, start] = useTransition();
  const ok = "ok" in result && result.ok;
  const error = "error" in result ? result.error : null;
  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${error ? "border-border bg-surface" : ok ? "border-success/40 bg-success-tint" : "border-danger/50 bg-danger-tint"}`} aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          {ok ? <ShieldCheck className="size-6 shrink-0 text-success" aria-hidden /> : <ShieldAlert className={`size-6 shrink-0 ${error ? "text-text-2" : "text-danger"}`} aria-hidden />}
          <div>
            {error ? (
              <p className="font-medium">{error}</p>
            ) : "count" in result ? (
              <>
                <p className={`font-semibold ${ok ? "text-success" : "text-danger"}`}>{ok ? "Chain intact" : `Chain broken at entry #${result.brokenAt}`}</p>
                <p className="text-sm text-text-2">
                  {ok
                    ? `All ${result.count} entries recomputed; every hash matches the one before it.`
                    : `History was changed after it was written. Entries from #${result.brokenAt} on can't be trusted.`}
                  {result.at && ` Checked ${new Date(result.at).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC.`}
                </p>
              </>
            ) : null}
          </div>
        </div>
        <Button variant="primary" loading={pending} onClick={() => start(async () => setResult(await verifyAuditChain()))}>
          Verify chain
        </Button>
      </div>
    </div>
  );
}
