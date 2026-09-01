import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SubsonicClient } from './api/subsonic.js'
import { ClientProvider } from './api/context.js'
import { loadCredentials } from './auth.js'
import { Login } from './components/Login.js'
import { Shell } from './components/Shell.js'
import { MobileShell } from './components/MobileShell.js'
import { useIsMobile } from './hooks/viewport.js'
import { Albums } from './screens/Albums.js'
import { AlbumDetail } from './screens/AlbumDetail.js'
import { Planned } from './screens/Soon.js'
import { Crate } from './screens/Crate.js'
import { Search } from './screens/Search.js'
import { Artists } from './screens/Artists.js'
import { Genres } from './screens/Genres.js'
import { Settings } from './screens/Settings.js'
import { Today } from './screens/Today.js'
import { Favourites } from './screens/Favourites.js'
import { Playlists } from './screens/Playlists.js'
import { Stats } from './screens/Stats.js'
import { usePlayer } from './player.js'

export function App() {
  const [client, setClient] = useState<SubsonicClient | null>(null)
  const attach = usePlayer((s) => s.attach)
  const isMobile = useIsMobile()

  useEffect(() => {
    const saved = loadCredentials()
    if (saved) setClient(new SubsonicClient(saved))
  }, [])

  useEffect(() => { if (client) attach(client) }, [client, attach])

  if (!client) return <Login onAuthed={setClient} />

  return (
    <ClientProvider value={client}>
      <BrowserRouter>
        <Routes>
          <Route element={isMobile ? <MobileShell /> : <Shell />}>
            <Route path="/" element={<Today />} />
            <Route path="/albums" element={<Albums />} />
            <Route path="/album/:id" element={<AlbumDetail />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/genres" element={<Genres />} />
            <Route path="/search" element={<Search />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/favourites" element={<Favourites />} />
            <Route path="/crate" element={<Crate />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/year" element={
              <Planned title="Listening year" version="year · needs nyx-api"
                blurb="An editorial report written from your own history. Not for posting anywhere." />} />
            <Route path="/settings" element={<Settings onSignOut={() => setClient(null)} />} />
            <Route path="*" element={<Navigate to="/albums" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ClientProvider>
  )
}
