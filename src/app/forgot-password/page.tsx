"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buttonClass, cardClass } from "@/components/ui";
import { looksLikeEmail, RESET_REQUEST_MESSAGE } from "@/lib/recovery";

const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!looksLikeEmail(email)) {
      setError("Enter the email address you signed up with.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Only a failure to reach the server is reported. Every other answer (including errors that
    // could differ between existing and unknown addresses) gets the same message, so this form
    // can never be used to find out who has an account.
    if (err?.name === "AuthRetryableFetchError") {
      setError("We could not reach the server. Check your connection and try again.");
      return;
    }
    setSent(true);
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className={`${cardClass} p-5 sm:p-8`}>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reset your password</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter the email address you signed up with and we will send you a link to choose a new password.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <label className="block text-sm font-medium text-gray-800">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {sent && (
            <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {RESET_REQUEST_MESSAGE}
            </p>
          )}

          <button type="submit" disabled={busy || cooldown > 0} className={buttonClass("primary", "w-full")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {cooldown > 0 ? `Send again in ${cooldown}s` : sent ? "Send the link again" : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-600">
          <Link href="/login" className="inline-flex min-h-11 items-center text-blue-700 hover:underline">
            &larr; Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
