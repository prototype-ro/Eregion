"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Only a development build ever contains the import. In a production build NODE_ENV is replaced at compile
// time, the condition is false, and the annotation code and its libraries are left out of the bundle.
const AnnotateOverlay =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./AnnotateOverlay").then((m) => m.AnnotateOverlay), { ssr: false }) : null;
const SessionRecorder =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./SessionRecorder").then((m) => m.SessionRecorder), { ssr: false }) : null;
const AtmosphereSwitch =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./AtmosphereSwitch").then((m) => m.AtmosphereSwitch), { ssr: false }) : null;

const KEY = "eregion-dev-tools";

/** Whether the owner switched the tools on in this browser. Off until they do, so the site looks as visitors see it. */
function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function writeOn(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    // Private windows can refuse storage; the tools then stay off.
  }
}

/**
 * Developer-only tools: annotate, session recorder, atmosphere switch. Renders nothing in production, nothing on
 * any host but this machine, and nothing until switched on here: Ctrl+Shift+D toggles them, and so does opening
 * any page with ?devtools=on or ?devtools=off. The choice is remembered in this browser only.
 */
export function DevTools() {
  const [local, setLocal] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return;
    setLocal(true);
    const asked = new URLSearchParams(window.location.search).get("devtools");
    if (asked === "on" || asked === "off") writeOn(asked === "on");
    setOn(readOn());
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyD") {
        event.preventDefault();
        setOn((was) => {
          writeOn(!was);
          return !was;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!AnnotateOverlay || !SessionRecorder || !AtmosphereSwitch || !local || !on) return null;
  return (
    <>
      <AnnotateOverlay />
      <SessionRecorder />
      <AtmosphereSwitch />
    </>
  );
}
