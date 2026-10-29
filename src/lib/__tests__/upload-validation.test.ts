/** Run: npx tsx src/lib/__tests__/upload-validation.test.ts */
import assert from "node:assert";
import { hasPdfSignature, validateUploadMeta, MAX_FILE_BYTES } from "../upload-validation";

assert.ok(hasPdfSignature(Buffer.from("%PDF-1.7\n...")));
assert.ok(hasPdfSignature(Buffer.from("junk\n%PDF-1.4")));
assert.ok(!hasPdfSignature(Buffer.from("<html>not a pdf</html>")));
assert.ok(!hasPdfSignature(Buffer.from("MZ\x90\x00 executable")));
assert.ok(!hasPdfSignature(Buffer.alloc(0)));
assert.strictEqual(validateUploadMeta([{ name: "a.pdf", size: 10 }]), null);
assert.ok(validateUploadMeta([{ name: "a.pdf", size: 0 }]));
assert.ok(validateUploadMeta([{ name: "a.pdf", size: MAX_FILE_BYTES + 1 }]));
console.log("upload-validation: 8 assertions passed");
