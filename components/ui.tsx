"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X, LoaderCircle } from "lucide-react";
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>Loading your parts…</span>
    </div>
  );
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice" role="alert">
      {children}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Combo({
  label,
  value,
  options,
  onChange,
  onAdd,
  addLabel,
  required = false,
}: {
  label: string;
  value: string;
  options: { id: string; name: string; code?: string }[];
  onChange: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value),
    matches = options.filter((o) =>
      `${o.code || ""} ${o.name}`.toLowerCase().includes(q.toLowerCase()),
    );
  useEffect(() => {
    function close(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div className="field combo" ref={root}>
      <span className="field-label">
        {label}
        {required && <span className="required"> *</span>}
      </span>
      <button
        type="button"
        className="combo-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setQ("");
          setOpen(!open);
        }}
      >
        {selected ? (
          <span>
            {selected.name}
            {selected.code && <small>{selected.code}</small>}
          </span>
        ) : (
          <span className="muted">Choose {label.toLowerCase()}</span>
        )}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="combo-options">
          <div className="combo-search">
            <Search size={16} />
            <input
              autoFocus
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && matches.length === 1) {
                  e.preventDefault();
                  onChange(matches[0].id);
                  setOpen(false);
                }
              }}
            />
          </div>
          <div role="listbox" aria-label={label}>
            {matches.map((o) => (
              <button
                type="button"
                role="option"
                aria-selected={o.id === value}
                key={o.id}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span>
                  {o.name}
                  {o.code && <small>{o.code}</small>}
                </span>
                {o.id === value && <Check size={16} />}
              </button>
            ))}
            {!matches.length && (
              <p className="muted combo-empty">No matches found.</p>
            )}
          </div>
          {onAdd && (
            <button
              type="button"
              className="combo-add"
              onClick={() => {
                setOpen(false);
                onAdd();
              }}
            >
              + {addLabel || `Add new ${label.toLowerCase()}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
