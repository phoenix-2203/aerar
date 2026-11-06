// Dates in the UI are always UTC (the night shift is the same night for everyone).
export function time(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function dateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return `${new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}, ${time(d)} UTC`;
}

export function shortDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
