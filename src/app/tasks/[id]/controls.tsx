"use client";
// Task kill switches: pause/resume the task, revoke an agent's key (with an inline confirmation; it stays off).
import { KeyRound, Pause, Play } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { revokeAgentKey, setTaskActive, type ActionState } from "@/app/actions";
import { Button } from "@/components/button";
import { useToast } from "@/components/toast";

function useResult(state: ActionState) {
  const toast = useToast();
  useEffect(() => {
    if (state?.done) toast({ tone: "success", text: state.done });
    if (state?.error) toast({ tone: "danger", text: state.error });
  }, [state, toast]);
}

export function PauseToggle({ taskId, paused }: { taskId: string; paused: boolean }) {
  const [state, action, pending] = useActionState(setTaskActive.bind(null, taskId, paused), undefined);
  useResult(state);
  return (
    <form action={action}>
      <Button type="submit" variant={paused ? "primary" : "secondary"} loading={pending} icon={paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}>
        {paused ? "Resume task" : "Pause task"}
      </Button>
    </form>
  );
}

export function RevokeKey({ agentId, name }: { agentId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(revokeAgentKey.bind(null, agentId), undefined);
  useResult(state);
  if (!confirming)
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} icon={<KeyRound className="size-3.5" aria-hidden />}>
        Revoke key
      </Button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Confirm revoking ${name}'s key`}>
      <span className="text-xs text-text-2">Revoke {name}&apos;s key? It can&apos;t be turned back on.</span>
      <Button size="sm" type="submit" variant="danger" loading={pending}>
        Revoke
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </form>
  );
}
