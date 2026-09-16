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
export type Part = {
  archivedAt: string | null;
  changes: Change[];
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
  if (!res.ok) throw new Error(data.message || "Please try again.");
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
