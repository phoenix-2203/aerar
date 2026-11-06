// Aerar's mark: a treasury arch (the aerarium) with a brass crescent moon inside (the night shift).
// 24px grid, 2px round strokes. The arch takes the text colour; the crescent is always brass.

/** Crescent: a r=3.5 circle at (12,13) minus a r=3 circle at (13.6,11.8), as one path (no masks, so no duplicate ids). */
export const CRESCENT = "M11.65 9.52A3.5 3.5 0 1 0 15.25 14.31A3 3 0 0 1 11.65 9.52Z";

export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M5 21V11a7 7 0 0 1 14 0v10M3 21h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={CRESCENT} fill="var(--brass)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-text ${className}`}>
      <LogoMark size={22} />
      Aerar
    </span>
  );
}
