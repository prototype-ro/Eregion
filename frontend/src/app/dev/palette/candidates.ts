/**
 * Palettes to compare with the current one on /dev/palette. To add one, add an entry here: the page does the rest.
 *
 * `tokens` uses the same names as the colour variables in globals.css, for the dark theme. Anything left out falls back to the
 * current palette. `from` says whether a value was taken from the reference or worked out to make the palette usable
 * (a dark accent cannot be text on black, so a lighter tint of it is derived). `extras` are colours that belong to the
 * palette but have no token yet.
 */
export interface Candidate {
  id: string;
  name: string;
  source: string;
  note: string;
  tokens: Record<string, { value: string; from: "reference" | "derived"; why?: string }>;
  /** The light theme. Left out when nobody has designed one yet, and the page then says so. */
  light?: Record<string, { value: string; from: "reference" | "derived"; why?: string }>;
  extras: Array<{ name: string; value: string; from: "reference" | "derived" }>;
}

export const CANDIDATES: Candidate[] = [
  {
    id: "oakfrogs",
    name: "Oakfrogs ornaments",
    source: "A set of medieval-fantasy ornaments (swords, unicorns, castles) on near-black, pasted 2026-10-11",
    note: "Muted and aged: sage and slate shapes on a cool near-black, with small accents of apricot, crimson and violet. Nothing is bright, and the signature is a foil-like sheen between teal-green and violet.",
    tokens: {
      bg: { value: "#0b0f10", from: "reference", why: "the background of the image, 63% of its pixels" },
      surface: { value: "#12171a", from: "derived", why: "the background a step lighter, toward the slate teals" },
      "surface-2": { value: "#1a2125", from: "derived", why: "two steps lighter" },
      text: { value: "#e8efea", from: "derived", why: "a sage-tinted off-white, lighter than the sage in the art" },
      muted: { value: "#8da39b", from: "reference", why: "the sage #86a29a, nudged lighter to clear 4.5:1" },
      accent: { value: "#435688", from: "reference", why: "the periwinkle, dark enough to carry a light label" },
      "accent-text": { value: "#a3b4e8", from: "derived", why: "the periwinkle at a lightness that reads as text on black" },
      "on-accent": { value: "#eef1f6", from: "derived" },
      danger: { value: "#e88a9b", from: "derived", why: "the crimson #883246 lifted until it reads as text on black" },
      "add-text": { value: "#97b5a5", from: "reference", why: "the light sage" },
    },
    light: {
      bg: { value: "#eef2ef", from: "derived", why: "a sage-tinted off-white, the dark ground inverted" },
      surface: { value: "#e2e8e4", from: "derived" },
      "surface-2": { value: "#d5ddd8", from: "derived" },
      text: { value: "#0b0f10", from: "reference", why: "the near-black of the art" },
      muted: { value: "#4a5c56", from: "derived", why: "the sage, darkened until it clears 4.5:1 on the raised panel" },
      accent: { value: "#435688", from: "reference", why: "the periwinkle, which already carries a light label" },
      "accent-text": { value: "#34457a", from: "derived", why: "the periwinkle darker, so it reads on the light ground" },
      "on-accent": { value: "#eef1f6", from: "derived" },
      danger: { value: "#a02c45", from: "derived", why: "the crimson #883246, a little brighter" },
      "add-text": { value: "#3f6354", from: "derived", why: "the sage, darkened" },
    },
    extras: [
      { name: "apricot", value: "#ca805b", from: "reference" },
      { name: "ochre", value: "#c48c5a", from: "reference" },
      { name: "crimson", value: "#883246", from: "reference" },
      { name: "rose", value: "#772950", from: "reference" },
      { name: "violet", value: "#524f89", from: "reference" },
      { name: "slate", value: "#4a565c", from: "reference" },
    ],
  },
  {
    id: "sonya",
    name: "Sonya Feola",
    source: "A brand sheet with blackletter type (PlianGermanica, GoBold, Anybody), pasted 2026-10-11. Printed codes #1D190F #8D3427 #DAA99A #8C753B #CCD6D5",
    note: "Warm and printed: a brown-black ground, brick red, dusty pink, olive gold and a pale blue-grey. The red is the accent here, which is a problem for us, because red already means danger.",
    tokens: {
      bg: { value: "#1d190f", from: "reference", why: "the black of the sheet" },
      surface: { value: "#272217", from: "derived", why: "the black a step lighter, toward olive" },
      "surface-2": { value: "#322c1f", from: "derived", why: "two steps lighter" },
      text: { value: "#ccd6d5", from: "reference", why: "the pale blue-grey, the sheet's own text colour on black" },
      muted: { value: "#9ba7a4", from: "derived", why: "the pale blue-grey, dimmer" },
      accent: { value: "#8d3427", from: "reference", why: "the brick red" },
      "accent-text": { value: "#daa99a", from: "reference", why: "the dusty pink, which already reads on the dark" },
      "on-accent": { value: "#ccd6d5", from: "reference", why: "the pink on the red is only about 4:1, the pale grey passes" },
      danger: { value: "#e57660", from: "derived", why: "a brighter red than the accent, so danger can be told from it. The reference has only one red" },
      "add-text": { value: "#b99d55", from: "derived", why: "the olive gold lifted until it clears 4.5:1" },
    },
    extras: [
      { name: "olive gold", value: "#8c753b", from: "reference" },
      { name: "brick", value: "#8d3427", from: "reference" },
      { name: "dusty pink", value: "#daa99a", from: "reference" },
      { name: "pale grey", value: "#ccd6d5", from: "reference" },
      { name: "black", value: "#1d190f", from: "reference" },
    ],
  },
  {
    id: "engie",
    name: "Engie, velvet blue",
    source: "A palette taken from an old portrait, Engie Designs, pasted 2026-10-11. Printed codes #B79F78 #5D6FA2 #334B8F #322B43 #1A071D",
    note: "Deep aubergine black with royal blues and a vintage gold, like velvet and pearls in a painting. The grounds are strongly purple. There is no red in the reference at all.",
    tokens: {
      bg: { value: "#1a071d", from: "reference", why: "Meski Black, a very dark aubergine" },
      surface: { value: "#25132c", from: "derived", why: "the black a step lighter" },
      "surface-2": { value: "#322b43", from: "reference", why: "Viola Black" },
      text: { value: "#f0e9dc", from: "derived", why: "a cream drawn from the vintage gold, lightened" },
      muted: { value: "#b79f78", from: "reference", why: "Vintage Gold, which reads on the dark" },
      accent: { value: "#334b8f", from: "reference", why: "Blue Highlight" },
      "accent-text": { value: "#93a3d8", from: "derived", why: "Splendour and Pride lifted, since the reference blue is 3.8:1 on this black" },
      "on-accent": { value: "#f0e9dc", from: "derived" },
      danger: { value: "#e88a9a", from: "derived", why: "the reference has no red, so a rose that suits the aubergine" },
      "add-text": { value: "#b79f78", from: "reference", why: "Vintage Gold" },
    },
    light: {
      bg: { value: "#f6f1e8", from: "derived", why: "a cream drawn from the vintage gold" },
      surface: { value: "#ebe3d6", from: "derived" },
      "surface-2": { value: "#ddd3c3", from: "derived" },
      text: { value: "#1a071d", from: "reference", why: "Meski Black" },
      muted: { value: "#5f4d2e", from: "derived", why: "the vintage gold, darkened until it reads on cream" },
      accent: { value: "#334b8f", from: "reference", why: "Blue Highlight" },
      "accent-text": { value: "#334b8f", from: "reference", why: "the same blue, which reads well on cream" },
      "on-accent": { value: "#f6f1e8", from: "derived" },
      danger: { value: "#9e2f4a", from: "derived", why: "the rose of the dark theme, darkened" },
      "add-text": { value: "#5f4d2e", from: "derived", why: "the gold, darkened" },
    },
    extras: [
      { name: "vintage gold", value: "#b79f78", from: "reference" },
      { name: "splendour", value: "#5d6fa2", from: "reference" },
      { name: "blue highlight", value: "#334b8f", from: "reference" },
      { name: "viola black", value: "#322b43", from: "reference" },
      { name: "meski black", value: "#1a071d", from: "reference" },
    ],
  },
  {
    id: "future",
    name: "Future Medieval",
    source: "A palette poster: fluorescent green, aged verdigris, blood crimson, enchanted olive. Printed codes #CFFF46 #26D6B1 #ECEADA #571E10 #1D301D",
    note: "Loud against dark: an acid lime and an aqua on a dark olive green, with a cream and a blood crimson. The most saturated of the four by far.",
    tokens: {
      bg: { value: "#101a10", from: "derived", why: "the olive green, darker, so there is room for panels above it" },
      surface: { value: "#1d301d", from: "reference", why: "the enchanted olive" },
      "surface-2": { value: "#284028", from: "derived", why: "the olive, a step lighter" },
      text: { value: "#eceada", from: "reference", why: "the cream" },
      muted: { value: "#a7b3a0", from: "derived", why: "the cream, dimmer and slightly green" },
      accent: { value: "#cfff46", from: "reference", why: "the fluorescent green" },
      "accent-text": { value: "#cfff46", from: "reference", why: "the same lime, which is very bright as text" },
      "on-accent": { value: "#1d301d", from: "reference", why: "the olive, for the label on the lime" },
      danger: { value: "#f27d62", from: "derived", why: "the blood crimson #571E10 is too dark to read, so lifted" },
      "add-text": { value: "#26d6b1", from: "reference", why: "the verdigris aqua" },
    },
    extras: [
      { name: "lime", value: "#cfff46", from: "reference" },
      { name: "verdigris", value: "#26d6b1", from: "reference" },
      { name: "cream", value: "#eceada", from: "reference" },
      { name: "crimson", value: "#571e10", from: "reference" },
      { name: "olive", value: "#1d301d", from: "reference" },
    ],
  },
];
