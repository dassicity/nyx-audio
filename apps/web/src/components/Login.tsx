import { useState } from 'react'
import { SubsonicClient } from '../api/subsonic.js'
import { SubsonicError, SUBSONIC_WRONG_CREDENTIALS } from '../api/types.js'
import { saveCredentials } from '../auth.js'
import { px } from '../format.js'

export function Login({ onAuthed }: { onAuthed: (c: SubsonicClient) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const client = new SubsonicClient({ username, password })
    try {
      await client.ping()
      saveCredentials({ username, password })
      onAuthed(client)
    } catch (err) {
      // Say what went wrong and what to do, never just "failed".
      if (err instanceof SubsonicError && err.code === SUBSONIC_WRONG_CREDENTIALS) {
        setError('That username and password did not match.')
      } else if (err instanceof SubsonicError && err.code === 0) {
        setError('The server did not answer. Is Navidrome running?')
      } else {
        setError(err instanceof Error ? err.message : 'Could not reach the server.')
      }
      setBusy(false)
    }
  }

  return (
    <div style={{
      display: 'grid', placeItems: 'center', minHeight: '100%',
      padding: 'var(--nyx-s-6)',
    }}>
      <form onSubmit={submit} style={{ width: 'min(340px, 100%)' }}>
        <div className="display" style={{
          fontSize: px(38), fontWeight: 300, lineHeight: 1.06,
        }}>Nyx</div>
        <div className="eyebrow" style={{ marginTop: 6 }}>Audio</div>

        <p style={{
          color: 'var(--nyx-txt-2)', fontSize: 'var(--nyx-t-body-md)',
          marginTop: 'var(--nyx-s-5)', marginBottom: 'var(--nyx-s-4)',
        }}>
          Sign in to your library.
        </p>

        <label className="eyebrow" htmlFor="u">Username</label>
        <input
          id="u" value={username} autoComplete="username" autoFocus
          onChange={(e) => setUsername(e.target.value)} style={inputStyle}
        />

        <label className="eyebrow" htmlFor="p" style={{ marginTop: 'var(--nyx-s-3)', display: 'block' }}>
          Password
        </label>
        <input
          id="p" type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)} style={inputStyle}
        />

        {error && (
          <p className="mono" style={{
            color: 'var(--nyx-negative)', fontSize: 'var(--nyx-t-mono-sm)',
            marginTop: 'var(--nyx-s-3)',
          }}>{error}</p>
        )}

        <button type="submit" disabled={busy || !username || !password} style={{
          marginTop: 'var(--nyx-s-5)', width: '100%', minHeight: 'var(--nyx-hit-min)',
          background: 'var(--nyx-txt-1)', color: 'var(--nyx-bg-0)',
          borderRadius: 'var(--nyx-r-2)', fontWeight: 700,
          opacity: busy || !username || !password ? 0.5 : 1,
        }}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 6, padding: '10px 12px',
  minHeight: 'var(--nyx-hit-min)',
  background: 'var(--nyx-bg-1)', color: 'var(--nyx-txt-1)',
  border: '1px solid var(--nyx-line)', borderRadius: 'var(--nyx-r-2)',
  fontFamily: 'var(--nyx-font-body)', fontSize: 'var(--nyx-t-body-md)',
}
