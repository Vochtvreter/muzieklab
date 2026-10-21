# Scales (v1.4): design check and implementation plan

Status: **designs resolved; the engine is built (PR 1), the screens are not.** Compared on 2026-10-21: the live app (0.6.3 at vochtvreter.github.io/muzieklab,
the same as `main`) with the [MVP and release canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS) page *Scales ·
Planned*, the [App design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE) *Not built* pages, and
[DESIGN.md](DESIGN.md) §3.7, §9 and §9.1 with [LEARN-CHAPTERS.md](LEARN-CHAPTERS.md) chapter 11. The conflicts found
are resolved on both canvases and in DESIGN.md (§2); two canvas-wide questions stay open (§4).

## 1. What the designs hold

| Screen | MVP canvas (Scales page) | App design canvas | Phone · tablet · desktop |
|---|---|---|---|
| Home with a Scales tile | `HomeScales[-tablet\|-desktop][-dark]` (Home & shell page) | `Main`, `HomeTablet`, `HomeDesktop` | all six |
| Scales hub (circle of fifths) | `ScaleHub`, `ScaleHub-tablet`, `ScaleHubDesktop` + dark | `ScaleHub`, `ScaleHubTablet`, `ScaleHubDesktop` + dark | all six |
| Scale practice setup | `ScaleSetup[-tablet\|-desktop]` + dark | `ScaleSetup` + dark | all six |
| Play on the piano (D major) | `ScalePlay[-tablet\|-desktop]` + dark | `ScalePlay` + dark | all six |
| Spell it (E harmonic minor) | `ScaleSpell[-tablet\|-desktop]` + dark | `ScaleSpell` + dark | all six |
| Round done | `ScalesDone[-tablet\|-desktop]` + dark | `ScalesDone` + dark | all six |
| Learn chapter 11 · Scales | `LearnScales[-tablet\|-desktop]` + dark | `LearnScales` + dark | all six |

Checked and in agreement from the start:

- **Light and dark** draw the same markup on every Scales board (only colours differ), on both canvases.
- **The two canvases** draw the same phone boards: Play and Spell were identical; Hub, Setup, Done and Learn differed
  only in link targets, one hint line and the Learn board's height.
- **Setup and Round done** on tablet and desktop are the phone screen in a 640 px column with no tab bar or header, as
  the live exercise frame (`ExerciseFrame`) does for Read notes setup and its round summary.
- **Tokens**: the boards use the live palette (`src/styles/tokens.css`). New colours: the mastery fills (★★ `#9cc1c1`
  with `#10302f` text, ★★★ slate), the hint tint (`#7a540c` on `#f8edd2`) and the dark versions; they become tokens.
- **Desktop Home** with three tiles uses the live two-column Home; its tile grid is `auto-fit, minmax(180px, 1fr)`.
- **Setup** follows §3.7 option by option, and the live Key screen already picks one key or a mix.

## 2. Conflicts, and how they were resolved

Rule used: DESIGN.md and the live app decide the shell and the patterns; between the two canvases the newer App design
canvas wins (CLAUDE.md); a gap is filled with the pattern the live app already uses for the same thing.

| # | Conflict | Resolution | Changed |
|---|---|---|---|
| 1 | Hub on tablet: MVP drew the phone screen centred; App design drew the header and two columns (circle + selected key). DESIGN.md §9 treats the hub as a Home page with the header. | The App design two-column hub, with the MVP canvas's tablet header (icons, four tabs, items on the right, Home current). The *To resolve* row is deleted. | MVP `ScaleHub-tablet` + dark; `Resolve-ScaleHub-*` and their notes removed |
| 2 | Hub on phone had no tab bar, while tablet and desktop treat it as a Home page. | Tab bar with Home current plus the back arrow, as a Learn chapter and What's new do live (`AppShell`). The content scrolls above the tab bar. DESIGN.md §3.7 and §9 say so. | `ScaleHub` + dark on both canvases |
| 3 | Play and Spell on desktop were the phone screen in a 640 px column; DESIGN.md §9 and live Read notes use the exercise header and a wide layout with keyboard hints. | Redrawn in the Read notes desktop layout: exercise header (Quit · Esc), staff across the top, degree row with the piano or sign buttons, mistakes / Hear it so far (Space) / Start over beside it. Keys: A–L white, W E R T Y U I O black, − 0 = for signs, ↵ next. | MVP `ScalePlay-desktop`, `ScaleSpell-desktop` + dark |
| 4 | Learn boards drew the old chapter 9 (9.1–9.6, "of 9", one quiz, stale chapter list, phone page on tablet). | Redrawn as chapter 11 of 11 from LEARN-CHAPTERS.md (11.1–11.5, a quick check after each section, the chapter check, the live page layout on every size). | `LearnScales` + dark on both canvases, retitled |
| 5 | Setup's *Choose…* hint differed between the canvases. | The App design text: "Opens the key list, the same one as in Read notes." | MVP `ScaleSetup` (all six) |
| 6 | Round done said "Comes back at the end of the round" after the round, and had no *New round* (Read notes has one). | "Came back at the end of the round"; buttons *Change setup* and *New round*; the back arrow goes to the Scales hub (*Back to Scales*). | `ScalesDone` + dark on both canvases |
| 7 | Text under 4.5:1: inactive ring labels (`#7b8788`), white-key letters (`#8a9596`), the letters still to spell (`#a7b1b0`). | `#5a6667` in light, `#9aa7a7` in dark, as the other boards. | Hub, Play and Spell boards on both canvases |
| 8 | Gaps with no board: the 𝄪 button, a black-key tonic, up and down, phone landscape, XP. | Defined in DESIGN.md §3.7 and §9: 𝄪 is a fourth button (key X) only in G♯, D♯ and A♯ minor; the piano window starts on the white key below a black tonic; up and down adds a second line of degree boxes (7 to 1); phone landscape puts staff and degrees left, piano or signs right; XP = 2 per star per scale (×2 up and down) + 5 for an all-★★★ round. | DESIGN.md |

Not changed on purpose:

- The App design canvas's Scales hub on tablet and desktop keeps that canvas's own header (five words, Progress
  included), because every board on that canvas draws the shell that way (§4.1).
- Home's phone tiles: three in a row with the icon above the words, as `HomeScales`. Check at 320 px when building.

## 3. Implementation plan

Three PRs, each releasable, each with its version bump and changelog entry.

### PR 1 · Engine (done: no visible change, so no version bump; the minor bump comes with PR 2)

- `src/core/scale.ts`: a scale is a key signature + a type (`{ key: 'G', type: 'harmonic' }` = E harmonic minor);
  `scaleNotes(scale, direction)` spells it (each letter once, a −2…+2 `ScaleAlter`, staff step and MIDI number;
  melodic minor down as natural minor); `scaleSteps` / `stepName` (W, H, WH); `needsDoubleSharp`; `scaleId`
  (`D-major`, `E-harmonic`) and `parseScaleId`; `CIRCLE` (12 positions, three with two spellings), `CIRCLE_ORDER`;
  `majorLevel`, `minorLevel`, `doneCounts` for the hub; `pianoWindow` (9 white keys from the tonic or the white key
  below it, black keys with the gap they sit in).
- `src/core/scaleRound.ts`: `ScaleSettings` with `sanitizeScaleSettings`; `generateScaleRound` (seeded and shuffled,
  circle order for *Go round the circle*, mixed input alternating); `afterScale` (a scale with mistakes comes back
  once at the end); `isRightNote` (piano by MIDI number, so the octave counts; names by sign); `signChoices` (𝄪 only
  where needed); `scaleStars`, `scoreScaleRound` (first tries count, `cameBack` marks the retried ones),
  `scaleRoundXp`, `updateScaleStars`.
- `src/game/storage.ts`: `progress.scales = { settings, stars }`, sanitized (known scale ids, 1–3 stars).
- Tests (`scale.test.ts`, `scaleRound.test.ts`, `storage.test.ts`): all 60 scales have their pattern and each letter
  once; the board and textbook spellings (D major, E and G♯ harmonic minor, A♯ melodic minor, C♭ major); major and
  natural minor use exactly the key signature; double sharps only in G♯, D♯ and A♯ minor, never a double flat; the
  piano window holds every scale; property tests on the round.

### PR 2 · Scales mode (minor: new feature)

Routes in `src/ui/router.tsx` and screens under `src/ui/screens/scales/`:

| Route | Screen | Frame |
|---|---|---|
| `/scales` | Hub: Major/Minor switch, the circle, the selected key, Options / Practice, Go round the circle | `AppShell` with Home current; back arrow; two columns on tablet and desktop |
| `/scales/setup` | Scale practice setup | `ExerciseFrame` |
| `/scales/key` | The Read notes Key screen, reused (one key or a mix) | `ExerciseFrame` |
| `/scales/play` | Play on the piano / spell with signs, by the round's input | `ExerciseFrame`; desktop: the wide exercise layout (`dplay`); two columns in phone landscape |
| `/scales/done` | Round done | `ExerciseFrame` |

- Components: `CircleOfFifths` (geometry from the boards: phone circle 358 px, radii 146 / 88, buttons 50 / 40 and
  42 / 32; desktop 520 px, radii 212 / 128, buttons 68 / 54 and 58 / 46; a highlight ring that moves to the selected
  key; tap again to switch spelling), `ScalePiano` (9 white keys from the window, marks by MIDI note, computer keys on
  desktop), `DegreeRow` (boxes with W / H between them; a second line for up and down), sign buttons (♭ ♮ ♯, 𝄪 when
  needed), and `PitchStaff` for the notes so far.
- Home: the third Free practice tile *Scales · All the keys*.
- Audio: a short pitched tone for *Play each note* and *Hear it so far* (the engine only plays rhythm sounds today).
- Text in `en.json` and `nl.json`.
- `e2e/layout.spec.ts`: hub, setup, play (piano and names) and done at every size in `e2e/helpers.ts`, light and dark;
  nothing covered, no side scroll, no clipped labels; the hub's Home item is current at every size.
- Compare side by side with the boards at 390 × 844, 834 × 1194 and 1280, plus 844 × 390 and 1180 × 820 (touch:
  desktop layout without keyboard hints).

### PR 3 · Learn chapter 11 (patch: new content)

- `src/ui/learn/chapters.ts` + text, as the `LearnScales` boards: 11.1 The major scale · 11.2 Major scales in every
  key · 11.3 The circle of fifths · 11.4 Minor scales · 11.5 Scale degrees and intervals, each with its quick check,
  practice links into `/scales/setup` presets, and *See the circle in Scales*. The hub's *Learn scales* opens it.
- Remove `learn.laterNote`; update LEARN-CHAPTERS.md (chapter 11 built) and DESIGN.md §9 (v1.4 built).

## 4. Still open (canvas-wide, not Scales only)

1. **The App design canvas's shell** draws five tabs (with Progress) on every board, and on tablet words only with the
   items on the left. DESIGN.md §9 and the live app: the tabs of the release (four until Progress ships), and on
   tablet an icon with each word, items on the right. The MVP canvas follows DESIGN.md. Fixing it means redrawing the
   header on every tablet board of the App design canvas, so it is left for a separate change.
2. **Version numbers:** the MVP canvas's *Test yourself · Built (app 0.7.0)* note describes a version that is not live
   (0.6.3). Whichever of Test yourself and Scales ships first takes 0.7.0; the canvas note should say *Next* until then.
