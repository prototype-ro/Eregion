"use client";

import { useEffect, useRef } from "react";

export interface Strand {
  /** An SVG path, in the same coordinates as the diagram. */
  d: string;
  /** On the open branch: it carries the flowing energy. The others stay dim. */
  live: boolean;
  merge: boolean;
}

interface Props {
  strands: Strand[];
  width: number;
  height: number;
  /** Any CSS colour. */
  color: string;
  /** On a light page: the strands are drawn as ink that darkens the panel, not as light that adds to it. */
  light?: boolean;
  /** Read before every frame: the pills the dot grid has to keep clear of, as a flat list of x, y, width, height in the canvas's own pixels. */
  getClear?: (canvas: HTMLCanvasElement) => number[];
  /** Holds the last frame still, to leave the graphics card free for something that has to be smooth, such as a tooltip opening. */
  paused?: boolean;
  /** Called once if this browser cannot run the shader, so the plain lines can be drawn instead. */
  onUnsupported: () => void;
}

interface Engine {
  /** Replaces the line maps, rebuilds the halos and draws. */
  upload: (colorMap: HTMLCanvasElement, maskMap: HTMLCanvasElement, dpr: number, scale: number) => void;
  setCalm: (calm: boolean) => void;
}

const TEXW = 2048;
const TEXH = 1024;

const VERT = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

// A separable gaussian, read from the line map at a matching mip level so even a thin line is averaged over its whole footprint first.
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uDir, uOut; uniform float uSigma, uLod;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uOut; vec4 sum = vec4(0.); float tot = 0.;
  for (int i = -18; i <= 18; i++){ float w = exp(-float(i * i) / (2. * uSigma * uSigma)); sum += textureLod(uSrc, uv + uDir * float(i), uLod) * w; tot += w; }
  o = sum / tot;
}`;

const MAIN = `#version 300 es
precision highp float;
uniform sampler2D uMap, uMask, uB0, uB1, uB2;
uniform vec2 uPx, uTex;
uniform float uDpr, uTime, uCalm, uLight;
uniform vec4 uClear[16];
uniform vec3 uMouse, uTint;
uniform int uNClear;
out vec4 o;
// 0 right beside a pill, rising smoothly to 1 a little way off, so the dots thin out around each name and keep their distance whatever its length.
float clearFade(vec2 p){
  float f = 1.;
  for (int i = 0; i < 16; i++){
    if (i >= uNClear) break;
    vec4 r = uClear[i];
    vec2 q = abs(p - (r.xy + r.zw * .5)) - (r.zw * .5 - r.w * .5);
    float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r.w * .5;
    f = min(f, smoothstep(2., 42., d));
  }
  return f;
}
// The cursor's spotlight: how much each dot swells (x) and how lit it is (y), by the dot's own distance from the cursor so a dot never changes shape across its width.
vec2 spot(vec2 pxc){
  vec2 centre = pxc - (mod(pxc, 18.) - 9.);
  vec2 d = centre - uMouse.xy;
  float k = uMouse.z * exp(-dot(d, d) / (2. * 62. * 62.));
  return vec2(1. + 1.35 * k, k);
}
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hsh(i), hsh(i+vec2(1.,0.)), f.x), mix(hsh(i+vec2(0.,1.)), hsh(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<3;i++){ s += a*vn(p); p *= 2.03; a *= .5; } return s; }
void main(){
  vec2 pxc = vec2(gl_FragCoord.x, uPx.y - gl_FragCoord.y) / uDpr;   // CSS pixels of the diagram
  vec2 uv = pxc * uTex;
  // Far from every strand there is no light to work out: only the dim grid. Most of the panel is like this, so it is decided from
  // one read of the widest glow, before any of the other textures are touched.
  vec4 h2 = texture(uB2, uv);
  if (h2.a < .0012) {
    vec2 gq = mod(pxc, 18.) - 9.;
    vec2 eq = min(pxc, uPx / uDpr - pxc);
    vec2 sp = spot(pxc);
    float dim = smoothstep(1.9 * sp.x, .5 * sp.x, length(gq)) * (.12 + .5 * sp.y) * smoothstep(0., 56., min(eq.x, eq.y)) * clearFade(pxc);
    if (uLight > .5) { float a = dim * 1.5; o = vec4(mix(vec3(.05), pow(uTint, vec3(1.5)) * .85, sp.y) * a, a); return; }
    vec3 c = vec3(1.) - exp(-mix(vec3(.95), uTint, sp.y) * dim * 1.05);
    o = vec4(c, max(c.r, max(c.g, c.b)));
    return;
  }
  vec4 m0 = texture(uMap, uv);
  vec4 halo = texture(uB0, uv) * .9 + texture(uB1, uv) * 1.5 + h2 * 2.4;
  vec3 base = m0.a > .02 ? m0.rgb / m0.a : halo.rgb / max(halo.a, 1e-5);
  vec4 mk = texture(uMask, uv);
  float live = mk.a > .02 ? mk.r / mk.a : 0.;
  float t = uTime;
  // Brightness that travels along the strand, in the direction of time: broad swells with quicker ripples on top.
  float n  = fbm(vec2(pxc.x * .010 - t * .55, pxc.y * .016 + t * .04));
  float n2 = vn(vec2(pxc.x * .042 - t * 1.7, pxc.y * .05 + t * .1));
  float flow = mix(1., .6 + .7 * n + .9 * pow(n2, 3.), live * (1. - uCalm));
  float tw1 = .5 + .5 * sin(pxc.x * .52 - t * 2.4 + sin(pxc.y * .09) * 2.);
  float tw2 = .5 + .5 * sin(pxc.x * .52 - t * 2.4 + 3.14159 + sin(pxc.y * .09) * 2.);
  float filament = mix(1., .78 + .45 * max(tw1, tw2), live * (1. - uCalm));
  float core = m0.a;
  vec3 col = base * core * flow * filament;
  col += vec3(1.) * pow(core, 3.) * live * flow * .14 * (1. - uLight);
  // The dot grid: dim on its own, lit by the strand near it.
  vec2 g = mod(pxc, 18.) - 9.;
  vec2 sp = spot(pxc);
float dotm = smoothstep(1.9 * sp.x, .5 * sp.x, length(g)) * clearFade(pxc);
  vec2 e = min(pxc, uPx / uDpr - pxc);
  float edge = smoothstep(0., 56., min(e.x, e.y));
  vec3 lit = base * dotm * halo.a * 2.6 * mix(.55, 1., live) * mix(1., flow, live * .6);
  if (uLight > .5) {
    // Ink on a light page: the same strands, glow and lit grid, but they stain the panel with colour instead of lighting it.
    vec3 ink = pow(base, vec3(1.5)) * .85;
    float wash = halo.a * .55 * mix(.6, 1., live) * mix(1., flow, live * .5);
    float s = max(col.r, max(col.g, col.b)) + max(lit.r, max(lit.g, lit.b)) * 2.2 + wash;
    float a = 1. - exp(-s * 1.7);
    float da = dotm * (.17 + .5 * sp.y) * edge;
    float all = 1. - (1. - a) * (1. - da);
    o = vec4(ink * a + mix(vec3(.05), pow(uTint, vec3(1.5)) * .85, sp.y) * da * (1. - a), all);
    return;
  }
  col += mix(vec3(.95), uTint, sp.y) * dotm * (.12 + .5 * sp.y) * edge;
  col += lit;
  col = vec3(1.) - exp(-col * 1.05);
  col += (hsh(gl_FragCoord.xy + uTime) - .5) / 255.;
  // Transparent where there is no light, so what is behind the panel shows through. Premultiplied: the alpha is the strongest channel.
  o = vec4(col, max(col.r, max(col.g, col.b)));
}`;

/**
 * The strands of the version timeline, drawn by the graphics card as continuous light: a hot core, soft gaussian halos, brightness
 * that flows along the open branch, and the dot grid lit around it. The maps it reads are redrawn only when the lines change.
 * It sits under the SVG, which keeps the clickable dots and labels.
 */
export function StrandLayer({ strands, width, height, color, light = false, getClear, paused = false, onUnsupported }: Props) {
  const getClearRef = useRef(getClear);
  getClearRef.current = getClear;
  const tintRef = useRef<[number, number, number]>([0.22, 0.84, 1]);
  const lightRef = useRef(light);
  lightRef.current = light;
  // The strand colour as three 0 to 1 numbers, for the spotlight to tint the dots with.
  useEffect(() => {
    const swatch = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
    if (!swatch) return;
    swatch.fillStyle = color;
    swatch.fillRect(0, 0, 1, 1);
    const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
    tintRef.current[0] = r / 255;
    tintRef.current[1] = g / 255;
    tintRef.current[2] = b / 255;
  }, [color]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const maps = useRef<{ color: HTMLCanvasElement; mask: HTMLCanvasElement } | null>(null);
  const failed = useRef(onUnsupported);
  failed.current = onUnsupported;

  // One context for the life of the layer.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
    if (!gl) {
      failed.current();
      return;
    }
    const floatOK = !!gl.getExtension("EXT_color_buffer_float");
    // Everything made here is freed on cleanup. The context itself is left alone: React may mount this twice in development and hand the same canvas back.
    const dispose: Array<() => void> = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.warn("Strand shader:", gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = (fragment: string) => {
      const p = gl.createProgram()!;
      dispose.push(() => gl.deleteProgram(p));
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(p);
      return p;
    };
    const blur = program(BLUR), main = program(MAIN);
    if (!gl.getProgramParameter(blur, gl.LINK_STATUS) || !gl.getProgramParameter(main, gl.LINK_STATUS)) {
      failed.current();
      return;
    }
    const loc = (p: WebGLProgram, names: string[]) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>;
    const MU = loc(main, ["uMap", "uMask", "uB0", "uB1", "uB2", "uPx", "uTex", "uDpr", "uTime", "uCalm", "uLight", "uNClear", "uMouse", "uTint"]);
    const CLEAR = gl.getUniformLocation(main, "uClear");
    const BU = loc(blur, ["uSrc", "uDir", "uOut", "uSigma", "uLod"]);
    const vao = gl.createVertexArray();
    dispose.push(() => gl.deleteVertexArray(vao));
    gl.bindVertexArray(vao);

    const filters = (min: number) => {
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, min], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    };
    const target = (w: number, h: number) => {
      const t = gl.createTexture()!;
      dispose.push(() => gl.deleteTexture(t));
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, floatOK ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      filters(gl.LINEAR);
      const f = gl.createFramebuffer()!;
      dispose.push(() => gl.deleteFramebuffer(f));
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, f, w, h };
    };
    // Blur widths (the map's ratio, and sigma in that level's pixels): about 4, 11 and 27 diagram units.
    const levels = [[2, 4], [4, 5], [8, 6]].map(([ratio, sigma]) => ({ ratio, sigma, a: target(TEXW / ratio, TEXH / ratio), b: target(TEXW / ratio, TEXH / ratio) }));
    const mapTex = gl.createTexture()!;
    dispose.push(() => gl.deleteTexture(mapTex));
    gl.bindTexture(gl.TEXTURE_2D, mapTex);
    filters(gl.LINEAR_MIPMAP_LINEAR);
    const maskTex = gl.createTexture()!;
    dispose.push(() => gl.deleteTexture(maskTex));
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    filters(gl.LINEAR);

    const pointer = { x: 0, y: 0, on: false }, eased = { x: 0, y: 0 };
    let glow = 0;
    const tint = tintRef.current;
    const track = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.on = true;
    };
    const leave = () => (pointer.on = false);
    const host = element.parentElement;
    host?.addEventListener("pointermove", track);
    host?.addEventListener("pointerleave", leave);
    let scale = 1, dpr = 1, maxDpr = 1.5, calm = false, raf = 0, visible = true, clock = 0, last = performance.now();
    const draw = () => {
      // The canvas fills the whole panel, which can be wider than the diagram, so it follows its own size.
      // A budget of about 1.5 million pixels, however big the panel or the screen: the glow is soft, so a lower resolution costs no looks, and it is what keeps this light.
      dpr = Math.max(0.75, Math.min(maxDpr, Math.sqrt(1_500_000 / Math.max(1, element.clientWidth * element.clientHeight))));
      const w = Math.max(1, Math.round(element.clientWidth * dpr)), h = Math.max(1, Math.round(element.clientHeight * dpr));
      if (element.width !== w || element.height !== h) {
        element.width = w;
        element.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(main);
      const bind = (unit: number, tex: WebGLTexture, name: string) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(MU[name], unit);
      };
      bind(0, mapTex, "uMap");
      bind(1, maskTex, "uMask");
      levels.forEach((lv, i) => bind(2 + i, lv.b.t, "uB" + i));
      gl.uniform2f(MU.uPx, element.width, element.height);
      gl.uniform2f(MU.uTex, scale / TEXW, scale / TEXH);
      gl.uniform1f(MU.uDpr, dpr);
      gl.uniform1f(MU.uTime, clock);
      gl.uniform1f(MU.uCalm, calm ? 1 : 0);
      gl.uniform1f(MU.uLight, lightRef.current ? 1 : 0);
      const clear = (getClearRef.current?.(element) ?? []).slice(0, 64);
      gl.uniform1i(MU.uNClear, clear.length / 4);
      // The cursor eases toward where it really is and the spotlight fades in and out, so it glides rather than snaps.
      const box = element.getBoundingClientRect();
      const tx = pointer.x - box.left, ty = pointer.y - box.top;
      if (pointer.on && glow < 0.02) { eased.x = tx; eased.y = ty; }
      eased.x += (tx - eased.x) * 0.4;
      eased.y += (ty - eased.y) * 0.4;
      glow += ((pointer.on ? 1 : 0) - glow) * 0.2;
      if (glow < 0.004) glow = 0;
      gl.uniform3f(MU.uMouse, eased.x, eased.y, glow);
      gl.uniform3f(MU.uTint, tint[0], tint[1], tint[2]);
      if (clear.length) gl.uniform4fv(CLEAR, clear);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // The flow is slow, so 30 frames a second look the same as 60 and cost half as much.
      if (now - last < 30) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden || pausedRef.current) return;
      if (!calm) clock += dt;
      draw();
    };
    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(element);

    const upload: Engine["upload"] = (colorMap, maskMap, nextDpr, nextScale) => {
      maxDpr = nextDpr;
      scale = nextScale;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, colorMap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskMap);
      gl.useProgram(blur);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(BU.uSrc, 0);
      for (const lv of levels) {
        gl.viewport(0, 0, lv.a.w, lv.a.h);
        gl.uniform2f(BU.uOut, lv.a.w, lv.a.h);
        gl.uniform1f(BU.uSigma, lv.sigma);
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv.a.f);
        gl.bindTexture(gl.TEXTURE_2D, mapTex);
        gl.uniform2f(BU.uDir, 1 / lv.a.w, 0);
        gl.uniform1f(BU.uLod, Math.log2(lv.ratio));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv.b.f);
        gl.bindTexture(gl.TEXTURE_2D, lv.a.t);
        gl.uniform2f(BU.uDir, 0, 1 / lv.a.h);
        gl.uniform1f(BU.uLod, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      draw();
    };
    engine.current = {
      upload,
      setCalm: (value) => {
        calm = value;
        if (value) draw();
      },
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      host?.removeEventListener("pointermove", track);
      host?.removeEventListener("pointerleave", leave);
      observer.disconnect();
      dispose.forEach((fn) => fn());
      engine.current = null;
    };
  }, []);

  // Reduced motion: the colour and the glow stay, the flow stops.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => engine.current?.setCalm(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Redraw the two maps and rebuild the halos, only when the lines or the colour change.
  useEffect(() => {
    const e = engine.current;
    if (!e || strands.length === 0) return;
    const scale = Math.min(1.8, TEXW / Math.max(width, 1), TEXH / Math.max(height, 1));
    if (!maps.current) maps.current = { color: Object.assign(document.createElement("canvas"), { width: TEXW, height: TEXH }), mask: Object.assign(document.createElement("canvas"), { width: TEXW, height: TEXH }) };
    const { color: colorMap, mask: maskMap } = maps.current;
    const cc = colorMap.getContext("2d")!, mc = maskMap.getContext("2d")!;
    for (const c of [cc, mc]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, TEXW, TEXH);
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.lineCap = "round";
      c.lineJoin = "round";
    }
    // Live strands last, so they win where lines cross.
    const ordered = [...strands].sort((a, b) => Number(a.live) - Number(b.live));
    for (const s of ordered) {
      const path = new Path2D(s.d), dash = s.merge ? [2, 8] : [];
      cc.setLineDash(dash);
      cc.strokeStyle = color;
      cc.lineWidth = s.live ? 3.2 : 2.2;
      cc.globalAlpha = s.live ? 1 : 0.34;
      cc.stroke(path);
      mc.setLineDash(dash);
      mc.strokeStyle = s.live ? "rgb(255,0,0)" : "rgb(0,0,0)";
      mc.lineWidth = s.live ? 3.2 : 2.2;
      mc.stroke(path);
    }
    cc.globalAlpha = 1;
    e.upload(colorMap, maskMap, Math.min(window.devicePixelRatio || 1, 1.5, 4096 / Math.max(width, 1)), scale);
  }, [strands, width, height, color, light]);

  return <canvas ref={canvas} aria-hidden="true" className="tl-edges pointer-events-none absolute inset-0 h-full w-full" />;
}
