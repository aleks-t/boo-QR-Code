"use client";
import { useState } from "react";
import { api, date, type Part, type Revision } from "@/lib/types";
import { Modal, Notice } from "./ui";
export function RevisionDateEditor({
  part,
  revision,
  onClose,
  onSaved,
}: {
  part: Part;
  revision: Revision;
  onClose: () => void;
  onSaved: (part: Part) => void;
}) {
  const [value, setValue] = useState(revision.effectiveOn?.slice(0, 10) || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={`Edit V${revision.revisionNum} date`}
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
            onSaved(
              await api<Part>(`revisions/${revision.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  effectiveOn: value || null,
                  updatedAt: revision.updatedAt,
                }),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{part.partName}</p>
        {error && <Notice>{error}</Notice>}
        <label className="field">
          Revision date
          <input
            type="date"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
          />
          <small>
            When this version took effect. Leave blank if unknown. Each sample
            has its own Received on date.
          </small>
        </label>
        <p className="muted">
          Originally logged {date(revision.createdAt)} by {revision.loggedBy}.
          This timestamp is kept in history.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save date"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
