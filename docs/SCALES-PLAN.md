# Scales (v1.4): design check and implementation plan

Status: **prepared, not built.** Compared on 2026-10-21: the live app (0.6.3 at vochtvreter.github.io/muzieklab, the
same as `main`) with the [MVP and release canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS) page *Scales ·
Planned*, the [App design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE) *Not built* pages, and
[DESIGN.md](DESIGN.md) §3.7, §9 and §9.1 with [LEARN-CHAPTERS.md](LEARN-CHAPTERS.md) chapter 11.

## 1. What the designs hold

| Screen | MVP canvas (Scales page) | App design canvas | Phone · tablet · desktop |
|---|---|---|---|
| Home with a Scales tile | `HomeScales[-tablet\|-desktop][-dark]` (Home & shell page) | – | all six |
| Scales hub (circle of fifths) | `ScaleHub`, `ScaleHub-tablet`, `ScaleHubDesktop` + dark | `ScaleHub`, `ScaleHubTablet`, `ScaleHubDesktop` + dark; same as *To resolve* `Resolve-ScaleHub-*` | all six, but tablet differs (§2.1) |
| Scale practice setup | `ScaleSetup[-tablet\|-desktop]` + dark | `ScaleSetup` + dark | all six |
| Play on the piano (D major) | `ScalePlay[-tablet\|-desktop]` + dark | `ScalePlay` + dark | all six |
| Spell it (E harmonic minor) | `ScaleSpell[-tablet\|-desktop]` + dark | `ScaleSpell` + dark | all six |
| Round done | `ScalesDone[-tablet\|-desktop]` + dark | `ScalesDone` + dark | all six |
| Learn chapter · Scales | `LearnScales[-tablet\|-desktop]` + dark | `LearnScales` + dark | all six, but out of date (§2.3) |

Checked and in agreement:

- **Light and dark** draw the same markup on every Scales board (only colours differ), on both canvases.
- **The two canvases** draw the same phone boards: Play and Spell are identical; Hub, Setup, Done and Learn differ only
  in link targets, one hint line (§2.5) and the Learn board's height.
- **Exercise screens** (Setup, Play, Spell, Done) on tablet and desktop are the phone screen in a 640 px column with
  no tab bar or header. That is what the live exercise frame does (`ExerciseFrame`, 640 px at tablet, desktop and phone
  landscape, measured on the live site).
- **Tokens**: the boards use the live palette (`src/styles/tokens.css`). New colours: the mastery fills (★★ `#9cc1c1`
  with `#10302f` text, ★★★ slate), the hint tint (`#7a540c` on `#f8edd2`) and the dark versions; they become tokens.
- **Desktop Home** with three tiles (`HomeScales-desktop`) uses the live two-column Home; its tile grid is
  `auto-fit, minmax(180px, 1fr)`, so the third tile joins the row.
- **Setup** follows §3.7 option by option (keys, four scale types with their step patterns, answer with, direction,
  write with, show the steps, play each note). Both versions of the *Choose…* hint fit the live Key screen, which
  already picks one key or a mix.

## 2. Conflicts and gaps

### 2.1 Scales hub on tablet: two designs (decide)

- MVP canvas `ScaleHub-tablet`: the phone screen centred, no header, back arrow to Home.
- App design canvas `ScaleHubTablet` (and *To resolve* `Resolve-ScaleHub-tablet` on the MVP canvas): the top header
  with Home current, then two columns: the circle beside a panel with the key signature, mastery per form and the
  scale notes, then Options / Practice and *Go round the circle*.
- DESIGN.md §9: on tablet the tab bar becomes the top header, and "a screen opened from a tab (the Scales hub from
  Home's practice tile) marks that tab as current." That matches the App design canvas.

**Plan:** build the App design canvas version (newer canvas and DESIGN.md agree), unless you decide otherwise.

### 2.2 The header on the hub boards

- `ScaleHubTablet` / `Resolve-ScaleHub-tablet`: words only and five items (with Progress). DESIGN.md §9 and the live
  tablet header: an icon with each word, and four items (Progress joins in v1.5).
- App design `ScaleHubDesktop` / `Resolve-ScaleHub-desktop`: five items with Progress; MVP `ScaleHubDesktop` has four,
  as live.
- Phone `ScaleHub` (both canvases) has no tab bar, only a back arrow, while tablet and desktop treat the hub as a tab
  screen with Home current.

**Plan:** the live shell (`AppShell`): four items, icons on tablet, Home current on tablet and desktop. On phone, keep
the board (no tab bar, back to Home). Open question: should the phone hub show the tab bar with Home current?

### 2.3 Learn chapter boards are out of date (redraw)

`LearnScales` (all six, both canvases) is the old chapter 9:

| Board | DESIGN.md §9.1, LEARN-CHAPTERS.md, live app |
|---|---|
| "Chapter 9 of 9", sections 9.1–9.6 | Chapter 11 of 11, sections 11.1–11.5 |
| 9.1 Half steps and whole steps | Moved to 9.2 (live); 11.1 builds on it |
| "Its key signature (8.7)" | The key signature is 10.1 |
| 9.6 Scale degrees | 11.5 Scale degrees **and intervals**, with the tonic triad |
| One quick check at the end | A quick check after every section, plus the chapter check (0.6.0) |
| Tablet: the phone page centred, no header | Live Learn on tablet: header, full width |
| Desktop chapter list: 1–8 and 9 Scales, "7 Compound meter · Later" | Live: 1–10, chapter 7 is triplets |

**Plan:** write chapter 11 from LEARN-CHAPTERS.md with the live Learn page; the board is used only for the blocks
(the half-step keyboard, the degree table). The boards need redrawing as chapter 11.

### 2.4 The canvas says Test yourself is built at 0.7.0

The MVP canvas's *Test yourself · Built (app 0.7.0)* note and the Learn home it describes (topic tiles Rhythm, Reading
notes, Scales as Later) are not live: the live app is 0.6.3 with the chapter list. Scales would be the next minor
version (0.7.0) under the versioning rules, so the canvas note claims a version that does not exist yet. Where
chapter 11 shows depends on which ships first.

### 2.5 Smaller differences and gaps

1. **Setup hint for *Choose…*:** MVP "Opens a list of all 15 keys; tick the ones you want." · App design "Opens the
   key list, the same one as in Read notes." Plan: the App design text (it is what gets built).
2. **Home tiles on phone:** the board puts three tiles in one row with the icon above the words; live has two tiles
   with the icon beside the words. At 320 px each tile is about 90 px wide: check that "Read notes / Treble and bass"
   still fits.
3. **Double sharps:** §3.7 says F𝄪 appears in G♯ harmonic minor (also C𝄪 in D♯, G𝄪 in A♯; melodic minor adds E♯/B♯).
   The Spell board has only ♭ ♮ ♯. No board shows a 𝄪 button. Proposal: a fourth button, shown only in keys that need it.
4. **Black-key tonics on the piano:** §3.7 says the 9-white-key window starts on the tonic; for F♯, D♭, B♭ and the
   other black-key tonics it must start on the white key below. Not drawn.
5. **Up and down:** the boards draw 8 degree boxes (up only). Up and down has 15 notes; not drawn.
6. **Desktop keyboard hints:** Read notes shows computer keys on desktop (A–J, W–U). The Scales boards have none, and
   the piano has 9 white keys. Proposal: A S D F G H J K L for the white keys and W E (R) T Y U (I) O P for the black.
7. **Phone landscape (844 × 390):** §9 lists the exercise screens that go two-column; Scales Play / Spell are not on
   the list and not drawn. Plan: staff and degrees on the left, piano or sign buttons on the right, like Read notes.
8. **Round done copy:** each scale with mistakes says "Comes back at the end of the round", on a screen shown after
   the round. Proposal: "Came back at the end". The board also has no *New round* (Read notes has New round /
   Practice missed notes); it offers Change setup and Back to the circle.
9. **XP for scales** is not defined (§3.5 has it for notes, §3.7 does not). Proposal: per scale 3 × stars, + 5 when the
   round has no mistakes.
10. **Sound:** *Play each note* and *Hear it so far* need a pitched voice; the audio engine only plays rhythm
    sounds today, and Read notes is silent.
11. **Contrast:** the inactive ring labels on the phone hub use `#7b8788` on `#eef1f0` (3.3:1, under 4.5:1); the desktop
    board already uses `#5a6667`. Plan: `#5a6667` everywhere.

## 3. Implementation plan

Three PRs, each releasable, each with its version bump and changelog entry.

### PR 1 · Engine (0.6.4, patch: no visible change)

- `src/core/scale.ts`: scale types and step patterns (major W W H W W W H, natural W H W W H W W, harmonic
  W H W W H 1½ H, melodic W H W W W W H up and natural minor down); `spellScale(tonic, type, direction)` with each
  letter once and a −2…+2 alter (Read notes' `Alter` stays −1…+1); the 12 circle positions with the three enharmonic
  pairs (B/C♭, F♯/G♭, D♭/C♯) and their relative minors; key ids reuse `KeyId` from `pitch.ts`; the piano window
  (first white key at or below the tonic, 9 white keys); judging (piano by sounding key and octave, names by letter +
  sign); `scaleId` (`D-major`, `E-harmonic`).
- `src/core/scaleRound.ts`: a seeded round (chosen keys × chosen types, shuffled; *Go round the circle* in circle
  order), scales with mistakes queued again at the end, stars by mistakes (0 → ★★★, 1 → ★★, 2–3 → ★), XP (§2.5.9).
- `src/game/storage.ts`: `progress.scales = { settings, stars: Record<scaleId, 0–3> }` with sanitizing; hub fill =
  major stars, or minor forms with ★★+.
- Tests: every one of the 60 scales spells each letter once and has the right pattern; known spellings (E harmonic
  minor has D♯, G♯ harmonic minor has F𝄪); the 15 major scales' signs equal their key signatures; property tests on
  the round.

### PR 2 · Scales mode (0.7.0, minor: new feature)

Routes in `src/ui/router.tsx` and screens under `src/ui/screens/scales/`:

| Route | Screen | Frame |
|---|---|---|
| `/scales` | Hub: Major/Minor switch, the circle, the selected key, Options / Practice, Go round the circle | `AppShell` with Home current on tablet and desktop; phone as the board (§2.2) |
| `/scales/setup` | Scale practice setup | `ExerciseFrame` |
| `/scales/key` | The Read notes Key screen, reused (one key or a mix) | `ExerciseFrame` |
| `/scales/play` | Play on the piano / spell with signs, by the round's input | `ExerciseFrame`, two columns in phone landscape |
| `/scales/done` | Round done | `ExerciseFrame` |

- Components: `CircleOfFifths` (geometry from the boards: phone circle 358 px, radii 146 / 88, buttons 50 / 40 and
  42 / 32; desktop 520 px, radii 212 / 128, buttons 68 / 54 and 58 / 46; a highlight ring that moves to the selected
  key; tap again to switch spelling), `ScalePiano` (9 white keys from the window, marks by MIDI note, desktop keys),
  `DegreeRow` (boxes with W / H between them), sign buttons (♭ ♮ ♯, 𝄪 when needed), and `PitchStaff` for the notes
  so far.
- Home: the third Free practice tile *Scales · All the keys* (phone grid of three, desktop `auto-fit`).
- Audio: a short pitched tone for *Play each note* and *Hear it so far*.
- Text in `en.json` and `nl.json`.
- `e2e/layout.spec.ts`: hub, setup, play (piano and names) and done at every size in `e2e/helpers.ts`, light and dark;
  nothing covered, no side scroll, no clipped labels; the hub's Home item is current on tablet and desktop.
- Compare side by side with the boards at 390 × 844, 834 × 1194 and 1280, plus 844 × 390 and 1180 × 820 (touch:
  desktop layout without keyboard hints).

### PR 3 · Learn chapter 11 (0.7.1, patch: new content)

- `src/ui/learn/chapters.ts` + text: 11.1 The major scale · 11.2 Major scales in every key · 11.3 The circle of fifths
  · 11.4 Minor scales · 11.5 Scale degrees and intervals, each with its quick check, practice links into
  `/scales/setup` presets, and *See the circle in Scales*. The hub's *Learn scales* opens it.
- Remove `learn.laterNote`; update LEARN-CHAPTERS.md (chapter 11 built) and DESIGN.md §9 (v1.4 built).

### Canvas follow-up (after the decisions above)

Move the chosen hub tablet board into its row and delete the other; redraw `LearnScales` as chapter 11 at all six
sizes; add a board for up and down, the 𝄪 button, a black-key tonic and phone landscape; fix the Done copy; move the
Scales rows to *Built* when PR 2 ships.

## 4. Decisions needed

1. Hub on tablet: App design canvas (header + two columns, recommended) or the MVP board (phone layout centred)?
2. Phone hub: no tab bar (board) or the tab bar with Home current?
3. Learn: chapter 11 in the current chapter list, or wait for the Learn home with topic tiles (Test yourself)?
4. XP for a scales round (proposal in §2.5.9), and the Done screen's buttons (add *New round*?).
5. The 𝄪 button and the up-and-down degree row: build from the proposals, or draw them first?
