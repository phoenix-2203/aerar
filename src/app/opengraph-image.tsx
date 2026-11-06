// Social preview card (1200x630), generated at build time.
import { ImageResponse } from "next/og";

export const alt = "Aerar: spending control for AI agents that pay over x402";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#08090c", color: "#edeef0", padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 24 24">
            <rect x="2.3" y="16" width="13.2" height="4.4" rx="2.2" fill="#edeef0" />
            <rect x="5.4" y="9.8" width="13.2" height="4.4" rx="2.2" fill="#edeef0" />
            <rect x="8.5" y="3.6" width="13.2" height="4.4" rx="2.2" fill="#d8aa55" />
          </svg>
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: -1 }}>Aerar</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 62, fontWeight: 600, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1060 }}>Every agent purchase, accounted for.</div>
          <div style={{ fontSize: 30, color: "#9ba1ad", maxWidth: 980, lineHeight: 1.35 }}>
            Checked against the task, reused if already bought, held for a person when it&apos;s big, paid in USDC on Base and proven onchain.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 24 }}>
          {[["Paid", "#4cc08a"], ["Reused", "#6aa6f2"], ["Needs approval", "#edb14b"], ["Declined", "#f2796e"]].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #22252c", borderRadius: 999, padding: "8px 18px" }}>
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
