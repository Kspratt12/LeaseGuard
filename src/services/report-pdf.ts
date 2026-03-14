import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Finding, OverchargeLineItem, LeaseClauseSummary } from "@/services/audit-logic";
import { getLeaseClauseEvidence } from "@/lib/lease-clause-evidence";

interface ReportInput {
  auditId: string;
  createdAt: string;
  savingsEstimate: number;
  freeFindings: Finding[];
  paidFindings: Finding[];
  isPaid: boolean;
  confidence?: "high" | "medium" | "low";
  confidenceScore?: number;
  validationWarning?: string | null;
  estimatedOvercharge?: number;
  overchargeBreakdown?: OverchargeLineItem[];
  leaseClausesSummary?: LeaseClauseSummary | null;
}

// Colors
const BLUE = rgb(0.11, 0.31, 0.85);
const GRAY = rgb(0.42, 0.45, 0.49);
const LIGHT_GRAY = rgb(0.62, 0.64, 0.67);
const GREEN = rgb(0.08, 0.5, 0.24);
const DARK = rgb(0.07, 0.09, 0.15);
const RED = rgb(0.86, 0.15, 0.15);
const AMBER = rgb(0.85, 0.47, 0.02);
const LINE_GRAY = rgb(0.88, 0.89, 0.91);
const BG_GREEN = rgb(0.95, 0.99, 0.96);

const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const MARGIN = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_MARGIN = 60;

// ---------------------------------------------------------------------------
// Page context — tracks current page + cursor, allows adding pages on demand
// ---------------------------------------------------------------------------
interface PageCtx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
}

/** Start a fresh page and reset cursor. */
function newPage(ctx: PageCtx): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

/** If fewer than `needed` vertical points remain, start a new page. */
function ensureSpace(ctx: PageCtx, needed: number): void {
  if (ctx.y - needed < BOTTOM_MARGIN) {
    newPage(ctx);
  }
}

// ---------------------------------------------------------------------------
// Estimate the rendered height of a finding block (without drawing)
// ---------------------------------------------------------------------------
function estimateFindingHeight(
  finding: Finding,
  font: PDFFont,
  leaseClausesSummary?: LeaseClauseSummary | null,
): number {
  const descLines = wrapText(finding.description, font, 10, CONTENT_WIDTH);
  // title(13) + gap(16) + badge(8) + gap(14) + desc lines + gap(4)
  // + action/savings(11) + gap(16) + separator(0.5) + gap(18)
  let h = 16 + 14 + descLines.length * 14 + 4 + 16 + 18;
  // Add space for evidence snippets
  if (finding.sourceEvidence) {
    const evCount = Math.min(finding.sourceEvidence.length, 2);
    h += evCount * 30; // approx per evidence item
  }
  // Add space for lease clause evidence
  const clauseRef = getLeaseClauseEvidence(finding, leaseClausesSummary);
  if (clauseRef) {
    const clauseLines = wrapText(`"${clauseRef.text}"`, font, 9, CONTENT_WIDTH - 26);
    h += 14 + 14 + clauseLines.length * 13 + 10; // label + section + quote lines + padding
  }
  return h;
}

export async function generateReportPdf(
  input: ReportInput,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: PageCtx = {
    doc,
    page: null!,  // set by first newPage call
    y: 0,
    font,
    fontBold,
  };

  // ================================================================
  // Page 1: Cover / Summary
  // ================================================================
  newPage(ctx);
  ctx.y = PAGE_HEIGHT - 80;

  // Title block
  ctx.y = drawCenteredText(ctx.page, "LeaseGuard", fontBold, 30, BLUE, ctx.y);
  ctx.y -= 36;
  ctx.y = drawCenteredText(ctx.page, "CAM Audit Report", font, 15, DARK, ctx.y);

  // Thin divider
  ctx.y -= 24;
  ctx.page.drawLine({
    start: { x: PAGE_WIDTH / 2 - 80, y: ctx.y },
    end: { x: PAGE_WIDTH / 2 + 80, y: ctx.y },
    thickness: 0.75,
    color: LINE_GRAY,
  });

  // Metadata
  ctx.y -= 28;
  ctx.y = drawCenteredText(
    ctx.page,
    `Audit ID: ${input.auditId}`,
    font,
    9,
    LIGHT_GRAY,
    ctx.y,
  );
  ctx.y -= 14;
  ctx.y = drawCenteredText(
    ctx.page,
    `Date of Analysis: ${formatDate(input.createdAt)}`,
    font,
    9,
    LIGHT_GRAY,
    ctx.y,
  );

  // Savings highlight box
  ctx.y -= 52;
  const overcharge = input.estimatedOvercharge ?? 0;
  const overchargeBreakdown = input.overchargeBreakdown ?? [];
  const hasOvercharge = overcharge > 0 && overchargeBreakdown.length > 0;
  const boxH = 90;
  const boxW = 320;
  const boxX = (PAGE_WIDTH - boxW) / 2;

  if (hasOvercharge) {
    const BG_OVERCHARGE = rgb(0.98, 0.94, 0.92);
    ctx.page.drawRectangle({
      x: boxX,
      y: ctx.y - boxH,
      width: boxW,
      height: boxH,
      color: BG_OVERCHARGE,
      borderColor: rgb(0.93, 0.82, 0.76),
      borderWidth: 1,
    });
    const labelY = ctx.y - 28;
    drawCenteredText(ctx.page, "ESTIMATED RECOVERABLE OVERCHARGES", fontBold, 8, RED, labelY);
    const amountY = labelY - 38;
    drawCenteredText(ctx.page, `$${overcharge.toLocaleString()}`, fontBold, 36, RED, amountY);
  } else if (input.savingsEstimate > 0) {
    ctx.page.drawRectangle({
      x: boxX,
      y: ctx.y - boxH,
      width: boxW,
      height: boxH,
      color: BG_GREEN,
      borderColor: rgb(0.85, 0.93, 0.87),
      borderWidth: 1,
    });
    const labelY = ctx.y - 28;
    drawCenteredText(ctx.page, "ESTIMATED RECOVERABLE OVERCHARGES", fontBold, 9, GREEN, labelY);
    const amountY = labelY - 38;
    drawCenteredText(ctx.page, `$${input.savingsEstimate.toLocaleString()}`, fontBold, 36, GREEN, amountY);
  } else {
    const BG_GRAY = rgb(0.96, 0.96, 0.97);
    ctx.page.drawRectangle({
      x: boxX,
      y: ctx.y - boxH,
      width: boxW,
      height: boxH,
      color: BG_GRAY,
      borderColor: LINE_GRAY,
      borderWidth: 1,
    });
    const labelY = ctx.y - 28;
    drawCenteredText(ctx.page, "NO CLEAR OVERCHARGES DETECTED", fontBold, 9, GRAY, labelY);
    const textY = labelY - 26;
    const noOverchargeLines = wrapText(
      "The uploaded documents did not show a clear recoverable billing discrepancy based on current audit checks.",
      font,
      9,
      boxW - 24,
    );
    let noOverchargeY = textY;
    for (const line of noOverchargeLines) {
      drawCenteredText(ctx.page, line, font, 9, GRAY, noOverchargeY);
      noOverchargeY -= 13;
    }
  }
  ctx.y = ctx.y - boxH;

  // Overcharge breakdown table (on page 1 if space, otherwise continuation)
  if (hasOvercharge) {
    ctx.y -= 28;
    drawCenteredText(ctx.page, "Excluded Expense Overcharge Breakdown", fontBold, 11, DARK, ctx.y);
    ctx.y -= 24;

    const col0Left = MARGIN;
    const col1Right = MARGIN + 240;
    const col2Right = MARGIN + 310;
    const col3Right = MARGIN + 400;
    const col4Left = MARGIN + 414;

    // Table headers
    ctx.page.drawText("Category", { x: col0Left, y: ctx.y, size: 8, font: fontBold, color: GRAY });
    drawRightAlignedText(ctx.page, "Total Expense", fontBold, 8, GRAY, col1Right, ctx.y);
    drawRightAlignedText(ctx.page, "Tenant Share", fontBold, 8, GRAY, col2Right, ctx.y);
    drawRightAlignedText(ctx.page, "Tenant Charge", fontBold, 8, GRAY, col3Right, ctx.y);
    ctx.page.drawText("Reason", { x: col4Left, y: ctx.y, size: 8, font: fontBold, color: GRAY });
    ctx.y -= 6;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y }, thickness: 0.75, color: LINE_GRAY });
    ctx.y -= 16;

    // Table rows
    for (const row of overchargeBreakdown) {
      if (ctx.y < 100) {
        newPage(ctx);
      }
      const catName = row.category.replace(/\b\w/g, (c) => c.toUpperCase());
      ctx.page.drawText(catName, { x: col0Left, y: ctx.y, size: 9, font, color: DARK });
      drawRightAlignedText(ctx.page, `$${row.total_expense.toLocaleString()}`, font, 9, DARK, col1Right, ctx.y);
      drawRightAlignedText(ctx.page, `${row.tenant_share_percent}%`, font, 9, DARK, col2Right, ctx.y);
      drawRightAlignedText(ctx.page, `$${row.tenant_charge.toLocaleString()}`, fontBold, 9, RED, col3Right, ctx.y);
      const reasonMaxW = MARGIN + CONTENT_WIDTH - col4Left;
      const reasonLines = wrapText(row.reason, font, 8, reasonMaxW);
      if (reasonLines.length > 0) {
        ctx.page.drawText(reasonLines[0], { x: col4Left, y: ctx.y, size: 8, font, color: LIGHT_GRAY });
      }
      ctx.y -= 18;
    }

    // Total row
    ctx.y -= 2;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 10 }, end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y + 10 }, thickness: 0.75, color: LINE_GRAY });
    ctx.page.drawText("Total Estimated Overcharge", { x: col0Left, y: ctx.y, size: 9, font: fontBold, color: DARK });
    drawRightAlignedText(ctx.page, `$${overcharge.toLocaleString()}`, fontBold, 9, RED, col3Right, ctx.y);
    ctx.y -= 18;
  }

  // Confidence indicator
  if (input.confidence) {
    ctx.y -= 36;
    const confLabel = `Audit Confidence: ${input.confidence.toUpperCase()}`;
    const confColor =
      input.confidence === "high"
        ? GREEN
        : input.confidence === "medium"
          ? AMBER
          : RED;
    const scoreText = input.confidenceScore != null
      ? ` (${input.confidenceScore}/100)`
      : "";
    drawCenteredText(ctx.page, confLabel + scoreText, fontBold, 11, confColor, ctx.y);
    ctx.y -= 8;
  }

  // Validation warning
  if (input.validationWarning) {
    ctx.y -= 16;
    const warnLines = wrapText(input.validationWarning, font, 9, CONTENT_WIDTH);
    for (const line of warnLines) {
      drawCenteredText(ctx.page, line, font, 9, AMBER, ctx.y);
      ctx.y -= 14;
    }
  }

  // Summary paragraph
  ctx.y -= 52;
  const summaryLines = wrapText(
    "This report summarizes detected discrepancies between your commercial lease " +
      "terms and the CAM reconciliation statement(s) provided. Each finding references " +
      "a specific gap between what your lease allows and what was billed. " +
      "Professional review is recommended to confirm findings before taking action.",
    font,
    10,
    CONTENT_WIDTH,
  );
  for (const line of summaryLines) {
    ctx.y = drawText(ctx.page, line, font, 10, DARK, MARGIN, ctx.y);
    ctx.y -= 16;
  }

  // Disclaimer pinned near bottom of page 1
  drawCenteredText(
    ctx.page,
    "AI-powered analysis for informational purposes only. Not legal or accounting advice.",
    font,
    8,
    LIGHT_GRAY,
    MARGIN + 20,
  );

  // ================================================================
  // Lease Clauses Detected — starts on a new page
  // ================================================================
  const lcs = input.leaseClausesSummary;
  let clausesDrawn = false;
  if (lcs) {
    const clauseRows: Array<{ label: string; value: string }> = [];
    if (lcs.camCap) clauseRows.push({ label: "CAM Cap", value: lcs.camCap });
    if (lcs.adminFeeCap) clauseRows.push({ label: "Admin Fee Cap", value: lcs.adminFeeCap });
    if (lcs.managementFeeCap) clauseRows.push({ label: "Management Fee Cap", value: lcs.managementFeeCap });
    if (lcs.tenantProRataShare) clauseRows.push({ label: "Tenant Pro-Rata Share", value: lcs.tenantProRataShare });
    if (lcs.tenantSquareFootage) clauseRows.push({ label: "Tenant Square Footage", value: lcs.tenantSquareFootage });
    if (lcs.buildingSquareFootage) clauseRows.push({ label: "Building Square Footage", value: lcs.buildingSquareFootage });

    const hasContent = clauseRows.length > 0 || lcs.excludedCategories.length > 0 || lcs.additionalClauses.length > 0;
    if (hasContent) {
      // Estimate clause section height
      let clauseHeight = 42 + 20; // title + confidence note
      clauseHeight += clauseRows.length * 18;
      if (lcs.excludedCategories.length > 0) {
        const excludedText = lcs.excludedCategories.join(", ");
        const excludedLines = wrapText(excludedText, font, 9, CONTENT_WIDTH);
        clauseHeight += 8 + 16 + excludedLines.length * 14;
      }
      if (lcs.additionalClauses.length > 0) {
        clauseHeight += 8 + 16 + lcs.additionalClauses.length * 16;
      }

      newPage(ctx);
      ctx.y = drawSectionTitle(ctx.page, "Lease Clauses Detected", fontBold, ctx.y);

      // Confidence note
      ctx.page.drawText(
        "Detected from lease language and extracted clause patterns.",
        { x: MARGIN, y: ctx.y, size: 9, font, color: LIGHT_GRAY },
      );
      ctx.y -= 20;

      // Label / value rows
      for (const row of clauseRows) {
        ensureSpace(ctx, 20);
        ctx.page.drawText(row.label, { x: MARGIN, y: ctx.y, size: 10, font, color: GRAY });
        const valX = MARGIN + 220;
        ctx.page.drawText(row.value, { x: valX, y: ctx.y, size: 10, font: fontBold, color: DARK });
        ctx.y -= 18;
      }

      // Excluded categories
      if (lcs.excludedCategories.length > 0) {
        ctx.y -= 8;
        ensureSpace(ctx, 30);
        ctx.page.drawText("Excluded Categories", { x: MARGIN, y: ctx.y, size: 10, font: fontBold, color: DARK });
        ctx.y -= 16;
        const excludedText = lcs.excludedCategories
          .map((c) => c.replace(/\b\w/g, (ch) => ch.toUpperCase()))
          .join(", ");
        const excludedLines = wrapText(excludedText, font, 9, CONTENT_WIDTH);
        for (const line of excludedLines) {
          ensureSpace(ctx, 14);
          ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 9, font, color: DARK });
          ctx.y -= 14;
        }
      }

      // Additional clauses
      if (lcs.additionalClauses.length > 0) {
        ctx.y -= 8;
        ensureSpace(ctx, 30);
        ctx.page.drawText("Additional Provisions", { x: MARGIN, y: ctx.y, size: 10, font: fontBold, color: DARK });
        ctx.y -= 16;
        for (const clause of lcs.additionalClauses) {
          ensureSpace(ctx, 16);
          ctx.page.drawText(`\u2022  ${clause}`, { x: MARGIN + 8, y: ctx.y, size: 9, font, color: DARK });
          ctx.y -= 16;
        }
      }

      clausesDrawn = true;
    }
  }

  // ================================================================
  // Identified Findings — continue on current page if enough room,
  // otherwise start a new page
  // ================================================================

  // Include premium findings that should appear in Identified Findings section
  const premiumInIdentified = input.paidFindings.filter(
    (f) =>
      f.category === "Tenant Allocation Discrepancy" ||
      f.category === "Administrative Fee Cap Exceeded" ||
      f.category === "Year-over-Year CAM Escalation Exceeds Lease Cap" ||
      f.category === "Possible Gross-Up / Occupancy Adjustment",
  );
  const identifiedFindings = [...input.freeFindings, ...premiumInIdentified];

  // Estimate if the findings section title + first finding fit on the current page
  const findingsTitleHeight = 42; // section title height
  const firstFindingHeight = identifiedFindings.length > 0
    ? estimateFindingHeight(identifiedFindings[0], font, lcs)
    : 30;
  const needsFreshPage = !clausesDrawn || (ctx.y - findingsTitleHeight - firstFindingHeight < BOTTOM_MARGIN);

  if (needsFreshPage) {
    newPage(ctx);
  } else {
    ctx.y -= 28; // spacer between clauses and findings
  }

  ctx.y = drawSectionTitle(ctx.page, "Identified Findings", fontBold, ctx.y);

  if (identifiedFindings.length === 0) {
    ctx.y -= 8;
    ctx.y = drawText(
      ctx.page,
      "No findings in this section.",
      font,
      11,
      GRAY,
      MARGIN,
      ctx.y,
    );
  } else {
    for (const finding of identifiedFindings) {
      const height = estimateFindingHeight(finding, font, lcs);
      ensureSpace(ctx, height);
      drawFinding(ctx, finding, lcs);
    }
  }

  // ================================================================
  // Source Evidence — always starts on a fresh page
  // ================================================================
  const evidenceItems = (input.overchargeBreakdown ?? []).filter(
    (r) => r.sourceEvidence,
  );
  if (evidenceItems.length > 0) {
    newPage(ctx);

    ctx.y = drawSectionTitle(ctx.page, "Source Evidence", fontBold, ctx.y);

    for (const item of evidenceItems) {
      // Estimate evidence block height
      const evHeight = estimateEvidenceHeight(item, font);
      ensureSpace(ctx, evHeight);

      const ev = item.sourceEvidence!;

      // Category title
      const catName = item.category.replace(/\b\w/g, (c) => c.toUpperCase());
      ctx.page.drawText(catName, {
        x: MARGIN,
        y: ctx.y,
        size: 12,
        font: fontBold,
        color: DARK,
      });
      ctx.y -= 16;

      // Document + page + finding category
      let docLine = `Document: ${ev.document}`;
      if (ev.page != null) docLine += `  ·  Page: ${ev.page}`;
      if (ev.findingCategory) docLine += `  ·  Finding: ${ev.findingCategory}`;
      ctx.page.drawText(docLine, {
        x: MARGIN,
        y: ctx.y,
        size: 9,
        font,
        color: GRAY,
      });
      ctx.y -= 14;

      // Extracted text
      if (ev.extractedText) {
        ctx.y -= 2;
        ctx.page.drawRectangle({
          x: MARGIN,
          y: ctx.y - 2,
          width: 2,
          height: 14,
          color: LINE_GRAY,
        });
        const snippetLines = wrapText(
          `"${ev.extractedText}"`,
          font,
          9,
          CONTENT_WIDTH - 16,
        );
        for (const line of snippetLines) {
          ctx.page.drawText(line, {
            x: MARGIN + 10,
            y: ctx.y,
            size: 9,
            font,
            color: GRAY,
          });
          ctx.y -= 13;
        }
        ctx.y -= 2;
      }

      // Amount details
      const detailLine =
        `Detected Amount: $${item.total_expense.toLocaleString()}` +
        `    Tenant Share: ${item.tenant_share_percent}%` +
        `    Estimated Overcharge: $${item.tenant_charge.toLocaleString()}`;
      ctx.page.drawText(detailLine, {
        x: MARGIN,
        y: ctx.y,
        size: 9,
        font: fontBold,
        color: RED,
      });
      ctx.y -= 14;

      // Separator
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
        thickness: 0.5,
        color: LINE_GRAY,
      });
      ctx.y -= 18;
    }
  }

  // ================================================================
  // Premium Findings — only include if there are premium findings
  // ================================================================
  if (input.paidFindings.length === 0 && !input.isPaid) {
    // No premium findings — skip entire section
  } else {
  newPage(ctx);

  ctx.y = drawSectionTitle(ctx.page, "Premium Findings", fontBold, ctx.y);

  if (input.isPaid) {
    if (input.paidFindings.length === 0) {
      ctx.y -= 8;
      ctx.y = drawText(
        ctx.page,
        "No additional findings identified.",
        font,
        11,
        GRAY,
        MARGIN,
        ctx.y,
      );
    } else {
      for (const finding of input.paidFindings) {
        const height = estimateFindingHeight(finding, font, lcs);
        ensureSpace(ctx, height);
        drawFinding(ctx, finding, lcs);
      }
    }
  } else {
    // Locked state — centered content block
    const count = input.paidFindings.length;

    ctx.y -= 20;
    const premiumSavings = input.paidFindings
      .filter((f) => !f.insufficientData)
      .reduce((sum, f) => sum + f.potential_savings, 0);
    const premiumSummary = premiumSavings > 0
      ? `${count} additional premium finding${count !== 1 ? "s" : ""} identified with up to $${premiumSavings.toLocaleString()} in additional potential savings.`
      : `${count} additional premium finding${count !== 1 ? "s" : ""} identified. Full report includes source-level evidence and discrepancy analysis.`;
    ctx.y = drawText(
      ctx.page,
      premiumSummary,
      font,
      11,
      GRAY,
      MARGIN,
      ctx.y,
    );
    ctx.y -= 28;

    // Redacted bullet list
    for (const finding of input.paidFindings) {
      ctx.y = drawText(
        ctx.page,
        `\u2022  ${finding.category}`,
        fontBold,
        11,
        DARK,
        MARGIN + 8,
        ctx.y,
      );
      ctx.y -= 16;
      ctx.y = drawText(
        ctx.page,
        "Details available in the full report.",
        font,
        9,
        LIGHT_GRAY,
        MARGIN + 22,
        ctx.y,
      );
      ctx.y -= 24;
    }

    // Upsell CTA block
    ctx.y -= 32;
    ctx.y = drawCenteredText(
      ctx.page,
      "Unlock full report to view additional discrepancies.",
      fontBold,
      13,
      BLUE,
      ctx.y,
    );
    ctx.y -= 20;
    drawCenteredText(
      ctx.page,
      "Visit your audit results page to purchase the complete report.",
      font,
      10,
      GRAY,
      ctx.y,
    );
  }
  } // end if premium findings exist

  // Footer on last page bottom
  const lastPage = doc.getPages()[doc.getPageCount() - 1];
  drawCenteredText(
    lastPage,
    "Generated by LeaseGuard  ·  AI-powered CAM audit support",
    fontBold,
    8,
    BLUE,
    MARGIN + 32,
  );
  drawCenteredText(
    lastPage,
    "AI-powered analysis for informational purposes only. Not legal or accounting advice.",
    font,
    8,
    LIGHT_GRAY,
    MARGIN + 18,
  );

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// --- Drawing helpers ---

function drawText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  x: number,
  y: number,
): number {
  page.drawText(text, { x, y, size, font, color });
  return y;
}

function drawRightAlignedText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  rightX: number,
  y: number,
): number {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - textWidth, y, size, font, color });
  return y;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  y: number,
): number {
  const textWidth = font.widthOfTextAtSize(text, size);
  const x = (PAGE_WIDTH - textWidth) / 2;
  page.drawText(text, { x, y, size, font, color });
  return y;
}

function drawSectionTitle(
  page: PDFPage,
  title: string,
  fontBold: PDFFont,
  y: number,
): number {
  page.drawText(title, {
    x: MARGIN,
    y,
    size: 18,
    font: fontBold,
    color: BLUE,
  });
  y -= 14;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_WIDTH, y },
    thickness: 1,
    color: LINE_GRAY,
  });
  y -= 24; // was 32 — tightened
  return y;
}

/**
 * Draw a single finding block. Uses PageCtx so it can add a page if a very
 * long description overflows the current page.
 */
function drawFinding(ctx: PageCtx, finding: Finding, leaseClausesSummary?: LeaseClauseSummary | null): void {
  const { font, fontBold } = ctx;

  const severityColor =
    finding.severity === "high"
      ? RED
      : finding.severity === "medium"
        ? AMBER
        : GRAY;

  // Category title
  ctx.page.drawText(finding.category, {
    x: MARGIN,
    y: ctx.y,
    size: 13,
    font: fontBold,
    color: DARK,
  });
  ctx.y -= 16; // was 20

  // Severity badge
  const severityLabel = finding.insufficientData
    ? "INSUFFICIENT DATA"
    : finding.severity.toUpperCase() + " SEVERITY";
  const badgeColor = finding.insufficientData ? AMBER : severityColor;
  ctx.page.drawText(severityLabel, {
    x: MARGIN,
    y: ctx.y,
    size: 8,
    font: fontBold,
    color: badgeColor,
  });
  ctx.y -= 14; // was 20

  // Description (wrapped)
  const descLines = wrapText(finding.description, font, 10, CONTENT_WIDTH);
  for (const line of descLines) {
    // If a very long description overflows the page, continue on a new one
    if (ctx.y < BOTTOM_MARGIN) {
      newPage(ctx);
    }
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 10, font, color: DARK });
    ctx.y -= 14; // was 16
  }

  ctx.y -= 4; // was 6

  // Savings / action line
  if (finding.potential_savings > 0) {
    ctx.page.drawText(
      `Potential savings: $${finding.potential_savings.toLocaleString()}`,
      { x: MARGIN, y: ctx.y, size: 11, font: fontBold, color: GREEN },
    );
    ctx.y -= 16; // was 20
  } else if (finding.insufficientData) {
    ctx.page.drawText("Action: Manual review recommended", {
      x: MARGIN, y: ctx.y, size: 10, font, color: AMBER,
    });
    ctx.y -= 16; // was 20
  } else {
    ctx.page.drawText("Review recommended to confirm compliance", {
      x: MARGIN, y: ctx.y, size: 10, font, color: GRAY,
    });
    ctx.y -= 16; // was 20
  }

  // Source evidence snippets (if present on finding)
  if (finding.sourceEvidence && finding.sourceEvidence.length > 0) {
    for (const ev of finding.sourceEvidence.slice(0, 2)) {
      if (ctx.y < BOTTOM_MARGIN + 40) newPage(ctx);
      let evLabel = `Source: ${ev.document}`;
      if (ev.page != null) evLabel += ` · Page ${ev.page}`;
      ctx.page.drawText(evLabel, { x: MARGIN + 10, y: ctx.y, size: 8, font, color: LIGHT_GRAY });
      ctx.y -= 11;
      if (ev.extractedText) {
        const snippet = ev.extractedText.length > 100
          ? ev.extractedText.substring(0, 100) + "..."
          : ev.extractedText;
        const evLines = wrapText(`"${snippet}"`, font, 8, CONTENT_WIDTH - 20);
        for (const line of evLines) {
          if (ctx.y < BOTTOM_MARGIN) newPage(ctx);
          ctx.page.drawText(line, { x: MARGIN + 10, y: ctx.y, size: 8, font, color: GRAY });
          ctx.y -= 11;
        }
      }
      ctx.y -= 4;
    }
  }

  // Lease clause evidence
  const clauseRef = getLeaseClauseEvidence(finding, leaseClausesSummary);
  if (clauseRef) {
    if (ctx.y < BOTTOM_MARGIN + 60) newPage(ctx);
    ctx.y -= 4;

    // Draw bordered background box
    const clauseTextLines = wrapText(`"${clauseRef.text}"`, font, 9, CONTENT_WIDTH - 26);
    const boxHeight = 14 + 14 + clauseTextLines.length * 13 + 8;
    const BG_CLAUSE = rgb(0.94, 0.96, 1.0);
    const BORDER_CLAUSE = rgb(0.78, 0.84, 0.95);
    ctx.page.drawRectangle({
      x: MARGIN,
      y: ctx.y - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: BG_CLAUSE,
      borderColor: BORDER_CLAUSE,
      borderWidth: 0.75,
    });

    // Label
    ctx.y -= 12;
    ctx.page.drawText("Lease Clause Evidence", { x: MARGIN + 8, y: ctx.y, size: 8, font: fontBold, color: BLUE });
    ctx.y -= 14;

    // Section name
    ctx.page.drawText(clauseRef.section, { x: MARGIN + 8, y: ctx.y, size: 9, font: fontBold, color: DARK });
    ctx.y -= 14;

    // Clause quote with left border
    ctx.page.drawRectangle({
      x: MARGIN + 8,
      y: ctx.y - (clauseTextLines.length - 1) * 13 - 2,
      width: 2,
      height: clauseTextLines.length * 13,
      color: BLUE,
    });
    for (const line of clauseTextLines) {
      if (ctx.y < BOTTOM_MARGIN) newPage(ctx);
      ctx.page.drawText(line, { x: MARGIN + 16, y: ctx.y, size: 9, font, color: GRAY });
      ctx.y -= 13;
    }
    ctx.y -= 6;
  }

  // Separator line between findings
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 0.5,
    color: LINE_GRAY,
  });
  ctx.y -= 18; // was 26
}

/** Estimate rendered height of a source-evidence block. */
function estimateEvidenceHeight(
  item: OverchargeLineItem,
  font: PDFFont,
): number {
  let h = 16 + 14; // category + doc line
  if (item.sourceEvidence?.extractedText) {
    const lines = wrapText(
      `"${item.sourceEvidence.extractedText}"`,
      font,
      9,
      CONTENT_WIDTH - 16,
    );
    h += 2 + lines.length * 13 + 2;
  }
  h += 14 + 18; // detail line + separator
  return h;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
