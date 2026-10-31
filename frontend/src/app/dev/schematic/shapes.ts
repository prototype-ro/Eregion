import type { Role } from "./mock";

/**
 * Outline shapes for the schematic, drawn in a 400 x 260 space. Each part is one closed path tied to a
 * deck role, or to the commander ("core"). Parts are listed back to front: later parts cover earlier ones.
 */

export interface Part {
  role: Role | "core";
  d: string;
  /** Where an inside label goes when the middle of the part is covered by other parts. */
  labelAt?: [number, number];
  /** The part is too small for a name: an inside label shows only the count. */
  small?: boolean;
}

export interface Shape {
  key: ShapeKey;
  name: string;
  parts: Part[];
  /** Thin lines that are only decoration (teeth, rims, guides). */
  details?: string[];
}

export type ShapeKey = "ship" | "card" | "shield" | "ring" | "hive" | "spire" | "gem" | "stars";

type Pt = [number, number];

const f = (n: number) => +n.toFixed(1);
const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")} Z`;
const line = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")}`;
const polar = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

/** A band of an annulus between two angles (degrees, clockwise from 3 o'clock). */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${f(x0)} ${f(y0)} A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [400 - x, y]);

/* ---------------------------------------------------------------- ship: the Andor cockpit screen */

function ship(): Shape {
  const bands = [0, 0.36, 0.64, 1];
  const wing = (t0: number, t1: number): Pt[] => [
    [30, 10 + 240 * t0],
    [110, 62 + 136 * t0],
    [110, 62 + 136 * t1],
    [30, 10 + 240 * t1],
  ];
  const left: Role[] = ["lands", "ramp", "draw"];
  const right: Role[] = ["removal", "wipes", "protection"];
  const parts: Part[] = [];
  left.forEach((role, i) => parts.push({ role, d: poly(wing(bands[i], bands[i + 1])) }));
  right.forEach((role, i) => parts.push({ role, d: poly(mirror(wing(bands[i], bands[i + 1]))) }));
  parts.push({ role: "wincons", d: poly([[110, 122], [166, 122], [166, 138], [110, 138]]) });
  parts.push({ role: "wincons", d: poly([[234, 122], [290, 122], [290, 138], [234, 138]]) });
  parts.push({ role: "core", d: poly([0, 60, 120, 180, 240, 300].map((a) => polar(200, 130, 40, a))) });
  const teeth: string[] = [];
  for (let i = 1; i < 12; i++) {
    const y = 10 + (240 * i) / 12;
    teeth.push(line([[30, y], [38, y + 3]]), line([[370, y], [362, y + 3]]));
  }
  return { key: "ship", name: "Ship", parts, details: [...teeth, circle(200, 130, 18)] };
}

/* ---------------------------------------------------------------- card: a Magic card frame */

function card(): Shape {
  const frame = `${rr(130, 25, 140, 210, 10)} ${rr(138, 33, 124, 194, 4)}`;
  return {
    key: "card",
    name: "Card",
    parts: [
      { role: "lands", d: frame, labelAt: [200, 232] },
      { role: "core", d: rr(142, 37, 116, 16, 3) },
      { role: "wincons", d: rr(142, 57, 116, 74, 2) },
      { role: "protection", d: rr(142, 135, 116, 14, 3) },
      { role: "ramp", d: rr(142, 153, 116, 21, 2) },
      { role: "draw", d: rr(142, 177, 116, 21, 2) },
      { role: "removal", d: rr(142, 201, 86, 21, 2) },
      { role: "wipes", d: rr(232, 203, 26, 19, 3), small: true },
    ],
    details: [line([[150, 45], [200, 45]]), circle(250, 45, 3), circle(242, 45, 3)],
  };
}

/* ---------------------------------------------------------------- shield: heraldic, quartered */

function shield(): Shape {
  return {
    key: "shield",
    name: "Shield",
    parts: [
      { role: "ramp", d: poly([[120, 20], [173, 20], [173, 58], [120, 58]]) },
      { role: "wincons", d: poly([[173, 20], [227, 20], [227, 58], [173, 58]]) },
      { role: "draw", d: poly([[227, 20], [280, 20], [280, 58], [227, 58]]) },
      { role: "lands", d: poly([[120, 62], [198, 62], [198, 138], [120, 138]]) },
      { role: "removal", d: poly([[202, 62], [280, 62], [280, 138], [202, 138]]) },
      { role: "protection", d: poly([[120, 142], [198, 142], [198, 240], [120, 160]]) },
      { role: "wipes", d: poly([[202, 142], [280, 142], [280, 160], [202, 240]]) },
      { role: "core", d: circle(200, 140, 26) },
    ],
    details: [line([[110, 14], [290, 14], [290, 164], [200, 252], [110, 164], [110, 14]])],
  };
}

/* ---------------------------------------------------------------- ring: a radar dial */

function ring(): Shape {
  const roles: Role[] = ["lands", "ramp", "draw", "removal", "wipes", "protection", "wincons"];
  const step = 360 / roles.length;
  const parts: Part[] = roles.map((role, i) => ({ role, d: sector(200, 132, 58, 100, -90 + i * step + 2, -90 + (i + 1) * step - 2) }));
  parts.push({ role: "core", d: circle(200, 132, 40) });
  const ticks: string[] = [];
  for (let i = 0; i < 72; i++) {
    const a = i * 5;
    ticks.push(line([polar(200, 132, 110, a), polar(200, 132, i % 6 === 0 ? 120 : 114, a)]));
  }
  return { key: "ring", name: "Radar", parts, details: [circle(200, 132, 110), ...ticks] };
}

/* ---------------------------------------------------------------- hive: hexagon cells */

function hive(): Shape {
  const r = 31;
  const hex = (cx: number, cy: number) => poly([30, 90, 150, 210, 270, 330].map((a) => polar(cx, cy, r - 2, a)));
  const step = Math.sqrt(3) * r;
  const at = (deg: number, dist = step): Pt => polar(185, 130, dist, deg);
  const cells: Array<[Role, Pt]> = [
    ["lands", at(180)],
    ["ramp", at(240)],
    ["draw", at(300)],
    ["removal", at(0)],
    ["wipes", at(60)],
    ["protection", at(120)],
    ["wincons", at(0, step * 2)],
  ];
  return { key: "hive", name: "Hive", parts: [...cells.map(([role, [x, y]]) => ({ role, d: hex(x, y) })), { role: "core", d: hex(185, 130) }] };
}

/* ---------------------------------------------------------------- spire: exploded isometric layers */

function spire(): Shape {
  const order: Role[] = ["lands", "ramp", "draw", "removal", "wipes", "protection", "wincons"];
  const parts: Part[] = order.map((role, i) => {
    const cy = 236 - i * 30;
    return { role, d: poly([[200, cy - 17], [320, cy], [200, cy + 17], [80, cy]]) };
  });
  parts.push({ role: "core", d: poly([[200, 14], [236, 26], [200, 38], [164, 26]]) });
  return { key: "spire", name: "Layers", parts, details: [line([[200, 38], [200, 236]]), line([[80, 56], [80, 236]]), line([[320, 56], [320, 236]])] };
}

/* ---------------------------------------------------------------- gem: a cut stone */

function gem(): Shape {
  const xs = [110, 146, 182, 218, 254, 290];
  const pav: Role[] = ["lands", "ramp", "draw", "removal", "wipes"];
  return {
    key: "gem",
    name: "Gem",
    parts: [
      { role: "wincons", d: poly([[110, 108], [160, 50], [178, 108]]) },
      { role: "protection", d: poly([[240, 50], [290, 108], [222, 108]]) },
      ...pav.map((role, i) => ({ role, d: poly([[xs[i], 112], [xs[i + 1], 112], [200, 246]]) })),
      { role: "core", d: poly([[160, 50], [240, 50], [222, 108], [178, 108]]) },
    ],
  };
}

/* ---------------------------------------------------------------- stars: seven points, as on the banner of Elendil */

function stars(): Shape {
  const roles: Role[] = ["wincons", "removal", "wipes", "protection", "lands", "ramp", "draw"];
  const n = 7;
  const step = 360 / n;
  const inner = (k: number) => polar(200, 136, 36, -90 + (k - 0.5) * step);
  const parts: Part[] = roles.map((role, k) => ({ role, d: poly([inner(k), polar(200, 136, 112, -90 + k * step), inner(k + 1)]) }));
  parts.push({ role: "core", d: poly(Array.from({ length: n }, (_, k) => inner(k))) });
  return { key: "stars", name: "Seven stars", parts, details: [circle(200, 136, 122)] };
}

export const SHAPES: Shape[] = [ship(), card(), shield(), ring(), hive(), spire(), gem(), stars()];
export const SHAPE_BY_KEY = Object.fromEntries(SHAPES.map((s) => [s.key, s])) as Record<ShapeKey, Shape>;
