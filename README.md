# Muzieklab

A browser game for practising rhythm reading and rhythm dictation. Choose your time
signatures, note values, rests and number of bars; the app generates a new, musically
sensible exercise each time. Tap the rhythm in time on any key or the phone screen, or
listen and write down the rhythm you hear.

**Status:** MVP built: rhythm practice in Tap mode (learning path, free practice, play,
results with coaching, settings, calibration), on phone, tablet and desktop, in light and dark.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest, including property tests of the rhythm engine
npm run build      # type check + production build in dist/
```

On a computer any key is the tap pad; on a phone, tap the pad on screen. Run
Settings → Calibrate once per device so the timing scores match what you hear.

## Deploy

`.github/workflows/deploy.yml` tests, builds and publishes the app to GitHub Pages on every push to `main`
(or by hand: **Actions → Deploy to GitHub Pages → Run workflow**). One-time setup: **Settings → Pages →
Build and deployment → Source = GitHub Actions**. The app is then live at
`https://vochtvreter.github.io/muzieklab/`. The build uses a relative base, so it works under any path.

## Docs

- [Theory sources](docs/THEORY-SOURCES.md): every music theory claim with its source.
- [Design document](docs/DESIGN.md): modes, settings, rhythm generator, timing and
  scoring, gamification, architecture, milestones and open questions.
- [App design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE): screens,
  foundations (colour, type, components) and the exercise engine.
- [MVP and release canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS): the MVP and
  v1.1–v1.7, each on phone, tablet and desktop, light and dark.
