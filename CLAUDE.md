# Muzieklab

## Designs first

Every screen is designed on the [Muzieklab canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS) before it is
built, on phone (390 × 844), tablet (834 × 1194) and desktop (1280 wide), light and dark. The canvas holds the screens;
[DESIGN.md](docs/DESIGN.md) holds the requirements (what a feature does, its rules and numbers) and §9 the breakpoints
and layout rules.

The canvas has one page per feature, plus *Start here* (the map and these rules), *Foundations* (colour, type,
components, the engine) and *Archive* (earlier versions, never built from). The page name ends with its status: *Built*, *Next*, *Planned* or *Idea*. On every page:

- a spec note at the top says what the page covers, the DESIGN.md section it follows, and any open conflicts;
- each screen is one row of six boards: phone, tablet and desktop in light, then the same three in dark;
- built screens come first; screens that are designed but not built sit under *Planned* below them;
- *To resolve* holds boards from the old App design canvas that differ from the row above them, each with a note on
  how. When you work on such a screen, ask the user which one is right, keep it in the screen's row and delete the
  other;
- board files are named `Screen[-tablet|-desktop][-dark].dc.html`.

Before you add or change a screen, read its row on the canvas and build what it shows. A live screen needs all three
versions: phone, tablet and desktop. Also check phone landscape (844 × 390) and a tablet in landscape (1180 × 820,
touch), which the canvas does not draw. Then compare the result side by side with the boards. If a screen has no board
yet, or the code has to differ from it, say so in the PR. Every screen gets a test in `e2e/layout.spec.ts`, which runs
at every size in `e2e/helpers.ts`.

### Keep the designs consistent

The canvas and DESIGN.md describe one app, so they must agree. The shell is the same everywhere: a bottom tab bar on
phone, and a top header on tablet and desktop (the canvas's *Home & shell* page; DESIGN.md §9). There is no desktop
sidebar.

- **Before you build a designed screen,** compare its row with its DESIGN.md section and the page's spec note: shell,
  layout, which parts are shown, and copy.
- **When you add or change a board,** put it in its screen's row on its feature page, reuse the shell, tokens and
  component markup of the boards that already exist, and update all six versions. A new feature gets a new page with
  the same layout and a spec note.
- **When a requirement changes,** update DESIGN.md and the page's spec note in the same change. **When a screen ships,**
  move its row above *Planned*, and update the page name and spec note.
- **When two designs conflict** (a board and DESIGN.md, two boards for one screen, or a board and what is built), do
  not pick one silently. Point the conflict out to the user, naming the boards or sections on each side and how they
  differ, so they can investigate; list it in the PR and in the page's spec note. If work has to go on before they
  answer, follow DESIGN.md and say that you did.

## Learning content

Learn chapters (`src/ui/learn/chapters.ts`) and Learning Path units (`src/game/path.ts`) are data with their text in
`src/i18n/en.json`. [docs/ADDING-CONTENT.md](docs/ADDING-CONTENT.md) explains how to add them; the plan for the chapters is
in [docs/LEARN-CHAPTERS.md](docs/LEARN-CHAPTERS.md).

## Versioning

The version lives in `package.json` (Settings → About shows it) and follows major.minor.patch. Bump it in the same PR
as the change; `npm version <patch|minor|major> --no-git-tag-version` updates `package.json` and `package-lock.json`
together.

- **Patch** (0.3.0 → 0.3.1): bug fixes, small fixes and tweaks, and new content (a Learn chapter or lesson, new
  exercises) that needs no new feature.
- **Minor** (0.3.1 → 0.4.0): new features.
- **Major** (0.x.y → 1.0.0): only for a major release or an overhaul.

Every version bump adds its release at the top of `src/ui/lib/changelog.ts`, with its text under `changelog` in
`src/i18n/en.json`; Settings → What's new shows it. A unit test fails when the newest entry is not the version in
`package.json`.
