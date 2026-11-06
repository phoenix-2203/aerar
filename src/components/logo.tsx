// Aerar's mark: three records in a ledger, each a step on from the last; the newest (top) is the accent colour.
// 24px grid. The two older records take the text colour. Hover a .logo-hover parent and the records shift in turn.

const H = 4.4;
const G = 1.8;
const W = 13.2;
const S = 3.1;
const Y0 = (24 - (3 * H + 2 * G)) / 2;
const X0 = (24 - (W + 2 * S)) / 2;
/** Bottom to top: [x, y] of each record. */
export const RECORDS = [0, 1, 2].map((i) => [+(X0 + i * S).toFixed(2), +(Y0 + (2 - i) * (H + G)).toFixed(2)] as const);
export const RECORD = { w: W, h: H, r: H / 2 };

export function LogoMark({ size = 24, className = "", mono = false }: { size?: number; className?: string; mono?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`logo-mark ${className}`}>
      {RECORDS.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={W} height={H} rx={H / 2} fill={i === 2 && !mono ? "var(--accent)" : "currentColor"} />
      ))}
    </svg>
  );
}

export function Logo({ className = "", size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={`logo-hover inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-text ${className}`}>
      <LogoMark size={size} />
      Aerar
    </span>
  );
}
