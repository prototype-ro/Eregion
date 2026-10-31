"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { aggregate } from "./mock";

type Play = { current: number };
const C = 8;

function Surface({ heights }: { heights: number[][] }) {
  const geometry = useMemo(() => {
    const R = heights.length;
    const max = Math.max(...heights.flat(), 1);
    const positions: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r < R; r += 1) {
      for (let c = 0; c < C; c += 1) {
        positions.push((c - (C - 1) / 2) * 0.6, (heights[r][c] / max) * 2.2, (r - (R - 1) / 2) * 0.6);
      }
    }
    for (let r = 0; r < R - 1; r += 1) {
      for (let c = 0; c < C - 1; c += 1) {
        const a = r * C + c;
        const b = r * C + c + 1;
        const d = (r + 1) * C + c + 1;
        const e = (r + 1) * C + c;
        indices.push(a, e, b, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [heights]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#1f6f8b" emissive="#0b3a4a" emissiveIntensity={0.55} metalness={0.35} roughness={0.45} flatShading />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial wireframe color="#7fd4ff" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

/** The playhead ridge, riding the curve across the surface as the versions advance. */
function Ridge({ heights, play }: { heights: number[][]; play: Play }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(C * 3), 3));
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color("#7fd4ff") });
    return new THREE.Line(geometry, material);
  }, []);
  useFrame(() => {
    const max = Math.max(...heights.flat(), 1);
    const pv = Math.max(0, Math.min(heights.length - 1, play.current));
    const r0 = Math.max(0, Math.min(heights.length - 2, Math.floor(pv)));
    const fr = pv - r0;
    const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attribute.array as Float32Array;
    for (let c = 0; c < C; c += 1) {
      const h = heights[r0][c] + (heights[r0 + 1][c] - heights[r0][c]) * fr;
      arr[c * 3] = (c - (C - 1) / 2) * 0.6;
      arr[c * 3 + 1] = (h / max) * 2.2 + 0.05;
      arr[c * 3 + 2] = (pv - (heights.length - 1) / 2) * 0.6;
    }
    attribute.needsUpdate = true;
  });
  return <primitive object={line} />;
}

export function Surface3D({ play }: { play: Play }) {
  const heights = useMemo(() => aggregate().map((entry) => entry.curve), []);
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10" style={{ background: "#0c0d12" }}>
      <div className="p-5 pb-0">
        <p className="text-[18px] leading-none font-semibold tracking-tight text-[#f1f3ff]">Terrain, rotatable</p>
        <p className="mt-1.5 text-[11px] text-[#9aa1c9]">react-three-fiber: the curve across every version as a surface. Drag to orbit; it turns on its own.</p>
      </div>
      <div className="h-[360px] w-full">
        <Canvas camera={{ position: [6, 6, 7], fov: 45 }} dpr={[1, 1.5]}>
          <color attach="background" args={["#0c0d12"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[6, 12, 8]} intensity={1.5} />
          <Surface heights={heights} />
          <Ridge heights={heights} play={play} />
          <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.7} maxPolarAngle={Math.PI / 2.1} minDistance={5} maxDistance={22} />
        </Canvas>
      </div>
    </div>
  );
}
