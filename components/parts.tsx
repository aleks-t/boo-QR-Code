"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
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
import {
  api,
  post,
  Part,
  Revision,
  Vendor,
  Category,
  date,
  dateOnly,
  today,
} from "@/lib/types";
import { similarCode } from "@/lib/domain";
import { Combo, Modal, Notice, Spinner } from "./ui";
import { LabelEditor } from "./label-editor";
import { SamplesPanel } from "./samples";
import { RevisionDateEditor } from "./revision-date";
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
    [sampleCount, setSampleCount] = useState("1"),
    [receivedOn, setReceivedOn] = useState(today),
    [note, setNote] = useState(""),
    [adding, setAdding] = useState<"vendor" | "category" | null>(null),
    [localV, setLocalV] = useState<Vendor[]>([]),
    [localC, setLocalC] = useState<Category[]>([]),
    [matches, setMatches] = useState<Part[]>([]),
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
  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api<{ parts: Part[] }>(`parts?q=${encodeURIComponent(query)}`)
        .then((result) => setMatches(result.parts.slice(0, 5)))
        .catch(() => setMatches([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [name]);
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
              sampleCount: Number(sampleCount),
              receivedOn,
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
        <label className="field name-autocomplete">
          Part name <span className="required">*</span>
          <input
            placeholder="e.g. Mounting bracket"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
          />
          {matches.length > 0 && (
            <div className="duplicate-warning duplicate-part-warning">
              <strong>That part may already be in your inventory.</strong>
              <p>
                Choose the existing part to log a new revision, or continue
                creating another part.
              </p>
              <div className="part-suggestions">
                {matches.map((match) => (
                  <button
                    type="button"
                    className="part-suggestion"
                    key={match.id}
                    onClick={() => router.push(`/parts/${match.partNumber}`)}
                  >
                    <span>
                      <strong>{match.partName}</strong>
                      <small className="mono">{match.partNumber}</small>
                    </span>
                    <span className="version-badge">
                      {match.current ? `V${match.current.revisionNum}` : "—"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </label>
        <Combo
          label="Category"
          value={category}
          options={allC}
          onChange={setCategory}
          onAdd={() => setAdding("category")}
          required
        />
        <label className="field">
          How many samples? <span className="optional">optional</span>
          <input
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            value={sampleCount}
            onChange={(e) => setSampleCount(e.target.value)}
          />
          <small className="field-help">
            Track each physical sample separately when you have more than one.
          </small>
        </label>
        <label className="field">
          Received on
          <input
            type="date"
            required
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
          />
          <small className="field-help">
            When these samples actually arrived. You can enter an earlier date.
          </small>
        </label>
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
    [restoreId, setRestoreId] = useState(""),
    [revisionSearch, setRevisionSearch] = useState(""),
    [dating, setDating] = useState<Revision | null>(null);
  useEffect(() => {
    setRevisionSearch("");
  }, [number]);
  useEffect(() => {
    const hash = window.location.hash;
    if (!part || !/^#(?:revision-history|samples|sample-\d+)$/.test(hash))
      return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(hash.slice(1))?.scrollIntoView(),
    );
    return () => cancelAnimationFrame(frame);
  }, [part?.id]);
  if (error) return <Missing number={number} error={error} />;
  if (!part) return <Spinner />;
  const current = part.current,
    prior = part.revisions.filter(
      (r) => !r.voided && r.id !== current?.id,
    ).length;
  const nextAfterVoid = voiding
    ? part.revisions.find((r) => !r.voided && r.id !== voiding.id)
    : null;
  const query = revisionSearch.trim().toLowerCase();
  const visibleRevisions = part.revisions.filter((r) => {
    if (/^v?\d+$/.test(query))
      return r.revisionNum === Number(query.replace(/^v/, ""));
    return [
      `V${r.revisionNum}`,
      r.changeNote,
      r.loggedBy,
      r.voidReason || "",
      date(r.createdAt),
      r.effectiveOn ? dateOnly(r.effectiveOn) : "",
      r.effectiveOn?.slice(0, 10) || "",
      r.voided ? "Voided" : r.id === current?.id ? "Current" : "Superseded",
    ].some((value) => value.toLowerCase().includes(query));
  });
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
      {part.scannedSampleId &&
        (() => {
          const sample = part.samples.find(
            (s) => s.id === part.scannedSampleId,
          )!;
          return (
            <div className="scan-context" role="status">
              <strong>
                Scanned Sample {sample.sampleNumber} ·{" "}
                {sample.revisionNum
                  ? `V${sample.revisionNum}`
                  : "Version not assigned"}
              </strong>
              <p>
                This QR identifies this physical piece. The latest part version
                is {current ? `V${current.revisionNum}` : "not set"}.
              </p>
              <a className="button" href={`#sample-${sample.sampleNumber}`}>
                Go to this sample
              </a>
            </div>
          );
        })()}
      {part.scannedRevisionNum && (
        <div className="scan-context">
          <strong>Scanned V{part.scannedRevisionNum} label</strong>
          <p>
            {part.revisions.some(
              (r) => r.revisionNum === part.scannedRevisionNum,
            )
              ? "The latest part version is shown below. View revision history for this label’s version."
              : "That version is not on record. The latest part version is shown below."}
          </p>
          <a
            className="button"
            href="#revision-history"
            onClick={() => setRevisionSearch(`V${part.scannedRevisionNum}`)}
          >
            View label’s version
          </a>
        </div>
      )}
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
                Revision date:{" "}
                {current.effectiveOn
                  ? dateOnly(current.effectiveOn)
                  : "Not set"}
              </p>
              <details className="sample-audit">
                <summary>Logging details</summary>
                <p className="revision-byline">
                  V{current.revisionNum} logged {date(current.createdAt)} by{" "}
                  <strong>{current.loggedBy}</strong>
                </p>
              </details>
              <blockquote>{current.changeNote}</blockquote>
            </>
          )}
          <div className="permanent-note">
            <Tag size={16} />
            {part.labelPrinted
              ? "The existing label is still correct. Scanning opens the latest version."
              : "No label export recorded. A permanent label opens the latest version."}
          </div>
          <a
            className="text-button revision-history-link"
            href="#revision-history"
          >
            View all {part.revisions.length} versions
          </a>
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
      <section
        className="panel revision-history-panel"
        id="revision-history"
        aria-labelledby="revision-history-heading"
      >
        <div className="section-heading">
          <h2 id="revision-history-heading">
            <History size={19} /> Revision history
          </h2>
          <span>{part.revisions.length} versions</span>
        </div>
        <p className="muted">
          All versions are kept here, newest first. Scroll to browse older
          versions.
        </p>
        <label className="field revision-search">
          Find a version
          <input
            type="search"
            placeholder="Version number, change, person, or date…"
            value={revisionSearch}
            onChange={(e) => setRevisionSearch(e.target.value)}
          />
        </label>
        <p className="muted" role="status">
          Showing {visibleRevisions.length} of {part.revisions.length} versions
        </p>
        <div
          className="history-list revision-history-scroll"
          role="region"
          aria-label="All revisions, newest first"
          tabIndex={0}
        >
          {visibleRevisions.length === 0 && (
            <p>No matching versions. Try another search.</p>
          )}
          {visibleRevisions.map((r) => (
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
                  Revision date:{" "}
                  {r.effectiveOn ? dateOnly(r.effectiveOn) : "Not set"}
                </p>
                <p className="history-meta">
                  Logged {date(r.createdAt)} · {r.loggedBy}
                </p>
                <p>{r.voided ? `Voided: ${r.voidReason}` : r.changeNote}</p>
                {r.voided && (
                  <p className="original-note">Original note: {r.changeNote}</p>
                )}
              </div>
              <div className="revision-entry-actions">
                {!r.voided && (
                  <Link
                    className="button small"
                    href={`/parts/${part.partNumber}-V${r.revisionNum}/print`}
                  >
                    <Printer size={15} />
                    Print V{r.revisionNum} label
                  </Link>
                )}
                {!part.archivedAt && (
                  <button className="button small" onClick={() => setDating(r)}>
                    Edit date
                  </button>
                )}
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
            </div>
          ))}
        </div>
      </section>
      <SamplesPanel
        part={part}
        onChange={(updated) => {
          setPart(updated);
        }}
      />
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
      {dating && (
        <RevisionDateEditor
          part={part}
          revision={dating}
          onClose={() => setDating(null)}
          onSaved={(updated) => {
            setPart(updated);
            setDating(null);
            reload();
          }}
        />
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
    [effectiveOn, setEffectiveOn] = useState(today),
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
            }>(`parts/${part.id}/revisions`, { changeNote: note, effectiveOn });
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
        <p className="muted">
          Existing samples keep their assigned versions. After saving, use Add
          samples for physical pieces of this new version.
        </p>
        {failure && <Notice>{failure}</Notice>}
        <label className="field">
          Revision date
          <input
            type="date"
            required
            value={effectiveOn}
            onChange={(e) => setEffectiveOn(e.target.value)}
          />
          <small className="field-help">
            When this revision took effect. Logging an earlier date still
            creates the next version; sample received dates stay unchanged.
          </small>
        </label>
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
          <p>
            Your permanent part label still works. Existing samples keep their
            own versions and QR codes.
          </p>
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
          <Link className="button" href={`/parts/${number}#samples`}>
            Add or manage samples
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
  const [created, setCreated] = useState(false);
  useEffect(() => {
    setCreated(sessionStorage.getItem(`created:${number}`) === "true");
  }, [number]);
  if (error) return <Missing number={number} error={error} />;
  if (!part) return <Spinner />;
  return (
    <LabelEditor
      key={number}
      part={part}
      number={number}
      created={created}
      reload={reload}
    />
  );
}
