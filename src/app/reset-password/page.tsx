"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buttonClass, cardClass } from "@/components/ui";
import { MIN_PASSWORD_LENGTH, parseRecoveryLinkProblem, validateNewPassword } from "@/lib/recovery";

type Stage = "checking" | "ready" | "expired" | "invalid" | "missing" | "done";

const inputClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 " +
  "focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

/**
 * Landing page for the password-recovery email link. The link signs the visitor in as the account
 * that received the email (and only that account); this page shows no audit data. If the link is
 * expired, already used, or absent, no form is shown.
 */
export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Read the URL before Supabase finishes processing (and clears) it.
    const problem = parseRecoveryLinkProblem(window.location.hash || window.location.search);
    (async () => {
      const { data } = await supabase.auth.getSession(); // waits for the link to be processed
      if (cancelled) return;
      if (problem.kind === "expired") return setStage("expired");
      if (problem.kind === "invalid") return setStage("invalid");
      setStage(data.session ? "ready" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validateNewPassword(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      return setError(err.message || "We could not change your password. Please request a new link.");
    }
    // Sign out every other session so anyone who had the old password is locked out.
    await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
    setBusy(false);
    setPassword("");
    setConfirm("");
    setStage("done");
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className={`${cardClass} p-5 sm:p-8`}>
        {stage === "checking" && (
          <div className="flex items-center gap-3 text-gray-600" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Checking your link...
          </div>
        )}

        {(stage === "expired" || stage === "invalid" || stage === "missing") && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {stage === "expired" ? "This link has expired" : "This link can't be used"}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {stage === "expired"
                ? "Password reset links expire after a short time."
                : stage === "invalid"
                  ? "The link is not valid, or it has already been used."
                  : "Open this page from the link in your password reset email."}{" "}
              Request a new one and use the newest email.
            </p>
            <Link href="/forgot-password" className={buttonClass("primary", "mt-6 w-full")}>
              Request a new link
            </Link>
            <p className="mt-4 text-sm">
              <Link href="/login" className="inline-flex min-h-11 items-center text-blue-700 hover:underline">
                &larr; Back to sign in
              </Link>
            </p>
          </>
        )}

        {stage === "ready" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Choose a new password</h1>
            <p className="mt-2 text-sm text-gray-600">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <label className="block text-sm font-medium text-gray-800">
                New password
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium text-gray-800">
                Confirm new password
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputClass}
                />
              </label>
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className={buttonClass("primary", "w-full")}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save new password
              </button>
            </form>
          </>
        )}

        {stage === "done" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Password updated</h1>
            <p role="status" className="mt-2 text-sm text-gray-600">
              Your password has been changed and you are signed in. Other devices were signed out.
            </p>
            <Link href="/account" className={buttonClass("primary", "mt-6 w-full")}>
              Go to My audits
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
