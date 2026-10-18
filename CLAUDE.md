# Muzieklab

## Versioning

The version lives in `package.json` (Settings → About shows it). Every bug fix, small fix or tweak bumps
the patch number (0.x.y → 0.x.y+1) in the same PR as the change: `npm version patch --no-git-tag-version`
updates `package.json` and `package-lock.json` together.

Every version bump adds its release at the top of `src/ui/lib/changelog.ts`, with its text under `changelog` in
`src/i18n/en.json`; Settings → What's new shows it. A unit test fails when the newest entry is not the version in
`package.json`.
