// Social preview card (1200x630), generated at build time.
import { ImageResponse } from "next/og";

export const alt = "Aerar: the night-shift ledger for AI agents that spend money";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a0d14", color: "#e9ebf1", padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
            <path d="M5 21V11a7 7 0 0 1 14 0v10M3 21h18" stroke="#e9ebf1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11.65 9.52A3.5 3.5 0 1 0 15.25 14.31A3 3 0 0 1 11.65 9.52Z" fill="#d8aa55" />
          </svg>
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: -1 }}>Aerar</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 62, fontWeight: 600, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1060 }}>Every agent purchase, accounted for.</div>
          <div style={{ fontSize: 30, color: "#9aa2b4", maxWidth: 980, lineHeight: 1.35 }}>
            Checked against the task, reused if already bought, held for a person when it&apos;s big, paid in USDC on Base and proven onchain.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 24 }}>
          {[["Paid", "#4cc08a"], ["Reused", "#6aa6f2"], ["Needs approval", "#edb14b"], ["Declined", "#f2796e"]].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #252c3b", borderRadius: 999, padding: "8px 18px" }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
