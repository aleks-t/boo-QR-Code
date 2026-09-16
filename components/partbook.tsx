"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Layers3,
  LogOut,
  Menu,
  Plus,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import { api, post, Part, Session, Vendor, Category, date } from "@/lib/types";
import { Notice, Spinner } from "./ui";
import Scanner from "./scanner";
import { Inventory, Labels } from "./tables";
import {
  NewPart,
  PartDetail,
  RevisionForm,
  RevisionSuccess,
  PrintLabel,
} from "./parts";
import { Vendors, Preferences, InstallPrompts } from "./settings";
const nav = [
  { href: "/", label: "Scan a part", icon: ScanLine },
  { href: "/inventory", label: "Inventory", icon: FileSpreadsheet },
  { href: "/labels", label: "Labels", icon: Tag },
  { href: "/vendors", label: "Vendors", icon: ShieldCheck },
];
export default function Partbook() {
  const path = usePathname(),
    router = useRouter();
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [menu, setMenu] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]),
    [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({
    parts: 0,
    labels: 0,
    pending: 0,
    changes: 0,
  });
  const reload = useCallback(() => setRefresh((v) => v + 1), []);
  const loadSession = useCallback(
    () =>
      api<Session>("session")
        .then(setSession)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void loadSession();
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [loadSession]);
  useEffect(() => {
    setMenu(false);
  }, [path]);
  useEffect(() => {
    if (session?.user) window.scrollTo(0, 0);
  }, [session?.user?.id]);
  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    Promise.all([
      api<Vendor[]>("vendors"),
      api<Category[]>("categories"),
      api<typeof stats>("stats"),
    ])
      .then(([v, c, s]) => {
        if (alive) {
          setVendors(v);
          setCategories(c);
          setStats(s);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [session?.user, refresh, path]);
  if (!session)
    return (
      <div className="startup">
        <Brand />
        {error ? (
          <>
            <Notice>{error}</Notice>
            <button
              className="button"
              onClick={() => {
                setError("");
                void loadSession();
              }}
            >
              Try again
            </button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  if (!session.user)
    return (
      <Login
        onLogin={() => {
          void loadSession();
        }}
      />
    );
  const shared = { vendors, categories, reload };
  const segments = path.split("/").filter(Boolean);
  const number =
    segments[0] === "parts" ? decodeURIComponent(segments[1] || "") : "";
  let content;
  if (path === "/") content = <ScanHome stats={stats} refresh={refresh} />;
  else if (path === "/inventory")
    content = <Inventory {...shared} refresh={refresh} />;
  else if (path === "/new") content = <NewPart {...shared} />;
  else if (path === "/labels")
    content = <Labels {...shared} refresh={refresh} />;
  else if (path === "/vendors") content = <Vendors {...shared} />;
  else if (path === "/settings")
    content = <Preferences session={session} onUpdate={loadSession} />;
  else if (number && segments[2] === "revision")
    content = <RevisionForm number={number} reload={reload} />;
  else if (number && segments[2] === "success")
    content = <RevisionSuccess number={number} reload={reload} />;
  else if (number && segments[2] === "print")
    content = <PrintLabel number={number} reload={reload} />;
  else if (number && segments.length === 2)
    content = <PartDetail number={number} {...shared} refresh={refresh} />;
  else
    content = (
      <div className="empty">
        <h1>This page isn’t in the book.</h1>
        <Link className="button primary" href="/">
          Back to scanning
        </Link>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Box size={19} />
          </span>
          <div>
            <strong>Your workshop</strong>
            <small>PARTS & REVISION TRACKING</small>
          </div>
          <span className="online-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`nav-item ${path === n.href ? "active" : ""}`}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.href === "/labels" && stats.labels > 0 && (
                <span className="nav-count">{stats.labels}</span>
              )}
              {n.href === "/vendors" && stats.pending > 0 && (
                <span className="pending-dot" />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Layers3 size={23} />
          <strong>One label. Every revision.</strong>
          <p>Your part’s QR code stays the same, even as its story grows.</p>
        </div>
        <div className="sidebar-bottom">
          <Link
            className={`nav-item ${path === "/settings" ? "active" : ""}`}
            href="/settings"
          >
            <Settings2 size={19} />
            Settings
          </Link>
          <div className="user-row">
            <span className="avatar">
              {session.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>Workshop member</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("auth", { method: "DELETE" });
                  setSession({ ...session, user: null });
                  router.push("/");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span className="desktop-only">Workspace</span>
            <ChevronRight size={14} className="desktop-only" />
            <strong>
              {path === "/"
                ? "Scan a part"
                : number
                  ? "Part details"
                  : path === "/new"
                    ? "New part"
                    : path.slice(1).charAt(0).toUpperCase() + path.slice(2)}
            </strong>
          </div>
          <span className="facility-status">
            <span className="online-dot" />
            Shared workshop
          </span>
        </header>
        <main>
          {error && (
            <Notice>
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </Notice>
          )}
          <InstallPrompts session={session} />
          {content}
        </main>
        <footer className="page-footer">
          <span>PARTBOOK</span>
          <span>Every part has a story. Keep it together.</span>
        </footer>
      </div>
      <nav className="mobile-bottom">
        {nav.slice(0, 3).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={path === n.href ? "active" : ""}
          >
            <n.icon size={21} />
            {n.label}
          </Link>
        ))}
        <Link href="/new" className={path === "/new" ? "active" : ""}>
          <Plus size={21} />
          New part
        </Link>
      </nav>
    </div>
  );
}
function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">
        <ScanLine size={25} />
      </span>
      partbook<span className="brand-period">.</span>
    </Link>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <span className="eyebrow">A LITTLE ORDER FOR YOUR WORKSHOP</span>
        <h1>
          Every part.
          <br />
          Every revision.
          <br />
          <em>All together.</em>
        </h1>
        <p>
          Scan a label, find the latest revision, and keep your whole team on
          the same page.
        </p>
        <div className="login-graphic">
          <ScanLine size={92} strokeWidth={1} />
          <div>
            <small>ONE LABEL, FOR THE LIFE OF A PART</small>
            <strong>ACM-0043</strong>
            <span>
              V1 <ArrowRight size={14} /> V2 <ArrowRight size={14} /> <b>V3</b>
            </span>
          </div>
        </div>
      </div>
      <div className="login-panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              await post("auth", {
                name: data.get("name"),
                code: data.get("code"),
                email: data.get("email") || "",
              });
              onLogin();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="pill">
            <span className="online-dot" /> YOUR SHARED WORKSPACE
          </span>
          <h2>Welcome to the workshop.</h2>
          <p>
            Enter your name and the team’s access code.
            <br />
            We’ll remember you on this device.
          </p>
          {error && <Notice>{error}</Notice>}
          <label className="field">
            Your name
            <input
              name="name"
              autoComplete="given-name"
              placeholder="e.g. Sam"
              required
              maxLength={200}
            />
          </label>
          <label className="field">
            Access code
            <input
              name="code"
              type="password"
              autoComplete="current-password"
              placeholder="Your team’s shared code"
              required
            />
          </label>
          <label className="field">
            Email <span className="optional">optional</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="For revision notifications"
            />
          </label>
          <button className="button primary full" disabled={busy}>
            {busy ? "Opening your workshop…" : "Enter workshop"}
            <ArrowRight size={18} />
          </button>
          <p className="form-footnote">
            <ShieldCheck size={15} />
            Your name is recorded when you log a revision.
          </p>
        </form>
      </div>
    </div>
  );
}
function ScanHome({
  stats,
  refresh,
}: {
  stats: { parts: number; labels: number; changes: number };
  refresh: number;
}) {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ parts: Part[] }>("parts")
      .then((d) => setParts(d.parts.slice(0, 4)))
      .catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <>
      <div className="page-heading home-heading">
        <div>
          <span className="eyebrow">LESS GUESSWORK. MORE MAKING.</span>
          <h1>
            Know the part.
            <br className="mobile-only" /> Know what changed.
          </h1>
          <p>The latest revision is one scan away.</p>
        </div>
        <Link href="/new" className="button primary">
          <Plus size={18} />
          New part
        </Link>
      </div>
      <div className="stats-grid">
        <Stat
          icon={<Box size={20} />}
          label="Parts in your book"
          value={stats.parts}
          note="All in one place"
        />
        <Stat
          icon={<Layers3 size={20} />}
          label="Revisions this week"
          value={stats.changes}
          note="The latest from your team"
        />
        <Stat
          icon={<Tag size={20} />}
          label="Labels waiting"
          value={stats.labels}
          note={
            stats.labels
              ? "Ready for their first label"
              : "Everything is labeled"
          }
          href="/labels"
        />
      </div>
      <div className="scan-layout">
        <section className="panel scan-panel">
          <div className="panel-heading">
            <span className="section-icon">
              <ScanLine size={20} />
            </span>
            <div>
              <h2>Scan a part</h2>
              <p>Same label. Always the latest version.</p>
            </div>
            <span className="subtle-badge">QUICK LOOKUP</span>
          </div>
          <Scanner
            onScan={(code) => router.push(`/parts/${encodeURIComponent(code)}`)}
          />
          <div className="manual-link">
            <span>Don’t have the label?</span>
            <Link href="/inventory">
              <Search size={15} />
              Find part manually
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <div className="scan-aside">
          <section className="panel recent-panel">
            <div className="section-heading">
              <h2>In your workshop</h2>
              <Link href="/inventory">
                View all
                <ArrowRight size={15} />
              </Link>
            </div>
            {error && <Notice>{error}</Notice>}
            {parts.length ? (
              parts.map((p) => (
                <Link
                  href={`/parts/${p.partNumber}`}
                  className="recent-part"
                  key={p.id}
                >
                  <span className="part-icon">
                    <Box size={20} />
                  </span>
                  <div>
                    <strong>{p.partName}</strong>
                    <span className="mono">{p.partNumber}</span>
                  </div>
                  <span className="version-badge">
                    {p.current ? `V${p.current.revisionNum}` : "—"}
                  </span>
                  <ChevronRight size={15} />
                </Link>
              ))
            ) : (
              <div className="empty compact">
                <Box size={30} />
                <h3>No parts yet.</h3>
                <p>Create your first part to get started.</p>
                <Link href="/new" className="text-button">
                  Create a part <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </section>
          <section className="how-card">
            <span className="eyebrow">BUILT FOR THE WORKBENCH</span>
            <h2>
              A small label.
              <br />A complete history.
            </h2>
            <p>
              Every revision, every change, every person who logged it.
              Connected by one permanent QR code.
            </p>
            <div className="how-steps">
              <span>
                <ScanLine size={16} />
                Scan
              </span>
              <ChevronRight size={12} />
              <span>
                <ClipboardList size={16} />
                Review
              </span>
              <ChevronRight size={12} />
              <span>
                <Check size={16} />
                Keep making
              </span>
            </div>
          </section>
        </div>
      </div>
      <div className="sheet-callout">
        <span className="sheet-callout-icon">
          <FileSpreadsheet size={25} />
        </span>
        <div>
          <strong>A familiar sheet. A smarter inventory.</strong>
          <p>Search, filter, and edit your parts together in one place.</p>
        </div>
        <Link href="/inventory" className="button">
          Open inventory
          <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  note,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  href?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-title">
        <span>{label}</span>
        {icon}
      </div>
      <div className="stat-value">{value.toString().padStart(2, "0")}</div>
      <div className="stat-note">
        {note}
        {href && (
          <Link href={href} aria-label="Open labels">
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
