/**
 * Colour conversions for the artwork-driven palette.
 *
 * Everything works in OKLab/OKLCH because the design's contrast guarantee
 * depends on manipulating perceptual lightness independently of hue — which
 * is exactly what OKLab gives you and sRGB does not.
 */

export interface Oklch { L: number; C: number; h: number }
export interface Rgb { r: number; g: number; b: number }

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055

/** sRGB (0–255) → OKLab. */
export function rgbToOklab({ r, g, b }: Rgb): { L: number; a: number; b: number } {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

export function oklabToOklch(lab: { L: number; a: number; b: number }): Oklch {
  const C = Math.hypot(lab.a, lab.b)
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  if (h < 0) h += 360
  return { L: lab.L, C, h }
}

export function rgbToOklch(rgb: Rgb): Oklch {
  return oklabToOklch(rgbToOklab(rgb))
}

export function oklchToRgb({ L, C, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)))
  return { r: clamp(lr), g: clamp(lg), b: clamp(lb) }
}

/** WCAG relative luminance, for verifying the contrast guarantee holds. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => srgbToLinear(c / 255)) as [number, number, number]
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const css = ({ L, C, h }: Oklch): string =>
  `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`
