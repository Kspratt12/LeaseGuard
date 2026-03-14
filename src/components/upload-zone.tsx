"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, X, Camera, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { imagesToPdf } from "@/lib/images-to-pdf";
import { useAuditDraft } from "@/components/audit-draft-context";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name);
}

/** Grouped upload item: either a PDF or a set of images to be merged into one PDF */
interface UploadItem {
  id: string;
  /** The final PDF file (set immediately for PDF uploads, set after conversion for images) */
  pdf: File | null;
  /** Original source files (for preview) */
  sources: File[];
  /** Preview URLs for images */
  previews: string[];
  /** Whether images are being converted to PDF */
  converting: boolean;
  /** Display label */
  label: string;
}

let nextId = 0;
function uid() {
  return `item-${Date.now()}-${nextId++}`;
}

export function UploadZone() {
  const router = useRouter();
  const {
    draft,
    setLease: setDraftLease,
    addRecons: addDraftRecons,
    removeRecon: removeDraftRecon,
    setLastAuditId,
  } = useAuditDraft();
  const [leaseItem, setLeaseItem] = useState<UploadItem | null>(null);
  const [reconItems, setReconItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // Restore files from draft context (persisted across navigation)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Restore lease from draft context (File objects survive client-side navigation)
    if (draft.lease && !leaseItem) {
      if (draft.lease.file) {
        // File object available (client-side navigation, not page refresh)
        setLeaseItem({
          id: draft.lease.id,
          pdf: draft.lease.file,
          sources: [draft.lease.file],
          previews: [],
          converting: false,
          label: draft.lease.label,
        });
      } else {
        // Metadata only (page refresh) — show filename but require re-selection
        setLeaseItem({
          id: draft.lease.id,
          pdf: null,
          sources: [],
          previews: [],
          converting: false,
          label: `${draft.lease.meta.name} (re-select to rerun)`,
        });
      }
    }

    // Restore recon files from draft context
    if (draft.recons.length > 0 && reconItems.length === 0) {
      const restored: UploadItem[] = draft.recons.map((r) => {
        if (r.file) {
          return {
            id: r.id,
            pdf: r.file,
            sources: [r.file],
            previews: [],
            converting: false,
            label: r.label,
          };
        }
        return {
          id: r.id,
          pdf: null,
          sources: [],
          previews: [],
          converting: false,
          label: `${r.meta.name} (re-select to rerun)`,
        };
      });
      setReconItems(restored);
    }
  }, [draft, leaseItem, reconItems.length]);

  /** Convert images to PDF and update the item in place */
  const convertImages = useCallback(
    async (
      images: File[],
      setItem: (updater: (prev: UploadItem | null) => UploadItem | null) => void,
      itemId: string,
      filename: string,
      isLease?: boolean,
    ) => {
      try {
        const pdf = await imagesToPdf(images, filename);
        setItem((prev) => {
          if (!prev || prev.id !== itemId) return prev;
          return { ...prev, pdf, converting: false };
        });
        // Sync converted PDF to draft context
        if (isLease) {
          setDraftLease(pdf, filename);
        }
      } catch {
        setItem((prev) => {
          if (!prev || prev.id !== itemId) return prev;
          return { ...prev, converting: false };
        });
      }
    },
    [setDraftLease],
  );

  /** Create an UploadItem from files (PDF or images) */
  const createItem = useCallback(
    (
      files: File[],
      defaultFilename: string,
      setItem: (updater: (prev: UploadItem | null) => UploadItem | null) => void,
      isLease?: boolean,
    ): UploadItem => {
      const id = uid();
      const previews = files
        .filter(isImageFile)
        .map((f) => URL.createObjectURL(f));

      // If first file is a PDF, use it directly
      if (files.length === 1 && files[0].type === "application/pdf") {
        return {
          id,
          pdf: files[0],
          sources: files,
          previews: [],
          converting: false,
          label: files[0].name,
        };
      }

      // Otherwise it's images — convert to PDF
      const item: UploadItem = {
        id,
        pdf: null,
        sources: files,
        previews,
        converting: true,
        label:
          files.length === 1
            ? files[0].name
            : `${files.length} photos → PDF`,
      };

      convertImages(files, setItem, id, defaultFilename, isLease);
      return item;
    },
    [convertImages],
  );

  const handleSetLease = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      // Revoke old preview URLs
      if (leaseItem) leaseItem.previews.forEach(URL.revokeObjectURL);
      const item = createItem(
        files,
        "lease-photos.pdf",
        (fn) => setLeaseItem(fn),
        true, // isLease — for draft sync on image conversion
      );
      setLeaseItem(item);
      // Sync to draft context (if PDF is ready; images sync after conversion)
      if (item.pdf) {
        setDraftLease(item.pdf, item.label);
      }
    },
    [createItem, leaseItem, setDraftLease],
  );

  const handleClearLease = useCallback(() => {
    if (leaseItem) leaseItem.previews.forEach(URL.revokeObjectURL);
    setLeaseItem(null);
    setDraftLease(null);
  }, [leaseItem, setDraftLease]);

  const handleAddReconFiles = useCallback(
    (files: File[]) => {
      // Check for duplicates
      const existingNames = new Set(
        reconItems.flatMap((r) => r.sources.map((s) => s.name)),
      );
      const newFiles = files.filter((f) => !existingNames.has(f.name));
      const dupes = files.filter((f) => existingNames.has(f.name));
      if (dupes.length > 0) {
        setDuplicateNotice("This file has already been added.");
        setTimeout(() => setDuplicateNotice(null), 3000);
      }
      if (newFiles.length === 0) return;

      // Group: PDFs individually, images together
      const pdfFiles = newFiles.filter(
        (f) => f.type === "application/pdf",
      );
      const imageFiles = newFiles.filter(isImageFile);

      const newItems: UploadItem[] = [];

      for (const pdf of pdfFiles) {
        newItems.push({
          id: uid(),
          pdf,
          sources: [pdf],
          previews: [],
          converting: false,
          label: pdf.name,
        });
      }

      if (imageFiles.length > 0) {
        const id = uid();
        const previews = imageFiles.map((f) => URL.createObjectURL(f));
        const item: UploadItem = {
          id,
          pdf: null,
          sources: imageFiles,
          previews,
          converting: true,
          label: `${imageFiles.length} photo${imageFiles.length !== 1 ? "s" : ""} → PDF`,
        };
        newItems.push(item);

        // Convert in background
        imagesToPdf(imageFiles, "recon-photos.pdf").then((pdf) => {
          setReconItems((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, pdf, converting: false } : r,
            ),
          );
          // Sync converted PDF to draft
          addDraftRecons([{ file: pdf, label: "recon-photos.pdf" }]);
        }).catch(() => {
          setReconItems((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, converting: false } : r,
            ),
          );
        });
      }

      setReconItems((prev) => [...prev, ...newItems]);

      // Sync to draft context — only items with File objects
      const draftItems = newItems
        .filter((item) => item.pdf)
        .map((item) => ({ file: item.pdf!, label: item.label }));
      if (draftItems.length > 0) {
        addDraftRecons(draftItems);
      }
    },
    [reconItems, addDraftRecons],
  );

  const handleRemoveReconItem = useCallback((index: number) => {
    setReconItems((prev) => {
      const removed = prev[index];
      if (removed) removed.previews.forEach(URL.revokeObjectURL);
      return prev.filter((_, i) => i !== index);
    });
    removeDraftRecon(index);
  }, [removeDraftRecon]);

  const handleSubmit = useCallback(async () => {
    if (!leaseItem?.pdf || reconItems.length === 0) return;

    // Wait if anything is still converting
    const allConverting =
      leaseItem.converting || reconItems.some((r) => r.converting);
    if (allConverting) return;

    // Verify all recon items have PDFs
    const reconPdfs = reconItems
      .map((r) => r.pdf)
      .filter((f): f is File => f !== null);
    if (reconPdfs.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("lease", leaseItem.pdf);

      // First recon file goes as the primary "recon" field
      form.append("recon", reconPdfs[0]);

      // Additional recon files go as "extraRecons"
      for (let i = 1; i < reconPdfs.length; i++) {
        form.append("extraRecons", reconPdfs[i]);
      }

      const res = await fetch("/api/upload", { method: "POST", body: form });

      let json: Record<string, unknown>;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        json = await res.json();
      } else {
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

      // Save audit ID to draft so back navigation knows which audit to reference
      setLastAuditId(json.id as string);

      router.push(`/audit/${json.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }, [leaseItem, reconItems, router]);

  const anyConverting =
    leaseItem?.converting || reconItems.some((r) => r.converting);
  const isValid =
    !!leaseItem?.pdf &&
    !leaseItem.converting &&
    reconItems.length > 0 &&
    reconItems.every((r) => r.pdf && !r.converting);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DocumentDropBox
          label="Upload Lease PDF"
          cameraLabel="Or Take Photo"
          hint="CAM / operating expense section"
          item={leaseItem}
          onFiles={handleSetLease}
          onClear={handleClearLease}
        />
        <MultiDocumentDropBox
          label="Upload CAM Reconciliation"
          cameraLabel="Or Take Photo"
          hint="Upload one or more annual CAM reconciliations"
          subHint="Used for year-over-year comparison when multiple years are provided"
          items={reconItems}
          onAddFiles={handleAddReconFiles}
          onRemoveItem={handleRemoveReconItem}
          duplicateNotice={duplicateNotice}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="space-y-2">
        <button
          onClick={handleSubmit}
          disabled={!isValid || uploading || !!anyConverting}
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
          ) : anyConverting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Preparing images…
            </>
          ) : (
            "Run 60-Second Audit"
          )}
        </button>
        {!isValid && !uploading && !anyConverting && (
          <p className="text-sm text-gray-500 text-center">
            Upload 1 lease and at least 1 reconciliation to continue
          </p>
        )}
      </div>

      {/* Accepted formats hint */}
      <p className="text-xs text-gray-400 text-center">
        Accepts PDF, JPG, PNG, and camera photos. Images are automatically
        converted to PDF.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single-document drop box (lease)                                   */
/* ------------------------------------------------------------------ */

function DocumentDropBox({
  label,
  cameraLabel,
  hint,
  item,
  onFiles,
  onClear,
}: {
  label: string;
  cameraLabel: string;
  hint: string;
  item: UploadItem | null;
  onFiles: (files: File[]) => void;
  onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter(isAcceptedFile);
    if (accepted.length > 0) onFiles(accepted);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter(isAcceptedFile);
    if (accepted.length > 0) onFiles(accepted);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Main drop area */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-50"
            : item
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 focus-within:border-blue-400 bg-white",
        )}
      >
        {item ? (
          <FileText className="h-8 w-8 text-blue-600" />
        ) : (
          <Upload className="h-8 w-8 text-gray-400" />
        )}
        <span className="font-medium text-sm text-center">
          {item ? "Lease PDF" : label}
        </span>
        <span className="text-xs text-gray-500 text-center">
          {item ? "" : hint}
        </span>
        {!item && (
          <span className="text-xs text-gray-400">PDF, JPG, or PNG</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
          onChange={handleChange}
          className="hidden"
        />
      </label>

      {/* Camera capture button (visible on all devices, functional on mobile) */}
      {!item && (
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          <Camera className="h-4 w-4" />
          {cameraLabel}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleChange}
            className="hidden"
          />
        </button>
      )}

      {/* Preview / file info */}
      {item && (
        <div className="space-y-2">
          {/* Image previews */}
          {item.previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {item.previews.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Page ${i + 1}`}
                  className="h-16 w-16 rounded border border-gray-200 object-cover shrink-0"
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-blue-50 border border-blue-200 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              {item.converting ? (
                <Loader2 className="h-4 w-4 text-blue-600 shrink-0 animate-spin" />
              ) : item.previews.length > 0 ? (
                <ImageIcon className="h-4 w-4 text-blue-600 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
              )}
              <span className="truncate">
                {item.converting ? "Converting to PDF…" : item.label}
              </span>
              {item.pdf && !item.converting && (
                <span className="text-xs text-gray-500 shrink-0">
                  {(item.pdf.size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Multi-document drop box (reconciliation)                           */
/* ------------------------------------------------------------------ */

function MultiDocumentDropBox({
  label,
  cameraLabel,
  hint,
  subHint,
  items,
  onAddFiles,
  onRemoveItem,
  duplicateNotice,
}: {
  label: string;
  cameraLabel: string;
  hint: string;
  subHint?: string;
  items: UploadItem[];
  onAddFiles: (files: File[]) => void;
  onRemoveItem: (index: number) => void;
  duplicateNotice?: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter(isAcceptedFile);
    if (accepted.length > 0) onAddFiles(accepted);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter(isAcceptedFile);
    if (accepted.length > 0) onAddFiles(accepted);
  };

  const hasItems = items.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Main drop area */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-50"
            : hasItems
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 focus-within:border-blue-400 bg-white",
        )}
      >
        {hasItems ? (
          <FileText className="h-8 w-8 text-blue-600" />
        ) : (
          <Upload className="h-8 w-8 text-gray-400" />
        )}
        <span className="font-medium text-sm text-center">
          {hasItems
            ? `${items.length} file${items.length !== 1 ? "s" : ""} selected`
            : label}
        </span>
        <span className="text-xs text-gray-500 text-center">
          {hasItems ? "Click to add more" : hint}
        </span>
        {!hasItems && subHint && (
          <span className="text-xs text-gray-400 text-center">{subHint}</span>
        )}
        {!hasItems && (
          <span className="text-xs text-gray-400">PDF, JPG, or PNG</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
          multiple
          onChange={handleChange}
          className="hidden"
        />
      </label>

      {/* Camera capture button */}
      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <Camera className="h-4 w-4" />
        {cameraLabel}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleChange}
          className="hidden"
        />
      </button>

      {duplicateNotice && (
        <p className="text-xs text-amber-600">{duplicateNotice}</p>
      )}

      {/* File list with previews */}
      {hasItems && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500">
            Uploaded CAM Files
          </p>
          <ul className="space-y-1">
            {items.map((item, index) => (
              <li key={item.id} className="space-y-1">
                {/* Image previews */}
                {item.previews.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {item.previews.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Page ${i + 1}`}
                        className="h-12 w-12 rounded border border-gray-200 object-cover shrink-0"
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-blue-50 border border-blue-200 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.converting ? (
                      <Loader2 className="h-4 w-4 text-blue-600 shrink-0 animate-spin" />
                    ) : item.previews.length > 0 ? (
                      <ImageIcon className="h-4 w-4 text-blue-600 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                    <span className="truncate">
                      {item.converting ? "Converting to PDF…" : item.label}
                    </span>
                    {item.pdf && !item.converting && (
                      <span className="text-xs text-gray-500 shrink-0">
                        {(item.pdf.size / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    aria-label={`Remove ${item.label}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
