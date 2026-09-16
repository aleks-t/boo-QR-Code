"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, CameraOff } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { resolveCode } from "@/lib/domain";
export default function Scanner({
  onScan,
}: {
  onScan: (code: string) => void;
}) {
  const scanner = useRef<Html5Qrcode | null>(null),
    mounted = useRef(true),
    starting = useRef(false);
  const callback = useRef(onScan);
  callback.current = onScan;
  const [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (scanner.current?.isScanning)
        void scanner.current.stop().catch(() => {});
    };
  }, []);
  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!window.isSecureContext)
        throw new Error(
          "Camera access needs a secure HTTPS connection. Open the secure app link on your phone.",
        );
      const { Html5Qrcode, Html5QrcodeSupportedFormats } =
        await import("html5-qrcode");
      if (!mounted.current) return;
      const instance = new Html5Qrcode("camera-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scanner.current = instance;
      let found = false;
      await instance.start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: (w, h) => ({
            width: Math.floor(Math.min(w, h) * 0.72),
            height: Math.floor(Math.min(w, h) * 0.72),
          }),
          aspectRatio: 1,
        },
        (decoded) => {
          if (found || !mounted.current) return;
          found = true;
          const code = resolveCode(decoded);
          void instance
            .stop()
            .catch(() => {})
            .finally(() => {
              if (mounted.current) {
                setActive(false);
                callback.current(code);
              }
            });
        },
        () => {},
      );
      if (!mounted.current) {
        await instance.stop();
        return;
      }
      setActive(true);
    } catch (e) {
      if (mounted.current)
        setMessage(
          e instanceof Error && e.message.includes("HTTPS")
            ? e.message
            : "Camera access is unavailable. Allow camera access in your browser settings, or find the part manually.",
        );
    } finally {
      starting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function stop() {
    await scanner.current?.stop().catch(() => {});
    setActive(false);
  }
  return (
    <div className="scanner-wrap">
      <div className={`viewfinder ${active ? "camera-active" : ""}`}>
        <div id="camera-reader" />
        {!active && !busy && (
          <div className="camera-placeholder">
            <div className="camera-symbol">
              <ScanLine size={48} strokeWidth={1.3} />
            </div>
            <h3>A quick scan. The whole story.</h3>
            <p>
              Point your camera at a part’s QR label.
              <br />
              We’ll take it from there.
            </p>
          </div>
        )}
        <div className="scan-corners">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="camera-tag">
          <span />
          {active ? "Camera live · detecting automatically" : "QR SCANNER"}
        </span>
      </div>
      {message && (
        <p className="notice" role="alert">
          <CameraOff size={18} />
          {message}
        </p>
      )}
      <button
        className="button primary scan-button"
        disabled={busy}
        onClick={active ? stop : start}
      >
        <Camera size={20} />
        {busy ? "Opening camera…" : active ? "Stop camera" : "Scan part"}
      </button>
      <p className="scanner-caption">
        {active
          ? "Hold the label steady. It opens automatically."
          : "Your camera turns on when you’re ready."}
      </p>
    </div>
  );
}
