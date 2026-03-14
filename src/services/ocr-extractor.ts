/**
 * OCR fallback for scanned / image-based PDFs.
 *
 * When pdf-parse returns very little text (< 200 chars), this module
 * renders each PDF page to a PNG image using pdfjs-dist + @napi-rs/canvas,
 * then runs Tesseract.js OCR to recover the text content.
 *
 * Dependencies: tesseract.js, pdfjs-dist, @napi-rs/canvas
 */

import Tesseract from "tesseract.js";
import { createCanvas } from "@napi-rs/canvas";

/** Minimum text length to consider pdf-parse output sufficient. */
export const OCR_TEXT_THRESHOLD = 200;

export type ExtractionMethod = "pdf_text" | "ocr";

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  /** Whether the OCR fallback was triggered */
  ocrTriggered: boolean;
  /** Length of OCR-extracted text (0 if OCR was not used) */
  ocrTextLength: number;
  /** OCR error message if OCR failed, null otherwise */
  ocrError: string | null;
}

/** Maximum number of pages to OCR (prevents multi-page PDFs from timing out). */
const MAX_OCR_PAGES = 8;

/** Per-page OCR timeout in milliseconds. */
const PER_PAGE_TIMEOUT_MS = 30_000;

/** Total OCR timeout in milliseconds. */
const TOTAL_OCR_TIMEOUT_MS = 90_000;

/** Scale factor for rendering PDF pages (2.0 = ~150 DPI, good for OCR). */
const RENDER_SCALE = 2.0;

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
 * Custom CanvasFactory for pdfjs-dist that uses @napi-rs/canvas.
 * pdfjs-dist calls create() to get a canvas+context pair for rendering.
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  reset(
    canvasAndContext: { canvas: ReturnType<typeof createCanvas> },
    width: number,
    height: number,
  ) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: ReturnType<typeof createCanvas> }) {
    // @napi-rs/canvas doesn't require explicit cleanup
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

/**
 * Render a single PDF page to a PNG buffer using pdfjs-dist and @napi-rs/canvas.
 */
async function renderPageToPng(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any,
  pageNumber: number,
): Promise<Buffer | null> {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvasFactory = new NodeCanvasFactory();
    const { canvas, context } = canvasFactory.create(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    );

    await page.render({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvasContext: context as any,
      viewport,
      canvasFactory,
    }).promise;

    const pngBuffer = Buffer.from(canvas.toBuffer("image/png"));
    console.log(
      `[ocr] Page ${pageNumber} rendered to PNG: ${pngBuffer.length} bytes ` +
      `(${Math.round(viewport.width)}x${Math.round(viewport.height)})`,
    );

    if (pngBuffer.length < 1000) {
      console.warn(
        `[ocr] Page ${pageNumber} PNG is very small (${pngBuffer.length} bytes), ` +
        `page may be blank or contain no image content`,
      );
    }

    return pngBuffer;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ocr] Failed to render page ${pageNumber}: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.error(`[ocr] Stack: ${err.stack.split("\n").slice(0, 3).join(" > ")}`);
    }
    return null;
  }
}

/**
 * Run OCR on a PDF buffer by rendering each page to a PNG image
 * using pdfjs-dist + @napi-rs/canvas, then running Tesseract.js OCR
 * on each rendered image.
 *
 * Limits: processes at most MAX_OCR_PAGES pages, with PER_PAGE_TIMEOUT_MS
 * per page and TOTAL_OCR_TIMEOUT_MS overall to avoid serverless timeouts.
 */
export async function extractTextWithOcr(
  pdfBuffer: Buffer,
): Promise<string> {
  const ocrStart = Date.now();
  try {
    // Load PDF with pdfjs-dist for rendering
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(pdfBuffer);
    const pdfDoc = await pdfjsLib.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;

    const totalPages = pdfDoc.numPages;
    const pageCount = Math.min(totalPages, MAX_OCR_PAGES);
    const pageTexts: string[] = [];

    if (totalPages === 0) {
      console.warn("[ocr] PDF has 0 pages, nothing to OCR");
      pdfDoc.destroy();
      return "";
    }

    if (totalPages > MAX_OCR_PAGES) {
      console.log(
        `[ocr] PDF has ${totalPages} pages, limiting OCR to first ${MAX_OCR_PAGES}`,
      );
    }

    console.log(`[ocr] Starting OCR on ${pageCount} pages (buffer: ${pdfBuffer.length} bytes)...`);

    for (let i = 1; i <= pageCount; i++) {
      // Check total elapsed time
      if (Date.now() - ocrStart > TOTAL_OCR_TIMEOUT_MS) {
        console.warn(
          `[ocr] Total OCR timeout reached after ${i - 1} pages ` +
          `(${TOTAL_OCR_TIMEOUT_MS / 1000}s), returning partial text`,
        );
        break;
      }

      // Render PDF page to PNG
      const pngBuffer = await renderPageToPng(pdfDoc, i);
      if (!pngBuffer || pngBuffer.length === 0) {
        console.warn(`[ocr] Page ${i} rendered empty buffer, skipping`);
        continue;
      }

      // Run Tesseract OCR on the PNG image
      const result = await ocrWithTimeout(
        Tesseract.recognize(pngBuffer, "eng", {
          logger: () => {}, // suppress progress logs
        }),
        PER_PAGE_TIMEOUT_MS,
      );

      if (result == null) {
        console.warn(
          `[ocr] Page ${i} OCR timed out after ${PER_PAGE_TIMEOUT_MS / 1000}s, skipping`,
        );
        continue;
      }

      const pageText = result.data.text?.trim() ?? "";
      if (pageText.length > 0) {
        pageTexts.push(pageText);
        console.log(`[ocr] Page ${i}: ${pageText.length} chars extracted`);
      } else {
        console.warn(`[ocr] Page ${i}: Tesseract returned empty text`);
      }
    }

    pdfDoc.destroy();

    const combinedText = pageTexts.join("\n\n");
    console.log(
      `[ocr] Completed in ${((Date.now() - ocrStart) / 1000).toFixed(1)}s, ` +
      `${pageTexts.length}/${pageCount} pages produced text, ` +
      `${combinedText.length} total chars`,
    );
    return combinedText;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ocr] OCR extraction failed: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.error(`[ocr] Stack: ${err.stack.split("\n").slice(0, 5).join(" > ")}`);
    }
    return "";
  }
}
