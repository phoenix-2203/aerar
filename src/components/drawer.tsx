"use client";
// Side drawer driven by the URL (e.g. ?purchase=pur_x), so any purchase can be linked to. Esc or the backdrop closes it.
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export function Drawer({ title, closeHref, children }: { title: ReactNode; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
      // Keep Tab inside the drawer while it's open.
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      before?.focus?.();
    };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => router.push(closeHref, { scroll: false })} tabIndex={-1} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Purchase details"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl animate-arrive flex-col border-l border-border bg-bg shadow-card outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0 text-sm font-semibold">{title}</div>
          <button type="button" onClick={() => router.push(closeHref, { scroll: false })} className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Close details">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
