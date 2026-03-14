/**
 * Raw PDF buffer text extraction — last-resort fallback.
 *
 * When pdfjs-dist and pdf-parse both fail (common on Vercel serverless),
 * this module extracts text directly from the PDF binary format by:
 *
 *   1. Finding stream objects in the PDF
 *   2. Decompressing FlateDecode streams with zlib
 *   3. Extracting text from PDF content stream operators (Tj, TJ, ', ")
 *   4. Also scanning for uncompressed text strings
 *
 * This is intentionally crude — it won't handle every PDF feature — but
 * it recovers readable text from the vast majority of office-generated,
 * Word-to-PDF, and standard text PDFs where library parsers fail.
 *
 * Zero external dependencies beyond Node.js built-ins.
 */

import { inflateSync } from "zlib";

/**
 * Decode PDF escape sequences in a parenthesized string.
 *   \n → newline, \r → return, \t → tab, \\ → backslash,
 *   \( → (, \) → ), \NNN → octal char code
 */
function decodePdfString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\([()])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8)),
    );
}

/**
 * Extract readable text from a single PDF content stream.
 * Looks for BT...ET blocks and pulls text from Tj, TJ, ', " operators.
 */
function extractTextFromContentStream(stream: string): string {
  const parts: string[] = [];

  // Match BT (begin text) ... ET (end text) blocks
  const btEtRegex = /BT\b([\s\S]*?)ET\b/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btEtRegex.exec(stream)) !== null) {
    const block = btMatch[1];

    // Tj operator: (text) Tj — show a text string
    const tjRegex = /\(([^)]*(?:\\\)[^)]*)*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfString(tjMatch[1]);
      if (decoded.trim().length > 0) {
        parts.push(decoded);
      }
    }

    // TJ operator: [(text) num (text) num ...] TJ — show with kerning
    const tjArrayRegex = /\[((?:[^\]]|\\\])*?)\]\s*TJ/gi;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = arrMatch[1];
      const stringRegex = /\(([^)]*(?:\\\)[^)]*)*)\)/g;
      let strMatch: RegExpExecArray | null;
      const tjParts: string[] = [];
      while ((strMatch = stringRegex.exec(inner)) !== null) {
        tjParts.push(decodePdfString(strMatch[1]));
      }
      const combined = tjParts.join("");
      if (combined.trim().length > 0) {
        parts.push(combined);
      }
    }

    // ' operator: (text) ' — move to next line and show text
    const quoteRegex = /\(([^)]*(?:\\\)[^)]*)*)\)\s*'/g;
    let quoteMatch: RegExpExecArray | null;
    while ((quoteMatch = quoteRegex.exec(block)) !== null) {
      const decoded = decodePdfString(quoteMatch[1]);
      if (decoded.trim().length > 0) {
        parts.push(decoded);
      }
    }

    // " operator: aw ac (text) " — set word/char spacing, then show text
    const dblQuoteRegex =
      /[\d.\-]+\s+[\d.\-]+\s+\(([^)]*(?:\\\)[^)]*)*)\)\s*"/g;
    let dblMatch: RegExpExecArray | null;
    while ((dblMatch = dblQuoteRegex.exec(block)) !== null) {
      const decoded = decodePdfString(dblMatch[1]);
      if (decoded.trim().length > 0) {
        parts.push(decoded);
      }
    }
  }

  return parts.join(" ");
}

/**
 * Extract text directly from a PDF buffer by reading the binary format.
 *
 * Strategy:
 *   1. Find all stream...endstream objects
 *   2. Attempt FlateDecode decompression (most modern PDFs)
 *   3. Fall back to reading uncompressed stream data
 *   4. Extract text operators from content streams
 *   5. Also scan for simple parenthesized strings outside streams
 *
 * Returns extracted text (may be empty for image-only PDFs).
 */
export function extractTextFromRawBuffer(buffer: Buffer): string {
  const content = buffer.toString("binary");
  const textParts: string[] = [];
  let streamsProcessed = 0;
  let streamsDecompressed = 0;
  let streamsFailed = 0;

  // Find all stream...endstream blocks
  // Use a regex that handles both \r\n and \n line endings
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch: RegExpExecArray | null;

  while ((streamMatch = streamRegex.exec(content)) !== null) {
    streamsProcessed++;
    try {
      const rawStreamData = Buffer.from(streamMatch[1], "binary");
      let decompressed: string;

      // Try FlateDecode decompression first (most common in modern PDFs)
      try {
        const inflated = inflateSync(rawStreamData);
        decompressed = inflated.toString("latin1");
        streamsDecompressed++;
      } catch {
        // Not compressed or different compression — try raw
        decompressed = rawStreamData.toString("latin1");
      }

      // Extract text from this content stream
      const extracted = extractTextFromContentStream(decompressed);
      if (extracted.trim().length > 0) {
        textParts.push(extracted.trim());
      }
    } catch {
      streamsFailed++;
    }
  }

  // Also look for uncompressed text strings outside streams
  // These appear in some simple PDFs as (text) Tj directly in the file
  const looseTextRegex = /\(([^)]{3,})\)\s*Tj/g;
  let looseMatch: RegExpExecArray | null;
  while ((looseMatch = looseTextRegex.exec(content)) !== null) {
    const decoded = decodePdfString(looseMatch[1]);
    if (decoded.trim().length > 2 && /[a-zA-Z]/.test(decoded)) {
      textParts.push(decoded.trim());
    }
  }

  const result = textParts.join("\n").replace(/ {2,}/g, " ").trim();

  console.log(
    `[raw-pdf] Processed ${streamsProcessed} streams ` +
      `(${streamsDecompressed} decompressed, ${streamsFailed} failed), ` +
      `extracted ${result.length} chars`,
  );

  return result;
}
