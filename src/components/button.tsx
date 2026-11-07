// Buttons say what they do ("Approve $0.50", "Run all"). One primary per screen: ink on paper (inverted).
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover btn-depth",
  accent: "bg-accent text-on-accent hover:brightness-110 shadow-sm",
  secondary: "border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-2",
  ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-tint",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return `group/btn inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,transform,filter] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

/** Wrap a trailing arrow so it slides on hover. */
export function Trailing({ children }: { children: ReactNode }) {
  return <span className="inline-flex transition-transform duration-200 group-hover/btn:translate-x-0.5">{children}</span>;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  trailing,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode; trailing?: ReactNode }) {
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {trailing && <Trailing>{trailing}</Trailing>}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  trailing,
  children,
  className = "",
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode; trailing?: ReactNode }) {
  return (
    <Link {...rest} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
      {trailing && <Trailing>{trailing}</Trailing>}
    </Link>
  );
}
