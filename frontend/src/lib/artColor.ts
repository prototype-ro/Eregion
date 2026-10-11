/**
 * The colour of a commander's art, for the glow of the version timeline. Not the average, which is nearly always a muddy
 * brown or grey: the hue that most of the saturated, mid-bright pixels share, shown at a fixed brightness so it reads on a dark panel.
 */

const BINS = 36;
export const DEFAULT_STRAND = "#38d6ff";

/** The strongest hue (0 to 359) among the pixels of an RGBA image, or null when it has too little colour to tell. */
export function dominantHue(data: ArrayLike<number>): { hue: number; strength: number } | null {
  const bins = new Array<number>(BINS).fill(0);
  let counted = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), saturation = max === 0 ? 0 : (max - min) / max;
    // Near-black, near-white and grey pixels say nothing about the colour of the art.
    if (max < 0.18 || saturation < 0.22) continue;
    let hue = max === min ? 0 : max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    hue = (hue * 60 + 360) % 360;
    bins[Math.floor(hue / (360 / BINS)) % BINS] += saturation * saturation * (1 - Math.abs(max - 0.7));
    counted++;
  }
  const total = bins.reduce((a, b) => a + b, 0);
  // Fewer than 2% of the pixels carrying any colour: black and white art, or nearly so.
  if (total <= 0 || counted < (data.length / 4) * 0.02) return null;
  // Each bin is judged together with its neighbours, so a hue split across two bins still wins over a lone narrow one.
  const smooth = bins.map((_, i) => bins[(i + BINS - 1) % BINS] * 0.5 + bins[i] + bins[(i + 1) % BINS] * 0.5);
  const best = smooth.indexOf(Math.max(...smooth));
  const strength = smooth[best] / total;
  // No hue stands out: the art is a spread of many colours, so it has no colour of its own to give.
  if (strength < 0.2) return null;
  return { hue: best * (360 / BINS) + 360 / BINS / 2, strength };
}

export const strandColorOf = (hue: number) => `hsl(${Math.round(hue)} 95% 60%)`;

const KEY = "eregion-art-hue:v1:";
const memory = new Map<string, Promise<number | null>>();

/**
 * The hue for one piece of art, worked out once and then remembered in this tab and in local storage.
 * Costs a few milliseconds of work and, since the page already shows this art, usually no download.
 * Resolves to null for anything that cannot be read, in which case the caller keeps its default.
 */
export function artHue(url: string | null | undefined): Promise<number | null> {
  if (!url || typeof window === "undefined") return Promise.resolve(null);
  const cached = memory.get(url);
  if (cached) return cached;
  const job = (async () => {
    try {
      const stored = localStorage.getItem(KEY + url);
      if (stored !== null) return stored === "none" ? null : Number(stored);
    } catch {
      // Storage can be blocked. Work it out instead.
    }
    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) return null;
      // Decoded and shrunk to 64 by 64 in one step, so reading it costs next to nothing.
      const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: 64, resizeHeight: 64, resizeQuality: "low" });
      const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(64, 64) : Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
      const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!context) return null;
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const found = dominantHue(context.getImageData(0, 0, 64, 64).data);
      try {
        localStorage.setItem(KEY + url, found ? String(Math.round(found.hue)) : "none");
      } catch {
        // Not remembered, worked out again next time.
      }
      return found ? found.hue : null;
    } catch {
      return null;
    }
  })();
  memory.set(url, job);
  return job;
}
