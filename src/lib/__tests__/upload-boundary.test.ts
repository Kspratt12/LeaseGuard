/**
 * The upload request is ONE request to a serverless function; the hosting platform documents a 4.5 MB limit on its
 * body and answers 413 before our code runs. These tests cover the combined-size guard, explicit 413 handling, and the
 * visible statement-count limit matching the server.
 *
 * What this does NOT establish: that the platform limit applies to the deployed site (needs a deployed check).
 *
 * Run: npx tsx src/lib/__tests__/upload-boundary.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MAX_COMBINED_UPLOAD_BYTES, MAX_EXTRA_RECONS, MAX_FILE_BYTES, MAX_STATEMENTS, UPLOAD_TOO_LARGE_MESSAGE,
  combinedUploadError, parseUploadResponse, validateUploadMeta,
} from "../upload-validation";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}
const SRC = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8").replace(/\r\n/g, "\n");

(async () => {
  await t("the combined guard sits BELOW the platform's documented 4.5 MB request limit (it is conservative, and not described as the platform limit)", () => {
    assert.ok(MAX_COMBINED_UPLOAD_BYTES < 4_500_000);
    assert.ok(MAX_COMBINED_UPLOAD_BYTES < 4.5 * 1024 * 1024);
    assert.ok(MAX_COMBINED_UPLOAD_BYTES >= 3_500_000, "not so small that ordinary documents are refused");
    const msg = String(combinedUploadError(MAX_COMBINED_UPLOAD_BYTES + 1));
    assert.match(msg, /about 4 MB/);
    assert.ok(!/4\.5/.test(msg), "does not claim 4.5 MB as the app's limit");
  });

  await t("combinedUploadError: exactly at the limit passes; one byte over fails, naming the real total and the remedy, never 'try again'", () => {
    assert.equal(combinedUploadError(0), null);
    assert.equal(combinedUploadError(MAX_COMBINED_UPLOAD_BYTES), null);
    const m = String(combinedUploadError(5_300_000));
    assert.match(m, /5\.3 MB/);
    assert.match(m, /too large to upload together/);
    assert.match(m, /Remove a file, or use a smaller copy/);
    assert.ok(!/Please try again/i.test(m), "must not tell the customer to retry the identical request");
  });

  await t("server-side: many files that are each far below 25 MB but together exceed the guard are refused; ordinary uploads pass", () => {
    const files = [{ name: "lease.pdf", size: 2_100_000 }, { name: "recon.pdf", size: 1_900_000 }, { name: "recon2.pdf", size: 600_000 }];
    assert.match(String(validateUploadMeta(files)), /too large to upload together/);
    assert.equal(validateUploadMeta([{ name: "l.pdf", size: 1_200_000 }, { name: "r.pdf", size: 900_000 }]), null);
    assert.equal(validateUploadMeta([{ name: "l.pdf", size: 0 }, { name: "r.pdf", size: 10 }]), "One of the files is empty.");
    // a single 26 MB file is reported with the combined-size message, which is the limit that actually applies
    assert.match(String(validateUploadMeta([{ name: "big.pdf", size: MAX_FILE_BYTES + 1 }])), /too large to upload together/);
  });

  await t("the visible statement limit equals what the server accepts: one primary + MAX_EXTRA_RECONS extras", () => {
    assert.equal(MAX_STATEMENTS, MAX_EXTRA_RECONS + 1);
    assert.equal(MAX_STATEMENTS, 5);
    const route = read("app/api/upload/route.ts");
    assert.match(route, /extraReconEntries\.length > MAX_EXTRA_RECONS/);
    assert.match(route, /up to \$\{MAX_STATEMENTS\} reconciliation statements/);
    assert.ok(!/at most \$\{MAX_EXTRA_RECONS\} additional/.test(route), "the old, differently-counted message is gone");
    const zone = read("components/upload-zone.tsx");
    assert.match(zone, /MAX_STATEMENTS - reconItems\.length/);
    assert.match(zone, /up to \$\{MAX_STATEMENTS\}/);
  });

  // ── the oversized-response path ──
  const trap = (status: number, contentType: string | null) =>
    ({
      status, ok: status >= 200 && status < 300,
      headers: new Headers(contentType ? { "content-type": contentType } : {}),
      json: async () => { throw new Error("the body must not be parsed"); },
      text: async () => { throw new Error("the body must not be read"); },
    }) as unknown as Response;

  await t("HTTP 413 is recognised by STATUS before any attempt to read the body, whatever its content type", async () => {
    for (const ct of ["text/plain", "text/html", "application/json", null]) {
      await assert.rejects(() => parseUploadResponse(trap(413, ct)), (e: Error) => e.message === UPLOAD_TOO_LARGE_MESSAGE);
    }
  });

  await t("the 413 message says the upload is too large and what to do, and does not say to retry the identical request", () => {
    assert.match(UPLOAD_TOO_LARGE_MESSAGE, /too large/);
    assert.match(UPLOAD_TOO_LARGE_MESSAGE, /about 4 MB/);
    assert.match(UPLOAD_TOO_LARGE_MESSAGE, /then upload again/);
    assert.ok(!/Please try again/i.test(UPLOAD_TOO_LARGE_MESSAGE));
  });

  await t("a real platform 413 response (plain-text body) produces the too-large message", async () => {
    const res = new Response("Request Entity Too Large", { status: 413, headers: { "content-type": "text/plain" } });
    await assert.rejects(() => parseUploadResponse(res), /too large to upload together/);
  });

  await t("other responses keep their behavior: JSON errors pass through, non-JSON failures are 'unexpected', success returns the body", async () => {
    await assert.rejects(() => parseUploadResponse(new Response(JSON.stringify({ error: "Only valid PDF files are accepted." }), { status: 400, headers: { "content-type": "application/json" } })), /Only valid PDF files are accepted\./);
    await assert.rejects(() => parseUploadResponse(new Response(JSON.stringify({}), { status: 400, headers: { "content-type": "application/json" } })), /Upload failed/);
    await assert.rejects(() => parseUploadResponse(new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } })), /unexpected response/);
    const ok = await parseUploadResponse(new Response(JSON.stringify({ success: true, id: "abc" }), { status: 200, headers: { "content-type": "application/json" } }));
    assert.equal(ok.id, "abc");
  });

  await t("the upload screen checks the combined size BEFORE sending anything, and reads the response only through the shared handler", () => {
    const zone = read("components/upload-zone.tsx");
    const guard = zone.indexOf("combinedUploadError(leaseItem.pdf.size");
    const send = zone.indexOf('fetch("/api/upload"');
    assert.ok(guard > 0 && send > guard, "the guard must come before the request is sent");
    assert.match(zone, /await parseUploadResponse\(res\)/);
    assert.ok(!/Upload API returned non-JSON response/.test(zone), "the old parse-first path is gone");
    assert.match(zone, /!sizeError/, "the Run button is disabled while the files are too large");
  });

  process.stdout.write(`upload-boundary: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => {
  process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
