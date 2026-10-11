"use client";

import { Check, GitBranch, Plus } from "@phosphor-icons/react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Nine ways the same four buttons could look and move. Each is real, live CSS, so it can be hovered, pressed and tabbed to.
 * They share one geometry (a pill, 36px, 13px text) and only differ in their colour treatment and how they respond.
 */

export type StyleId = "fill" | "spot" | "sheen" | "ink" | "magnet" | "ring" | "glass" | "neon" | "spring" | "satin" | "matte" | "tonal" | "hairline" | "edge";
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export const STYLES: Array<{ id: StyleId; name: string; note: string; cost: "light" | "medium" | "heavy"; costNote: string }> = [
  { id: "fill", name: "Fill rise", note: "The current look: on hover the colour rises from the bottom edge and the text flips.", cost: "light", costNote: "Only a transform moves." },
  { id: "spot", name: "Spotlight", note: "A soft light follows the pointer across the button, like a torch.", cost: "medium", costNote: "A gradient is repainted as the pointer moves." },
  { id: "sheen", name: "Sheen", note: "A band of light sweeps across once on hover, like a polished surface.", cost: "light", costNote: "Only a transform moves." },
  { id: "ink", name: "Ink spread", note: "The fill spreads from the exact point the pointer entered, and retreats to where it left.", cost: "medium", costNote: "A clip-path is animated." },
  { id: "magnet", name: "Magnet", note: "The button drifts toward the pointer and the label moves a little more, so it seems to lean in.", cost: "light", costNote: "Transform only, set from the pointer." },
  { id: "ring", name: "Glow ring", note: "The border lights up with a slowly turning colour ring and a soft halo.", cost: "heavy", costNote: "A masked, animated gradient and a shadow." },
  { id: "glass", name: "Glass", note: "Frosted, translucent and lit along the top edge, like the three buttons in the deck header.", cost: "heavy", costNote: "Backdrop blur. Costly if there are many, or if what is behind it is animating." },
  { id: "neon", name: "Neon edge", note: "A coloured edge and text with a glow, in the same language as the version strands.", cost: "medium", costNote: "A shadow is animated." },
  { id: "satin", name: "Satin", note: "Glass without the blur: a faint white tint, a hairline edge and a line of light along the top. Hover brightens it.", cost: "light", costNote: "Only colours and a shadow change." },
  { id: "matte", name: "Matte", note: "Solid and opaque, a step lighter than the panel, with a fine top highlight. Reads as a physical key.", cost: "light", costNote: "Only colours change." },
  { id: "tonal", name: "Tonal", note: "Tinted with the accent: a washed blue fill and edge, so secondary buttons belong to the primary.", cost: "light", costNote: "Only colours change." },
  { id: "hairline", name: "Hairline", note: "Nothing but a thin edge. Hover fades a soft wash in. The quietest of them.", cost: "light", costNote: "Only colours change." },
  { id: "edge", name: "Lit edge", note: "A gradient border, bright at the top and fading toward the bottom, like a lit bevel.", cost: "light", costNote: "Only colours and a shadow change." },
  { id: "spring", name: "Spring press", note: "Hover lifts it a touch. Pressing squashes it and letting go springs it back past its size.", cost: "light", costNote: "Only a transform moves." },
];

const CSS = `
.bs{--k:1;position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;border-radius:999px;min-height:36px;padding:0 16px;font:inherit;font-size:13px;font-weight:500;line-height:1;cursor:pointer;background:var(--b0);color:var(--fg);border:1px solid var(--bd);outline-offset:2px;transition:color calc(.2s*var(--k)),background-color calc(.2s*var(--k)),border-color calc(.2s*var(--k)),box-shadow calc(.3s*var(--k)),transform calc(.2s*var(--k)),opacity calc(.2s*var(--k)),filter calc(.2s*var(--k))}
@media (pointer:coarse){.bs{min-height:44px;font-size:15px;padding:0 20px}}
.bs:focus-visible{outline:2px solid var(--accent-text)}
.bs:disabled{opacity:.4;pointer-events:none}
.bs>span{position:relative;z-index:2;display:inline-flex;align-items:center;gap:8px;transition:transform calc(.35s*var(--k)) cubic-bezier(.2,.8,.2,1)}
.bs::before,.bs::after{content:"";position:absolute;pointer-events:none;border-radius:inherit}
.bs[data-v=primary]{--b0:var(--accent);--fg:var(--on-accent);--bd:transparent;--hi:rgba(255,255,255,.4);--tone:#5db1cf;--fillc:color-mix(in srgb,var(--accent) 70%,#fff 30%);--fgh:var(--on-accent);font-weight:700}
.bs[data-v=secondary]{--b0:transparent;--fg:var(--text);--bd:var(--text);--hi:rgba(255,255,255,.16);--tone:var(--text);--fillc:var(--text);--fgh:var(--bg)}
.bs[data-v=quiet]{--b0:transparent;--fg:var(--muted);--bd:transparent;--hi:rgba(255,255,255,.1);--tone:var(--text);--fillc:rgba(255,255,255,.09);--fgh:var(--text)}
.bs[data-v=danger]{--b0:transparent;--fg:var(--danger);--bd:var(--danger-line);--hi:color-mix(in srgb,var(--danger) 28%,transparent);--tone:var(--danger);--fillc:color-mix(in srgb,var(--danger) 16%,transparent);--fgh:var(--danger)}

/* fill rise */
.bs[data-s=fill]::before{inset:0;z-index:0;background:var(--fillc);transform:scaleY(0);transform-origin:50% 100%;transition:transform calc(.38s*var(--k)) cubic-bezier(.16,1,.3,1)}
.bs[data-s=fill]:hover::before{transform:scaleY(1)}
.bs[data-s=fill]:hover{color:var(--fgh)}
.bs[data-s=fill]:active{transform:translateY(1px) scale(.98)}

/* spotlight */
.bs[data-s=spot]::before{inset:0;z-index:0;opacity:0;background:radial-gradient(90px circle at var(--mx,50%) var(--my,50%),var(--hi),transparent 70%);transition:opacity calc(.25s*var(--k))}
.bs[data-s=spot]:hover::before{opacity:1}
.bs[data-s=spot]:hover{border-color:var(--tone)}
.bs[data-s=spot][data-v=primary]:hover{border-color:transparent;filter:brightness(1.08)}
.bs[data-s=spot]:hover{color:var(--tone)}
.bs[data-s=spot][data-v=primary]:hover{color:var(--on-accent)}
.bs[data-s=spot]:active{transform:scale(.98)}

/* sheen */
.bs[data-s=sheen]::after{top:0;bottom:0;left:0;width:55%;z-index:1;background:linear-gradient(105deg,transparent,var(--hi),transparent);transform:translateX(-140%) skewX(-18deg)}
.bs[data-s=sheen]:hover::after{transform:translateX(260%) skewX(-18deg);transition:transform calc(.75s*var(--k)) cubic-bezier(.2,.8,.2,1)}
.bs[data-s=sheen]:hover{filter:brightness(1.1)}
.bs[data-s=sheen][data-v=secondary]:hover{border-color:#fff}
.bs[data-s=sheen]:active{transform:scale(.97)}

/* ink spread */
.bs[data-s=ink]::before{inset:0;z-index:0;background:var(--fillc);clip-path:circle(0% at var(--mx,50%) var(--my,50%));transition:clip-path calc(.55s*var(--k)) cubic-bezier(.2,.8,.2,1)}
.bs[data-s=ink]:hover::before{clip-path:circle(150% at var(--mx,50%) var(--my,50%))}
.bs[data-s=ink]:hover{color:var(--fgh)}
.bs[data-s=ink]:active{transform:scale(.97)}

/* magnet */
.bs[data-s=magnet]{transition:transform calc(.4s*var(--k)) cubic-bezier(.2,.8,.2,1),color calc(.2s*var(--k)),background-color calc(.2s*var(--k)),border-color calc(.2s*var(--k)),filter calc(.2s*var(--k))}
.bs[data-s=magnet]:hover{border-color:var(--tone)}
.bs[data-s=magnet][data-v=primary]:hover{filter:brightness(1.12)}
.bs[data-s=magnet][data-v=secondary]:hover{background:rgba(255,255,255,.07)}
.bs[data-s=magnet][data-v=quiet]:hover{background:rgba(255,255,255,.07);color:var(--text)}
.bs[data-s=magnet][data-v=danger]:hover{background:color-mix(in srgb,var(--danger) 12%,transparent)}
.bs[data-s=magnet]:active{filter:brightness(.92)}

/* glow ring */
@property --a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes bs-spin{to{--a:360deg}}
.bs[data-s=ring]{overflow:visible}
.bs[data-s=ring]::before{inset:-1px;z-index:0;padding:1px;background:conic-gradient(from var(--a),var(--tone),#9b6bff,#ff4fd8,#ffb02e,var(--tone));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);mask-composite:exclude;opacity:0;transition:opacity calc(.3s*var(--k))}
.bs[data-s=ring]:hover::before,.bs[data-s=ring]:focus-visible::before{opacity:1;animation:bs-spin calc(2.6s*var(--k)) linear infinite}
.bs[data-s=ring]:hover{box-shadow:0 0 22px -6px var(--tone)}
.bs[data-s=ring]:active{transform:scale(.98)}

/* glass */
.bs[data-s=glass]{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.26);color:var(--text);-webkit-backdrop-filter:blur(14px) saturate(1.7);backdrop-filter:blur(14px) saturate(1.7);box-shadow:inset 0 1px 0 rgba(255,255,255,.38),0 8px 28px rgba(0,0,0,.22)}
.bs[data-s=glass][data-v=primary]{background:color-mix(in srgb,var(--accent) 55%,transparent);color:#fff}
.bs[data-s=glass][data-v=quiet]{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14);color:var(--muted)}
.bs[data-s=glass][data-v=danger]{background:color-mix(in srgb,var(--danger) 14%,rgba(255,255,255,.04));border-color:color-mix(in srgb,var(--danger) 45%,transparent)}
.bs[data-s=glass]:hover{background:rgba(255,255,255,.16);transform:scale(1.03)}
.bs[data-s=glass][data-v=primary]:hover{background:color-mix(in srgb,var(--accent) 75%,transparent)}
.bs[data-s=glass]:active{transform:scale(.98)}

/* neon edge */
.bs[data-s=neon]{background:transparent;border-color:var(--tone);color:var(--tone);text-shadow:0 0 8px color-mix(in srgb,var(--tone) 55%,transparent);box-shadow:inset 0 0 10px -5px var(--tone)}
.bs[data-s=neon][data-v=primary]{background:color-mix(in srgb,#5db1cf 20%,transparent);color:#d8f3ff;border-color:#5db1cf;--tone:#5db1cf}
.bs[data-s=neon][data-v=quiet]{border-color:transparent;box-shadow:none;color:var(--muted);text-shadow:none}
.bs[data-s=neon]:hover{box-shadow:0 0 20px -2px var(--tone),inset 0 0 14px -4px var(--tone)}
.bs[data-s=neon][data-v=quiet]:hover{color:var(--text);text-shadow:0 0 10px rgba(255,255,255,.5)}
.bs[data-s=neon]:active{transform:scale(.97)}

/* satin: glass without the blur */
.bs[data-s=satin]{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.15);color:var(--text);box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 1px 2px rgba(0,0,0,.35)}
.bs[data-s=satin][data-v=primary]{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 84%,#fff 16%),var(--accent));border-color:rgba(255,255,255,.2);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 8px 20px -10px var(--accent)}
.bs[data-s=satin][data-v=quiet]{background:transparent;border-color:transparent;color:var(--muted);box-shadow:none}
.bs[data-s=satin][data-v=danger]{background:color-mix(in srgb,var(--danger) 9%,transparent);border-color:color-mix(in srgb,var(--danger) 38%,transparent);color:var(--danger);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--danger) 22%,transparent)}
.bs[data-s=satin]:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.3)}
.bs[data-s=satin][data-v=primary]:hover{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 74%,#fff 26%),color-mix(in srgb,var(--accent) 92%,#fff 8%));border-color:rgba(255,255,255,.3)}
.bs[data-s=satin][data-v=quiet]:hover{background:rgba(255,255,255,.07);color:var(--text)}
.bs[data-s=satin][data-v=danger]:hover{background:color-mix(in srgb,var(--danger) 17%,transparent);border-color:color-mix(in srgb,var(--danger) 60%,transparent)}
.bs[data-s=satin]:active{transform:scale(.98);box-shadow:inset 0 1px 3px rgba(0,0,0,.4)}

/* matte: solid keys */
.bs[data-s=matte]{background:color-mix(in srgb,var(--text) 8%,var(--bg));border-color:color-mix(in srgb,var(--text) 15%,var(--bg));color:var(--text);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 1px 2px rgba(0,0,0,.5)}
.bs[data-s=matte][data-v=primary]{background:var(--accent);border-color:color-mix(in srgb,var(--accent) 70%,#fff 30%);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(0,0,0,.5)}
.bs[data-s=matte][data-v=quiet]{background:transparent;border-color:transparent;color:var(--muted);box-shadow:none}
.bs[data-s=matte][data-v=danger]{background:color-mix(in srgb,var(--danger) 14%,var(--bg));border-color:color-mix(in srgb,var(--danger) 34%,var(--bg));color:var(--danger)}
.bs[data-s=matte]:hover{background:color-mix(in srgb,var(--text) 13%,var(--bg));border-color:color-mix(in srgb,var(--text) 26%,var(--bg))}
.bs[data-s=matte][data-v=primary]:hover{background:color-mix(in srgb,var(--accent) 86%,#fff 14%)}
.bs[data-s=matte][data-v=quiet]:hover{background:color-mix(in srgb,var(--text) 8%,transparent);color:var(--text)}
.bs[data-s=matte][data-v=danger]:hover{background:color-mix(in srgb,var(--danger) 22%,var(--bg))}
.bs[data-s=matte]:active{transform:translateY(1px);box-shadow:inset 0 1px 3px rgba(0,0,0,.5)}

/* tonal: tinted with the accent */
.bs[data-s=tonal]{background:color-mix(in srgb,#5db1cf 13%,transparent);border-color:color-mix(in srgb,#5db1cf 36%,transparent);color:#9ed4ea}
.bs[data-s=tonal][data-v=primary]{background:var(--accent);border-color:transparent;color:#fff}
.bs[data-s=tonal][data-v=quiet]{background:transparent;border-color:transparent;color:var(--muted)}
.bs[data-s=tonal][data-v=danger]{background:color-mix(in srgb,var(--danger) 12%,transparent);border-color:color-mix(in srgb,var(--danger) 36%,transparent);color:var(--danger)}
.bs[data-s=tonal]:hover{background:color-mix(in srgb,#5db1cf 22%,transparent);border-color:color-mix(in srgb,#5db1cf 60%,transparent);color:#cfeaf5}
.bs[data-s=tonal][data-v=primary]:hover{background:color-mix(in srgb,var(--accent) 82%,#fff 18%);border-color:transparent;color:#fff}
.bs[data-s=tonal][data-v=quiet]:hover{background:color-mix(in srgb,#5db1cf 10%,transparent);color:var(--text);border-color:transparent}
.bs[data-s=tonal][data-v=danger]:hover{background:color-mix(in srgb,var(--danger) 22%,transparent);border-color:color-mix(in srgb,var(--danger) 60%,transparent)}
.bs[data-s=tonal]:active{transform:scale(.98)}

/* hairline: just an edge */
.bs[data-s=hairline]{background:transparent;border-color:rgba(255,255,255,.24);color:var(--text)}
.bs[data-s=hairline][data-v=primary]{background:var(--accent);border-color:transparent;color:#fff}
.bs[data-s=hairline][data-v=quiet]{border-color:transparent;color:var(--muted)}
.bs[data-s=hairline][data-v=danger]{border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)}
.bs[data-s=hairline]:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.42)}
.bs[data-s=hairline][data-v=primary]:hover{background:color-mix(in srgb,var(--accent) 84%,#fff 16%)}
.bs[data-s=hairline][data-v=quiet]:hover{background:rgba(255,255,255,.06);color:var(--text)}
.bs[data-s=hairline][data-v=danger]:hover{background:color-mix(in srgb,var(--danger) 12%,transparent)}
.bs[data-s=hairline]:active{transform:scale(.98)}

/* lit edge: a gradient border */
.bs[data-s=edge]{--f:color-mix(in srgb,var(--text) 5%,var(--bg));background:linear-gradient(var(--f),var(--f)) padding-box,linear-gradient(180deg,rgba(255,255,255,.46),rgba(255,255,255,.06)) border-box;border:1px solid transparent;color:var(--text)}
.bs[data-s=edge][data-v=primary]{--f:var(--accent);background:linear-gradient(var(--f),var(--f)) padding-box,linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.08)) border-box;color:#fff}
.bs[data-s=edge][data-v=quiet]{background:transparent;border-color:transparent;color:var(--muted)}
.bs[data-s=edge][data-v=danger]{--f:color-mix(in srgb,var(--danger) 8%,var(--bg));background:linear-gradient(var(--f),var(--f)) padding-box,linear-gradient(180deg,color-mix(in srgb,var(--danger) 70%,transparent),color-mix(in srgb,var(--danger) 10%,transparent)) border-box;color:var(--danger)}
.bs[data-s=edge]:hover{filter:brightness(1.22);box-shadow:0 6px 20px -10px rgba(255,255,255,.35)}
.bs[data-s=edge][data-v=quiet]:hover{filter:none;box-shadow:none;background:rgba(255,255,255,.06);color:var(--text)}
.bs[data-s=edge]:active{transform:scale(.98);filter:brightness(1)}

/* spring press */
.bs[data-s=spring]{transition:transform calc(.5s*var(--k)) cubic-bezier(.34,1.56,.64,1),background-color calc(.2s*var(--k)),color calc(.2s*var(--k)),border-color calc(.2s*var(--k))}
.bs[data-s=spring]:hover{transform:translateY(-1px) scale(1.04)}
.bs[data-s=spring][data-v=primary]:hover{background:color-mix(in srgb,var(--accent) 80%,#fff 20%)}
.bs[data-s=spring][data-v=secondary]:hover{background:rgba(255,255,255,.08)}
.bs[data-s=spring][data-v=quiet]:hover{background:rgba(255,255,255,.08);color:var(--text)}
.bs[data-s=spring][data-v=danger]:hover{background:color-mix(in srgb,var(--danger) 12%,transparent)}
.bs[data-s=spring]:active{transform:scale(.9);transition-duration:.1s}

@media (prefers-reduced-motion:reduce){.bs,.bs>span,.bs::before,.bs::after{transition-duration:.01s!important;animation:none!important}}
`;

/** The styles for every button here. Rendered once by any page that uses them. */
export function ButtonCss() {
  return <style>{CSS}</style>;
}

/** The shared pointer behaviour: some styles follow the pointer, and the magnet leans toward it. */
export function BS({ s, v = "secondary", children, disabled, pressed, icon, onClick, k = 1, compact, ariaLabel }: { s: StyleId; v?: ButtonVariant; children?: ReactNode; disabled?: boolean; pressed?: boolean; icon?: ReactNode; onClick?: () => void; k?: number; /** A square button for one icon. */ compact?: boolean; ariaLabel?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  const track = (event: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el || event.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    if (s === "spot" || s === "ink") {
      el.style.setProperty("--mx", `${event.clientX - r.left}px`);
      el.style.setProperty("--my", `${event.clientY - r.top}px`);
    }
    if (s === "magnet") {
      const dx = Math.max(-1, Math.min(1, (event.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (event.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      el.style.transform = `translate(${dx * 5}px, ${dy * 3}px)`;
      if (label.current) label.current.style.transform = `translate(${dx * 3}px, ${dy * 2}px)`;
    }
  };
  const leave = (event: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    if (s === "ink") track(event); // retreat toward where the pointer left
    if (s === "magnet") {
      el.style.transform = "";
      if (label.current) label.current.style.transform = "";
    }
  };
  return (
    <button ref={ref} type="button" data-s={s} data-v={v} disabled={disabled} aria-pressed={pressed} onClick={onClick} onPointerEnter={track} onPointerMove={track} onPointerLeave={leave} aria-label={ariaLabel} className="bs" style={{ "--k": k, ...(compact ? { padding: 0, width: 36, minWidth: 36 } : null) } as CSSProperties}>
      <span ref={label}>
        {icon}
        {children}
      </span>
    </button>
  );
}

const COST_STYLE = { light: "border-add-line text-add-text", medium: "border-line text-muted", heavy: "border-danger-line text-danger" } as const;

/** A backdrop for the tiles: dark, with some colour and the knight behind, so glass and glow have something to show against. */
const STAGE: CSSProperties = {
  background: "radial-gradient(420px 220px at 85% 30%, rgba(155,107,255,.16), transparent 70%), radial-gradient(360px 200px at 12% 90%, rgba(56,214,255,.1), transparent 70%), var(--surface)",
};

function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-card border border-line ${className}`} style={STAGE}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/art/nobg-knight.png" alt="" aria-hidden="true" className="pointer-events-none absolute right-2 -bottom-6 h-[210px] w-auto max-w-none opacity-35" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function ButtonStyles() {
  const [picked, setPicked] = useState<StyleId>("fill");
  const [speed, setSpeed] = useState(1);
  const [on, setOn] = useState(false);
  const s = picked;
  return (
    <div>
      <style>{CSS}</style>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-3 text-muted">
          Animation speed
          <input type="range" min="0.5" max="2.2" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-40 accent-[var(--accent-text)]" aria-label="Animation speed" />
          <span className="w-10 font-mono text-xs text-ink">{speed < 1 ? "faster" : speed > 1 ? "slower" : "normal"}</span>
        </label>
        <p className="text-muted">Hover, press and tab to each one. Every set has a primary, a secondary, a quiet, a danger and a disabled button.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {STYLES.map((st) => (
          <Stage key={st.id} className="p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-medium">{st.name}</p>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${COST_STYLE[st.cost]}`} title={st.costNote}>{st.cost}</span>
            </div>
            <p className="mt-1 min-h-[3.2em] text-[13px] text-muted">{st.note}</p>
            <p className="mt-1 text-xs text-muted/70">{st.costNote}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <BS s={st.id} v="primary" k={speed}>Save new version</BS>
              <BS s={st.id} v="secondary" k={speed}>Branch off</BS>
              <BS s={st.id} v="quiet" k={speed}>More</BS>
              <BS s={st.id} v="danger" k={speed}>Delete</BS>
              <BS s={st.id} v="secondary" k={speed} disabled>Save</BS>
            </div>
            <button type="button" onClick={() => setPicked(st.id)} className="mt-5 text-[13px] text-accent-text underline underline-offset-4">Try it in the app</button>
          </Stage>
        ))}
      </div>

      <h3 className="mt-14 text-2xl font-medium">Try {STYLES.find((x) => x.id === s)?.name.toLowerCase()} in the app</h3>
      <p className="mt-1 text-sm text-muted">The same style on every button in four real places. Pick another with the chips.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {STYLES.map((st) => (
          <button key={st.id} type="button" aria-pressed={picked === st.id} onClick={() => setPicked(st.id)} className={`min-h-9 rounded-full border px-4 text-[13px] transition-colors ${picked === st.id ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
            {st.name}
          </button>
        ))}
      </div>
      <Stage className="mt-5 p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-card border border-line bg-bg/40 px-5 py-4">
            <p className="mb-3 text-lg font-medium">Versions</p>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
              <BS s={s} v="secondary" k={speed} disabled>Save</BS>
              <BS s={s} v="primary" k={speed}>Save new version</BS>
              <BS s={s} v="secondary" k={speed} pressed={on} onClick={() => setOn((v) => !v)} icon={<GitBranch size={14} aria-hidden />}>Branch off</BS>
              <BS s={s} v="secondary" k={speed}>Compare</BS>
              <BS s={s} v="quiet" k={speed}>More</BS>
            </div>
          </div>
          <div className="rounded-card border border-line bg-bg/40 px-5 py-4">
            <p className="mb-3 text-lg font-medium">Decks</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <BS s={s} v="primary" k={speed} icon={<Plus size={14} weight="bold" aria-hidden />}>New deck</BS>
              <BS s={s} v="secondary" k={speed}>Import a list</BS>
              <BS s={s} v="quiet" k={speed}>Filters</BS>
            </div>
          </div>
          <div className="rounded-card border border-line bg-bg/60 p-5">
            <p className="font-display text-3xl leading-none">Delete v4?</p>
            <p className="mt-2 text-sm text-muted">Versions that grew from it will grow from v3 instead.</p>
            <div className="mt-4 flex gap-2.5">
              <BS s={s} v="danger" k={speed}>Delete v4</BS>
              <BS s={s} v="quiet" k={speed}>Keep it</BS>
            </div>
          </div>
          <div className="rounded-card border border-line bg-bg/40 px-5 py-4">
            <p className="mb-3 text-lg font-medium">Done states</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <BS s={s} v="primary" k={speed} icon={<Check size={14} weight="bold" aria-hidden />}>Saved</BS>
              <BS s={s} v="secondary" k={speed} disabled>Compare</BS>
              <BS s={s} v="primary" k={speed} disabled>Save new version</BS>
            </div>
          </div>
        </div>
      </Stage>
    </div>
  );
}
