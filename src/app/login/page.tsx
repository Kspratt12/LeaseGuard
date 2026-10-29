"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, ShieldCheck, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buttonClass, cardClass } from "@/components/ui";

/** Only allow same-site relative redirects. */
function safeNext(value: string | null): string {
  return value && /^\/(?!\/)/.test(value) ? value : "/upload";
}

const inputClass =
  "mt-1 block w-full min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 " +
  "focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your email and confirm your address, then sign in. The link brings you straight back here.");
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === "signup";

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-14">
      <section className="order-2 lg:order-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {signup ? "Create your LeaseGuard account" : "Welcome back"}
        </h1>
        <p className="mt-3 text-gray-600">
          {signup
            ? "An account keeps your leases, audits and reports private to you, and lets you come back to them later."
            : "Sign in to see your audits, open a paid report, or start a new one."}
        </p>
        <ul className="mt-6 space-y-4 text-sm text-gray-700">
          <li className="flex gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span>Your documents and results are visible only to your account.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span>Findings show the lease and statement text they come from, so you can verify each one.</span>
          </li>
          <li className="flex gap-3">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span>The preview is free. The full report is a one-time $49 for one year or $149 for two to five years.</span>
          </li>
        </ul>
      </section>

      <section className={`${cardClass} order-1 p-5 sm:p-8 lg:order-2`}>
        <div role="group" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 text-sm font-semibold">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={`min-h-11 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate={false}>
          <label className="block text-sm font-medium text-gray-800">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={signup ? "pw-hint" : undefined}
              className={inputClass}
            />
          </label>
          {signup ? (
            <p id="pw-hint" className="-mt-2 text-xs text-gray-500">
              Use at least 8 characters.
            </p>
          ) : (
            <p className="-mt-2">
              <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 hover:underline">
                Forgot password?
              </Link>
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className={buttonClass("primary", "w-full")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {signup ? "Create account" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
