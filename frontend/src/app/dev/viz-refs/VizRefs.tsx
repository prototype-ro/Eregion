"use client";

import { useState } from "react";

/**
 * Reference clips of film and anime interfaces where the look carries the screen more than the data does.
 * Collected from HUDS+GUIS breakdowns. The files live in public/dev/viz-refs and belong to their
 * studios; keep them out of commits.
 */

type Mood = "radial" | "holo" | "wire" | "glow";

interface Ref {
  id: string;
  work: string;
  post: string;
  note: string;
  mood: Mood;
}

const HG = "https://www.hudsandguis.com/";

const REFS: Ref[] = [
  { id: "7a1489c5", work: "Cyber City Oedo 808", post: "home/2025/cyber-city-odeo-808", note: "Flat concentric colour rings over a grid, with tiny mono text blocks. Bold zones, almost no chart.", mood: "glow" },
  { id: "cc04e054", work: "Cyber City Oedo 808", post: "home/2025/cyber-city-odeo-808", note: "A city map made of glowing lines and blocks, lit from below.", mood: "glow" },
  { id: "1e85f62b", work: "Cyber City Oedo 808", post: "home/2025/cyber-city-odeo-808", note: "Cyan circuit lines on black, almost nothing else on screen.", mood: "wire" },
  { id: "91ab4707", work: "Cyber City Oedo 808", post: "home/2025/cyber-city-odeo-808", note: "Diagram and helix inside a thin red frame. One colour, lots of black.", mood: "wire" },
  { id: "8d3961ea", work: "Cyber City Oedo 808", post: "home/2025/cyber-city-odeo-808", note: "Red nodes around a ring, joined by hairlines.", mood: "wire" },
  { id: "49e93039", work: "Cyber City Oedo 808", post: "home/2025/cyber-city-odeo-808", note: "A single reticle circle with numbers tucked in the corners.", mood: "radial" },
  { id: "9f9144b7", work: "Jurassic World Rebirth", post: "home/2026/jurassic-world-rebirth", note: "Holographic table: blue orbits and routes glowing on a dark surface.", mood: "holo" },
  { id: "de3d7d8d", work: "Jurassic World Rebirth", post: "home/2026/jurassic-world-rebirth", note: "Concentric rings and a spiral, glowing up through the table.", mood: "holo" },
  { id: "8e1bbc97", work: "Jurassic World Rebirth", post: "home/2026/jurassic-world-rebirth", note: "Contour lines and range rings, a hand reaching across the table.", mood: "holo" },
  { id: "83d441a3", work: "Jurassic World Rebirth", post: "home/2026/jurassic-world-rebirth", note: "Same table with objects sitting on it: data as a physical surface.", mood: "holo" },
  { id: "7fc549d3", work: "Jurassic World Rebirth", post: "home/2026/jurassic-world-rebirth", note: "Amber blocks on an old CRT. Warm instead of blue.", mood: "glow" },
  { id: "196c9092", work: "The Silent Sea", post: "home/2025/the-silent-sea", note: "Radar dial: rings, ticks and a glowing centre.", mood: "radial" },
  { id: "e4e17463", work: "The Silent Sea", post: "home/2025/the-silent-sea", note: "Another view of the same dial.", mood: "radial" },
  { id: "3520e892", work: "The Silent Sea", post: "home/2025/the-silent-sea", note: "Chunky glowing chevrons. Pure graphic, almost no data.", mood: "glow" },
  { id: "53f669ff", work: "Andor S2", post: "home/2026/andor-s2", note: "Red outline shapes glowing in a dark cockpit.", mood: "glow" },
  { id: "e8e08dc3", work: "Andor S2", post: "home/2026/andor-s2", note: "Red brackets closing on a target.", mood: "glow" },
  { id: "1aed8905", work: "Andor S2", post: "home/2026/andor-s2", note: "Binocular view: two lenses, thin readouts along the rim.", mood: "radial" },
  { id: "2564fb83", work: "Andor S2", post: "home/2026/andor-s2", note: "A red radial disc set into a white console.", mood: "radial" },
  { id: "89029089", work: "Andor S2", post: "home/2026/andor-s2", note: "Maze of fine lines inside a frame, one accent colour.", mood: "wire" },
  { id: "ebf9791d", work: "Alien: Romulus", post: "home/2025/alien-romulus", note: "Constellation of points joined by lines on a dim screen.", mood: "wire" },
  { id: "0fcc132a", work: "Alien: Romulus", post: "home/2025/alien-romulus", note: "Wireframe globe on a CRT.", mood: "wire" },
  { id: "c0a6351b", work: "Alien: Romulus", post: "home/2025/alien-romulus", note: "Yellow wireframe in perspective on an orange bezel.", mood: "wire" },
  { id: "08a28c84", work: "Silo", post: "home/2025/silo-ui", note: "A ring of lit dots on a glass tablet. One shape, one meaning.", mood: "radial" },
  { id: "50e62060", work: "Silo", post: "home/2025/silo-ui", note: "One big number in a frame: 364 days. The whole screen is the number.", mood: "glow" },
];

const MOODS: Array<[Mood | "all", string]> = [
  ["all", "All"],
  ["radial", "Rings and radar"],
  ["holo", "Holo table"],
  ["wire", "Wireframe and line"],
  ["glow", "Glow and colour"],
];

export function VizRefs() {
  const [mood, setMood] = useState<Mood | "all">("all");
  const [open, setOpen] = useState<Ref | null>(null);
  const shown = mood === "all" ? REFS : REFS.filter((r) => r.mood === mood);

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-8 max-w-[720px]">
          <p className="font-mono text-[11px] tracking-[0.14em] text-white/50 uppercase">Dev lab / draft</p>
          <h1 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight">Viz references</h1>
          <p className="mt-3 text-sm text-white/60">
            Screen graphics from film and anime where the look does the work. Clips via HUDS+GUIS, for study only. Click one to enlarge.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap gap-1" role="group" aria-label="Filter by look">
          {MOODS.map(([key, text]) => (
            <button key={key} type="button" aria-pressed={mood === key} onClick={() => setMood(key)} className={`min-h-9 rounded-full border px-4 text-xs transition-colors ${mood === key ? "border-white bg-white text-black" : "border-white/20 text-white/60 hover:text-white"}`}>
              {text}
            </button>
          ))}
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-[20px] border border-white/10">
              <button type="button" onClick={() => setOpen(r)} className="block aspect-video w-full bg-black" aria-label={`Enlarge ${r.work}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/dev/viz-refs/${r.id}.gif`} alt={r.note} loading="lazy" className="h-full w-full object-cover" />
              </button>
              <div className="flex items-start justify-between gap-4 p-4">
                <p className="text-sm leading-snug text-white/70">{r.note}</p>
                <a href={HG + r.post} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-[11px] text-white/45 hover:text-white">
                  {r.work}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.work} onClick={() => setOpen(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/dev/viz-refs/${open.id}.gif`} alt={open.note} className="max-h-[90vh] max-w-full rounded-[12px] object-contain" />
        </div>
      )}
    </main>
  );
}
