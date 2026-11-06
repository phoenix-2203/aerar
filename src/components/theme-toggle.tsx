"use client";
// Light/dark toggle. The current theme is on <html data-theme>, set before paint; this flips and remembers it.
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggle() {
    const d = document.documentElement;
    const next = d.dataset.theme === "light" ? "dark" : "light";
    d.dataset.theme = next;
    try {
      localStorage.setItem("aerar-theme", next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }
  return (
    <button type="button" onClick={toggle} className="grid size-8 place-items-center rounded-lg text-text-2 transition-colors hover:bg-surface-2 hover:text-text" aria-label="Switch between light and dark theme">
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
    </button>
  );
}
