# Muzieklab

A browser game for practising rhythm reading, rhythm dictation and reading notes. Choose your time
signatures, note values, rests and number of bars; the app generates a new, musically
sensible exercise each time. Tap the rhythm in time on any key or the phone screen, or
listen and write down the rhythm you hear.

**Status:** built so far (the version is in `package.json`; Settings → What's new lists every release): rhythm
practice in Tap and Echo mode (learning path, free practice, play, results with coaching, a daily challenge, XP and
levels, exercise codes with Copy), Read notes (name notes in treble and bass clef in any of the 15 keys, with names or
on a one-octave piano, and a round summary), Learn chapters 1–10 with a quick check after every section, settings and
calibration. Next: Test yourself (flash cards). On phone, tablet and desktop, in light and dark. In English and
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
- [Muzieklab canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS): every screen, one page per feature,
  on phone, tablet and desktop, light and dark, plus the foundations (colour, type, components) and the exercise
  engine.
