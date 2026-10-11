"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PaletteSwitch } from "./PaletteSwitch";

// Only a development build ever contains the import. In a production build NODE_ENV is replaced at compile
// time, the condition is false, and the annotation code and its libraries are left out of the bundle.
const AnnotateOverlay =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./AnnotateOverlay").then((m) => m.AnnotateOverlay), { ssr: false }) : null;
const SessionRecorder =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./SessionRecorder").then((m) => m.SessionRecorder), { ssr: false }) : null;

/** Developer-only tools. Renders nothing in production, and nothing on any host but this machine. */
export function DevTools() {
  const [local, setLocal] = useState(false);
  useEffect(() => {
    setLocal(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
  }, []);
  if (!AnnotateOverlay || !SessionRecorder || !local) return null;
  return (
    <>
      <AnnotateOverlay />
      <SessionRecorder />
      <PaletteSwitch />
    </>
  );
}
