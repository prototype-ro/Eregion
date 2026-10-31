// Ambient declarations for the lab-only libraries that ship no types.

declare module "flubber" {
  type Shape = string | Array<[number, number]>;
  interface Options {
    maxSegmentLength?: number;
    string?: boolean;
  }
  export function interpolate(from: Shape, to: Shape, options?: Options): (t: number) => string;
  export function toCircle(from: Shape, x: number, y: number, r: number, options?: Options): (t: number) => string;
  export function toRect(from: Shape, x: number, y: number, width: number, height: number, options?: Options): (t: number) => string;
  export function separate(from: Shape, to: Shape[], options?: Options & { single?: boolean }): ((t: number) => string) | Array<(t: number) => string>;
  export function toPathString(ring: Array<[number, number]>): string;
  export function splitPathString(path: string): string[];
}

declare module "culori" {
  export function parse(color: string | object): any;
  export function formatHex(color: any): string;
  export function formatCss(color: any): string;
  export function converter(mode: string): (color: any) => any;
  export function interpolate(colors: Array<string | object>, mode?: string): (t: number) => any;
  export function oklch(color: any): any;
  export function rgb(color: any): any;
  export function wcagContrast(a: any, b: any): number;
}
