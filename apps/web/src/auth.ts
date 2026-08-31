/**
 * Credential storage.
 *
 * Single-user app on a private network, so credentials live in localStorage.
 * The password is needed to compute a fresh auth token per request, so it
 * cannot be discarded after login the way a bearer token could be.
 */
import type { Credentials } from './api/subsonic.js'

const KEY = 'nyx.credentials'

export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Credentials>
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null
    return { username: parsed.username, password: parsed.password }
  } catch {
    return null // private window, cleared storage, or corrupt value
  }
}

export function saveCredentials(c: Credentials): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* non-fatal */ }
}

export function clearCredentials(): void {
  try { localStorage.removeItem(KEY) } catch { /* non-fatal */ }
}
