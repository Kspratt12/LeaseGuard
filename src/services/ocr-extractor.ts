/**
 * OCR fallback for scanned / image-based PDFs.
 *
 * When text extractors return very little text (< 200 chars), this module
 * attempts OCR to recover text content.
 *
 * Strategy:
 *   1. Try unpdf renderPageAsImage (canvas handed over via canvasImport)
 *   2. Fall back to pdfjs-dist + @napi-rs/canvas (works locally, may fail on Vercel)
 *   3. Run Tesseract.js OCR on each rendered page image
 *
 * Dependencies: tesseract.js, unpdf, pdfjs-dist (optional), @napi-rs/canvas (optional)
 */

import os from "node:os";
import Tesseract from "tesseract.js";
import { errorInfo, stackFrames } from "@/lib/safe-log";

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
    canvasLoadError = errorInfo(err);
    console.error(`[ocr] @napi-rs/canvas failed to load: ${canvasLoadError}`);
    if (err instanceof Error && err.stack) {
      console.error(`[ocr] Stack: ${stackFrames(err)}`);
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
  /** When OCR ran: pages in the document, and pages that produced no text (a partial read must be disclosed) */
  ocrPagesTotal?: number;
  ocrPagesNotRead?: number;
  /** Text documents only: pages that had no text layer and were recovered with OCR, and pages that stayed empty */
  ocrPagesAdded?: number[];
  pagesWithoutText?: number[];
}

/** Rendered page images in page order; an empty buffer marks a page that could not be rendered. */
interface RenderedPages {
  pngBuffers: Buffer[];
  totalPages: number;
}

/** What OCR actually managed to read, so a partial read is never presented as a complete one. */
export interface OcrOutcome {
  /** Pages joined with a form feed, so page numbers survive into evidence references */
  text: string;
  totalPages: number;
  /** Pages that produced text */
  pagesRead: number;
  /** Pages that could not be rendered or recognised, or were beyond the page cap or the time limit */
  pagesNotProcessed: number;
  /** The page numbers (1-based) that were attempted, in order, and the text found on each ("" = nothing readable) */
  pageNumbers: number[];
  pageTexts: string[];
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
    const msg = errorInfo(err);
    console.error(`[ocr] Failed to render page ${pageNumber}: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.error(`[ocr] Stack: ${stackFrames(err)}`);
    }
    return null;
  }
}

/**
 * Try rendering PDF pages to images using unpdf.
 *
 * The raw bytes (not an already opened document) must be handed to renderPageAsImage together with canvasImport:
 * only then does unpdf open the document with its own canvas factory. Passing an opened document makes pdf.js use
 * its default canvas lookup, which reports the canvas library as unavailable.
 *
 * Returns one entry per page up to the cap, in page order; an empty buffer marks a page that could not be rendered,
 * so page numbers stay aligned with the original document.
 */
async function renderPagesWithUnpdf(
  pdfBuffer: Buffer,
  pageCount: number,
  only?: number[],
): Promise<RenderedPages> {
  const pngBuffers: Buffer[] = [];
  let totalPages = 0;
  try {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const probe = await getDocumentProxy(new Uint8Array(pdfBuffer));
    totalPages = probe.numPages;
    probe.destroy();
    const list = (only ?? Array.from({ length: totalPages }, (_, k) => k + 1)).filter((p) => p >= 1 && p <= totalPages).slice(0, pageCount);
    console.log(`[ocr] unpdf: rendering ${list.length} of ${totalPages} pages to images...`);

    for (const i of list) {
      try {
        const result = await renderPageAsImage(new Uint8Array(pdfBuffer), i, {
          scale: RENDER_SCALE,
          canvasImport: () => import("@napi-rs/canvas"),
        });
        const buf = Buffer.from(result);
        if (buf.length > 100) {
          pngBuffers.push(buf);
        } else {
          console.warn(`[ocr] unpdf page ${i}: image too small (${buf.length} bytes), skipping`);
          pngBuffers.push(Buffer.alloc(0));
        }
      } catch (pageErr) {
        const msg = errorInfo(pageErr);
        console.warn(`[ocr] unpdf page ${i} render failed: ${msg}`);
        pngBuffers.push(Buffer.alloc(0));
      }
    }
  } catch (err) {
    const msg = errorInfo(err);
    console.warn(`[ocr] unpdf rendering failed: ${msg}`);
  }
  return { pngBuffers, totalPages };
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
): Promise<RenderedPages> {
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
    return { pngBuffers: [], totalPages: 0 };
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
    pngBuffers.push(pngBuffer && pngBuffer.length > 0 ? pngBuffer : Buffer.alloc(0));
  }

  const totalPages: number = pdfDoc.numPages;
  pdfDoc.destroy();
  return { pngBuffers, totalPages };
}

/**
 * Run OCR on a PDF buffer by rendering each page to a PNG image,
 * then running Tesseract.js OCR on each rendered image.
 *
 * Rendering strategy:
 *   1. Try unpdf renderPageAsImage (canvas handed over via canvasImport)
 *   2. Fall back to pdfjs-dist + @napi-rs/canvas (local/Docker)
 *
 * Limits: processes at most MAX_OCR_PAGES pages, with PER_PAGE_TIMEOUT_MS
 * per page and TOTAL_OCR_TIMEOUT_MS overall to avoid serverless timeouts.
 * The outcome says how many pages were not read, so callers can tell a partial read from a complete one.
 */
export async function extractTextWithOcrDetailed(
  pdfBuffer: Buffer,
  /** Only these pages (1-based), for documents where most pages already have text. Omit to OCR from page 1. */
  opts: { pages?: number[] } = {},
): Promise<OcrOutcome> {
  const ocrStart = Date.now();
  const only = opts.pages;
  const empty: OcrOutcome = { text: "", totalPages: 0, pagesRead: 0, pagesNotProcessed: 0, pageNumbers: [], pageTexts: [] };
  try {
    console.log("[ocr] Attempting page rendering with unpdf...");
    let rendered = await renderPagesWithUnpdf(pdfBuffer, MAX_OCR_PAGES, only);

    // The fallback renderer always starts at page 1, so it cannot serve a request for particular pages.
    if (!only && !rendered.pngBuffers.some((b) => b.length > 0)) {
      console.log("[ocr] unpdf rendering produced no images, trying @napi-rs/canvas fallback...");
      const createCanvas = await ensureCanvas();
      if (createCanvas) {
        try {
          rendered = await renderPagesWithCanvas(pdfBuffer, MAX_OCR_PAGES, createCanvas);
        } catch (err) {
          console.error(`[ocr] canvas fallback failed: ${errorInfo(err)}`);
        }
      } else {
        console.error(`[ocr] @napi-rs/canvas also unavailable (${canvasLoadError ?? "unknown"}).`);
      }
    }

    const { pngBuffers, totalPages } = rendered;
    const pageNumbers = (only ?? Array.from({ length: totalPages }, (_, k) => k + 1)).filter((p) => p >= 1 && p <= totalPages).slice(0, MAX_OCR_PAGES);
    const wanted = only ? only.length : totalPages;
    if (!pngBuffers.some((b) => b.length > 0)) {
      console.error("[ocr] No PDF-to-image renderer produced any page image.");
      return { ...empty, totalPages, pagesNotProcessed: wanted };
    }

    console.log(`[ocr] Starting Tesseract OCR on ${pngBuffers.length} page images...`);

    const pageTexts: string[] = [];
    let pagesRead = 0;
    for (let i = 0; i < pngBuffers.length; i++) {
      if (Date.now() - ocrStart > TOTAL_OCR_TIMEOUT_MS) {
        console.warn(`[ocr] Total OCR timeout reached after ${i} pages (${TOTAL_OCR_TIMEOUT_MS / 1000}s), returning partial text`);
        break;
      }
      if (pngBuffers[i].length === 0) {
        pageTexts.push(""); // keep later pages numbered correctly
        continue;
      }

      const result = await ocrWithTimeout(
        Tesseract.recognize(pngBuffers[i], "eng", {
          logger: () => {}, // suppress progress logs
          // the language data is cached on disk; the app folder is read-only on serverless hosts
          cachePath: os.tmpdir(),
        }),
        PER_PAGE_TIMEOUT_MS,
      );

      if (result == null) {
        console.warn(`[ocr] Page ${i + 1} OCR timed out after ${PER_PAGE_TIMEOUT_MS / 1000}s, skipping`);
        pageTexts.push("");
        continue;
      }

      const pageText = result.data.text?.trim() ?? "";
      if (pageText.length > 0) {
        pagesRead++;
        pageTexts.push(pageText);
        console.log(`[ocr] Page ${i + 1}: ${pageText.length} chars, confidence: ${result.data.confidence ?? 0}%`);
      } else {
        console.warn(`[ocr] Page ${i + 1}: Tesseract returned empty text`);
        pageTexts.push("");
      }
    }

    const combinedText = pageTexts.join("\f");
    console.log(
      `[ocr] Completed in ${((Date.now() - ocrStart) / 1000).toFixed(1)}s, ` +
      `${pagesRead}/${wanted} pages produced text, ${combinedText.length} total chars`,
    );
    return {
      text: combinedText, totalPages, pagesRead, pagesNotProcessed: Math.max(0, wanted - pagesRead),
      pageNumbers: pageNumbers.slice(0, pageTexts.length), pageTexts,
    };
  } catch (err) {
    console.error(`[ocr] OCR extraction failed: ${errorInfo(err)}`);
    return empty;
  }
}

/** Text only; see extractTextWithOcrDetailed for how much of the document was actually read. */
export async function extractTextWithOcr(pdfBuffer: Buffer): Promise<string> {
  return (await extractTextWithOcrDetailed(pdfBuffer)).text;
}
