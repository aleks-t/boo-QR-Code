"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowDownToLine, Printer, Check } from "lucide-react";
import { post, saveFile, type Part, type Sample } from "@/lib/types";
import { normalizeCode, parseCode } from "@/lib/domain";
import { labelImage } from "@/lib/label-image";
import { Notice } from "./ui";

export function LabelEditor({
  part,
  number,
  created,
  reload,
}: {
  part: Part;
  number: string;
  created: boolean;
  reload: () => void;
}) {
  const [code, setCode] = useState(normalizeCode(number));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [marked, setMarked] = useState(false);
  const [samples, setSamples] = useState(part.samples);
  const [imageReady, setImageReady] = useState(false);
  const parsed = parseCode(code);
  const sample = samples.find((s) => s.sampleNumber === parsed.sampleNumber);
  const revisionNum = sample ? sample.revisionNum : parsed.revisionNum;
  const revision = part.revisions.find((r) => r.revisionNum === revisionNum);
  const valid =
    parsed.sampleNumber !== null
      ? !!sample
      : parsed.revisionNum !== null
        ? !!revision && !revision.voided
        : true;
  const lines = [
    part.partName,
    part.partNumber,
    ...(sample
      ? [
          `${sample.revisionNum ? `V${sample.revisionNum}` : "Version not assigned"} · Sample ${sample.sampleNumber}`,
          `Sample ID: ${code}`,
        ]
      : revision
        ? [`Version ${revision.revisionNum}`]
        : ["Part record · latest version"]),
  ];
  const qrUrl = `/api/parts/${encodeURIComponent(code)}/qr`;
  async function markPrinted() {
    if (sample) {
      const updated = await post<Sample>(`samples/${sample.id}/printed`, {
        updatedAt: sample.updatedAt,
      });
      setSamples((all) => all.map((s) => (s.id === updated.id ? updated : s)));
    } else if (parsed.revisionNum === null)
      await post("export/printed", { ids: [part.id] });
    setMarked(true);
    reload();
  }
  return (
    <div className="narrow-page print-page">
      <div className="no-print">
        <Link className="back-link" href={`/parts/${part.partNumber}`}>
          <ArrowLeft size={15} />
          Back to part
        </Link>
        <div className="page-heading">
          <div>
            <h1>
              {created ? `Created: ${part.partNumber}` : "Print a label."}
            </h1>
            <p>Choose a physical sample, a version, or the whole part.</p>
          </div>
        </div>
        <label className="field">
          Label for
          <select
            value={code}
            disabled={busy}
            onChange={(e) => {
              setCode(e.target.value);
              setImageReady(false);
              setMarked(false);
              setError("");
            }}
          >
            <option value={part.partNumber}>
              Whole part · opens latest version
            </option>
            <optgroup label="Versions">
              {part.revisions
                .filter((r) => !r.voided)
                .map((r) => (
                  <option
                    key={r.id}
                    value={`${part.partNumber}-V${r.revisionNum}`}
                  >
                    V{r.revisionNum} · version label
                  </option>
                ))}
            </optgroup>
            <optgroup label="Physical samples">
              {samples.map((s) => (
                <option
                  key={s.id}
                  value={`${part.partNumber}-S${s.sampleNumber}`}
                >
                  Sample {s.sampleNumber} ·{" "}
                  {s.revisionNum ? `V${s.revisionNum}` : "version not assigned"}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {sample && (
          <p className="notice">
            This QR always identifies Sample {sample.sampleNumber}. Edit its
            details at any time; reprint if the text on its label changes.
          </p>
        )}
        {!sample && parsed.revisionNum !== null && (
          <p className="notice">
            This label identifies V{parsed.revisionNum}, not an individual
            piece. For individual tracking, choose a physical sample.
          </p>
        )}
        {!sample && parsed.revisionNum === null && (
          <p className="notice">
            This permanent part label opens the latest version. Choose a sample
            above to identify one physical piece.
          </p>
        )}
        {sample && !sample.revisionNum && (
          <p className="notice">
            The sample’s version is not assigned yet. Its QR will still identify
            the correct sample.
          </p>
        )}
        {revision?.voided && sample && (
          <p className="notice">
            This sample belongs to a voided revision. Check its version before
            printing.
          </p>
        )}
        {error && <Notice>{error}</Notice>}
      </div>
      {!valid ? (
        <Notice>
          This label’s version or sample is unavailable. Choose another label
          above.
        </Notice>
      ) : (
        <section className="panel print-panel">
          <div className="physical-label">
            <img
              src={qrUrl}
              width={230}
              height={230}
              alt={`QR label encoding ${code}`}
              onLoad={() => setImageReady(true)}
              onError={() => {
                setImageReady(false);
                setError(
                  "The QR could not load. Refresh this page before printing.",
                );
              }}
            />
            <strong>{lines[0]}</strong>
            <span className="mono">{lines[1]}</span>
            {lines.slice(2).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>
      )}
      <div className="no-print">
        {marked && (
          <p className="success-toast" role="status">
            <Check size={16} />
            Label recorded as exported.
          </p>
        )}
        <div className="form-actions">
          <button
            className="button"
            disabled={busy || !valid || !!part.archivedAt}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (
                  await saveFile(
                    await labelImage(qrUrl, lines),
                    `${code}-label.png`,
                  )
                ) {
                  if (!marked) await markPrinted();
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowDownToLine size={17} />
            {busy ? "Preparing…" : "Download label PNG"}
          </button>
          <button
            className="button primary"
            disabled={busy || !valid || !!part.archivedAt}
            onClick={() => {
              if (imageReady) window.print();
              else
                setError(
                  "Wait for the QR image to finish loading before printing.",
                );
            }}
          >
            <Printer size={17} />
            Print label
          </button>
        </div>
        <div className="print-done">
          <button
            className="text-button"
            disabled={busy || marked || !valid || !!part.archivedAt}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await markPrinted();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            I printed this label
          </button>
          <Link
            className="button"
            href={`/parts/${code}`}
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
