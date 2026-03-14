"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata about a file that can be serialized to sessionStorage */
interface FileMeta {
  name: string;
  size: number;
  type: string;
}

/** A stored upload item — includes File object (when available) and metadata */
export interface DraftUploadItem {
  id: string;
  file: File | null;
  meta: FileMeta;
  /** For image-converted PDFs, the label shown in the UI */
  label: string;
}

interface AuditDraft {
  /** The lease file (if uploaded) */
  lease: DraftUploadItem | null;
  /** All reconciliation files */
  recons: DraftUploadItem[];
  /** The last audit ID (for "back from results" flow) */
  lastAuditId: string | null;
}

interface AuditDraftContextValue {
  draft: AuditDraft;
  setLease: (file: File | null, label?: string) => void;
  addRecons: (items: Array<{ file: File; label: string }>) => void;
  removeRecon: (index: number) => void;
  clearRecon: (index: number) => void;
  setLastAuditId: (id: string | null) => void;
  clearDraft: () => void;
  /** Whether the draft has files from a previous session (restored from storage) */
  isRestored: boolean;
}

// ---------------------------------------------------------------------------
// Session storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "leaseguard_audit_draft";

interface StoredDraft {
  lease: { meta: FileMeta; label: string } | null;
  recons: Array<{ meta: FileMeta; label: string }>;
  lastAuditId: string | null;
}

function saveDraftToStorage(draft: AuditDraft) {
  try {
    const stored: StoredDraft = {
      lease: draft.lease
        ? { meta: draft.lease.meta, label: draft.lease.label }
        : null,
      recons: draft.recons.map((r) => ({ meta: r.meta, label: r.label })),
      lastAuditId: draft.lastAuditId,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // sessionStorage may be unavailable
  }
}

function loadDraftFromStorage(): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft;
  } catch {
    return null;
  }
}

function clearStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EMPTY_DRAFT: AuditDraft = {
  lease: null,
  recons: [],
  lastAuditId: null,
};

const AuditDraftContext = createContext<AuditDraftContextValue>({
  draft: EMPTY_DRAFT,
  setLease: () => {},
  addRecons: () => {},
  removeRecon: () => {},
  clearRecon: () => {},
  setLastAuditId: () => {},
  clearDraft: () => {},
  isRestored: false,
});

let nextDraftId = 0;
function draftUid() {
  return `draft-${Date.now()}-${nextDraftId++}`;
}

export function AuditDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<AuditDraft>(EMPTY_DRAFT);
  const [isRestored, setIsRestored] = useState(false);

  // Restore from sessionStorage on mount
  useEffect(() => {
    const stored = loadDraftFromStorage();
    if (stored && (stored.lease || stored.recons.length > 0)) {
      const restoredDraft: AuditDraft = {
        lease: stored.lease
          ? {
              id: draftUid(),
              file: null, // File objects can't be serialized — null means "metadata only"
              meta: stored.lease.meta,
              label: stored.lease.label,
            }
          : null,
        recons: stored.recons.map((r) => ({
          id: draftUid(),
          file: null,
          meta: r.meta,
          label: r.label,
        })),
        lastAuditId: stored.lastAuditId,
      };
      setDraft(restoredDraft);
      setIsRestored(true);
    }
  }, []);

  // Persist to sessionStorage on change
  useEffect(() => {
    if (draft.lease || draft.recons.length > 0 || draft.lastAuditId) {
      saveDraftToStorage(draft);
    }
  }, [draft]);

  const setLease = useCallback((file: File | null, label?: string) => {
    if (!file) {
      setDraft((prev) => ({ ...prev, lease: null }));
      setIsRestored(false);
      return;
    }
    setDraft((prev) => ({
      ...prev,
      lease: {
        id: draftUid(),
        file,
        meta: { name: file.name, size: file.size, type: file.type },
        label: label ?? file.name,
      },
    }));
    setIsRestored(false);
  }, []);

  const addRecons = useCallback(
    (items: Array<{ file: File; label: string }>) => {
      const newItems: DraftUploadItem[] = items.map((item) => ({
        id: draftUid(),
        file: item.file,
        meta: {
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
        },
        label: item.label,
      }));
      setDraft((prev) => ({
        ...prev,
        recons: [...prev.recons, ...newItems],
      }));
      setIsRestored(false);
    },
    [],
  );

  const removeRecon = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      recons: prev.recons.filter((_, i) => i !== index),
    }));
  }, []);

  const clearRecon = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      recons: prev.recons.filter((_, i) => i !== index),
    }));
  }, []);

  const setLastAuditId = useCallback((id: string | null) => {
    setDraft((prev) => ({ ...prev, lastAuditId: id }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setIsRestored(false);
    clearStorage();
  }, []);

  return (
    <AuditDraftContext.Provider
      value={{
        draft,
        setLease,
        addRecons,
        removeRecon,
        clearRecon,
        setLastAuditId,
        clearDraft,
        isRestored,
      }}
    >
      {children}
    </AuditDraftContext.Provider>
  );
}

export function useAuditDraft() {
  return useContext(AuditDraftContext);
}
