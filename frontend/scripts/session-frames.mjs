#!/usr/bin/env node
// Reads a recording made with the in-app Record button (a .webm video and its .json log) and prepares it to be looked at:
// a timeline of everything that was done, and for every click, marker, route change, error or failed request a sheet of
// four frames (a moment before, at, a moment after and a second after), so what happened between actions is visible.
//
//   node scripts/session-frames.mjs                      newest recording in ~/Downloads
//   node scripts/session-frames.mjs path/to/session.json
//   node scripts/session-frames.mjs <json> --range 12.0 15.0 [--fps 6]    a dense strip of frames over a stretch
//
// Needs ffmpeg on the PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.indexOf(name);
const range = flag("--range") >= 0 ? [Number(args[flag("--range") + 1]), Number(args[flag("--range") + 2])] : null;
const fps = flag("--fps") >= 0 ? Number(args[flag("--fps") + 1]) : 6;
let jsonPath = args.find((arg) => arg.endsWith(".json"));
const videoArg = args.find((arg) => /\.(webm|mp4)$/.test(arg));
if (!jsonPath && videoArg) {
  // Given the video: use its log if it sits beside it, otherwise look at the video alone.
  const sibling = videoArg.replace(/\.(webm|mp4)$/, ".json");
  if (existsSync(sibling)) jsonPath = sibling;
}

if (!jsonPath && !videoArg) {
  const downloads = join(homedir(), "Downloads");
  const newest = readdirSync(downloads)
    .filter((name) => /^eregion-session-.*\.json$/.test(name))
    .map((name) => ({ name, time: statSync(join(downloads, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time)[0];
  if (!newest) {
    console.error("No eregion-session-*.json found in ~/Downloads. Record one with the Record button (Cmd/Ctrl+Shift+R).");
    process.exit(1);
  }
  jsonPath = join(downloads, newest.name);
}

// A recording file made by the Record button carries its log after the video: log, 8 bytes of length, then ERSLOG01.
let bundled = null;
if (!jsonPath && videoArg && existsSync(videoArg)) {
  const bytes = readFileSync(videoArg);
  if (bytes.length > 16 && bytes.subarray(bytes.length - 8).toString("latin1") === "ERSLOG01") {
    const length = Number(bytes.readBigUInt64LE(bytes.length - 16));
    const start = bytes.length - 16 - length;
    bundled = { session: JSON.parse(bytes.subarray(start, bytes.length - 16).toString("utf8")), video: bytes.subarray(0, start) };
  }
}
const videoOnly = !jsonPath && videoArg && !bundled;
const session = bundled ? bundled.session : videoOnly ? { events: [], video: {} } : JSON.parse(readFileSync(jsonPath, "utf8"));
if (videoOnly || bundled) jsonPath = videoArg;
const out = join(tmpdir(), basename(jsonPath).replace(/\.(json|webm|mp4)$/, ""));
mkdirSync(out, { recursive: true });
let videoPath = videoOnly ? videoArg : join(dirname(jsonPath), session.video?.file ?? basename(jsonPath).replace(/\.json$/, ".webm"));
if (bundled) {
  // The video without the log on its end.
  videoPath = join(out, `video${extname(videoArg)}`);
  writeFileSync(videoPath, bundled.video);
}
if (!existsSync(videoPath)) {
  console.error(`The video ${videoPath} is missing next to the log.`);
  process.exit(1);
}

const clock = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${(ms / 1000 % 60).toFixed(2).padStart(5, "0")}`;
const short = (target) =>
  target ? `${target.tag}${target.label ? ` [${target.label}]` : ""}${target.text ? ` "${target.text}"` : ""}${target.expanded ? ` expanded=${target.expanded}` : ""}${target.pressed ? ` pressed=${target.pressed}` : ""}${target.disabled ? " DISABLED" : ""}  (${target.path})` : "";

const line = (event) => {
  switch (event.type) {
    case "start": return `start on ${event.url}, scrolled ${event.scrollY}px`;
    case "click": return `click at ${event.x},${event.y} on ${short(event.target)}`;
    case "key": return `key ${event.meta ? "Cmd+" : ""}${event.ctrl ? "Ctrl+" : ""}${event.shift ? "Shift+" : ""}${event.key}${event.in ? " (in a field)" : ""}`;
    case "scroll": return `scroll to ${event.y}px`;
    case "route": return `route ${event.url} (${event.via})`;
    case "marker": return `MARKER: ${event.note}`;
    case "error": return `ERROR: ${event.message} ${event.source ?? ""}`;
    case "console": return `console.${event.level}: ${event.message}`;
    case "request": return `request ${event.method} ${event.url} -> ${event.failed ? `FAILED ${event.failed}` : `${event.status} in ${event.ms}ms`}`;
    case "resize": return `resize ${event.width}x${event.height}`;
    default: return JSON.stringify(event);
  }
};

const ffmpeg = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: ["ignore", "ignore", "inherit"] });
const frame = (seconds, file) => ffmpeg("-i", videoPath, "-ss", String(Math.max(0, seconds)), "-frames:v", "1", "-vf", "scale=800:-2", file);

// Sheets of frames, twelve to a sheet, left to right and top to bottom. Used for a stretch of the video, or for the whole video when there is no log.
function strips(dir, from, to, rate) {
  mkdirSync(dir, { recursive: true });
  const window = to === undefined ? [] : ["-ss", String(from), "-t", String(to - from)];
  ffmpeg("-i", videoPath, ...window, "-vf", `fps=${rate},scale=640:-2`, join(dir, "f%03d.png"));
  const count = readdirSync(dir).filter((name) => /^f\d+\.png$/.test(name)).length;
  const files = [];
  for (let start = 0; start < count; start += 12) {
    const file = join(dir, `strip-${String(start / 12 + 1).padStart(2, "0")}.png`);
    ffmpeg("-start_number", String(start + 1), "-i", join(dir, "f%03d.png"), "-frames:v", "1", "-vf", "tile=3x4", file);
    files.push(file);
  }
  const base = from ?? 0;
  files.forEach((file, i) => console.log(`${file}   frames at ${(base + (i * 12) / rate).toFixed(2)}s to ${(base + Math.min(count, i * 12 + 12) / rate).toFixed(2)}s, ${(1 / rate).toFixed(2)}s apart`));
  return count;
}

if (range) {
  const [from, to] = range;
  const count = strips(join(out, `range-${from}-${to}`), from, to, fps);
  console.log(`${count} frames at ${fps} per second from ${from}s to ${to}s.`);
  process.exit(0);
}
if (videoOnly) {
  console.log("No log beside this video, so here it is as one frame per second. Look at a stretch more closely with --range <from> <to> [--fps 8].\n");
  const count = strips(join(out, "overview"), undefined, undefined, 1);
  console.log(`${count} seconds in all.`);
  process.exit(0);
}

const events = session.events;
const lines = events.map((event) => `${clock(event.t)}  ${line(event)}`);
writeFileSync(join(out, "timeline.txt"), lines.join("\n") + "\n");

// The moments worth a look. Events within 350ms of each other share one sheet.
const interesting = (event) =>
  ["click", "marker", "route", "error"].includes(event.type) ||
  (event.type === "console" && event.level === "error") ||
  (event.type === "request" && (event.failed || event.status >= 400)) ||
  (event.type === "key" && ["Escape", "Enter", "[", "]"].includes(event.key));
const moments = [];
for (const event of events.filter(interesting)) {
  const last = moments.at(-1);
  if (last && event.t - last.t < 350) last.events.push(event);
  else moments.push({ t: event.t, events: [event] });
}
const picked = moments.length > 24 ? moments.filter((_, i) => i % Math.ceil(moments.length / 24) === 0) : moments;

console.log(`Recording: ${basename(jsonPath)}   video ${session.video?.width ?? "?"}x${session.video?.height ?? "?"}   viewport ${session.viewport?.width}x${session.viewport?.height}   page ${session.url}`);
console.log(`Timeline of ${events.length} events: ${join(out, "timeline.txt")}\n`);
picked.forEach((moment, index) => {
  const seconds = moment.t / 1000;
  const parts = [];
  [-0.3, 0, 0.4, 1.0].forEach((offset, i) => {
    const file = join(out, `m${String(index + 1).padStart(2, "0")}-${i}.png`);
    try {
      frame(seconds + offset, file);
    } catch {
      // Past the end of the video.
    }
    // Past the end there is no frame, so the sheet repeats the last one it has.
    parts.push(existsSync(file) ? file : parts.at(-1));
  });
  const sheet = join(out, `moment-${String(index + 1).padStart(2, "0")}.png`);
  ffmpeg(...parts.flatMap((file) => ["-i", file]), "-filter_complex", "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack", sheet);
  console.log(`#${index + 1} at ${clock(moment.t)}: ${moment.events.map(line).join("  |  ")}`);
  console.log(`   sheet (top left -0.3s, top right 0s, bottom left +0.4s, bottom right +1.0s): ${sheet}`);
});
if (picked.length < moments.length) console.log(`\n(${moments.length - picked.length} more moments skipped, see timeline.txt. Use --range for a stretch.)`);
console.log(`\nEverything is in ${out}`);
