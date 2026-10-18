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
