import { createContext, useContext } from 'react'
import type { SubsonicClient } from './subsonic.js'

const ClientContext = createContext<SubsonicClient | null>(null)

export const ClientProvider = ClientContext.Provider

/** The client is only ever null before sign-in, and the shell does not render
 *  until then — so callers get a non-null value rather than a needless check. */
export function useClient(): SubsonicClient {
  const c = useContext(ClientContext)
  if (!c) throw new Error('useClient outside a signed-in shell')
  return c
}
