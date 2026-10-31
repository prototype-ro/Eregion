"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ROLES, type MockDeck, type Role } from "./mock";
import { SHAPE_BY_KEY, type ShapeKey } from "./shapes";

export interface Look {
  shape: ShapeKey;
  hue: number;
  chroma: number;
  tickHue: number;
  weight: number;
  glow: number;
  glowStrength: number;
  fill: "solid" | "hatch" | "dots" | "edge";
  fillAmount: number;
  level: "binary" | "level" | "opacity";
  empty: "dim" | "dashed" | "warn";
  labels: "off" | "inline" | "callouts";
  ticks: "cards" | "bars" | "off";
  frame: boolean;
  details: boolean;
  fringe: boolean;
  scanlines: boolean;
  vignette: boolean;
  flicker: boolean;
  ground: "black" | "navy" | "smoke";
}

const W = 560;
const H = 340;
const OX = 80;
const OY = 50;
const MONO = "var(--font-mono), ui-monospace, monospace";

const GROUND: Record<Look["ground"], string> = {
  black: "#020203",
  navy: "radial-gradient(120% 90% at 50% 40%, #0b1424, #03060c)",
  smoke: "radial-gradient(110% 90% at 50% 45%, #1a1416, #050404)",
};

type Box = { x: number; y: number; width: number; height: number };

/** How full a role is, 0 to 1, against its target. The commander core is always full. */
function fullness(deck: MockDeck, role: Role | "core") {
  if (role === "core") return 1;
  const target = ROLES.find((r) => r.key === role)!.target;
  return Math.min(1, deck.counts[role] / target);
}

export function Schematic({
  look,
  deck,
  compact = false,
}: {
  look: Look;
  deck: MockDeck;
  compact?: boolean;
}) {
  const shape = SHAPE_BY_KEY[look.shape];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const refs = useRef<Array<SVGPathElement | null>>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);

  useLayoutEffect(() => {
    setBoxes(
      refs.current.map((el) =>
        el ? el.getBBox() : { x: 0, y: 0, width: 0, height: 0 },
      ),
    );
  }, [look.shape]);

  const main = `oklch(0.7 ${look.chroma} ${look.hue})`;
  const hot = `oklch(0.93 ${look.chroma * 0.35} ${look.hue})`;
  const tick = `oklch(0.8 ${look.chroma === 0 ? 0 : 0.12} ${look.tickHue})`;
  const amber = "oklch(0.82 0.15 80)";
  const warn = "oklch(0.8 0.16 80)";

  const lit = (role: Role | "core") => fullness(deck, role) >= 1;

  const fillPaint =
    look.fill === "hatch"
      ? `url(#hatch${uid})`
      : look.fill === "dots"
        ? `url(#dots${uid})`
        : main;

  /* one callout per role, at the first part that carries it */
  const seen = new Set<string>();
  const anchors = shape.parts
    .map((p, i) => ({ role: p.role, box: boxes[i], at: p.labelAt, small: p.small }))
    .filter(
      (a) => a.box && a.box.width > 0 && !seen.has(a.role) && seen.add(a.role),
    );

  return (
    <div
      className={`relative overflow-hidden ${compact ? "rounded-[14px]" : "rounded-[22px]"}`}
      style={{ background: GROUND[look.ground] }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`block w-full ${look.flicker ? "schematic-flicker" : ""}`}
        role="img"
        aria-label={`${shape.name} schematic of ${deck.name}`}
      >
        <defs>
          <filter
            id={`glow${uid}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={look.glow}
              result="b"
            />
            <feComponentTransfer in="b" result="g">
              <feFuncA type="linear" slope={look.glowStrength * 2.2} />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern
            id={`hatch${uid}`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="5" stroke={main} strokeWidth="1.4" />
          </pattern>
          <pattern
            id={`dots${uid}`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2.5" cy="2.5" r="1" fill={main} />
          </pattern>
          {shape.parts.map((p, i) => {
            const b = boxes[i];
            if (!b) return null;
            const fr = fullness(deck, p.role);
            return (
              <clipPath key={i} id={`lv${uid}-${i}`}>
                <rect
                  x={b.x - 2}
                  y={b.y + b.height * (1 - fr)}
                  width={b.width + 4}
                  height={b.height * fr + 2}
                />
              </clipPath>
            );
          })}
        </defs>

        <g filter={look.glow > 0 ? `url(#glow${uid})` : undefined}>
          {look.ticks !== "off" && (
            <Ticks look={look} deck={deck} color={tick} under={amber} />
          )}

          {look.labels === "callouts" && (
            <Callouts
              layer="lines"
              anchors={anchors}
              deck={deck}
              main={main}
              hot={hot}
              lit={lit}
            />
          )}

          <g transform={`translate(${OX} ${OY})`}>
            {look.details &&
              shape.details?.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={main}
                  strokeOpacity={0.35}
                  strokeWidth={look.weight * 0.6}
                />
              ))}

            {shape.parts.map((p, i) => {
              const fr = fullness(deck, p.role);
              const on = lit(p.role);
              const show =
                look.fill !== "edge" && (look.level === "binary" ? on : fr > 0);
              const opacity =
                look.level === "opacity"
                  ? look.fillAmount * fr
                  : look.fillAmount;
              const stroke = on
                ? p.role === "core"
                  ? hot
                  : main
                : look.empty === "warn"
                  ? warn
                  : main;
              return (
                <g key={i}>
                  {/* the background colour under each part, so nearer parts cover farther ones */}
                  <path d={p.d} fill="#030304" fillRule="evenodd" />
                  {show && (
                    <path
                      d={p.d}
                      fillRule="evenodd"
                      fill={fillPaint}
                      fillOpacity={
                        look.fill === "solid"
                          ? opacity
                          : Math.min(1, opacity * 2)
                      }
                      clipPath={
                        look.level === "level"
                          ? `url(#lv${uid}-${i})`
                          : undefined
                      }
                    />
                  )}
                  <path
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    d={p.d}
                    fill="none"
                    fillRule="evenodd"
                    stroke={stroke}
                    strokeWidth={on ? look.weight : look.weight * 0.8}
                    strokeOpacity={on ? 1 : look.empty === "dim" ? 0.38 : 0.8}
                    strokeDasharray={
                      !on && look.empty === "dashed"
                        ? `${look.weight * 3} ${look.weight * 2.5}`
                        : undefined
                    }
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            {look.fringe &&
              shape.parts.map((p, i) => (
                <path
                  key={`f${i}`}
                  d={p.d}
                  fill="none"
                  fillRule="evenodd"
                  stroke="oklch(0.85 0.12 200)"
                  strokeOpacity={0.22}
                  strokeWidth={look.weight * 0.7}
                  transform="translate(1.2 0.6)"
                />
              ))}

            {look.labels === "inline" &&
              anchors.map((a) => (
                <text
                  key={a.role}
                  x={a.at ? a.at[0] : a.box.x + a.box.width / 2}
                  y={a.at ? a.at[1] : a.box.y + a.box.height / 2 + 3}
                  textAnchor="middle"
                  fontSize={a.role === "core" || a.at ? 7 : 8}
                  fontFamily={MONO}
                  fill={lit(a.role) ? hot : main}
                  fillOpacity={lit(a.role) ? 1 : 0.6}
                >
                  {a.small && a.role !== "core" ? `${deck.counts[a.role]}` : label(a.role, deck)}
                </text>
              ))}
          </g>

          {look.labels === "callouts" && (
            <Callouts
              layer="marks"
              anchors={anchors}
              deck={deck}
              main={main}
              hot={hot}
              lit={lit}
            />
          )}

          {look.frame && <Frame color={main} deck={deck} />}
        </g>
      </svg>
      {look.scanlines && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)",
          }}
        />
      )}
      {look.vignette && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.75))",
          }}
        />
      )}
    </div>
  );
}

function label(role: Role | "core", deck: MockDeck) {
  if (role === "core") return "CMDR";
  const r = ROLES.find((x) => x.key === role)!;
  return `${r.label} ${deck.counts[role]}/${r.target}`;
}

/** Leader lines go behind the shape (its parts cover them); dots and text go on top. */
function Callouts({
  layer,
  anchors,
  deck,
  main,
  hot,
  lit,
}: {
  layer: "lines" | "marks";
  anchors: Array<{ role: Role | "core"; box: Box }>;
  deck: MockDeck;
  main: string;
  hot: string;
  lit: (r: Role | "core") => boolean;
}) {
  const pts = anchors
    .filter((a) => a.role !== "core")
    .map((a) => ({
      role: a.role,
      x: a.box.x + a.box.width / 2 + OX,
      y: a.box.y + a.box.height / 2 + OY,
    }));
  const sides = [
    pts.filter((p) => p.x < W / 2),
    pts.filter((p) => p.x >= W / 2),
  ];
  return (
    <g fontFamily={MONO} fontSize="8.5">
      {sides.map((side, s) => {
        const sorted = [...side].sort((a, b) => a.y - b.y);
        let last = -Infinity;
        return sorted.map((p) => {
          const ty = Math.max(p.y, last + 20);
          last = ty;
          const tx = s === 0 ? 14 : W - 14;
          const elbow = s === 0 ? 74 : W - 74;
          const on = lit(p.role);
          const r = ROLES.find((x) => x.key === p.role)!;
          return (
            <g key={p.role}>
              {layer === "lines" ? (
                <path
                  d={`M${p.x} ${p.y} L${elbow} ${ty} L${tx + (s === 0 ? 60 : -60)} ${ty}`}
                  fill="none"
                  stroke={main}
                  strokeOpacity={0.45}
                  strokeWidth="0.6"
                />
              ) : (
                <>
                  <circle cx={p.x} cy={p.y} r="1.6" fill={on ? hot : main} />
                  <text
                    x={tx}
                    y={ty - 3}
                    textAnchor={s === 0 ? "start" : "end"}
                    fill={on ? hot : main}
                    fillOpacity={on ? 1 : 0.7}
                  >
                    {r.label}
                  </text>
                  <text
                    x={tx}
                    y={ty + 8}
                    textAnchor={s === 0 ? "start" : "end"}
                    fill={main}
                    fillOpacity={0.6}
                    fontSize="7.5"
                  >
                    {deck.counts[p.role as Role]}/{r.target}
                  </text>
                </>
              )}
            </g>
          );
        });
      })}
    </g>
  );
}

/** The mana curve as a row of ticks, one per card, grouped by mana value with an underline per group. */
function Ticks({
  look,
  deck,
  color,
  under,
}: {
  look: Look;
  deck: MockDeck;
  color: string;
  under: string;
}) {
  if (look.ticks === "bars") {
    const max = Math.max(...deck.curve, 1);
    const bw = 22;
    const gap = 8;
    const x0 = W / 2 - (deck.curve.length * (bw + gap) - gap) / 2;
    return (
      <g>
        {deck.curve.map((n, i) => {
          const rows = Math.round((n / max) * 7);
          return (
            <g key={i}>
              {Array.from({ length: rows }, (_, k) => (
                <rect
                  key={k}
                  x={x0 + i * (bw + gap)}
                  y={30 - k * 3.2}
                  width={bw}
                  height={1.8}
                  fill={color}
                />
              ))}
              <rect
                x={x0 + i * (bw + gap)}
                y={35}
                width={bw}
                height={1.4}
                fill={under}
              />
            </g>
          );
        })}
      </g>
    );
  }
  const tw = 2.2;
  const tg = 2;
  const gg = 8;
  const total =
    deck.curve.reduce((s, n) => s + n * (tw + tg) - (n ? tg : 0), 0) +
    gg * (deck.curve.length - 1);
  let x = W / 2 - total / 2;
  return (
    <g>
      {deck.curve.map((n, i) => {
        const start = x;
        const marks = Array.from({ length: n }, (_, k) => (
          <rect
            key={k}
            x={start + k * (tw + tg)}
            y={14}
            width={tw}
            height={16}
            fill={color}
          />
        ));
        const width = n * (tw + tg) - (n ? tg : 0);
        x += width + gg;
        return (
          <g key={i}>
            {marks}
            {n > 0 && (
              <rect x={start} y={34} width={width} height={1.6} fill={under} />
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Corner brackets and a readout, like the edge of a cockpit screen. */
function Frame({ color, deck }: { color: string; deck: MockDeck }) {
  const c = 14;
  const m = 8;
  const corners = [
    `M${m} ${m + c} V${m} H${m + c}`,
    `M${W - m - c} ${m} H${W - m} V${m + c}`,
    `M${m} ${H - m - c} V${H - m} H${m + c}`,
    `M${W - m - c} ${H - m} H${W - m} V${H - m - c}`,
  ];
  const total = Object.values(deck.counts).length
    ? deck.curve.reduce((a, b) => a + b, 0) + deck.counts.lands
    : 0;
  return (
    <g stroke={color} strokeOpacity={0.6} fill="none" strokeWidth="1">
      {corners.map((d) => (
        <path key={d} d={d} />
      ))}
      <path d={`M${W / 2 - 6} ${H - m} H${W / 2 + 6}`} />
      <text
        x={m + 4}
        y={H - m - 6}
        fontFamily={MONO}
        fontSize="8"
        fill={color}
        fillOpacity={0.75}
        stroke="none"
      >
        {deck.commander.toUpperCase()}
      </text>
      <text
        x={W - m - 4}
        y={H - m - 6}
        textAnchor="end"
        fontFamily={MONO}
        fontSize="8"
        fill={color}
        fillOpacity={0.75}
        stroke="none"
      >
        {`${total}/100 · B${deck.bracket}`}
      </text>
    </g>
  );
}
