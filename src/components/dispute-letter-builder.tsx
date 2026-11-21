"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, FileDown, FileText, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  ACCENTS,
  DEFAULT_STYLE,
  ITEM_PRESETS,
  THEMES,
  buildBlocks,
  defaultLetter,
  inkAccent,
  letterToDocx,
  letterToPdf,
  newId,
  normalizeHex,
  onAccent,
  remainingPlaceholders,
  themeAccent,
  toPlainText,
  type Block,
  type LetterData,
  type LetterStyle,
} from "@/lib/letter-builder";

const STORAGE_KEY = "lg-dispute-letter-v1";

function todayLong() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* ------------------------------------------------------------------------- */
/* Form controls                                                              */
/* ------------------------------------------------------------------------- */

const inputCls =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

function TextField(props: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number }) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-gray-800">
        {props.label}
      </label>
      {props.multiline ? (
        <textarea id={props.id} rows={props.rows ?? 2} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} className={inputCls} />
      ) : (
        <input id={props.id} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} className={inputCls} autoComplete="off" />
      )}
    </div>
  );
}

function Section(props: { title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={props.defaultOpen} className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
        <span>
          {props.title}
          {props.hint && <span className="ml-2 font-normal text-gray-500">{props.hint}</span>}
        </span>
        <span aria-hidden className="text-gray-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-4 py-4">{props.children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------------- */
/* Preview (mirrors the PDF layout)                                           */
/* ------------------------------------------------------------------------- */

function Marked({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]\n]{1,80}\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[[^\]]+\]$/.test(p) ? (
          <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-amber-900 print:bg-transparent">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function LetterPreview({ blocks, style }: { blocks: Block[]; style: LetterStyle }) {
  const accent = themeAccent(style);
  const accentText = inkAccent(accent);
  const plain = style.theme === "plain";
  const headColor = plain ? "#1a1a1a" : accentText;
  const fontFamily = style.font === "serif" ? "Georgia, 'Times New Roman', serif" : "Inter, Helvetica, Arial, sans-serif";

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-md bg-white text-[#1a1a1a] shadow-[0_1px_3px_rgba(11,27,51,0.12),0_12px_32px_-12px_rgba(11,27,51,0.25)] ring-1 ring-black/5"
      style={{ fontFamily, fontSize: style.font === "serif" ? 13 : 12.5, lineHeight: 1.5, minHeight: 600 }}
    >
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "letterhead":
            if (style.theme === "banner")
              return (
                <div key={i} className="px-8 pb-5 pt-7 sm:px-12" style={{ background: accent, color: onAccent(accent) }}>
                  <div className="text-xl font-bold leading-tight sm:text-2xl"><Marked text={b.name} /></div>
                  {b.sub.map((l, j) => (
                    <div key={j} className="text-[11px] opacity-90"><Marked text={l} /></div>
                  ))}
                </div>
              );
            if (style.theme === "classic")
              return (
                <div key={i} className="px-8 pt-10 text-center sm:px-12">
                  <div className="text-xl font-bold sm:text-2xl" style={{ color: headColor }}><Marked text={b.name} /></div>
                  {b.sub.map((l, j) => (
                    <div key={j} className="text-[11px] text-[#555]"><Marked text={l} /></div>
                  ))}
                  <div className="mt-3 border-b-[3px] border-double" style={{ borderColor: accent }} />
                </div>
              );
            if (style.theme === "modern")
              return (
                <div key={i} className="px-8 pt-10 sm:px-12">
                  <div className="border-l-4 pl-3" style={{ borderColor: accent }}>
                    <div className="text-xl font-bold leading-tight sm:text-2xl" style={{ color: headColor }}><Marked text={b.name} /></div>
                    {b.sub.map((l, j) => (
                      <div key={j} className="text-[11px] text-[#555]"><Marked text={l} /></div>
                    ))}
                  </div>
                </div>
              );
            return (
              <div key={i} className="px-8 pt-10 sm:px-12">
                <div className="font-bold"><Marked text={b.name} /></div>
                {b.sub.map((l, j) => (
                  <div key={j}><Marked text={l} /></div>
                ))}
              </div>
            );
          case "date":
            return <p key={i} className="mt-7 px-8 sm:px-12"><Marked text={b.text} /></p>;
          case "address":
            return (
              <div key={i} className="mt-4 px-8 sm:px-12">
                {b.lines.map((l, j) => (
                  <div key={j}><Marked text={l} /></div>
                ))}
              </div>
            );
          case "subject":
            return <p key={i} className="mt-4 px-8 font-bold sm:px-12" style={{ color: headColor }}><Marked text={b.text} /></p>;
          case "para":
            return <p key={i} className="mt-3 whitespace-pre-line px-8 sm:px-12"><Marked text={b.text} /></p>;
          case "item":
            return (
              <div key={i} className="mt-3 px-8 sm:px-12">
                <div className="font-bold" style={{ color: headColor }}>
                  {b.n}. <Marked text={b.title} />
                </div>
                <p className="whitespace-pre-line pl-4"><Marked text={b.body} /></p>
              </div>
            );
          case "bullets":
            return (
              <ul key={i} className="mt-1 space-y-0.5 px-8 sm:px-12">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: plain ? "#1a1a1a" : accent }} />
                    <span><Marked text={it} /></span>
                  </li>
                ))}
              </ul>
            );
          case "signature":
            return (
              <div key={i} className="mt-5 px-8 pb-12 sm:px-12">
                <div><Marked text={b.signoff} /></div>
                <div className="h-10" />
                {b.lines.map((l, j) => (
                  <div key={j} className={j === 0 ? "font-bold" : "text-[#555]"}><Marked text={l} /></div>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Builder                                                                    */
/* ------------------------------------------------------------------------- */

function download(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DisputeLetterBuilder() {
  const [data, setData] = useState<LetterData>(defaultLetter);
  const [style, setStyle] = useState<LetterStyle>(DEFAULT_STYLE);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState(String(3));
  const loaded = useRef(false);

  // Restore a saved draft (this browser only), or start with today's date. This runs after mount on purpose:
  // localStorage and the visitor's date are not available during server rendering.
  useEffect(() => {
    let nextData: LetterData | null = null;
    let nextStyle: LetterStyle | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as { data?: Partial<LetterData>; style?: Partial<LetterStyle> }) : null;
      if (saved?.data) {
        const base = defaultLetter();
        nextData = { ...base, ...saved.data, items: (saved.data.items ?? base.items).map((it) => ({ ...it, id: it.id || newId() })) };
      }
      if (saved?.style) nextStyle = { ...DEFAULT_STYLE, ...saved.style, accent: normalizeHex(saved.style.accent ?? DEFAULT_STYLE.accent) };
    } catch {
      /* unreadable or blocked storage: start fresh */
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from browser-only state
    setData(nextData ?? { ...defaultLetter(), date: todayLong() });
    if (nextStyle) setStyle(nextStyle);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, style }));
      } catch {
        /* storage unavailable: the draft simply is not remembered */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data, style]);

  const blocks = useMemo(() => buildBlocks(data), [data]);
  const placeholders = useMemo(() => remainingPlaceholders(blocks), [blocks]);

  const set = <K extends keyof LetterData>(k: K) => (v: LetterData[K]) => setData((d) => ({ ...d, [k]: v }));
  const setItem = (id: string, patch: Partial<{ title: string; body: string }>) =>
    setData((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const moveItem = (idx: number, dir: -1 | 1) =>
    setData((d) => {
      const items = [...d.items];
      const j = idx + dir;
      if (j < 0 || j >= items.length) return d;
      [items[idx], items[j]] = [items[j], items[idx]];
      return { ...d, items };
    });

  const fileBase = () => {
    const slug = (data.premises || "cam-dispute-letter").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    return slug.startsWith("cam") ? slug : `cam-dispute-letter-${slug}`;
  };

  async function onPdf() {
    setBusy("pdf"); setError(null);
    try {
      download(await letterToPdf(blocks, style), `${fileBase()}.pdf`, "application/pdf");
    } catch {
      setError("The PDF could not be created in this browser. Try the Word download or copy the text.");
    } finally {
      setBusy(null);
    }
  }
  async function onDocx() {
    setBusy("docx"); setError(null);
    try {
      download(await letterToDocx(blocks, style), `${fileBase()}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch {
      setError("The Word file could not be created in this browser. Try the PDF download or copy the text.");
    } finally {
      setBusy(null);
    }
  }
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(toPlainText(blocks));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy is blocked in this browser. Select the letter text and copy it manually.");
    }
  }
  function onReset() {
    setData({ ...defaultLetter(), date: todayLong() });
    setStyle(DEFAULT_STYLE);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  const accent = normalizeHex(style.accent);
  const isPreset = ACCENTS.some((a) => a.hex === accent);

  return (
    <div className="not-prose">
      {/* Style bar */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Theme</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {THEMES.map((t) => {
                const on = style.theme === t.id;
                const sw = t.id === "plain" ? "#111111" : accent;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStyle((s) => ({ ...s, theme: t.id, font: t.font }))}
                    className={`group flex min-h-11 flex-col rounded-lg border bg-white p-2 text-left transition ${on ? "border-blue-700 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-400"}`}
                  >
                    <span aria-hidden className="mb-2 block h-12 w-full overflow-hidden rounded border border-gray-100 bg-white p-1.5">
                      {t.id === "banner" && <span className="-m-1.5 mb-1 block h-3.5" style={{ background: sw }} />}
                      {t.id === "classic" && (
                        <>
                          <span className="mx-auto block h-1.5 w-1/2 rounded-sm" style={{ background: sw }} />
                          <span className="mt-1 block border-b-2 border-double" style={{ borderColor: sw }} />
                        </>
                      )}
                      {t.id === "modern" && (
                        <span className="block border-l-2 pl-1" style={{ borderColor: sw }}>
                          <span className="block h-1.5 w-1/2 rounded-sm" style={{ background: sw }} />
                        </span>
                      )}
                      {t.id === "plain" && <span className="block h-1.5 w-1/3 rounded-sm bg-gray-800" />}
                      <span className="mt-1.5 block h-1 w-full rounded-sm bg-gray-200" />
                      <span className="mt-1 block h-1 w-4/5 rounded-sm bg-gray-200" />
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                    <span className="text-[11px] leading-snug text-gray-500">{t.note}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
            <fieldset disabled={style.theme === "plain"} className="disabled:opacity-50">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Color{style.theme === "plain" && <span className="ml-1 normal-case tracking-normal">(Plain is black)</span>}
              </legend>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.hex}
                    type="button"
                    title={a.name}
                    aria-label={`${a.name} accent`}
                    aria-pressed={accent === a.hex}
                    onClick={() => setStyle((s) => ({ ...s, accent: a.hex }))}
                    className={`h-8 w-8 rounded-full ring-offset-2 transition ${accent === a.hex ? "ring-2 ring-gray-900" : "hover:scale-110"}`}
                    style={{ background: a.hex }}
                  />
                ))}
                <label
                  title="Custom color"
                  className={`relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-offset-2 ${!isPreset ? "ring-2 ring-gray-900" : ""}`}
                  style={{ background: isPreset ? "conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)" : accent }}
                >
                  <span className="sr-only">Custom color</span>
                  <input type="color" value={accent} onChange={(e) => setStyle((s) => ({ ...s, accent: e.target.value }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Typeface</legend>
              <div className="mt-2 inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                {(["serif", "sans"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={style.font === f}
                    onClick={() => setStyle((s) => ({ ...s, font: f }))}
                    className={`min-h-9 rounded-md px-3 text-sm ${style.font === f ? "bg-ink text-white" : "text-gray-700 hover:bg-gray-100"}`}
                    style={{ fontFamily: f === "serif" ? "Georgia, serif" : "Helvetica, Arial, sans-serif" }}
                  >
                    {f === "serif" ? "Serif" : "Sans"}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Form */}
        <div className="space-y-3">
          <Section title="Your details" defaultOpen>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="lb-name" label="Your name" value={data.senderName} onChange={set("senderName")} />
              <TextField id="lb-title" label="Title (optional)" value={data.senderTitle} onChange={set("senderTitle")} placeholder="Owner" />
            </div>
            <TextField id="lb-biz" label="Business name" value={data.senderBusiness} onChange={set("senderBusiness")} />
            <TextField id="lb-addr" label="Your address" value={data.senderAddress} onChange={set("senderAddress")} multiline placeholder={"Street\nCity, State ZIP"} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="lb-phone" label="Phone" value={data.senderPhone} onChange={set("senderPhone")} />
              <TextField id="lb-email" label="Email" value={data.senderEmail} onChange={set("senderEmail")} />
            </div>
          </Section>

          <Section title="Landlord or property manager" defaultOpen>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="lb-rname" label="Contact name" value={data.recipientName} onChange={set("recipientName")} />
              <TextField id="lb-rco" label="Company (optional)" value={data.recipientCompany} onChange={set("recipientCompany")} />
            </div>
            <TextField id="lb-raddr" label="Address" value={data.recipientAddress} onChange={set("recipientAddress")} multiline placeholder={"Street\nCity, State ZIP"} />
          </Section>

          <Section title="Statement" defaultOpen>
            <TextField id="lb-prem" label="Premises address / suite" value={data.premises} onChange={set("premises")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="lb-period" label="Reconciliation period" value={data.period} onChange={set("period")} placeholder="Calendar year 2025" />
              <TextField id="lb-sdate" label="Statement date" value={data.statementDate} onChange={set("statementDate")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <TextField id="lb-date" label="Letter date" value={data.date} onChange={set("date")} />
                <button type="button" onClick={() => set("date")(todayLong())} className="mt-1 text-xs text-blue-700 hover:underline">Use today</button>
              </div>
              <TextField id="lb-resp" label="Ask for a reply by" value={data.responseBy} onChange={set("responseBy")} placeholder="Check your lease for any notice period" />
            </div>
          </Section>

          <Section title="Items to question" hint={`${data.items.length} listed`} defaultOpen>
            <p className="text-xs text-gray-500">Replace the [bracketed] parts with the amount, page and exact lease wording. Quote the lease word for word.</p>
            {data.items.map((it, idx) => (
              <div key={it.id} className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-500">{idx + 1}.</span>
                  <input
                    aria-label={`Item ${idx + 1} title`}
                    value={it.title}
                    onChange={(e) => setItem(it.id, { title: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => moveItem(idx, -1)} className="rounded p-1.5 text-gray-500 hover:bg-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="Move down" disabled={idx === data.items.length - 1} onClick={() => moveItem(idx, 1)} className="rounded p-1.5 text-gray-500 hover:bg-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Remove item ${idx + 1}`} onClick={() => setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))} className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                </div>
                <textarea
                  aria-label={`Item ${idx + 1} wording`}
                  rows={4}
                  value={it.body}
                  onChange={(e) => setItem(it.id, { body: e.target.value })}
                  className={inputCls}
                />
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row">
              <select aria-label="Item type to add" value={preset} onChange={(e) => setPreset(e.target.value)} className="min-h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900">
                {ITEM_PRESETS.map((p, i) => (
                  <option key={p.title} value={i}>{p.title}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setData((d) => ({ ...d, items: [...d.items, { id: newId(), ...ITEM_PRESETS[Number(preset)] }] }))}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 hover:border-gray-500"
              >
                <Plus className="h-4 w-4" /> Add item
              </button>
            </div>
          </Section>

          <Section title="Records to request" hint={`${data.requests.filter((r) => r.trim()).length} listed`}>
            {data.requests.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input aria-label={`Record request ${i + 1}`} value={r} onChange={(e) => setData((d) => ({ ...d, requests: d.requests.map((x, j) => (j === i ? e.target.value : x)) }))} className={inputCls + " mt-0"} />
                <button type="button" aria-label={`Remove record request ${i + 1}`} onClick={() => setData((d) => ({ ...d, requests: d.requests.filter((_, j) => j !== i) }))} className="rounded p-1.5 text-gray-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setData((d) => ({ ...d, requests: [...d.requests, ""] }))} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
              <Plus className="h-4 w-4" /> Add a record
            </button>
          </Section>

          <Section title="Opening and closing wording">
            <p className="text-xs text-gray-500">Tokens like [Statement date] and [Response date] fill in from the fields above.</p>
            <TextField id="lb-open" label="Opening paragraph" value={data.opening} onChange={set("opening")} multiline rows={5} />
            <TextField id="lb-close" label="Closing paragraph" value={data.closing} onChange={set("closing")} multiline rows={4} />
            <TextField id="lb-sign" label="Sign-off" value={data.signoff} onChange={set("signoff")} />
          </Section>
        </div>

        {/* Preview + actions */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPdf}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" /> {busy === "pdf" ? "Building PDF..." : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onDocx}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 transition hover:border-gray-500 disabled:opacity-60"
            >
              <FileText className="h-4 w-4" /> {busy === "docx" ? "Building..." : "Word (.docx)"}
            </button>
            <button type="button" onClick={onCopy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:border-gray-500">
              {copied ? <Check className="h-4 w-4 text-verified" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy text"}
            </button>
            <button type="button" onClick={onReset} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-gray-500 hover:text-gray-900" title="Clear the form and start over">
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
          <p aria-live="polite" className={`mb-3 rounded-lg px-3 py-2 text-xs ${placeholders.length ? "bg-review-soft text-review" : "bg-verified-soft text-verified"}`}>
            {placeholders.length
              ? `${placeholders.length} placeholder${placeholders.length === 1 ? "" : "s"} still to fill, highlighted below. You can download at any time.`
              : "Every placeholder is filled. Read it through once more before you send it."}
          </p>
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          <div className="max-h-none overflow-visible rounded-xl bg-gray-100 p-3 sm:p-5 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
            <LetterPreview blocks={blocks} style={style} />
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Your draft stays in this browser. Nothing you type is uploaded or sent to LeaseGuard.</p>
        </div>
      </div>
    </div>
  );
}
