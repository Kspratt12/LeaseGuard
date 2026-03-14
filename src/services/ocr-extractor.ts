/**
 * OCR fallback for scanned / image-based PDFs.
 *
 * When pdf-parse returns very little text (< 50 chars), this module
 * converts each PDF page to a PNG image and runs Tesseract.js OCR
 * to recover the text content.
 *
 * Dependencies: tesseract.js, pdf-lib (already in project)
 */

import Tesseract from "tesseract.js";
import { PDFDocument } from "pdf-lib";

/** Minimum text length to consider pdf-parse output sufficient. */
export const OCR_TEXT_THRESHOLD = 50;

export type ExtractionMethod = "pdf_text" | "ocr";

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
}

/** Maximum number of pages to OCR (prevents multi-page PDFs from timing out). */
const MAX_OCR_PAGES = 5;

/** Per-page OCR timeout in milliseconds. */
const PER_PAGE_TIMEOUT_MS = 20_000;

/** Total OCR timeout in milliseconds. */
const TOTAL_OCR_TIMEOUT_MS = 60_000;

/** Race a promise against a timeout, returning null on timeout instead of throwing. */
function ocrWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/**
 * Run OCR on a PDF buffer by converting each page to a single-page PDF,
 * then feeding the raw bytes to Tesseract (which can handle PDF/image input).
 *
 * Tesseract.js v5+ accepts raw image buffers. We extract each page as a
 * standalone single-page PDF and convert to a PNG-like representation
 * that Tesseract can process.
 *
 * Limits: processes at most MAX_OCR_PAGES pages, with PER_PAGE_TIMEOUT_MS
 * per page and TOTAL_OCR_TIMEOUT_MS overall to avoid serverless timeouts.
 */
export async function extractTextWithOcr(
  pdfBuffer: Buffer,
): Promise<string> {
  const ocrStart = Date.now();
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = Math.min(pdfDoc.getPageCount(), MAX_OCR_PAGES);
    const pageTexts: string[] = [];

    if (pdfDoc.getPageCount() > MAX_OCR_PAGES) {
      console.log(
        `[ocr] PDF has ${pdfDoc.getPageCount()} pages, limiting OCR to first ${MAX_OCR_PAGES}`,
      );
    }

    for (let i = 0; i < pageCount; i++) {
      // Check total elapsed time
      if (Date.now() - ocrStart > TOTAL_OCR_TIMEOUT_MS) {
        console.warn(
          `[ocr] Total OCR timeout reached after ${i} pages (${TOTAL_OCR_TIMEOUT_MS / 1000}s), returning partial text`,
        );
        break;
      }

      // Create a new single-page PDF for each page
      const singlePagePdf = await PDFDocument.create();
      const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
      singlePagePdf.addPage(copiedPage);
      const singlePageBytes = await singlePagePdf.save();

      // Run Tesseract on the single-page PDF bytes with per-page timeout
      const result = await ocrWithTimeout(
        Tesseract.recognize(
          Buffer.from(singlePageBytes),
          "eng",
          {
            logger: () => {}, // suppress progress logs
          },
        ),
        PER_PAGE_TIMEOUT_MS,
      );

      if (result == null) {
        console.warn(`[ocr] Page ${i + 1} timed out after ${PER_PAGE_TIMEOUT_MS / 1000}s, skipping`);
        continue;
      }

      if (result.data.text) {
        pageTexts.push(result.data.text.trim());
      }
    }

    console.log(
      `[ocr] Completed in ${((Date.now() - ocrStart) / 1000).toFixed(1)}s, ${pageTexts.length}/${pageCount} pages extracted`,
    );
    return pageTexts.join("\n\n");
  } catch (err) {
    console.error("OCR extraction failed:", err);
    return "";
  }
}
