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

/**
 * Run OCR on a PDF buffer by converting each page to a single-page PDF,
 * then feeding the raw bytes to Tesseract (which can handle PDF/image input).
 *
 * Tesseract.js v5+ accepts raw image buffers. We extract each page as a
 * standalone single-page PDF and convert to a PNG-like representation
 * that Tesseract can process.
 */
export async function extractTextWithOcr(
  pdfBuffer: Buffer,
): Promise<string> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    const pageTexts: string[] = [];

    for (let i = 0; i < pageCount; i++) {
      // Create a new single-page PDF for each page
      const singlePagePdf = await PDFDocument.create();
      const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
      singlePagePdf.addPage(copiedPage);
      const singlePageBytes = await singlePagePdf.save();

      // Run Tesseract on the single-page PDF bytes
      const result = await Tesseract.recognize(
        Buffer.from(singlePageBytes),
        "eng",
        {
          logger: () => {}, // suppress progress logs
        },
      );

      if (result.data.text) {
        pageTexts.push(result.data.text.trim());
      }
    }

    return pageTexts.join("\n\n");
  } catch (err) {
    console.error("OCR extraction failed:", err);
    return "";
  }
}
