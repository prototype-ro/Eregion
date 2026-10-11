"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records what happens in the tab, so a problem can be shown instead of described: a screen video plus a log of the
 * clicks, keys, scrolls, route changes, console errors and failed requests, each with its time in the video.
 * Typed text and request bodies are never logged. Alt+Shift+R starts and stops it (Cmd/Ctrl+Shift+R is the browser's own reload). Development on this machine only.
 */

/** Marks the end of a recording file that carries its log after the video. */
const SESSION_MAGIC = "ERSLOG01";

interface LogEntry {
  t: number;
  type: string;
  [key: string]: unknown;
}

/** A short description of an element, enough to tell which control was used. */
function describe(element: Element | null): Record<string, unknown> | null {
  if (!element) return null;
  const target = element.closest("button, a, input, select, textarea, summary, [role=button], [role=menuitem], [role=tab], [data-flip-id]") ?? element;
  const html = target as HTMLElement;
  const path: string[] = [];
  for (let node: Element | null = target; node && path.length < 4 && node !== document.body; node = node.parentElement) {
    const id = node.id ? `#${node.id}` : "";
    const cls = typeof node.className === "string" && node.className ? `.${node.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : "";
    path.unshift(`${node.tagName.toLowerCase()}${id}${cls}`);
  }
  const isField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  return {
    tag: target.tagName.toLowerCase(),
    text: isField ? undefined : (html.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || undefined,
    label: target.getAttribute("aria-label") ?? undefined,
    role: target.getAttribute("role") ?? undefined,
    id: target.id || undefined,
    expanded: target.getAttribute("aria-expanded") ?? undefined,
    pressed: target.getAttribute("aria-pressed") ?? undefined,
    disabled: (target as HTMLButtonElement).disabled || target.getAttribute("aria-disabled") === "true" || undefined,
    path: path.join(" > "),
  };
}

export function SessionRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const log = useRef<LogEntry[]>([]);
  const started = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cleanup = useRef<Array<() => void>>([]);

  const add = useCallback((type: string, data: Record<string, unknown> = {}) => {
    log.current.push({ t: Math.round(performance.now() - started.current), type, ...data });
  }, []);

  const attach = useCallback(() => {
    const off = cleanup.current;
    const listen = <K extends keyof WindowEventMap>(name: K, handler: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions) => {
      window.addEventListener(name, handler as EventListener, { capture: true, ...options });
      off.push(() => window.removeEventListener(name, handler as EventListener, { capture: true } as EventListenerOptions));
    };

    listen("click", (event) => {
      if ((event.target as Element | null)?.closest?.("[data-recorder-ignore]")) return;
      add("click", { x: event.clientX, y: event.clientY, target: describe(event.target as Element), url: location.pathname + location.search });
    });
    listen("keydown", (event) => {
      const field = (event.target as Element | null)?.closest?.("input, textarea, [contenteditable=true]");
      // Text typed into a field is never recorded, only that typing happened.
      const printable = event.key.length === 1 && !event.metaKey && !event.ctrlKey;
      add("key", { key: field && printable ? "[typed]" : event.key, meta: event.metaKey || undefined, ctrl: event.ctrlKey || undefined, shift: event.shiftKey || undefined, in: field ? "field" : undefined });
    });
    let lastScroll = 0;
    listen("scroll", () => {
      const now = performance.now();
      if (now - lastScroll < 200) return;
      lastScroll = now;
      add("scroll", { y: Math.round(window.scrollY) });
    }, { passive: true });
    listen("resize", () => add("resize", { width: window.innerWidth, height: window.innerHeight }));
    listen("popstate", () => add("route", { url: location.pathname + location.search, via: "popstate" }));
    listen("error", (event) => add("error", { message: String(event.message), source: event.filename ? `${event.filename}:${event.lineno}` : undefined }));
    listen("unhandledrejection", (event) => add("error", { message: `Unhandled rejection: ${String(event.reason)}` }));

    // Route changes made by the app.
    for (const name of ["pushState", "replaceState"] as const) {
      const original = history[name];
      history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const result = original.apply(this, args);
        add("route", { url: location.pathname + location.search, via: name });
        return result;
      };
      off.push(() => {
        history[name] = original;
      });
    }

    // Console errors and warnings.
    for (const level of ["error", "warn"] as const) {
      const original = console[level];
      console[level] = (...args: unknown[]) => {
        add("console", { level, message: args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 400) });
        original.apply(console, args);
      };
      off.push(() => {
        console[level] = original;
      });
    }

    // Requests: method, address, status and time only. No headers, no bodies.
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const begun = performance.now();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      try {
        const response = await originalFetch(input, init);
        if (!response.ok || method !== "GET") add("request", { method, url: url.replace(location.origin, ""), status: response.status, ms: Math.round(performance.now() - begun) });
        return response;
      } catch (err) {
        add("request", { method, url: url.replace(location.origin, ""), failed: String(err) });
        throw err;
      }
    };
    off.push(() => {
      window.fetch = originalFetch;
    });
  }, [add]);

  const stop = useCallback(() => {
    const active = recorder.current;
    if (active && active.state !== "inactive") active.stop();
  }, []);

  const start = useCallback(async () => {
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
        // @ts-expect-error Chrome options that preselect this tab in the picker.
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      });
      stream.current = media;
      chunks.current = [];
      log.current = [];
      // Chrome and Firefox record WebM. Safari records MP4. Either is fine for the frame script.
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const extension = mime?.startsWith("video/mp4") ? "mp4" : "webm";
      const rec = new MediaRecorder(media, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
      recorder.current = rec;
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        cleanup.current.forEach((fn) => fn());
        cleanup.current = [];
        media.getTracks().forEach((track) => track.stop());
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const settings = media.getVideoTracks()[0]?.getSettings();
        const save = (blob: Blob, name: string) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        };
        const session = {
          startedAt: new Date(Date.now() - (performance.now() - started.current)).toISOString(),
          url: location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
          video: { width: settings?.width, height: settings?.height, frameRate: settings?.frameRate, file: `eregion-session-${stamp}.${extension}` },
          userAgent: navigator.userAgent,
          events: log.current,
        };
        // One file, so the browser cannot block a second download and lose the log: the video, then the log as JSON,
        // then its length and a marker. Players ignore the extra bytes. scripts/session-frames.mjs splits them again.
        const logBytes = new TextEncoder().encode(JSON.stringify(session));
        const length = new DataView(new ArrayBuffer(8));
        length.setBigUint64(0, BigInt(logBytes.length), true);
        save(new Blob([...chunks.current, logBytes, length.buffer, new TextEncoder().encode(SESSION_MAGIC)], { type: rec.mimeType || "video/webm" }), `eregion-session-${stamp}.${extension}`);
        setRecording(false);
        setStatus(`Saved eregion-session-${stamp}.${extension} (video and log in one file) to Downloads`);
      };
      // If the person stops sharing from the browser's own bar, finish the same way.
      media.getVideoTracks()[0]?.addEventListener("ended", () => stop());
      rec.onstart = () => {
        started.current = performance.now();
        add("start", { url: location.pathname + location.search, scrollY: Math.round(window.scrollY) });
        attach();
        setSeconds(0);
        setRecording(true);
      };
      rec.start(1000);
    } catch (err) {
      setStatus(`Could not start recording: ${err instanceof Error ? err.message : "permission denied"}`);
    }
  }, [add, attach, stop]);

  const toggle = useCallback(() => {
    if (recorder.current && recorder.current.state === "recording") stop();
    else void start();
  }, [start, stop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyR") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  const pill = "rounded-full px-4 py-2 text-sm font-medium shadow-lg";
  return (
    <div data-annotate-ignore data-recorder-ignore>
      {!recording && (
        <button
          type="button"
          onClick={toggle}
          title="Record this tab with a log of what you do (Alt+Shift+R)"
          className={`${pill} fixed bottom-4 left-[7.25rem] z-[99998] border border-line bg-bg text-muted opacity-60 hover:opacity-100`}
        >
          Record
        </button>
      )}
      {recording && (
        <div className="fixed bottom-4 left-4 z-[100000] flex items-center gap-2 rounded-full border border-line bg-bg py-1.5 pr-1.5 pl-4 text-sm shadow-2xl">
          <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-[#ff3b30]" />
          <span className="font-mono tabular-nums">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && note.trim()) {
                add("marker", { note: note.trim() });
                setNote("");
                event.stopPropagation();
              }
            }}
            placeholder="Mark: type a note, Enter"
            aria-label="Add a marker to the recording"
            className="w-44 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button type="button" onClick={stop} className="rounded-full bg-[#ff3b30] px-4 py-1.5 text-xs font-bold text-white">
            Stop
          </button>
        </div>
      )}
      {status && (
        <p role="status" className="fixed bottom-6 left-1/2 z-[100001] -translate-x-1/2 rounded-full border border-line bg-bg px-5 py-3 text-sm text-ink shadow-2xl">
          {status}
        </p>
      )}
    </div>
  );
}
