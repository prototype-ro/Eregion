"use client";

import { DotsThree, GitBranch, Lock, PencilSimpleLine } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { BS, ButtonCss, type StyleId } from "./ButtonStyles";

type Tier = "plain" | "tiered" | "glass";

/** Which style each kind of button gets, in each of the three ways of dressing the same page. The companion is the style that sits next to glass. */
const pickFor = (tier: Tier, c: StyleId) => {
  const base = tier === "glass" ? "glass" : c;
  const glassy = tier === "plain" ? c : "glass";
  return { header: glassy, floating: glassy, primary: base, secondary: base, quiet: base, row: base, danger: base } as Record<"header" | "floating" | "primary" | "secondary" | "quiet" | "row" | "danger", StyleId>;
};

const CARDS = ["Sol Ring", "Arcane Signet", "Blood Artist", "Falkenrath Noble"];

/** One deck page in miniature, with every button styled by its tier. Counts the glass layers it ends up with. */
export function Mock({ tier, companion }: { tier: Tier; companion: StyleId }) {
  const pick = pickFor(tier, companion);
  const root = useRef<HTMLDivElement>(null);
  const [glass, setGlass] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setGlass(root.current?.querySelectorAll("[data-s=glass]").length ?? 0);
    setTotal(root.current?.querySelectorAll(".bs").length ?? 0);
  }, [tier, companion]);
  return (
    <div>
      <div ref={root} className="relative overflow-hidden rounded-card border border-line bg-bg pb-24">
        {/* The header: the title over the art, with the three pills sitting on it. */}
        <div className="relative px-5 pt-5 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/nobg-knight.png" alt="" aria-hidden="true" className="pointer-events-none absolute top-0 left-[34%] h-[300px] w-auto max-w-none opacity-80" />
          <div className="relative flex flex-wrap gap-2">
            <BS s={pick.header} v="secondary" icon={<span className="font-mono text-xs">v4</span>}>Version</BS>
            <BS s={pick.header} v="secondary" icon={<Lock size={13} aria-hidden />}>Private</BS>
            <BS s={pick.header} v="secondary" icon={<PencilSimpleLine size={13} aria-hidden />}>Add description</BS>
          </div>
          <p className="relative mt-4 font-display text-[52px] leading-[0.92]">Edgar&apos;s Blood Court</p>
          <p className="relative mt-2 text-xs text-muted">Commander | Legal | budget</p>
        </div>

        {/* The Versions panel: a faint strand and the footer actions. */}
        <div className="relative mx-5 rounded-card border border-line bg-surface/70 px-4 py-4">
          <p className="mb-2 text-sm font-medium">Versions</p>
          <div className="relative my-3 h-10">
            <span className="absolute top-1/2 left-2 h-[2px] w-[70%] -translate-y-1/2 bg-gradient-to-r from-[#38d6ff] to-[#9b6bff] opacity-80" />
            {[10, 32, 54, 76].map((x) => (
              <span key={x} className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-ink bg-bg" style={{ left: `${x}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <BS s={pick.secondary} v="secondary" disabled>Save</BS>
            <BS s={pick.primary} v="primary">Save new version</BS>
            <BS s={pick.secondary} v="secondary" icon={<GitBranch size={13} aria-hidden />}>Branch off</BS>
            <BS s={pick.secondary} v="secondary">Compare</BS>
            <BS s={pick.quiet} v="quiet">More</BS>
          </div>
        </div>

        {/* The board: a toolbar and a few card rows, each with its own small menu button. */}
        <div className="mx-5 mt-4 flex flex-wrap items-center gap-2">
          <BS s={pick.secondary} v="secondary">Type</BS>
          <BS s={pick.secondary} v="secondary">Name</BS>
          <BS s={pick.secondary} v="secondary">List</BS>
          <BS s={pick.quiet} v="quiet">Import list</BS>
        </div>
        <ul className="mx-5 mt-3 divide-y divide-line border-y border-line">
          {CARDS.map((name) => (
            <li key={name} className="flex items-center justify-between py-1.5 text-sm">
              <span>{name}</span>
              <BS s={pick.row} v="quiet" compact ariaLabel={`Actions for ${name}`}>
                <DotsThree size={18} weight="bold" aria-hidden />
              </BS>
            </li>
          ))}
        </ul>

        {/* The save bar that floats at the bottom when there is a draft. */}
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-[28px] border border-line bg-bg/70 p-2 pl-4">
          <span className="min-w-0 flex-1 truncate text-xs text-muted">Note (optional)</span>
          <BS s={pick.floating} v="secondary">Save</BS>
          <BS s={pick.primary} v="primary">Save new version</BS>
        </div>
      </div>
      <p className="mt-3 font-mono text-xs text-muted">
        {total} buttons, <span className={glass > 8 ? "text-danger" : "text-ink"}>{glass}</span> with a backdrop blur
      </p>
    </div>
  );
}

const TITLES: Array<[Tier, string, string]> = [
  ["plain", "All companion", "Every button uses the chosen companion style. Nothing blurs."],
  ["tiered", "Tiered", "Glass only for the header pills and the floating bar, which sit on the art. The rest uses the companion, and the main action is its solid one."],
  ["glass", "All glass", "Every button is glass. This is what it costs."],
];

const COMPANIONS: Array<[StyleId, string]> = [["fill", "Fill rise"], ["satin", "Satin"], ["matte", "Matte"], ["tonal", "Tonal"], ["hairline", "Hairline"], ["edge", "Lit edge"]];

export function TierCompare() {
  const [companion, setCompanion] = useState<StyleId>("satin");
  return (
    <div>
      <ButtonCss />
      <p className="mb-2 text-sm text-muted">The style that sits next to glass:</p>
      <div className="mb-8 flex flex-wrap gap-2">
        {COMPANIONS.map(([id, name]) => (
          <button key={id} type="button" aria-pressed={companion === id} onClick={() => setCompanion(id)} className={`min-h-9 rounded-full border px-4 text-[13px] transition-colors ${companion === id ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
            {name}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-8 xl:grid-cols-3">
        {TITLES.map(([tier, title, note]) => (
          <div key={tier}>
            <p className="text-lg font-medium">{title}</p>
            <p className="mt-1 mb-4 min-h-[3em] text-[13px] text-muted">{note}</p>
            <Mock tier={tier} companion={companion} />
          </div>
        ))}
      </div>
    </div>
  );
}
