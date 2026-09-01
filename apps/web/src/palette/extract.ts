/**
 * Pull swatches out of cover art.
 *
 * Downsample to 64×64 on a canvas, then k-means in OKLab. Small enough to be
 * instant, large enough to find a minority accent colour.
 */
import { kmeans } from './palette.js'
import type { Swatch } from './palette.js'
import type { Rgb } from './color.js'

const SIZE = 64
const cache = new Map<string, Swatch[]>()

export async function extractSwatches(url: string): Promise<Swatch[]> {
  const cached = cache.get(url)
  if (cached) return cached

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('cover failed to load'))
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(img, 0, 0, SIZE, SIZE)

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  const pixels: Rgb[] = []
  for (let i = 0; i < data.length; i += 4) {
    // Skip near-transparent pixels; they carry no usable colour.
    if (data[i + 3]! < 16) continue
    pixels.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! })
  }

  const swatches = kmeans(pixels, 5)
  cache.set(url, swatches)
  return swatches
}
