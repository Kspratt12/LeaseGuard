/** Upload limits and content checks. The client-supplied MIME type is not trusted. */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Primary reconciliation + up to 4 extra = 5 years, matching the multi-year offer. */
export const MAX_EXTRA_RECONS = 4;

/** A real PDF starts with "%PDF-" (a few producers prepend junk, so scan the first 1 KB). */
export function hasPdfSignature(buf: Uint8Array): boolean {
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

/** Returns an error message for the first problem found, or null if the upload is acceptable. */
export function validateUploadMeta(files: { name: string; size: number }[]): string | null {
  for (const f of files) {
    if (f.size === 0) return "One of the files is empty.";
    if (f.size > MAX_FILE_BYTES) {
      return `Each file must be under ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
    }
  }
  return null;
}
