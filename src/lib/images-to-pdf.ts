import { PDFDocument } from "pdf-lib";

/**
 * Compress and enhance an image for OCR readability.
 * Uses higher resolution and quality to preserve text clarity,
 * especially for blurry or angled mobile photos.
 *
 * Phone photos are typically 3000-4000px on their long edge.
 * We allow up to 3200px to preserve text sharpness for OCR while
 * keeping file sizes manageable for upload and server processing.
 */
async function compressImage(
  file: File,
  maxDim = 3200,
  quality = 0.92,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  // Scale down if either dimension exceeds maxDim
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Enable high-quality image smoothing for better downscale quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Enhance image for OCR readability
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Step 1: Mild contrast boost — shift pixels away from middle gray
    // This helps OCR engines distinguish text from background
    const contrastFactor = 1.2; // 20% contrast increase

    // Step 2: Also slightly increase brightness bias for dark photos
    // (many phone photos of documents have slightly dark backgrounds)
    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast enhancement
      let r = contrastFactor * (data[i] - 128) + 128;
      let g = contrastFactor * (data[i + 1] - 128) + 128;
      let b = contrastFactor * (data[i + 2] - 128) + 128;

      // Clamp to valid range
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    ctx.putImageData(imageData, 0, 0);
  } catch {
    // If image manipulation fails (e.g. CORS), just use original
  }

  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

/**
 * Convert one or more image files into a single PDF.
 * Each image becomes a full page sized to fit the image aspect ratio.
 *
 * Quality settings are optimized for OCR readability of phone photos:
 * - Higher resolution (3200px max) preserves small text
 * - Higher JPEG quality (92%) reduces compression artifacts
 * - Contrast enhancement improves text/background separation
 */
export async function imagesToPdf(
  images: File[],
  filename = "captured-document.pdf",
): Promise<File> {
  const doc = await PDFDocument.create();

  for (const img of images) {
    const compressed = await compressImage(img);
    const bytes = new Uint8Array(await compressed.arrayBuffer());
    const embedded = await doc.embedJpg(bytes);

    const { width, height } = embedded.scale(1);
    const page = doc.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  const pdfBytes = await doc.save();
  return new File([pdfBytes.buffer as ArrayBuffer], filename, { type: "application/pdf" });
}
