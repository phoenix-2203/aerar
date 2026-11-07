"use client";
// The phone/tablet menu: every public page, one tap away (the header only fits two links on small screens).
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS: [string, string, string][] = [
  ["/try", "Try it", "your own sandbox, no wallet"],
  ["/vault", "Vault", "your wallet, on-chain limits"],
  ["/scenarios", "Attack lab", "26 attacks through the real pipeline"],
  ["/demo", "Live report", "real payments on Base Sepolia"],
  ["/verify", "Verify a receipt", "check one in your browser"],
  ["/builders", "For builders", "MCP, REST, pricing"],
  ["/built", "How it was built", "built with Claude"],
  ["/login", "Sign in", "operator dashboard"],
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2 hover:text-text" aria-label={open ? "Close menu" : "Open menu"}>
        {open ? <X className="size-4.5" aria-hidden /> : <Menu className="size-4.5" aria-hidden />}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 top-14 z-30 bg-black/30 backdrop-blur-[1px]" aria-label="Close menu" onClick={() => setOpen(false)} />
          <nav id="mobile-menu" className="fixed inset-x-3 top-[60px] z-40 animate-arrive overflow-hidden rounded-2xl border border-border bg-surface shadow-lift" aria-label="All pages">
            <ul className="divide-y divide-dashed divide-border">
              {LINKS.map(([href, name, sub]) => (
                <li key={href}>
                  <Link href={href} onClick={() => setOpen(false)} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-surface-2/40">
                    <span className="text-[14.5px] font-medium">{name}</span>
                    <span className="truncate font-mono text-[11px] text-text-3">{sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
