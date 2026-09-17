"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  FileSpreadsheet,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { api, post, Part, Vendor, Category, date } from "@/lib/types";
import { Combo, Modal, Notice, Spinner } from "./ui";
export type Shared = {
  vendors: Vendor[];
  categories: Category[];
  reload: () => void;
};
function useParts(
  q: string,
  vendor: string,
  category: string,
  unprinted: boolean,
  archived: boolean,
  refresh: number,
  page: number,
) {
  const [data, setData] = useState<{
      parts: Part[];
      total: number;
      pages: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api<{ parts: Part[]; total: number; pages: number }>(
        `parts?${new URLSearchParams({ q, vendor, category, unprinted: String(unprinted), archived: String(archived), page: String(page) })}`,
        { signal: abort.signal },
      )
        .then((d) => {
          if (active) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, vendor, category, unprinted, archived, refresh, page]);
  return { data, error, loading };
}
export function Inventory(props: Shared & { refresh: number }) {
  return <PartsTable {...props} labels={false} />;
}
export function Labels(props: Shared & { refresh: number }) {
  return <PartsTable {...props} labels />;
}
function PartsTable({
  vendors,
  categories,
  reload,
  refresh,
  labels,
}: Shared & { refresh: number; labels: boolean }) {
  const [q, setQ] = useState(""),
    [vendor, setVendor] = useState(""),
    [category, setCategory] = useState(""),
    [unprinted, setUnprinted] = useState(labels),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1);
  const { data, error, loading } = useParts(
    q,
    vendor,
    category,
    unprinted,
    archived,
    refresh,
    page,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [editing, setEditing] = useState<Part | null>(null),
    [deleting, setDeleting] = useState<Part | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [toast, setToast] = useState("");
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [q, vendor, category, unprinted, archived]);
  useEffect(() => {
    setSelected(new Set());
  }, [page]);
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function exportFile(type: "csv" | "qr") {
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/export/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      const blob = await res.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        type === "csv" ? "partbook-labels.csv" : "partbook-qr-labels.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setToast(
        `Exported ${selected.size} ${selected.size === 1 ? "part" : "parts"}. ${type === "csv" ? "Your CSV is ready for Print Master." : "Your QR images are ready."}`,
      );
      setSelected(new Set());
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(p: Part, restore = false) {
    setBusy(true);
    setActionError("");
    try {
      await post(`parts/${p.id}/${restore ? "restore" : "archive"}`, {
        updatedAt: p.updatedAt,
      });
      setToast(
        restore
          ? `${p.partName} is back in your inventory.`
          : `${p.partName} moved to Trash. Restore it there at any time.`,
      );
      setDeleting(null);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {labels ? "READY FOR THE REAL WORLD" : "YOUR WORKSHOP, AT A GLANCE"}
          </span>
          <h1>{labels ? "One part. One lasting label." : "Your inventory."}</h1>
          <p>
            {labels
              ? "Print once. Your labels stay correct through every revision."
              : "A shared sheet for your parts. Easy to find, easy to keep up to date."}
          </p>
        </div>
        {!labels && (
          <Link href="/new" className="button primary">
            <Plus size={18} />
            New part
          </Link>
        )}
      </div>
      {toast && (
        <div className="success-toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {actionError && <Notice>{actionError}</Notice>}
      <section className="panel inventory-panel">
        <div className="inventory-tabs">
          {labels ? (
            <>
              <button
                className={unprinted ? "selected" : ""}
                onClick={() => setUnprinted(true)}
              >
                Labels waiting
              </button>
              <button
                className={!unprinted ? "selected" : ""}
                onClick={() => setUnprinted(false)}
              >
                All parts
              </button>
            </>
          ) : (
            <>
              <button
                className={!archived ? "selected" : ""}
                onClick={() => setArchived(false)}
              >
                <Box size={16} />
                All parts
              </button>
              <button
                className={archived ? "selected" : ""}
                onClick={() => setArchived(true)}
              >
                <Trash2 size={16} />
                Trash
              </button>
            </>
          )}
          <span className="table-count">{data?.total ?? "—"} parts</span>
        </div>
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search parts"
              list="part-search-suggestions"
              placeholder="Search part names or numbers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <datalist id="part-search-suggestions">
              {(data?.parts ?? []).slice(0, 10).map((part) => (
                <option key={part.id} value={part.partName}>
                  {part.partNumber}
                </option>
              ))}
            </datalist>
            {q && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setQ("")}
              >
                <X size={15} />
              </button>
            )}
          </label>
          <select
            aria-label="Filter by vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <Notice>{error}</Notice>
        ) : loading ? (
          <Spinner />
        ) : data?.parts.length ? (
          <div className="table-scroll">
            <table className="parts-table">
              <thead>
                <tr>
                  {labels && (
                    <th className="checkbox-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all parts on this page"
                        checked={data.parts.every((p) => selected.has(p.id))}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(data.parts.map((p) => p.id))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                  )}
                  <th>Part / permanent ID</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Revision</th>
                  <th>{labels ? "Label" : "Updated"}</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.parts.map((p) => (
                  <tr
                    key={p.id}
                    className={selected.has(p.id) ? "row-selected" : ""}
                  >
                    {labels && (
                      <td className="checkbox-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.partName}`}
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                      </td>
                    )}
                    <td className="part-name-cell">
                      <Link href={`/parts/${p.partNumber}`}>
                        <span className="part-icon">
                          <Box size={19} />
                        </span>
                        <span>
                          <strong>{p.partName}</strong>
                          <small className="mono">{p.partNumber}</small>
                        </span>
                      </Link>
                    </td>
                    <td data-label="Vendor">
                      <span className="vendor-code">{p.vendor.code}</span>
                      <span className="vendor-name">{p.vendor.name}</span>
                    </td>
                    <td data-label="Category">
                      <span className="category-badge">{p.category.name}</span>
                    </td>
                    <td data-label="Revision">
                      <span className="version-badge">
                        {p.current
                          ? `V${p.current.revisionNum}`
                          : "No active revision"}
                      </span>
                    </td>
                    <td
                      data-label={labels ? "Label" : "Updated"}
                      className="table-date"
                    >
                      {labels ? (
                        <span
                          className={`label-state ${p.labelPrinted ? "exported" : ""}`}
                        >
                          {p.labelPrinted ? <Check size={13} /> : <span />}
                          {p.labelPrinted ? "Exported" : "Needs label"}
                        </span>
                      ) : (
                        date(p.updatedAt)
                      )}
                    </td>
                    <td className="row-actions">
                      {archived ? (
                        <button
                          className="button small"
                          disabled={busy}
                          onClick={() => archive(p, true)}
                        >
                          <RotateCcw size={15} />
                          Restore
                        </button>
                      ) : labels ? (
                        <Link
                          className="icon-button"
                          href={`/parts/${p.partNumber}/print`}
                          aria-label={`Print ${p.partName}`}
                        >
                          <ArrowDownToLine size={17} />
                        </Link>
                      ) : (
                        <>
                          <button
                            className="icon-button"
                            title="Edit part"
                            aria-label={`Edit ${p.partName}`}
                            onClick={() => setEditing(p)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button danger-icon"
                            title="Move to Trash"
                            aria-label={`Delete ${p.partName}`}
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 size={16} />
                          </button>
                          <Link
                            className="icon-button"
                            href={`/parts/${p.partNumber}`}
                            aria-label={`Open ${p.partName}`}
                          >
                            <ChevronRight size={17} />
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              {labels ? (
                <Tag size={28} />
              ) : archived ? (
                <Trash2 size={28} />
              ) : (
                <Box size={28} />
              )}
            </span>
            <h2>
              {q || vendor || category
                ? "No matching parts."
                : archived
                  ? "Trash is empty."
                  : labels && unprinted
                    ? "No labels waiting."
                    : "No parts yet."}
            </h2>
            <p>
              {q || vendor || category
                ? "Try another name, part number, or filter."
                : archived
                  ? "Deleted parts appear here, ready to restore."
                  : labels && unprinted
                    ? "Every part has been exported at least once."
                    : "Create your first part to get started."}
            </p>
            {!labels && !archived && !q && !vendor && !category && (
              <Link href="/new" className="button primary">
                <Plus size={16} />
                Create your first part
              </Link>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {labels
              ? "QR codes contain only the permanent part number."
              : archived
                ? "Restoring a part keeps its original number and full history."
                : "Names, vendors, and categories are editable. Part numbers stay permanent."}
          </span>
          {!!data && data.pages > 1 && (
            <div className="pagination">
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ArrowLeft size={16} />
              </button>
              <span>
                {page} / {data.pages}
              </span>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>
      {labels && (
        <div className="export-bar">
          <span>
            <strong>{selected.size}</strong> parts selected{" "}
            <small>on this page</small>
          </span>
          <div>
            <button
              className="button"
              disabled={!selected.size || busy}
              onClick={() => exportFile("csv")}
            >
              <FileSpreadsheet size={17} />
              Download CSV for Print Master
            </button>
            <button
              className="button primary"
              disabled={!selected.size || busy}
              onClick={() => exportFile("qr")}
            >
              <ArrowDownToLine size={17} />
              {busy ? "Preparing…" : "Download QR images as ZIP"}
            </button>
          </div>
        </div>
      )}
      {editing && (
        <EditPart
          part={editing}
          vendors={vendors}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            setToast(
              "Changes saved. You can restore earlier details from the part’s edit history.",
            );
            reload();
          }}
        />
      )}
      {deleting && (
        <Modal
          title={`Move ${deleting.partName} to Trash?`}
          onClose={() => setDeleting(null)}
        >
          <p className="modal-copy">
            This part will leave the active inventory. Its number and revision
            history are preserved, and you can restore it from Trash at any
            time.
          </p>
          {actionError && <Notice>{actionError}</Notice>}
          <div className="form-actions">
            <button className="button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => archive(deleting)}
            >
              <Trash2 size={16} />
              {busy ? "Moving…" : "Move to Trash"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function EditPart({
  part,
  vendors,
  categories,
  onClose,
  onSave,
}: {
  part: Part;
  vendors: Vendor[];
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(part.partName),
    [vendor, setVendor] = useState(part.vendorId),
    [category, setCategory] = useState(part.categoryId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Edit part details" onClose={onClose}>
      <p className="modal-copy">
        The permanent ID <strong className="mono">{part.partNumber}</strong>{" "}
        stays the same. Your changes are saved in the edit history.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`parts/${part.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                partName: name,
                vendorId: vendor,
                categoryId: category,
                updatedAt: part.updatedAt,
              }),
            });
            onSave();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Notice>{error}</Notice>}
        <label className="field">
          Part name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Combo
          label="Vendor"
          value={vendor}
          options={vendors}
          onChange={setVendor}
          required
        />
        <Combo
          label="Category"
          value={category}
          options={categories}
          onChange={setCategory}
          required
        />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !vendor || !category}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
