/** Run: npx tsx src/lib/__tests__/recovery.test.ts */
import assert from "node:assert";
import { looksLikeEmail, MIN_PASSWORD_LENGTH, parseRecoveryLinkProblem, RESET_REQUEST_MESSAGE, validateNewPassword } from "../recovery";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

t("expired link is recognised from Supabase's redirect fragment", () => {
  assert.deepStrictEqual(
    parseRecoveryLinkProblem("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    { kind: "expired" },
  );
});
t("other link errors are reported as invalid", () => {
  assert.deepStrictEqual(parseRecoveryLinkProblem("#error=access_denied&error_code=unexpected_failure"), { kind: "invalid" });
  assert.deepStrictEqual(parseRecoveryLinkProblem("?error=server_error"), { kind: "invalid" });
});
t("a normal recovery fragment or an empty URL is not an error", () => {
  assert.deepStrictEqual(parseRecoveryLinkProblem(""), { kind: "none" });
  assert.deepStrictEqual(parseRecoveryLinkProblem("#access_token=abc&type=recovery"), { kind: "none" });
});
t("new password must be long enough and match", () => {
  assert.ok(validateNewPassword("short", "short"));
  assert.ok(validateNewPassword("a-long-enough-pass", "a-different-pass"));
  assert.strictEqual(validateNewPassword("a-long-enough-pass", "a-long-enough-pass"), null);
  assert.strictEqual(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH), "x".repeat(MIN_PASSWORD_LENGTH)), null);
  assert.ok(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH - 1), "x".repeat(MIN_PASSWORD_LENGTH - 1)));
});
t("email format check is permissive but rejects obvious junk", () => {
  for (const ok of ["a@b.co", " tenant@example.com "]) assert.ok(looksLikeEmail(ok));
  for (const bad of ["", "no-at-sign", "a@b", "a b@c.com"]) assert.ok(!looksLikeEmail(bad));
});
t("the reset-request message never says whether an account exists", () => {
  assert.ok(/If an account exists/.test(RESET_REQUEST_MESSAGE));
  assert.ok(!/not found|no account|does not exist|unknown|already registered/i.test(RESET_REQUEST_MESSAGE));
});

console.log(`\nrecovery: ${n} passed, 0 failed`);
