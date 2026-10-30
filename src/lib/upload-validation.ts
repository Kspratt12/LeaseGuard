/** Upload limits and content checks. The client-supplied MIME type is not trusted. */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Primary reconciliation + up to 4 extra = 5 years, matching the multi-year offer. */
export const MAX_EXTRA_RECONS = 4;
/** Reconciliation statements in one audit: the primary one plus the extras the server accepts. */
export const MAX_STATEMENTS = MAX_EXTRA_RECONS + 1;

/**
 * Combined size of every file in one upload request.
 *
 * The files travel to a serverless function in a single request, and the hosting platform documents a 4.5 MB limit on
 * that request body (it answers 413 before our code runs). This guard is deliberately below it: the request also
 * carries multipart framing, so 4 MB of files is a conservative way to stay under the platform limit. This is not a
 * claim that 4 MB is the platform's limit.
 */
export const MAX_COMBINED_UPLOAD_BYTES = 4_000_000;

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export const UPLOAD_TOO_LARGE_MESSAGE =
  "Your files are too large to upload together. The combined limit is about 4 MB. Remove a file, or use a smaller copy (for example fewer or lower-resolution photos), then upload again.";

/** Message shown BEFORE sending, when the files already exceed the combined guard. */
export function combinedUploadError(totalBytes: number): string | null {
  if (totalBytes <= MAX_COMBINED_UPLOAD_BYTES) return null;
  return `Your files total ${mb(totalBytes)}, which is too large to upload together. The combined limit is about 4 MB. Remove a file, or use a smaller copy (for example fewer or lower-resolution photos), then upload again.`;
}

/** A real PDF starts with "%PDF-" (a few producers prepend junk, so scan the first 1 KB). */
export function hasPdfSignature(buf: Uint8Array): boolean {
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

/** Returns an error message for the first problem found, or null if the upload is acceptable. */
export function validateUploadMeta(files: { name: string; size: number }[]): string | null {
  for (const f of files) {
    if (f.size === 0) return "One of the files is empty.";
  }
  // The combined guard comes first: it is the limit that actually applies on the function upload path.
  const tooLarge = combinedUploadError(files.reduce((sum, f) => sum + f.size, 0));
  if (tooLarge) return tooLarge;
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return `Each file must be under ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
    }
  }
  return null;
}

/**
 * Turn the upload response into JSON or a clear error. A 413 is answered by the platform (not by our code) with a
 * body that is not JSON, so it is recognised by status BEFORE any attempt to read the body: the customer is told
 * the upload is too large, not to retry the identical request.
 */
export async function parseUploadResponse(res: Response): Promise<Record<string, unknown>> {
  if (res.status === 413) throw new Error(UPLOAD_TOO_LARGE_MESSAGE);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Upload failed");
  return json;
}
