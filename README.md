# Muzieklab

A browser game for practising rhythm reading, rhythm dictation, reading notes and scales. Choose your time
signatures, note values, rests and number of bars; the app generates a new, musically
sensible exercise each time. Tap the rhythm in time on any key or the phone screen, or
listen and write down the rhythm you hear.

**Status:** v0.4: the MVP (rhythm practice in Tap mode: learning path, free practice, play,
results with coaching, settings, calibration), the v1.1 quick wins (a daily challenge, XP and
levels, exercise codes with Copy, and Echo mode: hear it, tap it back from memory) and v1.3 Read
notes: name notes in treble and bass clef in any of the 15 keys, with names (do re mi or letters)
or on a one-octave piano, and a round summary. v1.4 Scales (0.7.0): major and minor scales in all 15
keys around the circle of fifths, played on the piano or spelled with ♭ ♮ ♯. The Learn tab has chapters 1–11, from
pulse and meter to scales. 0.10.0 follows a UX test: the examples in Learn and the notes in Read notes can be heard, a
lesson shows its new symbols before it starts, Results tells a steady late tapper to calibrate, and the exercise
screens fit a phone browser. 0.11.0 makes the Path one learning path for notes and rhythm together: the notes come
one at a time (sol, mi, fa, la, do, re, si), to read, write on the staff and hear. 0.12.0 adds accounts, by
invitation only and optional (the app needs none): sign in from Settings → Account; change your name, email and
password, sign out every device, and download or delete your data; admins invite people with a link they send
themselves, and manage roles, blocking and premium. A privacy statement is in Settings → About. 0.14.0 keeps your
progress on your account: signed in, it is saved and merged across your devices, and nothing done before signing in is
lost. Accounts need the API (`server/`); a site without it shows no Account section. On phone, tablet and desktop, in light and dark. In English
and Dutch (Settings → Language); adding a language is one new catalog, see [DESIGN.md §11](docs/DESIGN.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest, including property tests of the rhythm engine
npm run build      # type check + production build in dist/
npm run e2e        # Playwright: layout at every screen size and a full lesson (builds first), the API mocked
npm run e2e:real   # Playwright against the real API: the app, the API bundle and a throwaway MongoDB
```

`npm run e2e:real` needs `npm install` in `server/` first; its first run downloads MongoDB 9.0.4.

On a computer any key is the tap pad; on a phone, tap the pad on screen. Run
Settings → Calibrate once per device so the timing scores match what you hear.

### The API

The API (`server/`: accounts, [BACKEND-PLAN.md](docs/BACKEND-PLAN.md)) is its own package:

```sh
cd server && npm install
npm test           # Vitest, against a throwaway MongoDB (mongodb-memory-server)
npm run build      # the bundle the server runs: dist/server.cjs
```

To run it, the API needs MongoDB as a replica set, because accounts use transactions (a plain `mongod` refuses them).
Start one in a terminal of its own, in `server/`. In memory, empty each time it starts:

```sh
node -e "require('mongodb-memory-server').MongoMemoryReplSet.create({ replSet: { name: 'rs0' }, instanceOpts: [{ port: 27017 }] }).then(() => console.log('MongoDB is ready'))"
```

Or in Docker, keeping its data (after a restart: `docker start muzieklab-dev-mongo`):

```sh
docker run -d --name muzieklab-dev-mongo -p 127.0.0.1:27017:27017 mongo:9.0.4 --replSet rs0
docker exec muzieklab-dev-mongo mongosh --quiet --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
```

Then the API, a first admin and the app, each in its own terminal:

```sh
# in server/, with MONGODB_URI='mongodb://127.0.0.1:27017/muzieklab_dev?replicaSet=rs0' set
COOKIE_SECURE=false npm run dev    # the API: http://127.0.0.1:3000/api/v1/health
npx tsx src/main.ts create-admin --email you@example.com --name You --url http://localhost:5173   # prints a link
# at the root
npm run dev                        # the app: http://localhost:5173
```

- The root `npm run dev` passes `/api` on to the API at 127.0.0.1:3000 and keeps the browser's Host header, which the
  API compares with the Origin of every change. So open the app on http://localhost:5173, then the link create-admin
  printed, and choose a password.
- `COOKIE_SECURE=false` makes the session cookie a plain `session` without Secure, because browsers drop Secure
  cookies over plain http. Never set it on a server ([DEPLOY.md](docs/DEPLOY.md)).
- `npm run preview` and `npm run e2e` have no API: the app then shows no Account section, as on a site without one.

## Deploy

Changes go through the `test` branch: branch from `test` and open the PR into `test`. Every push to `test` (each
merged PR) deploys https://test.vivanova.app (`.github/workflows/deploy-test.yml`), so the merged PRs can be checked
together. When the test site checks out, a release PR merges `test` into `main` with a merge commit, and every push to
`main` runs the tests, builds and deploys the site to the production server over SSH (`.github/workflows/deploy.yml`).
To redeploy without a change, run *Deploy to production* from the Actions tab; to try a branch on the test site before
merging it, run *Deploy to test*. [docs/DEPLOY.md](docs/DEPLOY.md) explains the branches, how to set up the server, and
how to roll back.

The same pushes also still deploy to GitHub Pages (`.github/workflows/pages.yml`).

## Docs

- [Theory sources](docs/THEORY-SOURCES.md): every music theory claim with its source.
- [Accounts and permissions](docs/BACKEND-PLAN.md): the back-end design; phases 0 (the API, MongoDB, backups), 1
  (accounts) and 2 (progress on the account) are built.
- [Design document](docs/DESIGN.md): modes, settings, rhythm generator, timing and
  scoring, gamification, architecture, milestones and open questions.
- [App design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE): screens,
  foundations (colour, type, components) and the exercise engine.
- [MVP and release canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS): the MVP and
  v1.1–v1.7, each on phone, tablet and desktop, light and dark.
