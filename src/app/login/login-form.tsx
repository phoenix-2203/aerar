"use client";
import { useActionState } from "react";
import { login } from "@/app/actions";
import { Button } from "@/components/button";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "login-error" : undefined}
          className={`mt-1.5 h-10 w-full rounded-lg border bg-surface px-3 text-text outline-none transition-colors focus:border-brand ${state?.error ? "border-danger" : "border-border-strong"}`}
        />
        {state?.error && (
          <p id="login-error" role="alert" className="mt-1.5 text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
