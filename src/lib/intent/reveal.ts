// Reveal: undo the ways an item can be disguised before IntentLock reads it.
//
// The Grok × Bankrbot drain (4 May 2026) worked because the instruction was written in Morse code: the filter saw dots
// and dashes, the agent saw "send 3B DRB". A shop or a poisoned page can do the same to an item: "g1ft c4rd",
// "gіft card" with a Cyrillic і, "g-i-f-t c-a-r-d", %67%69%66%74, base64, hex or Morse. Reveal produces the decoded
// readings of a text and says which disguises it undid, so IntentLock can judge what the item really is and treat the
// disguise itself as a warning sign.
//
// Deterministic and cheap: no model, no network. Only decodings that turn into readable text are kept.

export type Disguise = "morse" | "base64" | "hex" | "percent-encoding" | "look-alike letters" | "leetspeak" | "spaced letters";

export interface Revealed {
  /** Decoded readings of the text (not including the original). */
  texts: string[];
  /** Which disguises were undone to get them, in plain words. */
  disguises: Disguise[];
}

const MORSE: Record<string, string> = {
  ".-": "a", "-...": "b", "-.-.": "c", "-..": "d", ".": "e", "..-.": "f", "--.": "g", "....": "h", "..": "i", ".---": "j",
  "-.-": "k", ".-..": "l", "--": "m", "-.": "n", "---": "o", ".--.": "p", "--.-": "q", ".-.": "r", "...": "s", "-": "t",
  "..-": "u", "...-": "v", ".--": "w", "-..-": "x", "-.--": "y", "--..": "z", "-----": "0", ".----": "1", "..---": "2",
  "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
};

// Letters from other scripts that look like Latin ones (the common confusables used in phishing).
const CONFUSABLE: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "һ": "h", "ԁ": "d",
  "ɡ": "g", "к": "k", "м": "m", "т": "t", "в": "b", "н": "h", "ո": "n", "ս": "u",
  "α": "a", "ο": "o", "ρ": "p", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "τ": "t", "υ": "u", "χ": "x",
  "Α": "a", "Β": "b", "Ε": "e", "Ι": "i", "Κ": "k", "Μ": "m", "Ν": "n", "Ο": "o", "Ρ": "p", "Τ": "t", "Χ": "x", "Υ": "y",
  "А": "a", "В": "b", "Е": "e", "К": "k", "М": "m", "Н": "h", "О": "o", "Р": "p", "С": "c", "Т": "t", "Х": "x", "І": "i",
};

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "l" };

/** Mostly readable text: letters, digits, spaces and light punctuation. */
function readable(s: string): boolean {
  if (s.length < 4) return false;
  const ok = [...s].filter((c) => /[a-z0-9 .,:;'"/_\-()]/i.test(c)).length;
  return ok / s.length >= 0.9 && /[a-z]{3,}/i.test(s);
}

function decodeMorse(text: string): string | null {
  // Runs of Morse symbols: at least three letters, words separated by "/" or 2+ spaces.
  const runs = text.match(/(?:[.\-·•–—_]{1,6}[ /|]+){2,}[.\-·•–—_]{1,6}/g);
  if (!runs) return null;
  const out: string[] = [];
  for (const run of runs) {
    const norm = run.replace(/[·•]/g, ".").replace(/[–—_]/g, "-");
    const words = norm.split(/\s*[/|]\s*|\s{2,}/).filter(Boolean);
    const decoded = words.map((w) => w.trim().split(/\s+/).map((l) => MORSE[l] ?? "?").join("")).join(" ");
    if (!decoded.includes("?") && decoded.replace(/\s/g, "").length >= 3) out.push(decoded);
  }
  return out.length ? out.join(" ") : null;
}

function decodeBase64Tokens(text: string): string | null {
  const out: string[] = [];
  // URL-safe tokens (path segments) and classic base64 (which may contain "/").
  const toks = [...(text.match(/[A-Za-z0-9+_-]{12,}={0,2}/g) ?? []), ...(text.match(/[A-Za-z0-9+/]{16,}={0,2}/g) ?? [])];
  for (const tok of toks) {
    try {
      const s = Buffer.from(tok.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      if (readable(s)) out.push(s);
    } catch {
      /* not base64 */
    }
  }
  return out.length ? out.join(" ") : null;
}

function decodeHexTokens(text: string): string | null {
  const out: string[] = [];
  for (const tok of text.match(/(?:0x)?(?:[0-9a-f]{2}){5,}/gi) ?? []) {
    const hex = tok.replace(/^0x/i, "");
    // Addresses and hashes (20/32 bytes of noise) are not text; only keep decodings that read as words.
    const s = Buffer.from(hex, "hex").toString("utf8");
    if (readable(s)) out.push(s);
  }
  return out.length ? out.join(" ") : null;
}

function decodePercent(text: string): string | null {
  if (!/%[0-9a-f]{2}/i.test(text)) return null;
  try {
    const s = decodeURIComponent(text.replace(/\+/g, " "));
    return s !== text ? s : null;
  } catch {
    return null;
  }
}

function unConfuse(text: string): string | null {
  const nfkc = text.normalize("NFKC");
  let changed = nfkc !== text;
  const s = [...nfkc].map((c) => (CONFUSABLE[c] ? ((changed = true), CONFUSABLE[c]) : c)).join("");
  // Strip combining marks (accents stacked to break up words).
  const plain = s.normalize("NFD").replace(/[̀-ͯ​-‍⁠﻿]/g, "");
  return changed || plain !== s ? plain : null;
}

function unLeet(text: string): string | null {
  // Only inside tokens that mix letters with digits/symbols ("g1ft", "c4rd"); plain numbers and IDs stay as they are.
  let changed = false;
  const s = text.replace(/[a-z0-9@$!|]+/gi, (tok) => {
    if (!/[a-z]/i.test(tok) || !/[0-9@$!|]/.test(tok) || /^\d+[a-z]{0,2}$/i.test(tok)) return tok;
    changed = true;
    return [...tok].map((c) => LEET[c] ?? c).join("");
  });
  return changed ? s : null;
}

function joinSpaced(text: string): string | null {
  // "g i f t" / "g-i-f-t" / "g.i.f.t" -> "gift": four or more single letters in a row.
  // When letters are joined with "-", "." or "_", a space still separates words ("g-i-f-t c-a-r-d" -> "gift card").
  const s = text.replace(/\b(?:[a-z][ .\-_]){3,}[a-z]\b/gi, (m) => (/[.\-_]/.test(m) ? m.replace(/[.\-_]/g, "") : m.replace(/ /g, "")));
  return s !== text ? s : null;
}

export function reveal(text: string): Revealed {
  const texts: string[] = [];
  const disguises: Disguise[] = [];
  const add = (d: Disguise, s: string | null) => {
    if (s && !texts.includes(s)) {
      texts.push(s);
      if (!disguises.includes(d)) disguises.push(d);
    }
  };
  // Layered: undo percent-encoding and look-alikes first, then read the result for encodings and letter games.
  const base = [text];
  const pct = decodePercent(text);
  add("percent-encoding", pct);
  if (pct) base.push(pct);
  for (const b of [...base]) {
    const u = unConfuse(b);
    add("look-alike letters", u);
    if (u) base.push(u);
  }
  for (const b of base) {
    add("morse", decodeMorse(b));
    add("base64", decodeBase64Tokens(b));
    add("hex", decodeHexTokens(b));
    add("leetspeak", unLeet(b));
    add("spaced letters", joinSpaced(b));
    const l = unLeet(b);
    if (l) add("spaced letters", joinSpaced(l));
  }
  return { texts, disguises };
}
