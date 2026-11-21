/**
 * Fill-in dispute letter builder (public template page).
 * Run: npx tsx src/lib/__tests__/letter-builder.test.ts
 */
import assert from "node:assert";
import {
  ACCENTS,
  THEMES,
  buildBlocks,
  defaultLetter,
  fillTokens,
  inkAccent,
  letterToDocx,
  letterToPdf,
  normalizeHex,
  onAccent,
  remainingPlaceholders,
  toPlainText,
  toWinAnsi,
} from "@/lib/letter-builder";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

(async () => {
  await test("an empty letter keeps every unknown as a [placeholder]", () => {
    const text = toPlainText(buildBlocks(defaultLetter()));
    for (const p of ["[Date]", "[Name]", "[Premises address / suite]", "[Statement date]", "[Response date]", "[Your name]"]) {
      assert.ok(text.includes(p), p);
    }
    assert.ok(text.includes("three items"), "item count is filled from the list");
    assert.ok(remainingPlaceholders(buildBlocks(defaultLetter())).length > 5);
  });

  await test("form fields fill the matching tokens in the editable paragraphs", () => {
    const d = { ...defaultLetter(), statementDate: "March 3, 2026", responseBy: "April 15, 2026", premises: "100 Main St, Suite 4" };
    const text = toPlainText(buildBlocks(d));
    assert.ok(text.includes("statement dated March 3, 2026"));
    assert.ok(text.includes("Please respond by April 15, 2026."));
    assert.ok(text.includes("Re: 100 Main St, Suite 4 - CAM reconciliation for [year or period]"));
    assert.strictEqual(fillTokens("[Unknown]", d), "[Unknown]");
  });

  await test("a fully filled letter has no placeholders left once item brackets are edited", () => {
    const d = {
      ...defaultLetter(),
      date: "November 21, 2026", senderName: "Alex Doe", senderBusiness: "Doe Cafe LLC", senderAddress: "1 A St\nTown, ST 00000",
      senderPhone: "555-0100", senderEmail: "a@example.com", recipientName: "Pat Lee", recipientAddress: "2 B St\nTown, ST 00000",
      premises: "1 A St", period: "2025", statementDate: "March 3, 2026", responseBy: "April 15, 2026",
      items: [{ id: "x", title: "Management fee", body: "The statement shows 6% on page 2." }],
    };
    const blocks = buildBlocks(d);
    assert.deepStrictEqual(remainingPlaceholders(blocks), []);
    assert.ok(toPlainText(blocks).includes("one item"));
  });

  await test("removed items and empty record requests do not leave gaps", () => {
    const d = { ...defaultLetter(), items: [], requests: ["", "  "] };
    const text = toPlainText(buildBlocks(d));
    assert.ok(!text.includes("Please also send"));
    assert.ok(!/\n{3,}/.test(text));
  });

  await test("letter wording stays careful: no deadline, citation or guarantee language", () => {
    const text = toPlainText(buildBlocks(defaultLetter()));
    assert.ok(!/\b\d+ days\b/.test(text), "no stated deadline");
    assert.ok(!/§|U\.S\.C|guarantee|violat|overcharged/i.test(text));
    assert.ok(/not assuming that anything is incorrect/.test(text));
  });

  await test("colors: hex is normalized, banner text stays readable, light accents are darkened for text", () => {
    assert.strictEqual(normalizeHex("ABC"), "#aabbcc");
    assert.strictEqual(normalizeHex("not a color"), "#0f766e");
    assert.strictEqual(onAccent("#0b1b33"), "#ffffff");
    assert.strictEqual(onAccent("#fde047"), "#0b1b33");
    assert.notStrictEqual(inkAccent("#fde047"), "#fde047");
    assert.strictEqual(inkAccent("#0b1b33"), "#0b1b33");
  });

  await test("WinAnsi mapping keeps PDFs from failing on smart quotes and dashes", () => {
    assert.strictEqual(toWinAnsi("“Hi” – it’s… ok"), '"Hi" - it\'s... ok');
    assert.strictEqual(toWinAnsi("emoji 😀"), "emoji ??");
  });

  await test("every theme, typeface and preset color produces a valid PDF and Word file", async () => {
    const d = { ...defaultLetter(), senderBusiness: "Doe “Cafe” LLC", items: [...defaultLetter().items, ...defaultLetter().items, ...defaultLetter().items] };
    const blocks = buildBlocks(d);
    for (const t of THEMES) {
      for (const font of ["serif", "sans"] as const) {
        const style = { theme: t.id, font, accent: ACCENTS[(t.id.length + font.length) % ACCENTS.length].hex };
        const pdf = await letterToPdf(blocks, style);
        assert.strictEqual(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-", `${t.id}/${font} pdf`);
        const docx = await letterToDocx(blocks, style);
        assert.strictEqual(Buffer.from(docx.slice(0, 2)).toString(), "PK", `${t.id}/${font} docx`);
      }
    }
    const { PDFDocument } = await import("pdf-lib");
    const long = await PDFDocument.load(await letterToPdf(blocks, { theme: "banner", font: "serif", accent: "#fde047" }));
    assert.ok(long.getPageCount() >= 2, "a long letter flows onto a second page");
  });

  console.log(`\nletter-builder: ${passed} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
