"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import html2canvas from "html2canvas-pro";
import { useCallback, useEffect, useState } from "react";

/**
 * Draw on the live page: pen, arrows and text over the running UI, then export one PNG of the page with the
 * drawing on top. Cmd/Ctrl+Shift+A toggles it. Nothing is saved, closing the overlay throws the drawing away.
 * Development builds on this machine only, see DevTools.
 */
export function AnnotateOverlay() {
  const [on, setOn] = useState(false);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setOn((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  const close = useCallback(() => {
    setOn(false);
    setApi(null);
  }, []);

  const exportPng = useCallback(async () => {
    if (!api || busy) return;
    setBusy(true);
    try {
      // Finish any text box being typed, so it is part of the drawing.
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const ratio = window.devicePixelRatio || 1;
      // 1. The page as it is rendered right now, the overlay left out.
      const page = await html2canvas(document.documentElement, {
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        scale: ratio,
        useCORS: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        ignoreElements: (element) => element.hasAttribute("data-annotate-ignore"),
        // html2canvas paints the inside of a closed <details>, so hide it the way the browser does.
        onclone: (clone) => {
          clone.querySelectorAll<HTMLElement>("details:not([open]) > :not(summary)").forEach((element) => {
            element.style.display = "none";
          });
        },
      });

      // 2. The drawing: Excalidraw keeps its finished shapes on a transparent canvas the size of the viewport.
      const drawing = document.querySelector<HTMLCanvasElement>("[data-annotate-root] canvas.excalidraw__canvas.static");
      const out = document.createElement("canvas");
      out.width = page.width;
      out.height = page.height;
      const context = out.getContext("2d");
      if (!context) throw new Error("No canvas");
      context.drawImage(page, 0, 0);
      if (drawing) context.drawImage(drawing, 0, 0, out.width, out.height);

      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("No image");

      // 3. Keep it twice: on the clipboard to paste into a chat, and as a file.
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      } catch {
        // Clipboard can be blocked. The download below still happens.
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `eregion-annotated-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      setStatus(copied ? "Copied to the clipboard and downloaded" : "Downloaded (the clipboard was blocked)");
    } catch (err) {
      setStatus(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [api, busy]);

  const pill = "rounded-full px-4 py-2 text-sm font-medium shadow-lg";

  return (
    <div data-annotate-ignore>
      {!on && (
        <button
          type="button"
          onClick={() => setOn(true)}
          title="Annotate this page (Cmd/Ctrl+Shift+A)"
          className={`${pill} fixed bottom-4 left-4 z-[99998] border border-line bg-bg text-muted opacity-60 hover:opacity-100`}
        >
          Annotate
        </button>
      )}

      {on && (
        <div data-annotate-root className="annotate-root fixed inset-0 z-[99999]" style={{ pointerEvents: "auto" }}>
          <Excalidraw
            excalidrawAPI={setApi}
            theme="light"
            initialData={{
              appState: {
                viewBackgroundColor: "transparent",
                currentItemStrokeColor: "#ff3b30",
                currentItemStrokeWidth: 2,
                currentItemFontSize: 28,
                activeTool: { type: "freedraw", locked: false, lastActiveTool: null, customType: null },
              },
            }}
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, changeViewBackgroundColor: false, toggleTheme: false },
            }}
            renderTopRightUI={() => (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void exportPng()} disabled={busy} className={`${pill} bg-[#0b4e66] text-white disabled:opacity-60`}>
                  {busy ? "Exporting" : "Export PNG"}
                </button>
                <button type="button" onClick={close} className={`${pill} border border-black/20 bg-white text-black`}>
                  Close
                </button>
              </div>
            )}
          />
        </div>
      )}

      {status && (
        <p role="status" className="fixed bottom-6 left-1/2 z-[100000] -translate-x-1/2 rounded-full border border-line bg-bg px-5 py-3 text-sm text-ink shadow-2xl">
          {status}
        </p>
      )}
    </div>
  );
}
