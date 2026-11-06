// Empty states that teach: a headline, one or two sentences, and one action.
import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-full bg-surface-2 text-text-2">{icon}</div>}
      <h3 className="text-[15px] font-medium">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-text-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
