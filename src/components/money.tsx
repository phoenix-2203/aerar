// Money: tabular numerals, right-aligned by default, optional "test USDC" label. Amounts arrive formatted ("$0.10").
export function Money({
  value,
  testLabel = false,
  strike = false,
  align = "right",
  className = "",
}: {
  value: string | null | undefined;
  testLabel?: boolean;
  strike?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  if (value == null) return <span className="text-text-2">—</span>;
  const v = strike ? <s className="text-text-2">{value}</s> : value;
  return (
    <span className={`tabular whitespace-nowrap ${align === "right" ? "text-right" : ""} ${className}`}>
      {v}
      {testLabel && <span className="ml-1 text-xs font-normal text-text-2">test USDC</span>}
    </span>
  );
}
