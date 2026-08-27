# Design brief — Nyx Audio, a personal lossless music library

*(Paste this whole thing as your first message.)*

**The name is Nyx Audio and it's settled — don't propose alternatives.** Nyx is the Greek goddess of night, which is not decoration: this is software for listening after dark, and the name should inform the visual direction rather than just sit on top of it. Design a wordmark for it. "Nyx" alone is fine as the in-app mark where space is tight.

---

## 0. How I want you to respond

Two things in your first reply, in this order:

**Part A — 17 recommendations.** Before you show me any finished screen, give me exactly **17 numbered recommendations**, grouped under the headings below. Each one gets: a short name, two or three sentences on what it actually is, one line on why it fits *this specific project* (not design advice in general), and a "pick this if…" line. Keep each under 80 words — I want to scan all 17 and choose, not read an essay.

- **Visual direction** — 4 genuinely different art directions, not four shades of the same idea.
- **Cover-art colour system** — 2 different approaches to letting artwork drive the interface.
- **Now Playing & ambient display** — 3 concepts.
- **Crate-digging interaction** — 2 models.
- **Statistics presentation** — 2 approaches.
- **Navigation & information architecture** — 2 models.
- **Wildcards** — 2 ideas I didn't ask for, that you think would make this genuinely distinctive. Take a real risk with these.

Tell me which ones **you** would pick and why.

**Part B — first designs.** Then build the first pass using your own picks from Part A. Say clearly at the top which recommendations you built on, so when I come back and swap #3 for #4 you know exactly what changes. I expect to iterate with you from here — this is the start of a conversation, not a one-shot request.

Deliverables for Part B:

1. **A design canvas** with artboards for every screen in section 8, at both desktop and mobile sizes.
2. **A working interactive prototype** — a single self-contained HTML file, no external dependencies except a Google Fonts link. Not a clickable mockup: audio-less but genuinely functional. Navigation works, clicking an album opens it, pressing play updates the player bar and starts a simulated timeline, lyrics scroll in time against that timeline, crate mode cycles through real cards, stats render from a real dataset. I want to *use* it and feel whether the thing is right.
3. **A token file** — colour, type, spacing, radii, motion — as CSS custom properties, plus a short note on how each token maps to a Flutter equivalent. The mobile app will eventually be rebuilt in Flutter, so don't build the design on CSS tricks that can't survive the translation.

---

## 1. What I'm building

A private music library for lossless audio, running on a Raspberry Pi 5 on my home network.

The Pi stores my FLAC collection and serves it. **It never plays audio itself** — the sound comes out of whatever device I'm holding: my laptop, my phone. So this is a client that streams from my own hardware. Think Spotify's shape, but the library is mine, it's finite, I chose every record in it, and nobody is trying to grow my engagement.

The backend is Navidrome, speaking the OpenSubsonic API. That fixes the data model: artists, albums, tracks, playlists, genres, favourites, play counts, cover art. Lyrics come from LRCLIB. Genre, biography and release-context enrichment come from MusicBrainz and ListenBrainz. Listening statistics come from my own play history, stored locally.

I am the only user. I know exactly what's in my library. **The interface's job is not discovery-by-algorithm — it's making a collection I already love feel present, browsable, and physically real.**

---

## 2. How it should feel

The single most important sentence in this brief: **the interface is a frame for the artwork, not a competitor to it.**

Everything else follows from that. Chrome recedes. Album art is the largest, brightest, most saturated thing on almost every surface, and the UI arranges itself around it. When a record is playing, the room should feel like it's that record's colour.

Beyond that:

- **Calm, not urgent.** Nothing pulses, nothing badges, nothing wants me back. There are no notifications. This is furniture, not an app store product.
- **Evening-first.** I listen at night. Dark is the primary theme and should get the best of your attention. The light theme must be genuinely designed too, not an inversion.
- **Deliberate, not infinite.** No endless scroll of recommendations. Finite collections deserve interfaces with edges — I should be able to feel where the library ends. Show me counts. Show me the whole shelf.
- **Honest about the technical.** This is a lossless library and the person using it cares about that. Show real information — `FLAC · 16 bit · 44.1 kHz` — not a vague "HD" badge. Where the browser is resampling to 48 kHz on the way out, say so. Small, quiet, always available, never shouted. Treat this as a typographic detail: a mono readout, tabular numerals, the texture of good equipment.
- **Physical.** The best moments in this app should recall handling a record: the size of the sleeve, the act of choosing, the credits on the back. Find ways to make that literal without becoming a skeuomorphic pastiche.

---

## 3. Hard constraints

- **No CDN, no external assets at runtime.** The Pi may have no internet connection. Everything must be self-contained. A Google Fonts link is the one exception, and it needs a real fallback stack behind it.
- **Enrichment can fail.** Lyrics, genre data, artist bios all come from the internet and often won't be there. Every enriched element needs a designed absent state — not a spinner that never resolves, not an empty box. "No lyrics for this track" should look intentional.
- **Long text is the norm, not the edge case.** Classical and jazz track titles are brutal: *"Symphony No. 9 in D minor, Op. 125 'Choral': IV. Presto — Allegro assai — Rezitativ"*. Indian classical goes further: *"Raga Yaman: Alap, Jod, Jhala — Vilambit Teentaal"*. Diacritics everywhere. Your type system must handle these gracefully at every breakpoint, including in the player bar. Show me these cases in the designs.
- **Accessibility is not optional.** WCAG AA contrast must hold *even when the palette is being driven by album artwork* — that's the hard part, and I want to see how you solve it. Full keyboard control on desktop. `prefers-reduced-motion` respected. Proper labels on transport controls.
- **44pt minimum touch targets** on mobile, safe-area aware.

---

## 4. Design system

Give me a real system, not a set of screens that happen to look similar.

**Colour.** A neutral scale that was chosen, not defaulted to — a grey with a slight hue bias reads as considered, a pure mid-grey reads as unconsidered. Then the dynamic layer on top: colours extracted from the current album artwork.

The dynamic palette is the centrepiece of the design and also the biggest risk, so specify it properly:
- Which colours you extract, how many, and how you pick them.
- How you guarantee legibility when the artwork is a black-and-white photograph, a neon rave sleeve, or a beige ECM cover. Define a saturation ceiling, a contrast floor, and a fallback.
- Where the extracted colour is allowed to appear and where it is forbidden. My instinct: ambient backgrounds, the progress bar, the active lyric line, glows behind artwork — yes. Body text, alert states, anything I need to read quickly — never.
- How it transitions when a track changes. This is one of maybe three moments of real motion in the whole app, so make it count.

**Type.** Three roles minimum: a display face with genuine character for album and artist names, a body face that stays readable at small sizes, and a mono for technical readouts, timecodes, and statistics. Tabular numerals wherever digits align. A defined scale I can hold to. Show me the type specimen with real, difficult titles in it.

Do not use Inter or Space Grotesk as the safe default.

**Motion.** Few, deliberate moments. My candidates: the artwork and palette crossfade on track change, the lyric line advance, the mini-player expanding to full screen, and the crate-mode card reveal. Everything else should be instant. Scattered micro-animations will make this feel generated rather than designed.

**Iconography.** A coherent set. No emoji anywhere in the interface.

---

## 5. Web, desktop and mobile — designed once

I'm building the web app first, it will run as a desktop app, and later there'll be a Flutter mobile app. **I want one design system that covers all three, decided now**, so I don't redesign in six months.

- **Desktop (1280–2560px).** Sidebar navigation, dense content area, persistent player bar along the bottom. Density is a feature here — a collection is meant to be surveyed, so let me see a lot of it at once. Include a command palette (⌘K) and a full keyboard shortcut map.
- **Tablet (768–1024px).** Show me how the sidebar behaves and where the layout breaks.
- **Mobile (375–430px).** Bottom tab bar, mini-player docked above it, dragging or tapping the mini-player expands it into full-screen Now Playing. This must feel like a native app, not a squeezed web page. Show the gesture and the transition.

For each screen in section 8, tell me what the responsive strategy is: does it reflow, does it reorganise, or does it become a different screen entirely? Be explicit where the mobile version is genuinely a different design rather than the same design narrower.

---

## 6. The v1 feature set

These five are what I'm building first. They are the reason this project exists, so give them disproportionate attention.

### 6.1 Cover-art-driven interface
Covered in section 4. It's the visual thesis of the whole product.

### 6.2 Time-synced lyrics
Full-screen, karaoke-style, scrolling in time with the track. The active line is emphasised; lines before and after fall away by weight and opacity rather than disappearing. Tapping any line seeks to it. Typography carries this entire screen, so treat it as a typographic composition — this is the most beautiful screen in the app or you've done it wrong. Design the unsynced-lyrics variant (plain text, no timing) and the no-lyrics variant too, since both are common.

### 6.3 Crate-digging mode
An explicit anti-algorithm. One album at a time, full screen, huge artwork, drawn from things I own but haven't played in a long time. Each card states *why* it surfaced: "You haven't played this since March 2024." "Bought eleven months ago. Played once."

Actions: play it, skip to the next, or bury it for a year. Show a session counter — "4 dug, 1 played." The interaction should feel like flipping through a physical crate: weight, resistance, a satisfying commitment when you pull one out. Give me two different models for this in your 17 recommendations.

### 6.4 Ambient now-playing display
A screensaver / kiosk mode for when the app isn't being operated — a second monitor, a tablet propped on a shelf, a small panel next to the amplifier. Ten-foot legibility. Enormous artwork, minimal text, slow ambient motion driven by the extracted palette, a clock, and what's next. Level meters or a spectrum if they earn their place — as a designed element, not a stock visualiser. Include a variant safe for OLED burn-in (drifting composition, no static bright elements).

This should be the thing a visitor notices from across the room.

### 6.5 Statistics and my listening year
Two distinct things, and don't collapse them into one:

**The stats dashboard** — an instrument panel I check. This week / month / year / all time. Top artists, albums, tracks. Genre distribution, using genre data pulled from MusicBrainz rather than whatever nonsense is in my file tags. A listening clock — hour-of-day by day-of-week heatmap. Format breakdown: how much of my listening is actually 24-bit versus CD quality, which is the kind of thing only this app can tell me. Streaks. Ratio of new records to familiar ones. Design this as information design: state readable at a glance, semantic colour kept separate from the accent, charts given the same care as the type.

**The listening year** — a completely different animal. An editorial, scrollable, once-a-year narrative report. Chapters, seasons, real writing, a designed sequence with a beginning and an end. The honest version of what streaming services make as a marketing exercise: my complete data, private, not optimised to be posted anywhere. It should feel like receiving a beautifully printed annual report about myself.

---

## 7. Future features — design them now, mark them clearly

I'll build these later, but I want the UI to already exist so the product has a coherent shape from day one. **Design a consistent "coming soon" treatment** — one defined component and state, applied uniformly, not ad-hoc greying-out.

1. **Natural-language library search.** An "ask" mode in the search bar. "Something quiet for the evening." "Like Talk Talk, but earlier." "The album with the saxophone on track three." Design the input affordance, the thinking state, and how results explain *why* they matched.
2. **Wishlist and acquisition.** Search that reaches past my shelves, with results in visible tiers: *In your library* / *Free and legal* / *Available to buy* / *Findable elsewhere*. One tap means "I want this," and a background worker fulfils it over the following minutes or hours. Design the wishlist screen, the per-item acquisition states (wanted → searching → downloading → tagging → in library), and — importantly — the **"playing a lossy copy while the lossless one arrives"** state, where a track in the queue is visibly provisional and will upgrade itself.
3. **Library health.** Flagged files: fake FLACs that are really upscaled MP3s, missing artwork, unmatched releases, duplicate albums. An inbox to work through.
4. **Handoff between devices.** "Playing on MacBook Pro." Move it to the phone with one tap. A device picker.
5. **Offline downloads on mobile.** Per-album, with storage budget and quality choice.
6. **Party queue.** A QR code that gives guests a stripped-down page that can only add to the queue. Design both the host's view and the guest's page.
7. **NFC tap-to-play.** Pairing a printed NFC card to an album in settings, and the moment of tapping.
8. **Smart playlists.** Rule-based, saved.

---

## 8. Every screen I need

Design all of these. Where a screen has meaningful states, design the states.

**Shell**
1. Desktop shell — sidebar, content region, persistent player bar. Show the collapsed sidebar variant.
2. Mobile shell — tab bar, mini-player, and the drag-to-expand transition to Now Playing.
3. Command palette (⌘K) with search, navigation and actions.
4. Keyboard shortcut reference overlay.

**Library**
5. **Home / Today.** Not a feed. Continue listening; recently added; today's crate pick; on this day in my listening history; what's gone unplayed longest.
6. **Albums.** The main grid. Dense, artwork-led, with sort, filter and a density toggle. Show it at 20 albums and at 800.
7. **Artists** index, and **artist detail** — discography in release order, appears-on, biography, my play history with them.
8. **Album detail.** The most important screen after Now Playing. Huge artwork, palette flooding the page, tracklist with durations and per-track format, credits, release information, my own history with this record ("23 plays, last on 4 March"). Design a normal 10-track album, a 40-track compilation with Various Artists, and a single-work classical album with three 22-minute movements.
9. **Genres.** Browsable, using enriched genre data.
10. **Playlists** index and detail.
11. **Favourites.**

**Playback**
12. **Now Playing, full screen.** Desktop and mobile. Artwork, ambient palette background, transport, scrubber, the signal-path readout, queue peek, lyrics toggle.
13. **Lyrics** — synced, unsynced, and absent.
14. **Queue.** Reorderable. History above, up-next below, "playing from" context, save-as-playlist.
15. **Ambient display mode**, plus the burn-in-safe variant.

**Search**
16. **Search** — empty state with recent searches, in-progress, results grouped by type, no results.
17. **Natural-language "ask" mode** *(coming soon)*.
18. **Tiered external results** *(coming soon)*.

**Crate**
19. **Crate-digging mode** — the card, the session summary, and the empty state for when I've dug through everything.

**Statistics**
20. **Stats dashboard** with its time-range variants.
21. **Listening year** — a multi-screen scrolling narrative. Show me at least four consecutive frames of it.

**Settings**
22. Library and scanning. Playback: gapless, ReplayGain track vs album, crossfade. Quality on cellular versus home network. Appearance: theme, and how strongly artwork drives the palette. Lyrics source. Statistics and privacy. Devices and handoff. About, with real version and library size.

**System states**
23. First-run onboarding: point at the server, scanning progress, an honest summary of what was found and what looks broken.
24. Server unreachable. Scanning in progress. Empty library. Offline / no internet, so enrichment is unavailable.

---

## 9. Flows the prototype must actually perform

1. Open → Home → browse Albums → open an album → press play. The player bar populates, the palette shifts across the whole interface, a simulated timeline runs.
2. Expand the mini-player into full-screen Now Playing, toggle lyrics, watch them scroll against the timeline, tap a line to seek.
3. Search for something, open a result, add it to the queue, reorder the queue.
4. Enter crate mode, dig through three cards, play one, and see the session summary.
5. Open stats, switch between time ranges, and enter the listening year.
6. Switch between desktop and mobile layouts — a viewport toggle in the prototype is fine.
7. Toggle light and dark themes, on the same screen with the same artwork, so I can compare directly.
8. Open ambient display mode and let it run.

---

## 10. Mock data

Use realistic data throughout. Never lorem ipsum, never "Album Title 1."

Build a library of roughly 40 albums that reads like a real collection with real taste and real range: jazz, Hindustani classical, Western classical, electronic, rock, ambient. Mix decades. Include artists whose names carry diacritics. Real durations, real track counts, plausible file formats — mostly 16/44.1, a handful of 24/96, one 24/192.

Deliberately include the hard cases, because they're where designs break:
- An album whose title is 90 characters long.
- A classical release with three movements of 18, 22 and 26 minutes.
- A 40-track Various Artists compilation.
- An album with no artwork.
- A track with no lyrics available.
- An artist with 14 albums and an artist with one.
- Play counts spanning 0 to 400.

Generate cover art procedurally — CSS gradients, canvas, or inline SVG — with genuine variety in hue, contrast and busyness, because the whole palette-extraction system has to survive all of it. Include a nearly-monochrome sleeve and a garish one.

---

## 11. What I don't want

Be blunt with yourself about this. Current AI-generated design clusters hard around a handful of looks, and if this lands in any of them the project has failed at the first step:

- Spotify's dark grey with a single green accent, or any recognisable clone of an existing streaming service.
- Glassmorphism, frosted panels, purple-to-blue gradients.
- Warm cream backgrounds with a serif display face and a terracotta accent.
- Near-black with one lone acid-green or vermilion pop.
- Inter or Space Grotesk as the default face.
- Emoji as section markers or icons.
- Everything centred, everything at the same corner radius, cards with a coloured accent rail.
- A giant hero section on a screen that exists to be operated.
- Numbered `01 / 02 / 03` markers on things that aren't a sequence.

Spend your boldness in one place and keep everything around it quiet.

---

## 12. Summary of what to send back

1. **17 recommendations**, grouped as in section 0, with your own picks marked.
2. **A design canvas** covering every screen in section 8, desktop and mobile.
3. **A single-file interactive prototype** performing every flow in section 9.
4. **A token file** with the Flutter mapping notes.
5. **A short written rationale** — under 400 words — covering the palette, the type pairing, the layout concept, and the one real risk you took.

Then I'll come back and start swapping things.
