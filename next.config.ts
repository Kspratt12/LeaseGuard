import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js", "@napi-rs/canvas", "unpdf"],
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  compress: true,
  // OCR loads its engine (tesseract.js-core, WebAssembly) by a computed path, so the file tracer cannot see it and the
  // serverless function would ship without it. Include the engine and the pdf.js build unpdf uses for rendering.
  outputFileTracingIncludes: {
    "/api/upload": ["./node_modules/tesseract.js-core/**/*", "./node_modules/tesseract.js/src/**/*", "./node_modules/unpdf/dist/**/*"],
  },
  // The shorter NNN guide duplicated the stronger one (same search intent, nothing links to it), so it now redirects permanently.
  async redirects() {
    return [{ source: "/resources/nnn-lease-hidden-costs", destination: "/resources/hidden-costs-in-nnn-leases", permanent: true }];
  },
};

export default nextConfig;
