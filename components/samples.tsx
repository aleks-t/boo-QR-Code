"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Printer, Pencil, ChevronDown } from "lucide-react";
import {
  api,
  post,
  date,
  dateOnly,
  today,
  type Part,
  type Sample,
} from "@/lib/types";
import { Modal, Notice } from "./ui";

const statuses = {
  IN_HOUSE: "In house",
  SENT_OUT: "Sent out",
  PASSED: "Passed",
  FAILED: "Failed",
  SENT_BACK: "Sent back",
};

export function SamplesPanel({
  part,
  onChange,
}: {
  part: Part;
  onChange: (part: Part) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Sample | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const groups = [
    ...part.revisions.map((r) => ({
      key: String(r.revisionNum),
      title: `V${r.revisionNum}${r.voided ? " · Voided revision" : r.id === part.current?.id ? " · Current version" : ""}`,
    })),
    { key: "unknown", title: "Version not assigned" },
  ];
  const query = search.trim().toLowerCase();
  const sampleQuery = query.match(/^(?:sample\s*|s)?([1-9]\d*)$/);
  const samples = part.samples.filter(
    (s) =>
      (!filter ||
        (s.revisionNum == null ? "unknown" : String(s.revisionNum)) ===
          filter) &&
      (!query ||
        (sampleQuery
          ? s.sampleNumber === Number(sampleQuery[1])
          : [
              `Sample ${s.sampleNumber}`,
              `${part.partNumber}-S${s.sampleNumber}`,
              s.note || "",
              statuses[s.status],
            ].some((v) => v.toLowerCase().includes(query)))),
  );
  return (
    <section
      className="panel samples-panel sample-tree"
      id="samples"
      aria-labelledby="samples-heading"
    >
      <div className="section-heading">
        <h2 id="samples-heading">
          Physical samples <small>{part.samples.length} total</small>
        </h2>
        {!part.archivedAt && (
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add samples
          </button>
        )}
      </div>
      <p className="muted sample-help">
        One card and one permanent QR per physical piece. More pieces of the
        same version stay under that version.
      </p>
      {message && (
        <p className="success-toast" role="status">
          {message}
        </p>
      )}
      {part.samples.some((s) => s.revisionNum == null) && (
        <p className="notice">
          Some existing samples have no version assigned. Use Edit details to
          choose their version and received date.
        </p>
      )}
      {part.samples.length > 0 && (
        <div className="sample-filters">
          <label className="field">
            Find a sample
            <input
              type="search"
              placeholder="Sample number, status, or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="field">
            Version
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All versions</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!part.samples.length && (
        <p className="muted">
          No physical samples yet. Add samples when they arrive.
        </p>
      )}
      {part.samples.length > 0 && !samples.length && (
        <p className="muted">
          No matching samples. Clear your search or change the version filter.
        </p>
      )}
      {groups.map((group) => {
        const items = samples.filter(
          (s) =>
            (s.revisionNum == null ? "unknown" : String(s.revisionNum)) ===
            group.key,
        );
        if (!items.length) return null;
        return (
          <div className="sample-version-group" key={group.key}>
            <h3>
              {group.title}
              <span>
                {items.length} {items.length === 1 ? "sample" : "samples"}
              </span>
            </h3>
            <div className="sample-branches">
              {items.map((sample) => (
                <article
                  className={`sample-card ${part.scannedSampleId === sample.id ? "scanned-sample" : ""}`}
                  id={`sample-${sample.sampleNumber}`}
                  key={sample.id}
                  aria-label={`Sample ${sample.sampleNumber}`}
                >
                  <div className="sample-card-heading">
                    <h4>Sample {sample.sampleNumber}</h4>
                    <span className="category-badge">
                      {statuses[sample.status]}
                    </span>
                  </div>
                  <p className="mono sample-code">
                    {part.partNumber}-S{sample.sampleNumber}
                  </p>
                  <p className="sample-received">
                    <strong>Received on</strong>{" "}
                    {sample.receivedOn
                      ? dateOnly(sample.receivedOn)
                      : "Not set"}
                  </p>
                  {sample.note && <p className="sample-note">{sample.note}</p>}
                  <div className="sample-card-actions">
                    {!part.archivedAt && (
                      <button
                        className="button"
                        onClick={() => setEditing(sample)}
                      >
                        <Pencil size={16} />
                        Edit details
                      </button>
                    )}
                    <Link
                      className="button"
                      href={`/parts/${part.partNumber}-S${sample.sampleNumber}/print`}
                    >
                      <Printer size={16} />
                      Print label
                    </Link>
                    <small>
                      {sample.labelPrinted
                        ? "Label exported"
                        : "Label not yet exported"}
                    </small>
                  </div>
                  <details className="sample-audit">
                    <summary>
                      History <ChevronDown size={14} />
                    </summary>
                    <p className="muted">Logged on {date(sample.createdAt)}</p>
                    {sample.events.map((event) => (
                      <div key={event.id} className="sample-audit-event">
                        <strong>
                          {event.details?.action || statuses[event.status]}
                        </strong>
                        <small>
                          {date(event.createdAt)} · {event.loggedBy} ·{" "}
                          {event.revisionNum
                            ? `V${event.revisionNum}`
                            : "Version not recorded"}
                        </small>
                        {event.note && <p>{event.note}</p>}
                        {event.details?.before && event.details?.after ? (
                          <p>
                            {describeEdit(
                              event.details.before,
                              event.details.after,
                            )}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </details>
                </article>
              ))}
            </div>
          </div>
        );
      })}
      {adding && (
        <SampleForm
          part={part}
          onClose={() => setAdding(false)}
          onSaved={(updated, count) => {
            onChange(updated);
            setAdding(false);
            setFilter("");
            setSearch("");
            setMessage(
              `Added ${count} ${count === 1 ? "sample" : "samples"}. Use Print label on each new sample card.`,
            );
          }}
        />
      )}
      {editing && (
        <SampleForm
          part={part}
          sample={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onChange(updated);
            setEditing(null);
            setMessage(
              "Sample details saved. Its permanent QR code stays the same.",
            );
          }}
        />
      )}
    </section>
  );
}

function describeEdit(before: unknown, after: unknown) {
  const a = before as Record<string, unknown>,
    b = after as Record<string, unknown>;
  const names = {
    revisionNum: "Version",
    receivedOn: "Received on",
    status: "Status",
    note: "Note",
  };
  return Object.entries(names)
    .filter(([key]) => a[key] !== b[key])
    .map(
      ([key, name]) =>
        `${name}: ${String(a[key] ?? "Not set")} → ${String(b[key] ?? "Not set")}`,
    )
    .join(" · ");
}

function SampleForm({
  part,
  sample,
  onClose,
  onSaved,
}: {
  part: Part;
  sample?: Sample;
  onClose: () => void;
  onSaved: (part: Part, count?: number) => void;
}) {
  const [version, setVersion] = useState(
    String(
      sample ? (sample.revisionNum ?? "") : (part.current?.revisionNum ?? ""),
    ),
  );
  const [received, setReceived] = useState(
    sample ? sample.receivedOn?.slice(0, 10) || "" : today(),
  );
  const [count, setCount] = useState("1");
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<{
    count: number;
    revisionNum: number | null;
    receivedOn: string;
    note: string;
    requestId: string;
  } | null>(null);
  const [status, setStatus] = useState(sample?.status || "IN_HOUSE");
  const [note, setNote] = useState(sample?.note || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={
        sample ? `Edit Sample ${sample.sampleNumber}` : "Add physical samples"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const revisionNum = version ? Number(version) : null;
            if (sample) {
              const updated = await api<Sample>(`samples/${sample.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  updatedAt: sample.updatedAt,
                  status,
                  note,
                  revisionNum,
                  receivedOn: received || null,
                }),
              });
              onSaved({
                ...part,
                samples: part.samples.map((s) =>
                  s.id === updated.id ? updated : s,
                ),
              });
            } else {
              const input = pending || {
                count: Number(count),
                revisionNum,
                receivedOn: received,
                note,
                requestId,
              };
              setPending(input);
              const updated = await post<Part>(
                `parts/${part.id}/samples`,
                input,
              );
              onSaved(updated, Number(count));
            }
          } catch (e) {
            setError((e as Error).message);
            if (
              (e as { status?: number }).status &&
              (e as { status: number }).status < 500
            )
              setPending(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          {part.partName} · {part.partNumber}
        </p>
        {error && <Notice>{error}</Notice>}
        {pending && !busy && (
          <p className="notice">
            Saving has not been confirmed. Retry below to recover the same
            samples without creating duplicates.
          </p>
        )}
        <fieldset disabled={busy || !!pending} className="sample-form-fields">
          <label className="field">
            Version
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            >
              <option value="">Not known yet</option>
              {part.revisions
                .filter(
                  (r) => !r.voided || r.revisionNum === sample?.revisionNum,
                )
                .map((r) => (
                  <option key={r.id} value={r.revisionNum}>
                    V{r.revisionNum}
                    {r.voided
                      ? " (voided)"
                      : r.id === part.current?.id
                        ? " (current)"
                        : ""}
                  </option>
                ))}
            </select>
          </label>
          {!sample && (
            <label className="field">
              How many more samples?
              <input
                type="number"
                min={1}
                max={100}
                required
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
              <small>
                {part.samples.length} existing + {Number(count) || 0} new ={" "}
                {part.samples.length + (Number(count) || 0)} samples. Each new
                piece gets its own QR. Existing codes stay unchanged.
              </small>
            </label>
          )}
          <label className="field">
            Received on
            <input
              type="date"
              required={!sample}
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
            <small>The actual arrival date. Earlier dates are welcome.</small>
          </label>
          {sample && (
            <label className="field">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Sample["status"])}
              >
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Details / notes
            <textarea
              maxLength={4000}
              placeholder="Location, supplier reference, condition, or test results…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </fieldset>
        {sample && version !== String(sample.revisionNum ?? "") && (
          <p className="notice">
            The QR still identifies this sample. Reprint its label if the
            version text changes.
          </p>
        )}
        <div className="form-actions">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : sample ? "Save sample" : "Add samples"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
