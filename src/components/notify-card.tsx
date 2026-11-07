"use client";
// "Approvals in your chat": paste a Slack / Discord webhook or a Telegram sendMessage URL; we post a test right away.
import { BellRing, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { currentNotify, saveNotify } from "@/lib/notify/actions";

const HOWTO = [
  { name: "Discord", text: "Channel settings → Integrations → Webhooks → New webhook → Copy URL." },
  { name: "Slack", text: "Create an app → Incoming Webhooks → Add to a channel → copy the URL." },
  { name: "Telegram", text: "Make a bot with @BotFather, then use https://api.telegram.org/bot<token>/sendMessage?chat_id=<your chat id>." },
];

export function NotifyCard({ where }: { where: "try" | "vault" }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ error?: string; done?: string } | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    currentNotify(where).then(setCurrent).catch(() => setCurrent(null));
  }, [where]);
  const save = async (value: string) => {
    setBusy(true);
    setOut(null);
    const r = await saveNotify(where, value);
    setBusy(false);
    setOut(r);
    if (!r.error) {
      setCurrent(r.masked ?? null);
      setUrl("");
    }
  };
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card" aria-labelledby={`notify-${where}`}>
      <h2 id={`notify-${where}`} className="flex items-center gap-2 text-[15px] font-semibold">
        <BellRing className="size-4 text-accent" aria-hidden /> Approvals in your chat
      </h2>
      <p className="mt-1 text-[12.5px] leading-5 text-text-3">
        When a purchase needs a person, Aerar posts it to your Slack, Discord or Telegram with a link to approve or decline. The link names that one purchase and
        expires in a day.
      </p>
      {current ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success-tint px-3 py-2 text-[13px] text-success">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4" aria-hidden /> Connected: {current}
          </span>
          <button onClick={() => save("")} disabled={busy} className="text-[12px] text-text-2 underline hover:text-text">
            Disconnect
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url) save(url);
          }}
        >
          <label htmlFor={`notify-url-${where}`} className="sr-only">
            Webhook URL
          </label>
          <input
            id={`notify-url-${where}`}
            type="password"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a Discord or Slack webhook URL"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg/40 px-3 font-mono text-[12px] outline-none focus:border-border-strong"
          />
          <button disabled={busy || !url} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary disabled:opacity-50">
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Connect
          </button>
        </form>
      )}
      {out?.error && <p className="mt-2 text-[12.5px] text-danger">{out.error}</p>}
      {out?.done && !out.error && <p className="mt-2 text-[12.5px] text-text-2">{out.done}</p>}
      <button onClick={() => setHelp(!help)} className="mt-3 text-[12px] text-text-3 underline hover:text-text">
        {help ? "Hide" : "Where do I get one?"}
      </button>
      {help && (
        <ul className="mt-2 space-y-1.5 text-[12px] leading-5 text-text-2">
          {HOWTO.map((h) => (
            <li key={h.name}>
              <b className="text-text">{h.name}:</b> {h.text}
            </li>
          ))}
          <li className="text-text-3">The URL is a secret. It&apos;s stored on the server and never shown back in full.</li>
        </ul>
      )}
    </section>
  );
}
