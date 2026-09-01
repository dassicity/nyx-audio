import { useEffect, useState } from 'react'

/**
 * Text size.
 *
 * The handoff's scale was drawn for 1280–2560px; on a large or scaled display
 * it reads small. This moves the whole scale at once rather than letting
 * individual sizes drift apart.
 */
export const TEXT_SIZES = {
  compact:     { label: 'Compact', scale: 1, hint: 'as the design was drawn' },
  comfortable: { label: 'Comfortable', scale: 1.15, hint: 'a little larger throughout' },
  large:       { label: 'Large', scale: 1.32, hint: 'for a big or distant screen' },
} as const

export type TextSize = keyof typeof TEXT_SIZES

const KEY = 'nyx.textSize'
const DEFAULT: TextSize = 'comfortable'

export function loadTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY)
    return v && v in TEXT_SIZES ? v as TextSize : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function applyTextSize(size: TextSize): void {
  document.documentElement.style.setProperty(
    '--nyx-text-scale', String(TEXT_SIZES[size].scale))
}

export function useTextSize(): [TextSize, (s: TextSize) => void] {
  const [size, setSize] = useState<TextSize>(loadTextSize)

  useEffect(() => {
    applyTextSize(size)
    try { localStorage.setItem(KEY, size) } catch { /* non-fatal */ }
  }, [size])

  return [size, setSize]
}
