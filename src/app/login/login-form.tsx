"use client";
import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-sm text-muted">Password</span>
        <input
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-line bg-night px-3 py-2.5 text-text outline-none focus:border-lamp"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-refused">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-lamp px-4 py-2.5 font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
