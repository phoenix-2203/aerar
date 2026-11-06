// USDC has 6 decimals. All arithmetic happens on bigint atomic units.
export const USDC_DECIMALS = 6;
const SCALE = 10n ** BigInt(USDC_DECIMALS);

/** "1.25" -> 1_250_000n. Rejects anything that isn't a plain non-negative decimal with <= 6 places. */
export function parseUsdc(input: string): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Not a valid USDC amount: "${input}"`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(USDC_DECIMALS, "0"));
}

/** 1_250_000n -> "1.25". Always at least 2 decimals. */
export function formatUsdc(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export function fmt$(units: bigint): string {
  return `$${formatUsdc(units)}`;
}
