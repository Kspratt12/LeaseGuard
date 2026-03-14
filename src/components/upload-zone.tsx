"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function UploadZone() {
  const router = useRouter();
  const [leaseFile, setLeaseFile] = useState<File | null>(null);
  const [reconFiles, setReconFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const handleAddReconFiles = useCallback((files: File[]) => {
    setReconFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const newFiles = files.filter((f) => !existingNames.has(f.name));
      const dupes = files.filter((f) => existingNames.has(f.name));
      if (dupes.length > 0) {
        setDuplicateNotice("This file has already been added.");
        setTimeout(() => setDuplicateNotice(null), 3000);
      }
      return [...prev, ...newFiles];
    });
  }, []);

  const handleRemoveReconFile = useCallback((index: number) => {
    setReconFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!leaseFile || reconFiles.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("lease", leaseFile);

      // First recon file goes as the primary "recon" field
      form.append("recon", reconFiles[0]);

      // Additional recon files go as "extraRecons"
      for (let i = 1; i < reconFiles.length; i++) {
        form.append("extraRecons", reconFiles[i]);
      }

      const res = await fetch("/api/upload", { method: "POST", body: form });

      // Guard: read body safely — the server may return HTML on a crash
      let json: Record<string, unknown>;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        json = await res.json();
      } else {
        // Non-JSON response (likely an HTML error page)
        const text = await res.text();
        console.error("Upload API returned non-JSON response:", text.slice(0, 500));
        throw new Error("The server returned an unexpected response. Please try again.");
      }

      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Upload failed",
        );
      }

      if (typeof json.id !== "string") {
        throw new Error("Upload succeeded but no audit ID was returned.");
      }

      router.push(`/audit/${json.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }, [leaseFile, reconFiles, router]);

  const isValid = !!leaseFile && reconFiles.length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FileDropBox
          label="Click or drag lease PDF here"
          hint="CAM / operating expense section"
          file={leaseFile}
          onFile={setLeaseFile}
          onClear={() => setLeaseFile(null)}
          accept=".pdf"
        />
        <MultiFileDropBox
          label="Click or drag reconciliation PDF(s) here"
          hint="Upload one or more annual CAM reconciliations"
          subHint="Used for year-over-year comparison when multiple years are provided"
          files={reconFiles}
          onAddFiles={handleAddReconFiles}
          onRemoveFile={handleRemoveReconFile}
          accept=".pdf"
          duplicateNotice={duplicateNotice}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="space-y-2">
        <button
          onClick={handleSubmit}
          disabled={!isValid || uploading}
          className={cn(
            "w-full py-4 px-6 rounded-lg text-lg font-semibold transition-colors",
            "bg-blue-600 text-white hover:bg-blue-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "flex items-center justify-center gap-2",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Uploading…
            </>
          ) : (
            "Run 60-Second Audit"
          )}
        </button>
        {!isValid && !uploading && (
          <p className="text-sm text-gray-500 text-center">
            Upload 1 lease PDF and at least 1 reconciliation PDF to continue
          </p>
        )}
      </div>
    </div>
  );
}

function FileDropBox({
  label,
  hint,
  file,
  onFile,
  onClear,
  accept,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  onClear: () => void;
  accept: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    onFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.name.toLowerCase().endsWith(".pdf")) onFile(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-50"
            : file
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 focus-within:border-blue-400 bg-white",
        )}
      >
        {file ? (
          <FileText className="h-8 w-8 text-blue-600" />
        ) : (
          <Upload className="h-8 w-8 text-gray-400" />
        )}
        <span className="font-medium text-sm text-center">
          {file ? "Lease PDF" : label}
        </span>
        <span className="text-xs text-gray-500 text-center">
          {file ? "" : hint}
        </span>
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
      </label>

      {file && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-blue-50 border border-blue-200 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="truncate">{file.name}</span>
            <span className="text-xs text-gray-500 shrink-0">
              {(file.size / 1024).toFixed(0)} KB
            </span>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MultiFileDropBox({
  label,
  hint,
  subHint,
  files,
  onAddFiles,
  onRemoveFile,
  accept,
  duplicateNotice,
}: {
  label: string;
  hint: string;
  subHint?: string;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  accept: string;
  duplicateNotice?: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    onAddFiles(Array.from(selected));
    // Reset input so the same files can be re-selected
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files;
    if (!dropped || dropped.length === 0) return;
    const pdfs = Array.from(dropped).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length > 0) onAddFiles(pdfs);
  };

  const hasFiles = files.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-50"
            : hasFiles
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 focus-within:border-blue-400 bg-white",
        )}
      >
        {hasFiles ? (
          <FileText className="h-8 w-8 text-blue-600" />
        ) : (
          <Upload className="h-8 w-8 text-gray-400" />
        )}
        <span className="font-medium text-sm text-center">
          {hasFiles
            ? `${files.length} file${files.length !== 1 ? "s" : ""} selected`
            : label}
        </span>
        <span className="text-xs text-gray-500 text-center">
          {hasFiles ? "Click to add more" : hint}
        </span>
        {!hasFiles && subHint && (
          <span className="text-xs text-gray-400 text-center">{subHint}</span>
        )}
        <input
          type="file"
          accept={accept}
          multiple
          onChange={handleChange}
          className="hidden"
        />
      </label>

      {duplicateNotice && (
        <p className="text-xs text-amber-600">{duplicateNotice}</p>
      )}

      {hasFiles && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500">Uploaded CAM Files</p>
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.lastModified}`}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-blue-50 border border-blue-200 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFile(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
