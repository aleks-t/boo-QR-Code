"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  Layers3,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import { api, post, Part, Revision, Vendor, Category, date } from "@/lib/types";
import { similarCode } from "@/lib/domain";
import { Combo, Modal, Notice, Spinner } from "./ui";
import { EditPart, Shared } from "./tables";
function Back({
  href = "/inventory",
  children = "Back to inventory",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link className="back-link" href={href}>
      <ArrowLeft size={16} />
      {children}
    </Link>
  );
}
function usePart(number: string, refresh = 0) {
  const [part, setPart] = useState<Part | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    setPart(null);
    api<Part>(`parts/${encodeURIComponent(number)}`)
      .then((p) => {
        if (alive) setPart(p);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [number, refresh]);
  return { part, error, setPart };
}
function Missing({ number, error }: { number: string; error: string }) {
  return (
    <section className="panel empty">
      <Box size={35} />
      <h1>
        {error.startsWith("No part") ? (
          <>
            No part matches <span className="mono">{number}</span>.
          </>
        ) : (
          error
        )}
      </h1>
      <p>
        {error.startsWith("No part")
          ? "This code is not in the system yet. If you are labeling something new, create the part now. If you expected to find something, the code may have been mis-scanned."
          : "Try opening the part again in a moment."}
      </p>
      <div className="form-actions">
        <Link className="button primary" href="/new">
          Create a new part
        </Link>
        <Link className="button" href="/">
          Scan again
        </Link>
      </div>
    </section>
  );
}
export function NewPart({ vendors, categories, reload }: Shared) {
  const router = useRouter();
  const [vendor, setVendor] = useState(""),
    [category, setCategory] = useState(""),
    [name, setName] = useState(""),
    [note, setNote] = useState(""),
    [adding, setAdding] = useState<"vendor" | "category" | null>(null),
    [localV, setLocalV] = useState<Vendor[]>([]),
    [localC, setLocalC] = useState<Category[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const allV = [
      ...vendors,
      ...localV.filter((v) => !vendors.some((x) => x.id === v.id)),
    ],
    allC = [
      ...categories,
      ...localC.filter((c) => !categories.some((x) => x.id === c.id)),
    ];
  return (
    <div className="narrow-page">
      <Back />
      <div className="page-heading">
        <div>
          <span className="eyebrow">A NEW PAGE IN THE BOOK</span>
          <h1>Add a new part.</h1>
          <p>Three details from you. We’ll handle the numbers.</p>
        </div>
      </div>
      <form
        className="panel form-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const part = await post<Part>("parts", {
              vendorId: vendor,
              partName: name,
              categoryId: category,
              ...(note.trim() ? { changeNote: note } : {}),
            });
            sessionStorage.setItem(`created:${part.partNumber}`, "true");
            reload();
            router.push(`/parts/${part.partNumber}/print`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Notice>{error}</Notice>}
        <Combo
          label="Vendor"
          value={vendor}
          options={allV}
          onChange={setVendor}
          onAdd={() => setAdding("vendor")}
          required
        />
        <label className="field">
          Part name <span className="required">*</span>
          <input
            placeholder="e.g. Mounting bracket"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
          />
        </label>
        <Combo
          label="Category"
          value={category}
          options={allC}
          onChange={setCategory}
          onAdd={() => setAdding("category")}
          required
        />
        <details className="optional-note">
          <summary>
            Add an initial change note <span>optional</span>
          </summary>
          <label className="field">
            <span className="sr-only">Initial change note</span>
            <textarea
              placeholder="Initial release."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
            />
          </label>
        </details>
        <div className="info-strip">
          <Tag size={20} />
          <div>
            <strong>A permanent number. An initial revision.</strong>
            <p>
              Your part number is assigned automatically. Your first revision is
              V1.
            </p>
          </div>
        </div>
        <div className="form-actions">
          <Link className="button" href="/inventory">
            Cancel
          </Link>
          <button
            className="button primary"
            disabled={busy || !vendor || !category || !name.trim()}
          >
            {busy ? "Creating your part…" : "Create part"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
      {adding && (
        <AddReference
          kind={adding}
          vendors={allV}
          onClose={() => setAdding(null)}
          onSelect={(id) => {
            setVendor(id);
            setAdding(null);
          }}
          onCreated={(item) => {
            if (adding === "vendor") {
              setLocalV((v) => [...v, item as Vendor]);
              setVendor(item.id);
            } else {
              setLocalC((c) => [...c, item as Category]);
              setCategory(item.id);
            }
            setAdding(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
export function AddReference({
  kind,
  vendors,
  onClose,
  onCreated,
  onSelect,
}: {
  kind: "vendor" | "category";
  vendors: Vendor[];
  onClose: () => void;
  onCreated: (item: Vendor | Category) => void;
  onSelect: (id: string) => void;
}) {
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false);
  const similar = vendors.find((v) => similarCode(code, v.code));
  return (
    <Modal title={`Add new ${kind}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (kind === "vendor" && similar && !ack) return;
          setBusy(true);
          setError("");
          try {
            onCreated(
              await post<Vendor | Category>(
                kind === "vendor" ? "vendors" : "categories",
                kind === "vendor" ? { code, name } : { name },
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "vendor" && (
          <p className="modal-copy">
            You can use this vendor immediately. It will also go to the approval
            queue for review.
          </p>
        )}
        {error && <Notice>{error}</Notice>}
        {kind === "vendor" && (
          <label className="field">
            Vendor code
            <input
              required
              pattern="[A-Z]{3,4}"
              title="3–4 uppercase letters"
              minLength={3}
              maxLength={4}
              placeholder="e.g. ACM"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""));
                setAck(false);
              }}
            />
          </label>
        )}
        <label className="field">
          {kind === "vendor" ? "Vendor" : "Category"} name
          <input
            autoFocus={kind === "category"}
            required
            maxLength={200}
            placeholder={
              kind === "vendor" ? "e.g. Acme Manufacturing" : "e.g. Brackets"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {kind === "vendor" && code.length >= 3 && similar && !ack && (
          <div className="duplicate-warning">
            <strong>
              {code} is new. Did you mean {similar.code} ({similar.name})?
            </strong>
            <div>
              <button
                type="button"
                className="button small"
                onClick={() => onSelect(similar.id)}
              >
                Use {similar.code}
              </button>
              {similar.code !== code && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setAck(true)}
                >
                  Create {code} as a new vendor
                </button>
              )}
            </div>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || (kind === "vendor" && !!similar && !ack)}
          >
            {busy ? "Saving…" : `Add ${kind}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PartDetail({
  number,
  vendors,
  categories,
  reload,
  refresh,
}: Shared & { number: string; refresh: number }) {
  const { part, error, setPart } = usePart(number, refresh);
  const [editing, setEditing] = useState(false),
    [voiding, setVoiding] = useState<Revision | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [toast, setToast] = useState(""),
    [restoreId, setRestoreId] = useState("");
  if (error) return <Missing number={number} error={error} />;
  if (!part) return <Spinner />;
  const current = part.current,
    prior = part.revisions.filter(
      (r) => !r.voided && r.id !== current?.id,
    ).length;
  const nextAfterVoid = voiding
    ? part.revisions.find((r) => !r.voided && r.id !== voiding.id)
    : null;
  async function restore() {
    if (!part) return;
    setBusy(true);
    try {
      const restored = await post<Part>(`parts/${part.id}/restore`, {
        updatedAt: part.updatedAt,
      });
      setPart(restored);
      setToast("This part is back in your inventory.");
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="detail-page">
      <Back />
      <div className="part-recognition">
        <span className="pill">
          <CheckCircle2 size={14} /> PART FOUND
        </span>
        <span className="mono">{part.partNumber}</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>{part.partName}</h1>
          <p>
            {current ? (
              <>
                Currently on <strong>version {current.revisionNum}</strong>.{" "}
                {prior
                  ? `${prior === 1 ? "One" : prior === 2 ? "Two" : prior} earlier ${prior === 1 ? "version" : "versions"} on record.`
                  : current.revisionNum === 1
                    ? "No changes logged yet."
                    : ""}
              </>
            ) : (
              <>
                No active revision. Log a new version to make this part current.
              </>
            )}
          </p>
        </div>
        {!part.archivedAt && (
          <button className="button" onClick={() => setEditing(true)}>
            <Pencil size={16} />
            Edit details
          </button>
        )}
      </div>
      {part.archivedAt && (
        <div className="archive-banner">
          <Trash2 size={22} />
          <div>
            <strong>This part is in Trash.</strong>
            <p>
              Its QR code and history are preserved. Restore it to use it again.
            </p>
          </div>
          <button className="button" disabled={busy} onClick={restore}>
            <RotateCcw size={16} />
            Restore part
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className="success-toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      {actionError && <Notice>{actionError}</Notice>}
      <div className="detail-grid">
        <section className="panel current-card">
          <div className="section-heading">
            <span className="eyebrow">CURRENT REVISION</span>
            <span className="pill green">
              <span className="online-dot" />
              {current ? "Active" : "No active revision"}
            </span>
          </div>
          <div className="current-version">
            {current ? `V${current.revisionNum}` : "—"}
            <Layers3 size={48} strokeWidth={1} />
          </div>
          {current && (
            <>
              <p className="revision-byline">
                V{current.revisionNum} logged {date(current.createdAt)} by{" "}
                <strong>{current.loggedBy}</strong>
              </p>
              <blockquote>{current.changeNote}</blockquote>
            </>
          )}
          <div className="permanent-note">
            <Tag size={16} />
            The existing label is still correct.
          </div>
        </section>
        <section className="panel details-card">
          <h2>Part details</h2>
          <dl>
            <div>
              <dt>Permanent ID</dt>
              <dd className="mono">{part.partNumber}</dd>
            </div>
            <div>
              <dt>Current display ID</dt>
              <dd className="mono">{part.displayId}</dd>
            </div>
            <div>
              <dt>Vendor</dt>
              <dd>
                {part.vendor.name}
                <small>{part.vendor.code}</small>
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{part.category.name}</dd>
            </div>
            <div>
              <dt>Added to the book</dt>
              <dd>{date(part.createdAt)}</dd>
            </div>
          </dl>
        </section>
      </div>
      <details className="panel history-panel">
        <summary>
          <span>
            <History size={19} />
            Revision history <small>{part.revisions.length} entries</small>
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className="history-list">
          {part.revisions.map((r) => (
            <div
              className={`history-entry ${r.voided ? "voided" : ""}`}
              key={r.id}
            >
              <span className="history-dot" />
              <div>
                <strong className="history-title">
                  V{r.revisionNum}{" "}
                  <span>
                    —{" "}
                    {r.voided
                      ? "Voided"
                      : r.id === current?.id
                        ? "Current"
                        : "Superseded"}
                  </span>
                </strong>
                <p className="history-meta">
                  {date(r.createdAt)} · {r.loggedBy}
                </p>
                <p>{r.voided ? `Voided: ${r.voidReason}` : r.changeNote}</p>
                {r.voided && (
                  <p className="original-note">Original note: {r.changeNote}</p>
                )}
              </div>
              {!r.voided && !part.archivedAt && (
                <button
                  className="text-button danger-text"
                  onClick={() => {
                    setReason("");
                    setActionError("");
                    setVoiding(r);
                  }}
                >
                  Void
                </button>
              )}
            </div>
          ))}
        </div>
      </details>
      <details className="panel history-panel">
        <summary>
          <span>
            <Pencil size={18} />
            Edit history <small>{part.changes.length} entries</small>
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className="history-list">
          {!part.changes.length && (
            <p className="muted">No details have been changed yet.</p>
          )}
          {part.changes.map((change) => (
            <div className="history-entry" key={change.id}>
              <span className="history-dot" />
              <div>
                <strong>{change.action}</strong>
                <p className="history-meta">
                  {date(change.createdAt)} · {change.loggedBy}
                </p>
                {["Edited", "Restored edit"].includes(change.action) && (
                  <p>
                    Previously: {change.before.partName} ·{" "}
                    {change.before.vendorName || "Previous vendor"} ·{" "}
                    {change.before.categoryName || "Previous category"}
                  </p>
                )}
              </div>
              {["Edited", "Restored edit"].includes(change.action) &&
                !part.archivedAt && (
                  <button
                    className="text-button"
                    onClick={() => setRestoreId(change.id)}
                  >
                    Restore previous details
                  </button>
                )}
            </div>
          ))}
        </div>
      </details>
      {!part.archivedAt && (
        <div className="detail-actions">
          <Link className="button" href={`/parts/${part.partNumber}/print`}>
            <Printer size={18} />
            Reprint label
          </Link>
          <Link
            className="button primary"
            href={`/parts/${part.partNumber}/revision`}
          >
            <Plus size={18} />
            Log new revision
          </Link>
        </div>
      )}
      {editing && (
        <EditPart
          part={part}
          vendors={vendors}
          categories={categories}
          onClose={() => setEditing(false)}
          onSave={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
      {voiding && (
        <Modal
          title={`Void version ${voiding.revisionNum} of ${part.partName}?`}
          onClose={() => setVoiding(null)}
        >
          <p className="modal-copy">
            This entry stays in the history for the record, but stops counting
            as current.{" "}
            {nextAfterVoid
              ? `Version ${nextAfterVoid.revisionNum} ${current?.id === voiding.id ? "becomes current again" : "remains current"}.`
              : "There will be no current version until a new revision is logged."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setActionError("");
              try {
                const result = await post<Part>(
                  `revisions/${voiding.id}/void`,
                  { reason },
                );
                setPart(result);
                setVoiding(null);
                setToast(
                  result.current
                    ? `Version ${result.current.revisionNum} is now current.`
                    : "This part now has no active revision.",
                );
                reload();
              } catch (e) {
                setActionError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {actionError && <Notice>{actionError}</Notice>}
            <label className="field">
              Reason <span className="required">required</span>
              <textarea
                autoFocus
                required
                maxLength={4000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this entry being voided?"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setVoiding(null)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={busy || !reason.trim()}
              >
                {busy ? "Voiding…" : `Void version ${voiding.revisionNum}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {restoreId && (
        <Modal
          title="Restore these previous details?"
          onClose={() => setRestoreId("")}
        >
          <p className="modal-copy">
            The name, vendor, and category will return to the values shown in
            this history entry. This restoration is also recorded, so it can be
            reversed.
          </p>
          {actionError && <Notice>{actionError}</Notice>}
          <div className="form-actions">
            <button className="button" onClick={() => setRestoreId("")}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setActionError("");
                try {
                  await post(`parts/${part.id}/restore-edit`, {
                    updatedAt: part.updatedAt,
                    changeId: restoreId,
                  });
                  setRestoreId("");
                  setToast("Previous details restored.");
                  reload();
                } catch (e) {
                  setActionError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Restoring…" : "Restore previous details"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function RevisionForm({
  number,
  reload,
}: {
  number: string;
  reload: () => void;
}) {
  const router = useRouter();
  const { part, error } = usePart(number);
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  if (error) return <Missing number={number} error={error} />;
  if (!part) return <Spinner />;
  return (
    <div className="narrow-page">
      <Back href={`/parts/${part.partNumber}`}>Back to part</Back>
      <form
        className="panel revision-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setFailure("");
          try {
            const result = await post<{
              revision: Revision;
              previous: Revision | null;
            }>(`parts/${part.id}/revisions`, { changeNote: note });
            sessionStorage.setItem(
              `revision:${part.partNumber}`,
              JSON.stringify(result),
            );
            reload();
            router.push(`/parts/${part.partNumber}/success`);
          } catch (e) {
            setFailure((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="large-icon">
          <Layers3 size={30} />
        </span>
        <span className="eyebrow">A NEW CHAPTER</span>
        <h1>
          Log version {part.nextRevision} of {part.partName}?
        </h1>
        <p className="confirm-copy">
          {part.current
            ? `Version ${part.current.revisionNum} has been current since ${date(part.current.createdAt)}. Logging a new version will supersede it.`
            : "There is no active version. Logging a new version will make it current."}
        </p>
        <div className="version-transition">
          <span>
            {part.current ? `V${part.current.revisionNum}` : "—"}
            <small>Current</small>
          </span>
          <ArrowRight size={24} />
          <span className="next-version">
            V{part.nextRevision}
            <small>New version</small>
          </span>
        </div>
        {failure && <Notice>{failure}</Notice>}
        <label className="field">
          What changed? <span className="required">required</span>
          <textarea
            required
            autoFocus
            maxLength={4000}
            placeholder="e.g. Reinforced wall thickness to 3mm after field failure"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <Link className="button" href={`/parts/${part.partNumber}`}>
            Cancel
          </Link>
          <button
            className="button primary"
            disabled={busy || !note.trim() || !!part.archivedAt}
          >
            {busy ? "Logging revision…" : `Log version ${part.nextRevision}`}
          </button>
        </div>
      </form>
    </div>
  );
}
export function RevisionSuccess({
  number,
  reload,
}: {
  number: string;
  reload: () => void;
}) {
  const { part, error, setPart } = usePart(number);
  const [logged, setLogged] = useState<{
      revision: Revision;
      previous: Revision | null;
    } | null>(null),
    [seconds, setSeconds] = useState(0),
    [busy, setBusy] = useState(false),
    [undone, setUndone] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`revision:${number}`);
      if (raw) setLogged(JSON.parse(raw));
    } catch {}
  }, [number]);
  useEffect(() => {
    if (!logged) return;
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (new Date(logged.revision.createdAt).getTime() +
              60000 -
              Date.now()) /
              1000,
          ),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [logged]);
  if (error) return <Missing number={number} error={error} />;
  if (!part) return <Spinner />;
  const isVoided =
    undone ||
    part.revisions.some((r) => r.id === logged?.revision.id && r.voided);
  return (
    <div className="narrow-page">
      <section className="panel success-panel">
        <span className="success-icon">
          <Check size={34} />
        </span>
        <span className="eyebrow">
          {isVoided ? "REVISION UNDONE" : "SAVED TO THE BOOK"}
        </span>
        <h1>
          {isVoided
            ? `${part.partName} ${part.current ? `is back on version ${part.current.revisionNum}` : "has no active version"}.`
            : logged
              ? `${part.partName} is now on version ${logged.revision.revisionNum}.`
              : `${part.partName} is ${part.current ? `on version ${part.current.revisionNum}` : "without an active version"}.`}
        </h1>
        {!isVoided && logged?.previous && (
          <p>Version {logged.previous.revisionNum} is marked superseded.</p>
        )}
        <div className="info-strip">
          <Tag size={22} />
          <p>The existing label is still correct. No reprint needed.</p>
        </div>
        {failure && <Notice>{failure}</Notice>}
        {!!logged && seconds > 0 && !isVoided && (
          <div className="undo-banner" role="status">
            <span>Logged version {logged.revision.revisionNum} just now.</span>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const p = await post<Part>(
                    `revisions/${logged.revision.id}/void`,
                    {
                      reason:
                        "Undone immediately after logging (wrong scan or accidental entry).",
                      undo: true,
                    },
                  );
                  setPart(p);
                  setUndone(true);
                  reload();
                } catch (e) {
                  setFailure((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RotateCcw size={16} />
              Undo
            </button>
          </div>
        )}
        <div className="form-actions">
          <Link className="button" href={`/parts/${number}`}>
            View part
          </Link>
          <Link className="button primary" href="/">
            Scan another part
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
export function PrintLabel({
  number,
  reload,
}: {
  number: string;
  reload: () => void;
}) {
  const { part, error } = usePart(number);
  const [created, setCreated] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [marked, setMarked] = useState(false);
  useEffect(() => {
    setCreated(sessionStorage.getItem(`created:${number}`) === "true");
  }, [number]);
  if (error) return <Missing number={number} error={error} />;
  if (!part) return <Spinner />;
  async function download() {
    if (!part) return;
    setBusy(true);
    try {
      const res = await fetch("/api/export/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [part.id] }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      const url = URL.createObjectURL(await res.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `${number}-label.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMarked(true);
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page print-page">
      <div className="no-print">
        <Back href={`/parts/${number}`}>Back to part</Back>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {created
                ? "YOUR PART IS IN THE BOOK"
                : "A FRESH LABEL, THE SAME PART"}
            </span>
            <h1>
              {created ? (
                <>
                  Created: <span className="mono">{part.partNumber}</span>
                </>
              ) : (
                "Print a label."
              )}
            </h1>
            <p>{created ? `${part.partName}, revision 1` : part.partName}</p>
            {created && <p>This part needs a physical label.</p>}
          </div>
        </div>
      </div>
      <section className="panel print-panel">
        <div className="physical-label">
          <img
            src={`/api/parts/${part.partNumber}/qr`}
            width={230}
            height={230}
            alt={`QR label encoding ${part.partNumber}`}
          />
          <strong className="mono">{part.partNumber}</strong>
          <span>{part.partName}</span>
        </div>
        <p className="no-print muted">
          The QR contains <strong className="mono">{part.partNumber}</strong>{" "}
          only.
          <br />
          It stays correct through every revision.
        </p>
      </section>
      <div className="no-print">
        {failure && <Notice>{failure}</Notice>}
        {marked && (
          <div className="success-toast">
            <Check size={18} />
            Label recorded as exported.
          </div>
        )}
        <div className="form-actions">
          <button
            className="button"
            onClick={download}
            disabled={busy || !!part.archivedAt}
          >
            <ArrowDownToLine size={17} />
            {busy ? "Preparing…" : "Download QR"}
          </button>
          <button
            className="button primary"
            disabled={!!part.archivedAt}
            onClick={() => window.print()}
          >
            <Printer size={17} />
            Print label
          </button>
        </div>
        <div className="print-done">
          <button
            className="text-button"
            disabled={marked || busy || !!part.archivedAt}
            onClick={async () => {
              setBusy(true);
              try {
                await post("export/printed", { ids: [part.id] });
                setMarked(true);
                reload();
              } catch (e) {
                setFailure((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            I printed this label
          </button>
          <Link
            className="button"
            href={`/parts/${number}`}
            onClick={() => sessionStorage.removeItem(`created:${number}`)}
          >
            Done
            <Check size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
