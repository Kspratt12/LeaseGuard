import type { Metadata } from "next";
import { UploadZone } from "@/components/upload-zone";
import { FileText, Files, Camera } from "lucide-react";

export const metadata: Metadata = {
  alternates: { canonical: "/upload" },
  title: "Upload Your Lease and CAM Statement | LeaseGuard",
  description: "Upload a commercial lease and CAM reconciliation statement to run a LeaseGuard audit.",
  // A tool entry point, not search content: keep it out of the index.
  robots: { index: false, follow: true },
};

export default function UploadPage() {
  return (
    <main className="flex flex-col items-center px-4 py-10 sm:py-24">
      {/* Header */}
      <div className="max-w-2xl text-center space-y-3 sm:space-y-4 mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-gray-900">
          Upload Your Documents
        </h1>
        <p className="text-base sm:text-lg text-gray-600">
          Upload your commercial lease and CAM reconciliation statements, or
          take photos with your phone. LeaseGuard will analyze them and flag potential billing discrepancies.
        </p>
      </div>

      {/* Upload instructions */}
      <div className="hidden w-full max-w-2xl grid-cols-1 sm:grid sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 shrink-0">
            <FileText className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Upload Lease PDF</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload the CAM or operating expense provisions of your lease, plus the definitions, schedules, exhibits and amendments that affect the charges. An excerpt may support only a limited review.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 shrink-0">
            <Files className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Upload CAM Statements
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload one or more annual CAM reconciliation statements. Add
              multiple years to enable year-over-year comparison.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 shrink-0">
            <Camera className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Or Take Photo</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Use your phone camera to capture documents. Each photo is
              automatically converted to PDF for analysis.
            </p>
          </div>
        </div>
      </div>

      {/* Upload component */}
      <UploadZone />

      {/* Disclaimer */}
      <p className="mt-10 max-w-md text-center text-xs text-gray-400">
        AI-powered analysis for informational purposes only. Not legal or
        accounting advice.
      </p>
    </main>
  );
}
