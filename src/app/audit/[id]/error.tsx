"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function AuditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[audit-error-boundary]", error);
  }, [error]);

  return (
    <main className="flex flex-col items-center px-4 py-24 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <p className="text-gray-500 mb-2 max-w-md">
        An error occurred while loading your audit results. Your audit data is
        safe.
      </p>
      <p className="text-xs text-gray-400 mb-6 max-w-md font-mono">
        {error.message}
      </p>
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Try Again
        </button>
        <Link href="/upload" className="text-blue-700 underline text-sm">
          Start a new audit
        </Link>
      </div>
    </main>
  );
}
