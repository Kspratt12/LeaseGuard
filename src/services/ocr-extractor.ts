/**
 * OCR fallback for scanned / image-based PDFs.
 *
 * When text extractors return very little text (< 200 chars), this module
 * attempts OCR to recover text content.
 *
 * Strategy:
 *   1. Try unpdf renderPageAsImage (serverless-safe, no native canvas needed)
 *   2. Fall back to pdfjs-dist + @napi-rs/canvas (works locally, may fail on Vercel)
 *   3. Run Tesseract.js OCR on each rendered page image
 *
 * Dependencies: tesseract.js, unpdf, pdfjs-dist (optional), @napi-rs/canvas (optional)
 */

import Tesseract from "tesseract.js";

// Dynamic import for @napi-rs/canvas — may not be available on all platforms
let createCanvasFn: typeof import("@napi-rs/canvas").createCanvas | null = null;
let canvasLoadError: string | null = null;
let canvasChecked = false;

async function ensureCanvas() {
  if (canvasChecked) return createCanvasFn;
  canvasChecked = true;
  try {
    const canvasModule = await import("@napi-rs/canvas");
    createCanvasFn = canvasModule.createCanvas;
    console.log("[ocr] @napi-rs/canvas loaded successfully");
    return createCanvasFn;
  } catch (err) {
    canvasLoadError = err instanceof Error ? err.message : String(err);
    console.error(`[ocr] @napi-rs/canvas failed to load: ${canvasLoadError}`);
    if (err instanceof Error && err.stack) {
      console.error(`[ocr] Stack: ${err.stack.split("\n").slice(0, 3).join(" > ")}`);
    }
    return null;
  }
}

/** Check if canvas is available (for diagnostics) */
export function getCanvasStatus(): { available: boolean; error: string | null } {
  return { available: createCanvasFn !== null, error: canvasLoadError };
}

/** Minimum text length to consider pdf-parse output sufficient. */
export const OCR_TEXT_THRESHOLD = 200;

export type ExtractionMethod = "pdf_text" | "ocr";

import type { ExtractorAttempt, QualityTier } from "@/services/document-validator";

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  /** Whether the OCR fallback was triggered */
  ocrTriggered: boolean;
  /** Length of OCR-extracted text (0 if OCR was not used) */
  ocrTextLength: number;
  /** OCR error message if OCR failed, null otherwise */
  ocrError: string | null;
  /** Per-extractor attempt results for diagnostics (optional) */
  pipeline?: ExtractorAttempt[];
  /** Extraction quality score 0-100 (optional) */
  qualityScore?: number;
  /** Extraction quality tier (optional) */
  qualityTier?: QualityTier;
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
 */
class NodeCanvasFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _createCanvas: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(createCanvas: any) {
    this._createCanvas = createCanvas;
  }

  create(width: number, height: number) {
    const canvas = this._createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reset(canvasAndContext: { canvas: any }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destroy(canvasAndContext: { canvas: any }) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createCanvas: any,
): Promise<Buffer | null> {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvasFactory = new NodeCanvasFactory(createCanvas);
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
 * Try rendering PDF pages to images using unpdf (serverless-safe).
 * Returns an array of PNG buffers, one per page.
 */
async function renderPagesWithUnpdf(
  pdfBuffer: Buffer,
  pageCount: number,
): Promise<Buffer[]> {
  const pngBuffers: Buffer[] = [];
  try {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const total = Math.min(doc.numPages, pageCount);
    console.log(`[ocr] unpdf: rendering ${total} pages to images...`);

    for (let i = 1; i <= total; i++) {
      try {
        const result = await renderPageAsImage(doc, i, {
          scale: RENDER_SCALE,
          width: undefined,
          height: undefined,
        });
        // renderPageAsImage returns a Uint8Array (PNG)
        const buf = Buffer.from(result);
        console.log(`[ocr] unpdf page ${i}: rendered ${buf.length} bytes`);
        if (buf.length > 100) {
          pngBuffers.push(buf);
        } else {
          console.warn(`[ocr] unpdf page ${i}: image too small (${buf.length} bytes), skipping`);
        }
      } catch (pageErr) {
        const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
        console.warn(`[ocr] unpdf page ${i} render failed: ${msg}`);
      }
    }

    doc.destroy();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ocr] unpdf rendering failed: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.warn(`[ocr] unpdf stack: ${err.stack.split("\n").slice(0, 3).join(" > ")}`);
    }
  }
  return pngBuffers;
}

/**
 * Try rendering PDF pages using pdfjs-dist + @napi-rs/canvas (native).
 * Returns an array of PNG buffers, one per page.
 */
async function renderPagesWithCanvas(
  pdfBuffer: Buffer,
  pageCount: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createCanvas: any,
): Promise<Buffer[]> {
  const pngBuffers: Buffer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfjsLib: any;
  const importPaths = [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist",
  ];
  for (const p of importPaths) {
    try {
      pdfjsLib = await import(/* webpackIgnore: true */ p);
      break;
    } catch { /* try next */ }
  }
  if (!pdfjsLib) {
    console.warn("[ocr] pdfjs-dist import failed in canvas OCR (all paths exhausted)");
    return [];
  }

  const data = new Uint8Array(pdfBuffer);
  const pdfDoc = await pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const total = Math.min(pdfDoc.numPages, pageCount);
  console.log(`[ocr] canvas: rendering ${total} pages to images...`);

  for (let i = 1; i <= total; i++) {
    const pngBuffer = await renderPageToPng(pdfDoc, i, createCanvas);
    if (pngBuffer && pngBuffer.length > 0) {
      pngBuffers.push(pngBuffer);
    }
  }

  pdfDoc.destroy();
  return pngBuffers;
}

/**
 * Run OCR on a PDF buffer by rendering each page to a PNG image,
 * then running Tesseract.js OCR on each rendered image.
 *
 * Rendering strategy:
 *   1. Try unpdf renderPageAsImage (serverless-safe, no native deps)
 *   2. Fall back to pdfjs-dist + @napi-rs/canvas (local/Docker)
 *
 * Limits: processes at most MAX_OCR_PAGES pages, with PER_PAGE_TIMEOUT_MS
 * per page and TOTAL_OCR_TIMEOUT_MS overall to avoid serverless timeouts.
 */
export async function extractTextWithOcr(
  pdfBuffer: Buffer,
): Promise<string> {
  const ocrStart = Date.now();
  try {
    const pageCount = MAX_OCR_PAGES;

    // Strategy 1: Try unpdf (serverless-safe, no native canvas needed)
    console.log("[ocr] Attempting page rendering with unpdf (serverless-safe)...");
    let pngBuffers = await renderPagesWithUnpdf(pdfBuffer, pageCount);

    // Strategy 2: Fall back to pdfjs-dist + @napi-rs/canvas
    if (pngBuffers.length === 0) {
      console.log("[ocr] unpdf rendering produced no images, trying @napi-rs/canvas fallback...");
      const createCanvas = await ensureCanvas();
      if (createCanvas) {
        pngBuffers = await renderPagesWithCanvas(pdfBuffer, pageCount, createCanvas);
      } else {
        console.error(
          `[ocr] @napi-rs/canvas also unavailable (${canvasLoadError ?? "unknown"}). ` +
          `No PDF-to-image renderer available for OCR.`,
        );
      }
    }

    if (pngBuffers.length === 0) {
      const errMsg = "OCR failed: no PDF-to-image renderer available. " +
        "Neither unpdf rendering nor @napi-rs/canvas produced page images. " +
        "Text PDFs should be handled by the text extraction pipeline (unpdf/pdfjs-dist).";
      console.error(`[ocr] ${errMsg}`);
      throw new Error(errMsg);
    }

    console.log(`[ocr] Starting Tesseract OCR on ${pngBuffers.length} page images (buffer: ${pdfBuffer.length} bytes)...`);

    const pageTexts: string[] = [];
    for (let i = 0; i < pngBuffers.length; i++) {
      // Check total elapsed time
      if (Date.now() - ocrStart > TOTAL_OCR_TIMEOUT_MS) {
        console.warn(
          `[ocr] Total OCR timeout reached after ${i} pages ` +
          `(${TOTAL_OCR_TIMEOUT_MS / 1000}s), returning partial text`,
        );
        break;
      }

      const pngBuffer = pngBuffers[i];
      console.log(`[ocr] Running Tesseract on page ${i + 1}: ${pngBuffer.length} bytes input image`);

      // Run Tesseract OCR on the PNG image
      const result = await ocrWithTimeout(
        Tesseract.recognize(pngBuffer, "eng", {
          logger: () => {}, // suppress progress logs
        }),
        PER_PAGE_TIMEOUT_MS,
      );

      if (result == null) {
        console.warn(
          `[ocr] Page ${i + 1} OCR timed out after ${PER_PAGE_TIMEOUT_MS / 1000}s, skipping`,
        );
        continue;
      }

      const pageText = result.data.text?.trim() ?? "";
      const confidence = result.data.confidence ?? 0;
      if (pageText.length > 0) {
        pageTexts.push(pageText);
        console.log(`[ocr] Page ${i + 1}: ${pageText.length} chars, confidence: ${confidence}%`);
      } else {
        console.warn(`[ocr] Page ${i + 1}: Tesseract returned empty text (confidence: ${confidence}%)`);
      }
    }

    const combinedText = pageTexts.join("\n\n");
    console.log(
      `[ocr] Completed in ${((Date.now() - ocrStart) / 1000).toFixed(1)}s, ` +
      `${pageTexts.length}/${pngBuffers.length} pages produced text, ` +
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
