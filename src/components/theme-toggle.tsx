"use client";
// Light/dark toggle, plus the brand-accent preview switch (brass or Base Blue). Both live on <html>, set before
// paint; these flip them and remember the choice.
import { Moon, Sun } from "lucide-react";

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

export function ThemeToggle() {
  function toggle() {
    const d = document.documentElement;
    const next = d.dataset.theme === "light" ? "dark" : "light";
    d.dataset.theme = next;
    remember("aerar-theme", next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="group grid size-8 place-items-center rounded-lg text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
      aria-label="Switch between light and dark theme"
    >
      <Sun className="hidden size-4 transition-transform duration-500 group-hover:rotate-90 dark:block" aria-hidden />
      <Moon className="size-4 transition-transform duration-300 group-hover:-rotate-12 dark:hidden" aria-hidden />
    </button>
  );
}

/** Brand preview: switch the accent between brass and Base Blue. Remove once the final colour is chosen. */
export function AccentToggle() {
  function toggle() {
    const d = document.documentElement;
    const next = d.dataset.accent === "blue" ? "brass" : "blue";
    d.dataset.accent = next;
    remember("aerar-accent", next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      title="Brand colour: brass or Base Blue"
      aria-label="Switch brand colour between brass and Base Blue"
      className="group grid size-8 place-items-center rounded-lg transition-colors hover:bg-surface-2"
    >
      <span className="relative block size-3.5 rounded-full bg-accent ring-2 ring-surface-3 transition-transform duration-300 group-hover:scale-110" aria-hidden />
    </button>
  );
}
