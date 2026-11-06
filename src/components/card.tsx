// The surface every section sits on: title row, optional aside, body.
import type { ReactNode } from "react";

export function Card({
  title,
  aside,
  children,
  className = "",
  bodyClassName = "p-4 sm:p-5",
  id,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border border-border bg-surface shadow-card ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside && <div className="text-xs text-text-2">{aside}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
