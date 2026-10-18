# Muzieklab

A browser game for practising rhythm reading, rhythm dictation and reading notes. Choose your time
signatures, note values, rests and number of bars; the app generates a new, musically
sensible exercise each time. Tap the rhythm in time on any key or the phone screen, or
listen and write down the rhythm you hear.

**Status:** v0.4: the MVP (rhythm practice in Tap mode: learning path, free practice, play,
results with coaching, settings, calibration), the v1.1 quick wins (a daily challenge, XP and
levels, exercise codes with Copy, and Echo mode: hear it, tap it back from memory) and v1.3 Read
notes: name notes in treble and bass clef in any of the 15 keys, with names (do re mi or letters)
or on a one-octave piano, and a round summary. The Learn tab has chapter 8, Notes on the staff;
the rhythm chapters (v1.2) come next. On phone, tablet and desktop, in light and dark. In English and
Dutch (Settings → Language); adding a language is one new catalog, see [DESIGN.md §11](docs/DESIGN.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest, including property tests of the rhythm engine
npm run build      # type check + production build in dist/
npm run e2e        # Playwright: layout at every screen size and a full lesson (builds first)
```

On a computer any key is the tap pad; on a phone, tap the pad on screen. Run
Settings → Calibrate once per device so the timing scores match what you hear.

## Deploy

Every push to `main` runs the tests, builds and redeploys the site to GitHub Pages
(`.github/workflows/pages.yml`). To redeploy without a change, run *Deploy to GitHub Pages*
from the Actions tab.

## Docs

- [Theory sources](docs/THEORY-SOURCES.md): every music theory claim with its source.
- [Design document](docs/DESIGN.md): modes, settings, rhythm generator, timing and
  scoring, gamification, architecture, milestones and open questions.
- [App design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE): screens,
  foundations (colour, type, components) and the exercise engine.
- [MVP and release canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS): the MVP and
  v1.1–v1.7, each on phone, tablet and desktop, light and dark.
