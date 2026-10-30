import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { planMoney, reviewedSentence, TIER_LABEL, type ReviewPlan } from "@/services/review-plan";
import { toWinAnsi } from "@/services/dispute-letter";
import { ROUNDING_NOTE } from "@/lib/format";

/**
 * Draws the CAM Review Plan into the existing paid report PDF: a one-page checklist and action summary,
 * then each item in priority order. Standard PDF fonts only encode WinAnsi, so all text goes through toWinAnsi.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 60;
const WIDTH = PAGE_W - MARGIN * 2;
const BOTTOM = 60;
const DARK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.38, 0.41, 0.46);
const BLUE = rgb(0.11, 0.31, 0.85);
const LINE = rgb(0.88, 0.89, 0.91);

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }
  need(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }
  private wrap(text: string, f: PDFFont, size: number, width: number): string[] {
    const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  /** wrapped paragraph; returns nothing, advances the cursor */
  para(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 9;
    const f = o.bold ? this.bold : this.font;
    const indent = o.indent ?? 0;
    for (const line of this.wrap(text, f, size, WIDTH - indent)) {
      this.need(size + 4);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font: f, color: o.color ?? DARK });
      this.y -= size + 3.5;
    }
    this.y -= o.gap ?? 3;
  }
  bullets(items: string[], size = 9, indent = 10, box = false) {
    for (const it of items) {
      const lines = this.wrap(it, this.font, size, WIDTH - indent - 14);
      this.need((size + 3.5) * Math.min(lines.length, 2) + 2);
      lines.forEach((line, i) => {
        this.need(size + 4);
        if (i === 0) {
          if (box) this.page.drawRectangle({ x: MARGIN + indent, y: this.y - 1, width: 7, height: 7, borderColor: GRAY, borderWidth: 0.8 });
          else this.page.drawText("-", { x: MARGIN + indent, y: this.y, size, font: this.font, color: GRAY });
        }
        this.page.drawText(line, { x: MARGIN + indent + 14, y: this.y, size, font: this.font, color: DARK });
        this.y -= size + 3.5;
      });
      this.y -= 1.5;
    }
  }
  rule() {
    this.need(10);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + WIDTH, y: this.y }, thickness: 0.8, color: LINE });
    this.y -= 12;
  }
}

export function drawReviewPlanPages(doc: PDFDocument, font: PDFFont, bold: PDFFont, plan: ReviewPlan): void {
  const w = new Writer(doc, font, bold);

  // ── page 1: title, caution, checklist and action summary ──
  w.para("CAM Review Plan", { size: 20, bold: true, color: BLUE, gap: 6 });
  w.para(plan.caution, { size: 8.5, color: GRAY, gap: 6 });

  if (plan.empty) {
    w.para("The report has no findings to organize. You can still compare your statement with your lease yourself.", { size: 10 });
    return;
  }

  const c = plan.tierCounts;
  w.para(`Calculated from your documents: ${c.calculated}   |   Needs your judgment: ${c.judgment}   |   Needs more information: ${c["needs-data"]}   |   Matches: ${c.match}`, { size: 9, bold: true, gap: 2 });
  if (plan.calculatedTotal > 0 || plan.judgmentTotal > 0) {
    w.para(
      `Amounts in question: ${planMoney(plan.calculatedTotal)} calculated and ${planMoney(plan.judgmentTotal)} that depends on judgment. They are kept separate because they are different kinds of items, and neither is a confirmed overcharge. ${ROUNDING_NOTE}`,
      { size: 8.5, color: GRAY, gap: 2 },
    );
  }
  if (plan.confidenceNote) w.para(plan.confidenceNote, { size: 8.5, color: GRAY, gap: 2 });
  const readSentence = reviewedSentence(plan.reviewed);
  if (readSentence) w.para(readSentence, { size: 8.5, color: GRAY, gap: 4 });
  w.rule();

  w.para("One-page checklist and action summary", { size: 12, bold: true, color: BLUE, gap: 4 });
  if (plan.topActions.length) {
    w.para("Next steps", { size: 9, bold: true, gap: 1 });
    w.bullets(plan.topActions, 9);
  }
  for (const g of plan.checklist) {
    w.para(g.title, { size: 9, bold: true, gap: 1 });
    w.bullets(g.steps, 8.5, 10, true);
  }

  // ── following pages: the items ──
  w.newPage();
  w.para("Your items, in priority order", { size: 14, bold: true, color: BLUE, gap: 3 });
  w.para(plan.rankingRule, { size: 8.5, color: GRAY, gap: 8 });

  for (const it of plan.items) {
    w.need(70);
    w.para(`${it.rank}. ${it.title}`, { size: 11, bold: true, gap: 1 });
    w.para(`${TIER_LABEL[it.tier]}${it.amount != null && it.amount > 0 ? `  |  ${planMoney(it.amount)} in question` : ""}  |  ${it.evidenceLabel}`, { size: 8.5, color: GRAY, gap: 3 });
    w.para(`Why it is ranked here: ${it.whyRanked}`, { size: 9, gap: 2 });
    if (it.whatWeFound) w.para(`What the report says: ${it.whatWeFound}`, { size: 9, gap: 2 });
    w.para("How it was worked out", { size: 9, bold: true, gap: 1 });
    if (it.calculation.length) w.bullets(it.calculation, 8.5);
    else w.para("The report does not hold step-by-step figures for this item.", { size: 8.5, color: GRAY, indent: 10, gap: 2 });
    for (const e of it.evidence.slice(0, 2)) {
      w.para(`Evidence, ${e.document}${e.page != null ? `, page ${e.page}` : ""}${e.quote ? `: "${e.quote}"` : ""}`, { size: 8.5, color: GRAY, indent: 10, gap: 2 });
    }
    if (it.questions.length) {
      w.para("Questions you could ask your landlord", { size: 9, bold: true, gap: 1 });
      w.bullets(it.questions, 8.5);
    }
    if (it.documents.length) {
      w.para("Documents to review or request", { size: 9, bold: true, gap: 1 });
      w.bullets(it.documents, 8.5);
    }
    w.rule();
  }
}
