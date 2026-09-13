# Chordall

A better chords-and-lyrics play-along web app. Search the web for the richest
chord charts, play along with auto-scroll, transpose to your voice, see piano
voicings for every chord, and build setlists that generate a bridge progression
to glide seamlessly from one song into the next.

Built for pianists first (chord voicings render on a keyboard), but works for
any instrument.

## Status

Working MVP:

- **Search** across providers (Ultimate Guitar today; pluggable for more).
- **Player** — chords laid over lyrics, section labels, transpose (± semitones
  with live key readout), font size, auto-scroll with speed control, and a
  piano-voicing popover on any chord.
- **Phone-friendly wrapping** — UG stores chords on a separate line above the
  lyrics; we merge the two so each chord sits over its word, then wrap the line
  word-by-word so nothing runs off a narrow screen. Genuine ASCII tab/riffs are
  detected by content and kept in a horizontally-scrolling monospace block
  instead of wrapping.
- **Version picker** — a dropdown of every transcription of the song (pulled from
  UG's version list, ranked by rating × votes); switching reloads that version.
  The current one is labelled `This version (vN)`.
- **Piano or Jye (guitar) mode** — a front-page selector, a Settings toggle, and a
  quick 🎹/🎸 button in the player + perform bars all switch chord diagrams between
  piano voicings and real guitar fingering shapes (from `@tombatossals/chords-db`,
  lazy-loaded). Jye mode also swaps the homepage's suggested artists to a
  guitar-friendly set (`JYE_ARTISTS`) and lets country into the era/theme browse;
  Piano mode shows your listening-history artists and keeps country out.
- **✨ Jazzify** (Juncle/piano mode, per song; in the player *and* perform
  mode) — each press turns the dial up a notch, five levels then back to base,
  all keyed to the detected key and always leaving the writer's own rich chords
  alone: **1 Mild** 7ths by scale degree (I→maj7, ii→m7, V→7, vii°→m7b5) ·
  **2 Warm** + secondary dominants in repeated slots (`C C F` → `Cmaj7 C7 Fmaj7`)
  · **3 Smooth** + walking-bass inversions (`G7/F → Cmaj7/E`) · **4 Rich** + 9ths
  and 13ths · **5 Full jazz** + tritone substitutions (`G7 → Db9 → C`) and
  altered secondary dominants. Every press fires a sparkle burst (bigger the
  jazzier) and a chord shimmer (`lib/music/jazzify.ts`, `components/use-jazzify.ts`,
  `lib/sparkle.ts`).
- **Screen stays awake** — the Screen Wake Lock API keeps the display lit while
  auto-scrolling in the player and for the whole of perform mode (re-acquired
  automatically if you switch apps and come back; released on pause). The compact
  bar shows "☀ screen awake" while it holds. Works in iOS 16.4+ and the
  home-screen app (`components/use-wake-lock.ts`).
- **Top chrome gets out of the way** — scroll down and the header + controls
  slide up off-screen; scroll up (or reach the top) and they slide back. A small
  `⌄` tab at the top summons them any time. Paused while auto-scrolling, since the
  compact bar is your pause button (`components/use-auto-hide.ts`).
- **Rocker steppers** — Transpose and Text are single `[ −  value  + ]` pills with
  44px touch targets that tilt like a rocker switch toward the side you press;
  tap the value to reset (`components/Rocker.tsx`).
- **Focus while scrolling** — starting auto-scroll hides the site header and
  collapses the controls to one slim row (key · ❚❚ · speed) so the chords get
  the screen; pausing brings everything back.
- **Installable (PWA)** — a web manifest plus Apple standalone tags: add it to an
  iPhone home screen and it launches full-screen with no browser chrome,
  extending under the notch (`viewport-fit=cover`) with safe-area padding on the
  top bars and bottom tap-zones. Icons are in `public/` (rendered from
  `public/icon.svg`).
- **Playable scale keyboard** (piano mode) — the current key shows a two-octave
  keyboard with every scale note highlighted and named; tap any key to hear the
  pitch (Web Audio). In the player it sits in the header; in perform mode it's a
  sticky panel toggled from the key badge.
- **Browse the homepage** — "Your artists" chips (baked in from your listening
  history — see `lib/artists.ts`), plus era/theme chips (Musicals, 50s–00s) that
  Claude curates on click — with a hard "no true country" rule. Category browse
  needs the Claude API key; artist chips are just searches and always work.
- **Favourites** + **Suggest next** — heart songs; "Suggest next" picks the
  smoothest-transition song from your favourites and shows the bridge.
- **End-of-song transition** — when the current song is in a setlist, the bottom
  shows the bridge into the next song, a "Next song →" button, and (optional)
  auto-advance after a configurable delay.
- **Perform mode** (`/perform`) — a full-screen runner that plays the setlist in
  order: one song at a time (default transpose applied), the bridge into the next
  song inline, prev/next + auto-advance, and an "end of set" screen. Tapping the
  key badge floats a **sticky, playable keyboard** of the current scale (notes
  highlighted + labelled; tap any key to hear it via Web Audio).
- **Tap-to-scroll speed** — bottom-left `+ Speed`, bottom-right `− Speed`, and a
  centre `↑ Back` that smoothly rewinds half a page (rAF animation, so it works
  even where CSS smooth-scroll is a no-op).
- **On-disk song cache** — fetched charts are cached under `.songcache/`, so a
  song is never re-fetched from the provider.
- **Settings** — text size, high-legibility font, default transpose (e.g. always
  −3), auto-advance + delay, piano voicings.
- **AI setlist by mood** — describe a mood ("cosy rainy Sunday") and Claude
  curates a setlist; each song is resolved to a real chord chart with a bridge
  between them. Requires a Claude API key (see below).

## Enabling the AI setlist

Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
# optional — defaults to claude-opus-5; use a cheaper model if you like:
# CHORDALL_AI_MODEL=claude-haiku-4-5
```

Restart `npm run dev`. Without a key, everything else works and the generator
shows a friendly "add your key" message.
- **Rich chords** — we keep whatever the source provides (`F#m7`, `Esus4`,
  `Cmaj7/E`, …), not just triads.
- **Setlist + transitions** — add songs, reorder them, and between each pair we
  detect both keys and generate a short connecting progression (pivot chord when
  the keys share one, otherwise a V7 lean into the next key) with piano diagrams
  and a plain-English explanation.

Not built yet (deliberately deferred — see "Roadmap"):

- Automatic **chord analysis from audio** when a song isn't found anywhere.
- Additional scraper providers beyond Ultimate Guitar.
- Saved/named setlists, accounts, mobile polish.

## Architecture

```
app/
  page.tsx              search UI
  song/page.tsx         the player (reads ?provider&id&url)
  setlist/page.tsx      setlist + transition cards
  api/search/route.ts   aggregated provider search
  api/song/route.ts     fetch one song -> parsed model + detected key
lib/
  music/chords.ts       chord parsing, transpose, piano voicings (pure)
  music/key.ts          Krumhansl key detection + diatonic helpers
  music/transition.ts   bridge-progression generator between two keys
  chordpro/parse.ts     UG [ch] markup / ChordPro -> chords-over-lyrics model
  providers/            provider abstraction + Ultimate Guitar scraper
components/             ChordSheet, PianoChord, SetlistProvider, SiteHeader
```

### How sourcing works (and its caveat)

Chord sites have no public API. The Ultimate Guitar provider fetches the page
HTML and reads the JSON blob UG embeds in `<div class="js-store" data-content>`
rather than screen-scraping the DOM — much more stable, but still a scrape: if
UG changes their markup, `lib/providers/ultimate-guitar.ts` is the one place to
fix. Providers are isolated and searched with `Promise.allSettled`, so one
breaking never takes down the app. This is a ToS gray area; it's here because it
was an explicit product requirement.

## Develop

```bash
npm run dev     # http://localhost:3000
npm run build   # production build + typecheck
```

## Deploy (Docker + Saltbox / Traefik)

Chordall builds to a self-contained Next.js standalone server and ships as a
small Docker image (`node:24-alpine`).

**Prerequisites**

- A working Saltbox stack with Traefik on the external `saltbox` Docker network,
  entrypoints `web`/`websecure`, and the `cfdns` cert resolver (the defaults).
- A DNS record for your chosen hostname pointing at the server (Cloudflare).

GitHub Actions builds and publishes the image to
`ghcr.io/71cky5p1t/chordall:latest` on every push to `main`, so the server just
pulls it — no source needed on the box.

**Steps**

1. On the server, create a folder and drop in `docker-compose.yml` + a `.env`:

   ```bash
   mkdir -p /opt/chordall && cd /opt/chordall
   # copy docker-compose.yml here, then:
   cp .env.example .env   # or create .env by hand
   # set CHORDALL_HOST=chordall.yourdomain.com
   # set ANTHROPIC_API_KEY=... (optional, for AI features)
   ```

2. Pull and start:

   ```bash
   docker compose up -d
   ```

Traefik picks it up from the labels and serves it at `https://$CHORDALL_HOST`.

**Auto-updates:** the compose includes a bundled Watchtower (`chordall-watchtower`)
that polls GHCR every 5 minutes and, when CI publishes a newer `:latest`, pulls it,
recreates the container, and prunes the old image. It's scoped by
`--label-enable` to the `watchtower.enable=true` label — so it only ever updates
Chordall, never Radarr or anything else on the box. To update by hand instead,
`docker compose pull && docker compose up -d`.

> **One-time:** the GHCR package is created private on the first workflow run.
> Make it public (repo → Packages → chordall → Package settings → Change
> visibility) so the server can pull without a login — or, to keep it private,
> `echo $TOKEN | docker login ghcr.io -u <user> --password-stdin` on the server
> with a PAT that has `read:packages`.

To build locally from source instead, edit `docker-compose.yml` to use `build:`
and run `docker compose up -d --build`.

**Volumes & data**

- `chordall-cache` (named volume) — persists fetched chord charts so songs aren't
  re-fetched. That's the only state; there's no database.

**Notes**

- The Traefik middleware names in `docker-compose.yml`
  (`redirect-to-https@docker`, `cloudflarewarp@docker`, `gzip@docker`,
  `*Headers@file`, `securetls@file`) are the Saltbox defaults — adjust them if
  your Traefik dynamic config names them differently.
- Not on Saltbox? Drop the labels and the `saltbox` network, add
  `ports: ["3000:3000"]`, and put it behind whatever reverse proxy you use.
- Update later with `git pull && docker compose up -d --build`.

## Roadmap

1. Persist search results across back-navigation; saved/named setlists.
2. More providers (e-chords, Chordie, ChordPro repos) behind the same interface.
3. Audio chord-analysis fallback: a Python microservice (librosa/madmom/chordino)
   that estimates chords when no chart exists — approximate, best for a starting
   point you refine.
4. Playback sync (tap-tempo or audio beat tracking) so auto-scroll tracks the
   real song, not just a constant speed.
