import { PDFDocument } from "pdf-lib";

/**
 * Compress an image using canvas, returning a JPEG blob.
 * Resizes to fit within maxDim and compresses to the target quality.
 */
/**
 * Compress and enhance an image for OCR readability.
 * Uses higher resolution and quality to preserve text clarity,
 * especially for blurry mobile photos.
 */
async function compressImage(
  file: File,
  maxDim = 2400,
  quality = 0.85,
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

  // Enable image smoothing for better quality on resize
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Enhance contrast slightly for better OCR on blurry photos
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    // Mild contrast boost: shift pixels away from middle gray
    const factor = 1.15; // 15% contrast increase
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));     // R
      data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128)); // G
      data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128)); // B
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
