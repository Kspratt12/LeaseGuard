/**
 * Fill-in CAM dispute letter builder used by the public template page.
 *
 * One model drives everything: the on-screen preview, the PDF, the Word file and the plain text all render the
 * same list of blocks, so what the tenant sees is what they download. Nothing leaves the browser.
 *
 * Wording rules match the paid dispute letter: it asks for explanations and records, it states no deadline the
 * software cannot know, and anything the tenant must supply stays a [bracketed placeholder].
 */

export type ThemeId = "classic" | "modern" | "banner" | "plain";
export type FontId = "serif" | "sans";

export interface LetterItem {
  id: string;
  title: string;
  body: string;
}

export interface LetterData {
  date: string;
  senderName: string;
  senderTitle: string;
  senderBusiness: string;
  senderAddress: string;
  senderPhone: string;
  senderEmail: string;
  recipientName: string;
  recipientCompany: string;
  recipientAddress: string;
  premises: string;
  period: string;
  statementDate: string;
  responseBy: string;
  opening: string;
  items: LetterItem[];
  requestsIntro: string;
  requests: string[];
  closing: string;
  signoff: string;
}

export interface LetterStyle {
  theme: ThemeId;
  font: FontId;
  accent: string;
}

export const THEMES: { id: ThemeId; name: string; note: string; font: FontId }[] = [
  { id: "classic", name: "Classic", note: "Centered letterhead, serif type", font: "serif" },
  { id: "modern", name: "Modern", note: "Accent rule and colored headings", font: "sans" },
  { id: "banner", name: "Banner", note: "Full-color header band", font: "sans" },
  { id: "plain", name: "Plain", note: "Standard business letter, no color", font: "serif" },
];

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "Ink", hex: "#0b1b33" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Forest", hex: "#166534" },
  { name: "Burgundy", hex: "#7f1d1d" },
  { name: "Copper", hex: "#9a4507" },
  { name: "Plum", hex: "#5b21b6" },
  { name: "Slate", hex: "#334155" },
];

export const DEFAULT_STYLE: LetterStyle = { theme: "modern", font: "sans", accent: "#0f766e" };

/** Fields that can appear as [tokens] inside the editable paragraphs and are filled from the form. */
export const FIELD_TOKENS: { key: keyof LetterData; token: string }[] = [
  { key: "premises", token: "Premises" },
  { key: "period", token: "Reconciliation period" },
  { key: "statementDate", token: "Statement date" },
  { key: "responseBy", token: "Response date" },
  { key: "recipientName", token: "Recipient name" },
  { key: "senderBusiness", token: "Business name" },
];

export const ITEM_PRESETS: { title: string; body: string }[] = [
  {
    title: "Management fee",
    body:
      "The statement shows [amount or percentage] on page [page]. Section [lease section] of our lease says \"[short, exact quote from the lease]\". Could you explain how the statement amount was calculated and where the lease permits it?",
  },
  {
    title: "Roof repair or replacement",
    body:
      "The statement includes [amount] for [description] on page [page]. Could you tell me whether this was treated as an operating expense or a capital expense, and which lease provision allows it to be passed through? Please send the invoice or contract for the work.",
  },
  {
    title: "Pro-rata share",
    body:
      "The statement uses [percentage]. Our lease indicates [percentage or square footage]. Could you send the calculation behind the percentage and the building area you used?",
  },
  {
    title: "Expense the lease appears to exclude",
    body:
      "The statement includes [amount] for [category] on page [page]. Section [lease section] of our lease says \"[short, exact quote from the lease]\". Could you explain why this cost was included in operating expenses?",
  },
  {
    title: "Increase over a CAM cap",
    body:
      "Controllable expenses on the statement are [amount], compared with [prior-year amount] last year. Section [lease section] of our lease limits increases to [cap]. Could you show how the cap was applied to this year's charges?",
  },
  {
    title: "Gross-up adjustment",
    body:
      "The statement appears to gross up [expense category] to [percentage] occupancy on page [page]. Could you send the gross-up calculation, the actual occupancy for the period, and the lease provision that allows the adjustment?",
  },
  {
    title: "Insurance or tax allocation",
    body:
      "The statement allocates [amount] of [insurance or real estate tax] to our premises on page [page]. Could you send the bill or policy summary and show how our share was calculated?",
  },
  {
    title: "Other charge",
    body: "The statement includes [amount] for [description] on page [page]. Could you explain this charge and send the supporting invoice?",
  },
];

let idSeq = 0;
export const newId = () => `i${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function defaultLetter(): LetterData {
  return {
    date: "",
    senderName: "",
    senderTitle: "",
    senderBusiness: "",
    senderAddress: "",
    senderPhone: "",
    senderEmail: "",
    recipientName: "",
    recipientCompany: "",
    recipientAddress: "",
    premises: "",
    period: "",
    statementDate: "",
    responseBy: "",
    opening:
      "I am writing about the CAM reconciliation statement dated [Statement date] for the premises above. While reviewing it against our lease, I found [Number of items] I would like to understand better. I am asking for an explanation and supporting records, and I am not assuming that anything is incorrect.",
    items: ITEM_PRESETS.slice(0, 3).map((p) => ({ id: newId(), ...p })),
    requestsIntro: "Please also send:",
    requests: [
      "The general ledger or expense detail behind the operating expense total",
      "The prior-year reconciliation, if not already provided",
      "Any allocation or gross-up calculation applied",
      "Invoices for the items listed above",
    ],
    closing:
      "Please respond by [Response date]. I am reserving my rights under the lease while I review your reply, and I would welcome a call if that is easier.",
    signoff: "Sincerely,",
  };
}

// ---------------------------------------------------------------------------
// Text filling
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ["no items", "one item", "two items", "three items", "four items", "five items", "six items", "seven items", "eight items", "nine items", "ten items"];

export function itemCountPhrase(n: number): string {
  return NUMBER_WORDS[n] ?? `${n} items`;
}

/** Replaces [Field] tokens with the matching form value; unknown or empty tokens stay bracketed. */
export function fillTokens(text: string, data: LetterData): string {
  let out = text.replace(/\[Number of items\]/g, data.items.length ? itemCountPhrase(data.items.length) : "[Number of items]");
  for (const { key, token } of FIELD_TOKENS) {
    const v = String(data[key] ?? "").trim();
    if (!v) continue;
    out = out.split(`[${token}]`).join(v.replace(/\n+/g, ", "));
  }
  return out;
}

const or = (v: string, placeholder: string) => (v.trim() ? v.trim() : `[${placeholder}]`);
const lines = (v: string) => v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Block model shared by preview, PDF, DOCX and text
// ---------------------------------------------------------------------------

export type Block =
  | { kind: "letterhead"; name: string; sub: string[] }
  | { kind: "date"; text: string }
  | { kind: "address"; lines: string[] }
  | { kind: "subject"; text: string }
  | { kind: "para"; text: string }
  | { kind: "item"; n: number; title: string; body: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "signature"; signoff: string; lines: string[] };

export function buildBlocks(data: LetterData): Block[] {
  const blocks: Block[] = [];
  const business = data.senderBusiness.trim();
  const contact = [data.senderPhone.trim(), data.senderEmail.trim()].filter(Boolean).join("  |  ");
  const sub = [...lines(data.senderAddress), ...(contact ? [contact] : [])];
  blocks.push({
    kind: "letterhead",
    name: business || or(data.senderName, "Your business name"),
    sub: sub.length ? sub : ["[Your address]", "[Phone]  |  [Email]"],
  });
  blocks.push({ kind: "date", text: or(data.date, "Date") });
  blocks.push({
    kind: "address",
    lines: [
      or(data.recipientName, "Landlord or property manager name"),
      ...(data.recipientCompany.trim() ? [data.recipientCompany.trim()] : []),
      ...(lines(data.recipientAddress).length ? lines(data.recipientAddress) : ["[Address]"]),
    ],
  });
  blocks.push({
    kind: "subject",
    text: `Re: ${or(data.premises, "Premises address / suite")} - CAM reconciliation for ${or(data.period, "year or period")}`,
  });
  blocks.push({ kind: "para", text: `Dear ${or(data.recipientName, "Name")},` });
  if (data.opening.trim()) blocks.push({ kind: "para", text: fillTokens(data.opening.trim(), data) });
  data.items.forEach((it, i) => {
    blocks.push({ kind: "item", n: i + 1, title: fillTokens(it.title.trim() || "[Item]", data), body: fillTokens(it.body.trim(), data) });
  });
  const reqs = data.requests.map((r) => r.trim()).filter(Boolean);
  if (reqs.length) {
    if (data.requestsIntro.trim()) blocks.push({ kind: "para", text: fillTokens(data.requestsIntro.trim(), data) });
    blocks.push({ kind: "bullets", items: reqs.map((r) => fillTokens(r, data)) });
  }
  for (const p of data.closing.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    blocks.push({ kind: "para", text: fillTokens(p, data) });
  }
  blocks.push({
    kind: "signature",
    signoff: data.signoff.trim() || "Sincerely,",
    lines: [
      or(data.senderName, "Your name"),
      ...(data.senderTitle.trim() ? [data.senderTitle.trim()] : []),
      or(data.senderBusiness, "Business name"),
      ...(contact ? [contact] : ["[Phone]  |  [Email]"]),
    ],
  });
  return blocks;
}

/** Every [placeholder] still left in the finished letter, de-duplicated, in order. */
export function remainingPlaceholders(blocks: Block[]): string[] {
  const seen = new Set<string>();
  const add = (s: string) => {
    for (const m of s.matchAll(/\[[^\]\n]{1,80}\]/g)) seen.add(m[0]);
  };
  for (const b of blocks) {
    if (b.kind === "letterhead") [b.name, ...b.sub].forEach(add);
    else if (b.kind === "address") b.lines.forEach(add);
    else if (b.kind === "bullets") b.items.forEach(add);
    else if (b.kind === "item") [b.title, b.body].forEach(add);
    else if (b.kind === "signature") [b.signoff, ...b.lines].forEach(add);
    else add(b.text);
  }
  return [...seen];
}

export function toPlainText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "letterhead": out.push(b.name, ...b.sub, ""); break;
      case "date": out.push(b.text, ""); break;
      case "address": out.push(...b.lines, ""); break;
      case "subject": out.push(b.text, ""); break;
      case "para": out.push(b.text, ""); break;
      case "item": out.push(`${b.n}. ${b.title}`, `   ${b.body}`, ""); break;
      case "bullets": out.push(...b.items.map((i) => `- ${i}`), ""); break;
      case "signature": out.push(b.signoff, "", ...b.lines); break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export function normalizeHex(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return DEFAULT_STYLE.accent;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text color that stays readable on top of the accent (used by the banner theme). */
export function onAccent(hex: string): "#ffffff" | "#0b1b33" {
  return luminance(hex) > 0.4 ? "#0b1b33" : "#ffffff";
}

/**
 * The accent as used for text on white paper. Very light picks are darkened until they reach about 4.5:1 so
 * headings stay legible when printed.
 */
export function inkAccent(hex: string): string {
  let [r, g, b] = hexToRgb(hex);
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  for (let i = 0; i < 20; i++) {
    const h = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    if ((1.05) / (luminance(h) + 0.05) >= 4.5) return h;
    r *= 0.85; g *= 0.85; b *= 0.85;
  }
  return "#0b1b33";
}

/** The color a theme actually uses for accents ("plain" is always black ink). */
export function themeAccent(style: LetterStyle): string {
  return style.theme === "plain" ? "#111111" : normalizeHex(style.accent);
}

// ---------------------------------------------------------------------------
// PDF (pdf-lib, standard fonts)
// ---------------------------------------------------------------------------

/** Standard PDF fonts only encode WinAnsi; map common characters and drop the rest. */
export function toWinAnsi(input: string): string {
  return input
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "?");
}

/**
 * A letter that only just spills onto a second page (usually the signature alone) is re-set slightly tighter so
 * it fits on one. Longer letters keep the normal spacing and get page numbers.
 */
export async function letterToPdf(blocks: Block[], style: LetterStyle): Promise<Uint8Array> {
  const normal = await renderPdf(blocks, style, 1);
  if (normal.pages === 1) return normal.bytes;
  for (const fit of [0.93, 0.86]) {
    const tight = await renderPdf(blocks, style, fit);
    if (tight.pages === 1) return tight.bytes;
  }
  return normal.bytes;
}

async function renderPdf(blocks: Block[], style: LetterStyle, fit: number): Promise<{ bytes: Uint8Array; pages: number }> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle("CAM dispute letter");
  pdf.setCreator("LeaseGuard letter template");
  const serif = style.font === "serif";
  const regular = await pdf.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
  const bold = await pdf.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const accentHex = themeAccent(style);
  const color = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return rgb(r, g, b);
  };
  const ink = color("#1a1a1a");
  const muted = color("#555555");
  const accent = color(accentHex);
  const accentText = color(inkAccent(accentHex));

  const W = 612;
  const H = 792;
  const margin = 68;
  const marginY = 54;
  const textW = W - margin * 2;
  const size = (serif ? 11 : 10.25) * (0.6 + 0.4 * fit);
  const LH = 1.4 - (1 - fit) * 1.2;
  const lh = size * LH;

  let page = pdf.addPage([W, H]);
  let y = H - marginY;

  const wrap = (text: string, font: typeof regular, s: number, width: number): string[] => {
    const out: string[] = [];
    for (const raw of toWinAnsi(text).split("\n")) {
      const words = raw.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let line = "";
      for (const w of words) {
        const cand = line ? `${line} ${w}` : w;
        if (line && font.widthOfTextAtSize(cand, s) > width) { out.push(line); line = w; }
        else line = cand;
      }
      out.push(line);
    }
    return out;
  };
  const ensure = (need: number) => {
    if (y - need < marginY) { page = pdf.addPage([W, H]); y = H - marginY; }
  };
  const draw = (text: string, opts: { x?: number; font?: typeof regular; s?: number; c?: ReturnType<typeof rgb>; width?: number; gap?: number }) => {
    const font = opts.font ?? regular;
    const s = opts.s ?? size;
    const x = opts.x ?? margin;
    for (const l of wrap(text, font, s, opts.width ?? textW - (x - margin))) {
      ensure(s * LH);
      if (l) page.drawText(l, { x, y: y - s, size: s, font, color: opts.c ?? ink });
      y -= s * LH;
    }
    y -= opts.gap ?? 0;
  };

  for (const b of blocks) {
    switch (b.kind) {
      case "letterhead": {
        const t = toWinAnsi(b.name);
        if (style.theme === "banner") {
          const bandH = 34 + 18 + b.sub.length * 12;
          page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: accent });
          const on = color(onAccent(accentHex));
          page.drawText(t, { x: margin, y: H - 40, size: 20, font: bold, color: on });
          b.sub.forEach((l, i) => page.drawText(toWinAnsi(l), { x: margin, y: H - 58 - i * 12, size: 9, font: regular, color: on, opacity: 0.9 }));
          y = H - bandH - 30;
        } else if (style.theme === "classic") {
          const w = bold.widthOfTextAtSize(t, 18);
          page.drawText(t, { x: (W - w) / 2, y: y - 18, size: 18, font: bold, color: accentText });
          y -= 26;
          for (const l of b.sub) {
            const s = toWinAnsi(l);
            const lw = regular.widthOfTextAtSize(s, 9);
            page.drawText(s, { x: (W - lw) / 2, y: y - 9, size: 9, font: regular, color: muted });
            y -= 12;
          }
          y -= 8;
          page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 1, color: accent });
          page.drawLine({ start: { x: margin, y: y - 3 }, end: { x: W - margin, y: y - 3 }, thickness: 0.4, color: accent });
          y -= 22;
        } else if (style.theme === "modern") {
          const top = y;
          page.drawText(t, { x: margin + 14, y: y - 18, size: 18, font: bold, color: accentText });
          y -= 26;
          for (const l of b.sub) {
            page.drawText(toWinAnsi(l), { x: margin + 14, y: y - 9, size: 9, font: regular, color: muted });
            y -= 12;
          }
          page.drawRectangle({ x: margin, y: y + 2, width: 4, height: top - y - 2, color: accent });
          y -= 24;
        } else {
          // plain: sender block, top left, like a standard business letter
          draw(b.name, { font: bold });
          for (const l of b.sub) draw(l, {});
          y -= lh;
        }
        break;
      }
      case "date": draw(b.text, { gap: lh * 0.8 }); break;
      case "address": for (const l of b.lines) draw(l, {}); y -= lh * 0.8; break;
      case "subject": draw(b.text, { font: bold, c: style.theme === "plain" ? ink : accentText, gap: lh * 0.8 }); break;
      case "para": draw(b.text, { gap: lh * 0.6 }); break;
      case "item": {
        ensure(lh * 3);
        draw(`${b.n}. ${b.title}`, { font: bold, c: style.theme === "plain" ? ink : accentText, gap: 2 });
        draw(b.body, { x: margin + 16, gap: lh * 0.6 });
        break;
      }
      case "bullets":
        for (const it of b.items) {
          const lines0 = wrap(it, regular, size, textW - 16);
          ensure(lh);
          page.drawCircle({ x: margin + 5, y: y - size * 0.62, size: 1.8, color: style.theme === "plain" ? ink : accent });
          lines0.forEach((l) => {
            ensure(lh);
            page.drawText(l, { x: margin + 16, y: y - size, size, font: regular, color: ink });
            y -= lh;
          });
        }
        y -= lh * 0.6;
        break;
      case "signature":
        ensure(lh * (b.lines.length + 4));
        draw(b.signoff, { gap: lh * 1.8 });
        b.lines.forEach((l, i) => draw(l, { font: i === 0 ? bold : regular, c: i === 0 ? ink : muted }));
        break;
    }
  }
  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((pg, i) => {
      const label = `Page ${i + 1} of ${pages.length}`;
      pg.drawText(label, { x: W - margin - regular.widthOfTextAtSize(label, 8), y: 28, size: 8, font: regular, color: muted });
    });
  }
  return { bytes: await pdf.save(), pages: pages.length };
}

// ---------------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------------

export async function letterToDocx(blocks: Block[], style: LetterStyle): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType } = await import("docx");
  const font = style.font === "serif" ? "Georgia" : "Calibri";
  const size = style.font === "serif" ? 23 : 22;
  const accentHex = themeAccent(style);
  const acc = accentHex.slice(1);
  const accText = inkAccent(accentHex).slice(1);
  const on = onAccent(accentHex).slice(1);
  const plain = style.theme === "plain";
  const run = (text: string, o: { bold?: boolean; color?: string; size?: number } = {}) =>
    new TextRun({ text, font, size: o.size ?? size, bold: o.bold, color: o.color });
  const p = (children: InstanceType<typeof TextRun>[], o: Record<string, unknown> = {}) =>
    new Paragraph({ spacing: { after: 0, line: 300 }, children, ...o });

  const out: InstanceType<typeof Paragraph>[] = [];
  const gap = () => out.push(p([run("")]));

  for (const b of blocks) {
    switch (b.kind) {
      case "letterhead": {
        if (style.theme === "banner") {
          const shade = { type: ShadingType.CLEAR, color: "auto", fill: acc };
          out.push(p([run(b.name, { bold: true, color: on, size: 40 })], { shading: shade, spacing: { before: 0, after: 0 }, indent: { left: 200, right: 200 } }));
          b.sub.forEach((l) => out.push(p([run(l, { color: on, size: 18 })], { shading: shade, indent: { left: 200, right: 200 } })));
        } else if (style.theme === "classic") {
          out.push(p([run(b.name, { bold: true, color: accText, size: 36 })], { alignment: AlignmentType.CENTER }));
          b.sub.forEach((l, i) =>
            out.push(
              p([run(l, { color: "555555", size: 18 })], {
                alignment: AlignmentType.CENTER,
                ...(i === b.sub.length - 1 ? { border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: acc, space: 8 } } } : {}),
              }),
            ),
          );
        } else if (style.theme === "modern") {
          const border = { left: { style: BorderStyle.SINGLE, size: 24, color: acc, space: 10 } };
          out.push(p([run(b.name, { bold: true, color: accText, size: 36 })], { border }));
          b.sub.forEach((l) => out.push(p([run(l, { color: "555555", size: 18 })], { border })));
        } else {
          out.push(p([run(b.name, { bold: true })]));
          b.sub.forEach((l) => out.push(p([run(l)])));
        }
        gap(); gap();
        break;
      }
      case "date": out.push(p([run(b.text)])); gap(); break;
      case "address": b.lines.forEach((l) => out.push(p([run(l)]))); gap(); break;
      case "subject": out.push(p([run(b.text, { bold: true, color: plain ? undefined : accText })])); gap(); break;
      case "para": out.push(p([run(b.text)])); gap(); break;
      case "item":
        out.push(p([run(`${b.n}. ${b.title}`, { bold: true, color: plain ? undefined : accText })], { keepNext: true }));
        out.push(p([run(b.body)], { indent: { left: 360 } }));
        gap();
        break;
      case "bullets":
        b.items.forEach((it) => out.push(p([run(it)], { bullet: { level: 0 } })));
        gap();
        break;
      case "signature":
        out.push(p([run(b.signoff)], { keepNext: true }));
        gap(); gap();
        b.lines.forEach((l, i) => out.push(p([run(l, { bold: i === 0, color: i === 0 ? undefined : "555555" })], { keepNext: i < b.lines.length - 1 })));
        break;
    }
  }

  const doc = new Document({
    creator: "LeaseGuard letter template",
    title: "CAM dispute letter",
    sections: [{ properties: { page: { margin: { top: style.theme === "banner" ? 720 : 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: out }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
