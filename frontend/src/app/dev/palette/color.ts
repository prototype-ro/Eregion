/** Small colour maths for the palette page: contrast, OKLCH and colour-blind views. Nothing here touches the DOM. */

export interface Rgba { r: number; g: number; b: number; a: number }

export function parse(value: string): Rgba {
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = v.match(/^hsla?\(\s*([\d.]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%(?:[ ,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const f = (n: number) => {
      const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4];
    return { r: f(0), g: f(8), b: f(4), a: alpha };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** The colour you see when fg, with its own transparency, is laid over an opaque bg. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const gam = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
const clamp = (x: number) => Math.max(0, Math.min(255, x));

export const luminance = (c: Rgba) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export function contrast(a: Rgba, b: Rgba): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const css = (c: Rgba) => `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}${c.a < 1 ? ` / ${c.a.toFixed(2)}` : ""})`;
export const hex = (c: Rgba) => "#" + [c.r, c.g, c.b].map((x) => Math.round(clamp(x)).toString(16).padStart(2, "0")).join("");

export function oklab(c: Rgba): [number, number, number] {
  const r = lin(c.r), g = lin(c.g), b = lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function oklch(c: Rgba): { l: number; c: number; h: number } {
  const [l, a, b] = oklab(c);
  const chroma = Math.hypot(a, b);
  return { l, c: chroma, h: chroma < 0.004 ? 0 : (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}
/** How different two colours look, as a distance in OKLab. Under about 0.02 is hard to tell apart. */
export function distance(a: Rgba, b: Rgba): number {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// How the colours look to someone with a form of colour blindness (Machado et al., full severity), worked out in linear light.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
} as const;
export type Vision = keyof typeof CVD;
export const VISIONS = Object.keys(CVD) as Vision[];
export function simulate(c: Rgba, vision: Vision): Rgba {
  const m = CVD[vision], v = [lin(c.r), lin(c.g), lin(c.b)];
  const out = m.map((row) => Math.max(0, Math.min(1, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
  return { r: gam(out[0]), g: gam(out[1]), b: gam(out[2]), a: c.a };
}
