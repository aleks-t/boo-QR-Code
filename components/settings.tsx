"use client";
import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Download,
  Mail,
  Merge,
  Plus,
  Share,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { api, post, Session, Vendor } from "@/lib/types";
import { Combo, Modal, Notice } from "./ui";
import { Shared } from "./tables";
import { AddReference } from "./parts";
async function enablePush(key: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error(
      "Push is unavailable here. On iPhone, add the app to your home screen first, or use email notifications.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications are not enabled. You can change this in browser settings, or use email instead.",
    );
  const reg = await navigator.serviceWorker.ready;
  const padding = "=".repeat((4 - (key.length % 4)) % 4),
    raw = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/")),
    bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await post("push/subscribe", sub.toJSON());
}
export function Vendors({ vendors, reload }: Shared) {
  const [merge, setMerge] = useState<Vendor | null>(null),
    [target, setTarget] = useState(""),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const pending = vendors.filter((v) => !v.approved),
    approved = vendors.filter((v) => v.approved);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A SHARED ADDRESS BOOK</span>
          <h1>Your vendors.</h1>
          <p>
            New vendors are ready to use immediately. Review them here when you
            have a moment.
          </p>
        </div>
        <button className="button primary" onClick={() => setAdding(true)}>
          <Plus size={18} />
          Add vendor
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {toast && (
        <div className="success-toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      <section className="panel vendor-panel">
        <div className="section-heading">
          <h2>
            Waiting for review{" "}
            <span className="count-badge">{pending.length}</span>
          </h2>
          <span className="subtle-badge">APPROVAL QUEUE</span>
        </div>
        {pending.length ? (
          pending.map((v) => (
            <div className="vendor-row" key={v.id}>
              <span className="vendor-avatar">{v.code}</span>
              <div>
                <strong>{v.name}</strong>
                <p>{v._count?.parts || 0} parts · Usable now</p>
              </div>
              <div className="vendor-actions">
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => {
                    setTarget("");
                    setMerge(v);
                  }}
                >
                  <Merge size={15} />
                  Merge
                </button>
                <button
                  className="button primary small"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await post(`vendors/${v.id}/approve`);
                      setToast(`${v.name} is approved.`);
                      reload();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Check size={16} />
                  Approve
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty compact">
            <ShieldCheck size={30} />
            <h3>All caught up.</h3>
            <p>Every vendor has been reviewed.</p>
          </div>
        )}
      </section>
      <section className="panel vendor-panel">
        <div className="section-heading">
          <h2>Approved vendors</h2>
          <span className="muted">{approved.length} vendors</span>
        </div>
        {approved.map((v) => (
          <div className="vendor-row" key={v.id}>
            <span className="vendor-avatar">{v.code}</span>
            <div>
              <strong>{v.name}</strong>
              <p>{v._count?.parts || 0} parts</p>
            </div>
            <span className="pill green">
              <Check size={13} />
              Approved
            </span>
          </div>
        ))}
      </section>
      {adding && (
        <AddReference
          kind="vendor"
          vendors={vendors}
          onClose={() => setAdding(false)}
          onSelect={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {merge && (
        <Modal title={`Merge ${merge.name}?`} onClose={() => setMerge(null)}>
          <p className="modal-copy">
            All parts from {merge.name} will point to the vendor you choose.
            Their permanent numbers and QR labels stay the same. The duplicate
            vendor will be removed.
          </p>
          <Combo
            label="Merge into"
            value={target}
            options={vendors.filter((v) => v.id !== merge.id)}
            onChange={setTarget}
          />
          {error && <Notice>{error}</Notice>}
          <div className="form-actions">
            <button className="button" onClick={() => setMerge(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || !target}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await post(`vendors/${merge.id}/merge`, { targetId: target });
                  setToast(
                    `${merge.name} merged. Existing part numbers are unchanged.`,
                  );
                  setMerge(null);
                  reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Merging…" : "Merge vendors"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Preferences({
  session,
  onUpdate,
}: {
  session: Session;
  onUpdate: () => void;
}) {
  const [email, setEmail] = useState(session.user?.email || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [pending, setPending] = useState(0);
  useEffect(() => {
    api<{ pending: number }>("notifications")
      .then((d) => setPending(d.pending))
      .catch(() => {});
  }, []);
  return (
    <div className="narrow-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>Your settings.</h1>
          <p>A little setup, then back to making.</p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {toast && (
        <div className="success-toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      <section className="panel form-panel">
        <div className="settings-title">
          <Bell size={21} />
          <h2>Stay in the loop</h2>
        </div>
        <p className="muted">
          When someone logs a revision, we’ll try push first and email if push
          is unavailable.
        </p>
        <div className="setting-row">
          <div>
            <strong>Push notifications</strong>
            <p>
              {session.user?.hasPush
                ? "Enabled on your profile."
                : session.vapidPublicKey
                  ? "Get updates on this device."
                  : "Push delivery needs to be configured on the server."}
            </p>
          </div>
          <button
            className="button"
            disabled={busy || !session.vapidPublicKey}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await enablePush(session.vapidPublicKey!);
                setToast("Push notifications are enabled.");
                onUpdate();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {session.user?.hasPush ? "Reconnect" : "Enable push"}
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("profile", {
                method: "PATCH",
                body: JSON.stringify({ email }),
              });
              setToast("Your email preference is saved.");
              onUpdate();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Email fallback
            <input
              type="email"
              autoComplete="email"
              placeholder="you@workshop.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {!session.emailConfigured && (
            <p className="notice">
              Email delivery is not configured yet. Your address will be saved,
              but emails cannot be sent until the server is connected to Resend.
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save email"}
          </button>
        </form>
        {pending > 0 && (
          <div className="info-strip">
            <Mail size={20} />
            <div>
              <strong>{pending} notifications waiting for delivery</strong>
              <p>Enable push or add email to receive them.</p>
              <button
                className="text-button"
                onClick={async () => {
                  await post("notifications/retry");
                  setToast("Delivery retry requested.");
                }}
              >
                Retry delivery
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="panel form-panel">
        <div className="settings-title">
          <Smartphone size={21} />
          <h2>Keep Partbook on your home screen</h2>
        </div>
        <p>
          On iPhone, open this app in Safari, tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>, and tap <strong>Add</strong>.
          Open Partbook from the new icon to enable push notifications.
        </p>
        <p className="muted">
          On Android, open the browser menu and choose “Install app” or “Add to
          Home screen.”
        </p>
      </section>
      <section className="panel form-panel">
        <h2>A shared book, a clear history.</h2>
        <p className="muted">
          Signed in as <strong>{session.user?.name}</strong>. Edits and
          revisions are attributed to your name. Deleted parts stay in Trash
          until you restore them. Earlier part details can be restored from each
          part’s edit history.
        </p>
      </section>
    </div>
  );
}
export function InstallPrompts({ session }: { session: Session }) {
  const [ios, setIos] = useState(false),
    [prompt, setPrompt] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone;
    try {
      setIos(
        isIOS && !standalone && !localStorage.getItem("install-dismissed"),
      );
      if (!sessionStorage.getItem("partbook-visit")) {
        localStorage.setItem(
          "partbook-visits",
          String(Number(localStorage.getItem("partbook-visits") || 0) + 1),
        );
        sessionStorage.setItem("partbook-visit", "1");
      }
      setPrompt(
        Number(localStorage.getItem("partbook-visits")) >= 2 &&
          !sessionStorage.getItem("push-dismissed") &&
          !session.user?.hasPush &&
          !!session.vapidPublicKey &&
          "Notification" in window &&
          Notification.permission === "default" &&
          (!isIOS || !!standalone),
      );
    } catch {}
  }, [session]);
  return (
    <>
      {ios && (
        <div className="install-banner">
          <Smartphone size={22} />
          <div>
            <strong>Take your workshop with you.</strong>
            <p>
              In Safari, tap Share → Add to Home Screen → Add. Open the new icon
              to scan parts and receive push notifications.
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss installation tip"
            onClick={() => {
              localStorage.setItem("install-dismissed", "1");
              setIos(false);
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {prompt && (
        <div className="install-banner">
          <Bell size={21} />
          <div>
            <strong>Know when a part changes.</strong>
            <p>Enable notifications for new revisions from your team.</p>
            {error && <p role="alert">{error}</p>}
          </div>
          <button
            className="button small"
            onClick={async () => {
              try {
                await enablePush(session.vapidPublicKey!);
                setPrompt(false);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Enable
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss notification prompt"
            onClick={() => {
              sessionStorage.setItem("push-dismissed", "1");
              setPrompt(false);
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
