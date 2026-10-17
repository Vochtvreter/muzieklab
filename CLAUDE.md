# Muzieklab

## Versioning

The version lives in `package.json` (Settings → About shows it). Every bug fix bumps the patch number
(0.x.y → 0.x.y+1) in the same PR as the fix: `npm version patch --no-git-tag-version` updates
`package.json` and `package-lock.json` together.
