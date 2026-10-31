"use client";

import { Chord, Ribbon } from "@visx/chord";
import { curveBasis } from "@visx/curve";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { Area } from "@visx/shape";
import { voronoi } from "@visx/voronoi";
import { useMemo, type ReactNode } from "react";
import { COMPOSITION } from "../stats/mock";
import { aggregate, CARDS, ROLE_HUES, ROLE_ORDER, type Aggregate } from "./mock";

const HUE = (role: string) => ROLE_HUES[role] ?? 250;
const MANA_HUE: Record<string, number> = { W: 95, U: 245, B: 305, R: 28, G: 150 };

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 p-5 text-[#f1f3ff]" style={{ background: "#0c0d12" }}>
      <p className="text-[18px] leading-none font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 mb-2 text-[11px]" style={{ color: "#9aa1c9" }}>
        {sub}
      </p>
      <div className="h-[300px] w-full">{children}</div>
    </div>
  );
}

/** visx: a ridgeline — every version's curve at one scale, stacked and overlapping. */
export function RidgelinePanel({ play }: { play: { current: number } }) {
  const agg = useMemo<Aggregate[]>(aggregate, []);
  const W = 540;
  const H = 380;
  const pad = 34;
  const maxC = Math.max(...agg.flatMap((entry) => entry.curve), 1);
  const rowH = (H - pad * 2) / agg.length;
  const x = scaleLinear({ domain: [0, 7], range: [pad, W - pad] });
  const current = Math.max(0, Math.min(agg.length - 1, Math.round(play.current)));
  return (
    <Panel title="Ridgeline" sub="visx @visx/shape: the curve of every version stacked; the playhead's row lifts.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Ridgeline of every version's mana curve">
        <Group>
          {agg.map((entry, i) => {
            const base = pad + i * rowH + rowH * 0.95;
            const yScale = scaleLinear({ domain: [0, maxC], range: [0, rowH * 2.6] });
            const hue = 205 + (i / agg.length) * 55;
            const live = i === current;
            return (
              <Area
                key={i}
                data={entry.curve}
                x={(_, j) => x(j as number)}
                y0={() => base}
                y1={(d) => base - yScale(d as number)}
                curve={curveBasis}
                fill={`oklch(0.66 0.13 ${hue} / ${live ? 0.75 : 0.42})`}
                stroke={`oklch(0.82 0.12 ${hue} / ${live ? 1 : 0.7})`}
                strokeWidth={live ? 1.6 : 1}
              />
            );
          })}
        </Group>
      </svg>
    </Panel>
  );
}

/** visx: a Voronoi tessellation of the deck's cards, placed by role (angle) and mana value (radius). */
export function VoronoiPanel() {
  const W = 540;
  const H = 300;
  type Pt = { role: string; x: number; y: number };
  const data = useMemo<Pt[]>(
    () =>
      CARDS.map((card) => {
        const roleIndex = ROLE_ORDER.indexOf(card.role);
        const angle = -Math.PI / 2 + (Math.max(0, roleIndex) / ROLE_ORDER.length) * Math.PI * 2;
        const r = 40 + Math.min(card.cmc, 8) * 16;
        return { role: card.role, x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r };
      }),
    [W, H],
  );
  const layout = useMemo(() => voronoi<Pt>({ width: W, height: H, x: (d) => d.x, y: (d) => d.y }), [W, H]);
  const cells = layout.polygons(data) as Array<Array<[number, number]>>;
  return (
    <Panel title="Voronoi" sub="visx @visx/voronoi: the cards tessellated by role and mana value; area shows the space each claims.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Voronoi of the deck's cards">
        <Group>
          {cells.map((poly, i) =>
            poly ? (
              <path
                key={i}
                d={`M${poly.map(([px, py]) => `${px},${py}`).join("L")}Z`}
                fill={`oklch(0.7 0.14 ${HUE(data[i].role)} / 0.14)`}
                stroke="rgba(127,212,255,0.28)"
                strokeWidth={0.75}
              />
            ) : null,
          )}
          {data.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={3} fill={`oklch(0.78 0.16 ${HUE(d.role)})`} />
          ))}
        </Group>
      </svg>
    </Panel>
  );
}

/** visx: a chord diagram of the colour pips and sources. */
export function ChordPanel() {
  const W = 540;
  const H = 300;
  const colors = ["W", "U", "B", "R", "G"];
  const matrix = useMemo(
    () =>
      colors.map((ci, i) =>
        colors.map((cj, j) =>
          i === j ? (COMPOSITION.sources[ci] ?? 0) + (COMPOSITION.pips[ci] ?? 0) : Math.round(((COMPOSITION.pips[ci] ?? 0) + (COMPOSITION.pips[cj] ?? 0)) / 5),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const R = Math.min(W, H) / 2 - 40;
  return (
    <Panel title="Chord" sub="visx @visx/chord: how the five colours feed one another in the costs and the sources.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Chord diagram of the deck's colours">
        <Group top={H / 2} left={W / 2}>
          <Chord matrix={matrix} padAngle={0.06}>
            {({ chords }) => (
              <g>
                {chords.map((chord, i) => (
                  <Ribbon key={i} chord={chord} radius={R} fill={`oklch(0.7 0.15 ${MANA_HUE[colors[chord.source.index % 5]]} / 0.5)`} stroke="rgba(127,212,255,0.3)" strokeWidth={0.6} />
                ))}
              </g>
            )}
          </Chord>
        </Group>
      </svg>
    </Panel>
  );
}

/** visx: a radar of the deck's shape at the current version. */
export function RadarPanel({ version }: { version: number }) {
  const agg = useMemo<Aggregate[]>(aggregate, []);
  const W = 540;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2;
  const R = 108;
  const metrics = useMemo(() => {
    const a = agg[Math.max(0, Math.min(agg.length - 1, version))];
    const norm = (v: number, m: number) => Math.min(1, v / m);
    return [
      { key: "Ramp", value: norm(a.roles["Ramp"] ?? 0, 8) },
      { key: "Draw", value: norm(a.roles["Card Draw"] ?? 0, 10) },
      { key: "Removal", value: norm(a.roles["Removal"] ?? 0, 10) },
      { key: "Wipes", value: norm(a.roles["Board Wipe"] ?? 0, 4) },
      { key: "Lands", value: norm(a.types["Land"] ?? 0, 38) },
      { key: "Low curve", value: norm(a.curve.slice(0, 4).reduce((s, v) => s + v, 0), 40) },
    ];
  }, [agg, version]);
  const n = metrics.length;
  const rScale = scaleLinear({ domain: [0, 1], range: [0, R] });
  const angle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const points = metrics.map((m, i) => ({ x: cx + Math.sin(angle(i)) * rScale(m.value), y: cy - Math.cos(angle(i)) * rScale(m.value) }));
  return (
    <Panel title="Radar" sub="visx @visx/scale: the deck's shape at the current version, drawn as a six-spoke star.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Radar of the deck's shape">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <circle key={t} cx={cx} cy={cy} r={R * t} fill="none" stroke="rgba(160,170,255,0.12)" />
        ))}
        {metrics.map((m, i) => (
          <g key={m.key}>
            <line x1={cx} y1={cy} x2={cx + Math.sin(angle(i)) * R} y2={cy - Math.cos(angle(i)) * R} stroke="rgba(160,170,255,0.12)" />
            <text x={cx + Math.sin(angle(i)) * (R + 18)} y={cy - Math.cos(angle(i)) * (R + 18)} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontFamily="var(--font-mono)" fill="#9aa1c9">
              {m.key}
            </text>
          </g>
        ))}
        <path d={`M${points.map((p) => `${p.x},${p.y}`).join("L")}Z`} fill="oklch(0.7 0.15 235 / 0.4)" stroke="#7fd4ff" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#7fd4ff" />
        ))}
      </svg>
    </Panel>
  );
}
