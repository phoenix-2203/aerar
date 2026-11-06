"use client";
// Toasts for results of actions ("Approved. Paid $0.50."). Announced politely to screen readers.
import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; tone: "success" | "danger"; text: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

let next = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = ++next;
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md animate-arrive items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-card">
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
