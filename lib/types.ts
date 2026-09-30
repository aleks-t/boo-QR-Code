export type Vendor = {
  id: string;
  code: string;
  name: string;
  approved: boolean;
  _count?: { parts: number };
};
export type Category = { id: string; code: string; name: string };
export type Revision = {
  id: string;
  revisionNum: number;
  changeNote: string;
  loggedBy: string;
  voided: boolean;
  voidReason: string | null;
  createdAt: string;
  effectiveOn: string | null;
  updatedAt: string;
};
export type Change = {
  id: string;
  before: {
    partName: string;
    vendorId: string;
    categoryId: string;
    vendorName?: string;
    categoryName?: string;
  };
  after: { partName: string; vendorId: string; categoryId: string };
  loggedBy: string;
  action: string;
  createdAt: string;
};
export type SampleEvent = {
  id: string;
  status: "IN_HOUSE" | "SENT_OUT" | "PASSED" | "FAILED" | "SENT_BACK";
  note: string | null;
  revisionNum: number | null;
  loggedBy: string;
  createdAt: string;
  details?: { action?: string; before?: unknown; after?: unknown } | null;
};
export type Sample = {
  id: string;
  sampleNumber: number;
  revisionNum: number | null;
  receivedOn: string | null;
  labelPrinted: boolean;
  createdAt: string;
  status: SampleEvent["status"];
  note: string | null;
  updatedAt: string;
  events: SampleEvent[];
};
export type Part = {
  scannedSampleId?: string | null;
  scannedRevisionNum?: number | null;
  archivedAt: string | null;
  changes: Change[];
  samples: Sample[];
  id: string;
  partNumber: string;
  partName: string;
  vendorId: string;
  categoryId: string;
  vendor: Vendor;
  category: Category;
  sequence: number;
  labelPrinted: boolean;
  createdAt: string;
  updatedAt: string;
  revisions: Revision[];
  current: Revision | null;
  displayId: string;
  nextRevision: number;
};
export type Session = {
  user: {
    id: string;
    name: string;
    email: string | null;
    hasPush: boolean;
  } | null;
  vapidPublicKey: string | null;
  emailConfigured: boolean;
};
export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.message || "Please try again."), {
      status: res.status,
    });
  return data;
}
export const post = <T = unknown>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function dateOnly(value: string) {
  return new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
// iOS Safari doesn't save `<a download>` blob links to disk — it opens a
// preview instead. The share sheet's "Save Image"/"Save to Files" does, so
// prefer it when available. Returns false only if the user cancelled it.
export async function saveFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
