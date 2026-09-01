import { useEffect, useState } from 'react'

/** The handoff's breakpoints. Mobile is a genuinely different shell, not the
 *  desktop one made narrower — so this is a real branch, not a media query. */
export const MOBILE_MAX = 767

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
    const on = () => setIsMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}
