# Muzieklab

## Designs first

Every screen is designed on the canvases before it is built, on phone (390 × 844), tablet (834 × 1194) and desktop
(1280 wide), light and dark:

- [MVP and release canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS): one page per release (MVP, v1.1–v1.7,
  Metronome style). Use the board for the screen you are changing, at each size.
- [App design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE): foundations (colour, type, components).
- [DESIGN.md](docs/DESIGN.md) §9: breakpoints and layout rules.

Before you add or change a screen, read its boards on the canvas and build what they show. A live screen needs all
three versions: phone, tablet and desktop. Also check phone landscape (844 × 390) and a tablet in landscape
(1180 × 820, touch), which the canvas does not draw. Then compare the result side by side with the boards. If a screen
has no board yet, or the code has to differ from it, say so in the PR. Every screen gets a test in
`e2e/layout.spec.ts`, which runs at every size in `e2e/helpers.ts`.

### Keep the designs consistent

The two canvases and DESIGN.md describe one app, so they must agree. The shell is the same everywhere: a bottom tab
bar on phone, and a top header on tablet and desktop (the App design canvas, Desktop · Home; DESIGN.md §9). There is no
desktop sidebar.

- **Before you build a designed screen,** compare its boards on both canvases (the release page on the MVP canvas and
  the matching board on the App design canvas) with DESIGN.md: shell, layout, which parts are shown, and copy.
- **When you add or change a board,** reuse the shell, tokens and component markup of the boards that already exist,
  and check that it still agrees with the same screen on the other canvas and with DESIGN.md. Update every board that
  draws that screen, in light and dark.
- **When two designs conflict** (two boards for one screen, a board and DESIGN.md, or a board and what is built), do
  not pick one silently. Point the conflict out to the user, naming the boards or sections on each side and how they
  differ, so they can investigate, and list it in the PR. If work has to go on before they answer, follow the newer
  App design canvas and DESIGN.md, and say that you did.

### Built and not built

Both canvases split their pages by what the app has: **Built · …** pages hold screens that are live, **Not built · …**
pages hold screens that are designed but not in the app yet (on the App design canvas: Built · light / dark and Not
built · light / dark). When a PR ships a screen, move its boards (light and dark, every size) from the Not built page to
the matching Built page in the same PR, and say so in the PR. A board for a new, unbuilt screen goes on a Not built page.

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
