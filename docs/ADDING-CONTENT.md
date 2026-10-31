# Adding learning content

Learn chapters and Learning Path units are data. Adding one is an entry in a data file plus its text in
`src/i18n/en.json`; no screen code changes. Tests check that every text exists and every example and preset works.

Before you start: the chapter plan is in [`LEARN-CHAPTERS.md`](LEARN-CHAPTERS.md), every theory claim needs its row in
[`THEORY-SOURCES.md`](THEORY-SOURCES.md), and a new screen or section still needs its boards on the canvas
([CLAUDE.md](../CLAUDE.md), *Designs first*). New content is a patch release (CLAUDE.md, *Versioning*).

## A Learn chapter or section

1. **Data:** add the chapter to `CHAPTERS` in `src/ui/learn/chapters.ts`, in number order, or a section to a chapter.
   Sections are numbered `n.1`, `n.2`, … in order. The page, its route (`#/learn/n`), the Learn tab's chapter list, the
   desktop sidebar, previous / next and the read status all follow from the data.
2. **Text:** in `src/i18n/en.json`, under `learn`:
   - `chapters.{n}.title` and `.sub`: the name and the line under it in the chapter list;
   - `builds` and `units` in the data give the line under the intro ("Builds on chapters 1 and 2 · Path units 2, 6,
     10"); units are numbers in the Learning path (`PATH_UNITS` in `src/game/tracks.ts`: rhythm unit n is path unit
     2n);
   - `ch{n}.intro`, and `ch{n}.quiz.question`, `.right`, `.wrong` for the quick check;
   - `ch{n}.s{k}.title` for every section, `.check.question`, `.right` and `.wrong` for its quick check, `.practice` for
     its practice link, and every key its blocks name.
   Keys inside a section are relative: in section 9.3, `{ kind: 'text', text: 'point1' }` reads `learn.ch9.s3.point1`.
   Every other catalog (`nl.json`) needs the same keys; `src/i18n/i18n.test.ts` fails on one that is missing.
3. **Run `npm test`.** `src/ui/learn/chapters.test.ts` fails on a missing text, a note or rhythm that does not parse,
   a bar that is not full, a quick check without a right answer, or a practice preset that cannot be played.
   `npm run e2e` then checks that every chapter fits at every screen size.

### Blocks

| Block | Shows |
|---|---|
| `{ kind: 'text', text }` | a paragraph |
| `{ kind: 'tip', text }` | a grey box: a memory aid or "in the game" |
| `{ kind: 'list', items }` | a bulleted list |
| `{ kind: 'tiles', tiles: [{ glyph, title, text }] }` | cards with a music glyph (the two clefs) |
| `{ kind: 'staff', clef, keyId?, notes, labels?, title?, value?, slots?, room?, play?, alt }` | a five-line staff, one whole note per bar. `notes: 'E4 G4 F#4 Bb4 Fn5'` (letter, sign `#` `b` `n`, octave; C4 = middle C). `labels: 'name'` writes the names under the notes. `slots: 0` draws only the clef and key signature, with `value` beside it. A `value` stays on one line (DESIGN.md §9.1, *Narrow phones*), so keep it as short as a step pattern or a row of letters. `play: true` adds a play button (see *Sound* below). |
| `{ kind: 'rhythm', meter, bars, title?, value?, verdict?, common?, tempo?, alt }` | the one-line rhythm staff with the counting under the notes, and a play button. `bars: ['q [8 8] h', 'q. 8 q qr']`; the tokens are in `src/render/notationText.ts` (`w h q 8 16`, `.` dot, `r` rest, `~` tie, `t` triplet, `W` whole-bar rest, `[ ]` beam). The counts come from the rhythm (`src/render/counting.ts`). `verdict: 'write' \| 'avoid'` adds a green or red label, `common: true` draws 4/4 as C, `tempo: 60` plays it at 60 BPM (default 80). |
| `{ kind: 'table', rows: [{ glyph?, title, text?, value? }] }` | rows of a name, a line under it and a value on the right (tempo words, the rests) |
| `{ kind: 'beatGrid', rows: [{ title, beat }], alt }` | one beat divided several ways, each row's counts in one grid: `beat: '[8. 16]'` reads 1 (&) a |
| `{ kind: 'timeSig', meter, top, bottom }` | a big time signature beside what its two numbers mean |
| `{ kind: 'accents', meters }` | strong, medium and weak beats per meter, from the engine's metric weights |
| `{ kind: 'pulse', tempos, alt }` | four seconds of beats at each tempo, each with a play button |
| `{ kind: 'noteTree' }` | the note tree, one bar of 4/4 per value, with a Notes \| Rests switch; each bar can be played |
| `{ kind: 'piano', marked?, alt }` | one piano octave from middle C; a tapped key sounds. `marked: ['E', 'F']` tints white keys and adds a play button |
| `{ kind: 'noteNames' }` | C–B with do re mi |
| `{ kind: 'pair', variant?, columns }` | columns side by side on tablet and desktop, stacked on phones (`'staves'` or `'text'`) |

Every `alt` is the description a screen reader gets for the picture; for a staff it may use `{names}`, the notes as
they are said (*F sharp*).

### Sound

Examples that show music can be heard (DESIGN.md §9.1). A round play button sits in front of the notation on tablet and
desktop, and at the start of the example's first line on phones; it turns into Stop while the example plays. Its name
for screen readers is the example's `title`, or its `alt` when it has none (*Play: Whole note*). One example plays at a
time, and leaving the chapter stops it. The sound follows the Sound volumes in Settings.

| Block | Play button | What it plays |
|---|---|---|
| `rhythm` | always | one bar of count-in clicks, then the rhythm on the woodblock with every beat clicking, at `tempo` (default 80 BPM) |
| `noteTree` | always, per row | that row's bar the same way (a rests row: only the clicks) |
| `pulse` | always, per tempo | four seconds of beat clicks; the dot of each beat lights up |
| `staff` | with `play: true` | the notes left to right as piano tones (the scales of chapter 11 go up); a note without a sign takes the key signature's |
| `piano` | with `marked` | the marked keys in the order written, each above the one before (`['E', 'F', 'B', 'C']` plays E–F and B–C) |

Every piano diagram's keys sound when tapped. Tables, text, the beat grid and the other blocks stay silent. What each
block sends to the audio engine is worked out in `src/ui/lib/learnSound.ts` (unit tested), and played by
`src/ui/learn/Listen.tsx`.

A new kind of block (counting under the notes, for example) is a case in the `Block` type in `chapters.ts`, a case in
`src/ui/learn/Blocks.tsx`, and a line in `blockKeys` in `chapters.test.ts`.

### Practice links and the quick check

- `practice: { notes: { clefs: ['bass'], range: 'staff' } }` starts a Read notes round straight away, with those
  settings on top of the player's own (answer with, notes per round and the timer stay). `practice: { rhythm: { meters:
  ['3/4'] } }` starts a rhythm exercise the same way, in Tap mode (tempo, bars and the metronome stay the player's).
  An extra the preset turns on (`dotted`, `ties`, `triplets`) is in the exercise and in Results' Next. A tie needs two
  bars, so with the player's Bars at 1 a `ties` preset plays 2; the player's setup keeps 1. Where the preset alone
  does not make sure of what the section teaches, name it with `shows` beside the preset, in the ids of
  `src/game/intro.ts` (`SHOW_IDS`): 5.3 *Dotted eighth and sixteenth* has `shows: ['dotted:eighth']`, as a dotted
  quarter has a dot too; 3.1 has `'rest'` (any rest), 4.1 `['figure:eighth-pair', 'rest:eighth']`, 4.2
  `['note:sixteenth', 'figure:four-sixteenths']`. Every start and Next then has it, unless none of the seeds a start
  tries has all of it: it then keeps the exercise that comes closest, the first id counting most, so put the title's
  figure first. DESIGN.md §9.1 lists those gaps, such as 4.1's eighth rest with Bars at 1 and Sparse notes. Name only
  what an exercise can have at any Bars, density and amount of rests: a whole note beside a half and a quarter needs 2
  bars. One exception: 3.2's silent bar (`'rest:whole'`) needs 3, and a start with fewer does not look for it. Give a
  new rhythm link its row in the `teaches` table of `src/ui/store.test.ts`, which checks what its exercises show.
  Quit, and the back arrow on Results or Round done, return to the section; their setup button opens the setup with
  the preset. `practice: { scales: { keyMode: 'one', keys: ['C'], types: ['major'] } }` opens the Scales setup.
- The chapter's `practice: 'notes' | 'rhythm' | 'scales'` picks the big button at the end.
- A staff block with `barlines: false` writes its notes in one bar without bar lines, as a scale is written.
- `quiz: { answers: [{ note: 'G' }, { note: 'Gb' }, { text: 'a3' }], right: 1 }`: the chapter's quick check at the
  end of the page. Answers are note names or text keys under `ch{n}.quiz`; a wrong pick shows the right answer.
- `check: { answers: […], right: 0 }` on every section: its own quick check, the same way with text keys under
  `ch{n}.s{k}.check`. Answering it right marks the section read, so ask about what the section itself explains. A wrong
  pick does not show the right answer: `.wrong` is a hint that sends the player back to the section, and they try again.

### Moving or renumbering sections

Read status is stored by section id. When a section moves, map the old id to the new ones in `MOVED_SECTIONS` in
`src/game/storage.ts` (as 0.3.4 did for 8.6 and 8.7), and update links into it (`#/learn/10?s=10.1` on the Key screen).
Set `PLANNED_CHAPTERS` in `chapters.ts` when the plan grows ("chapter 9 of 11").

## A Learning Path unit

1. **Data:** add a `unit(…)` to `UNITS` in `src/game/path.ts`, numbered after the last rhythm unit: a base with every musical
   setting, and five lessons that each add one thing, the fifth a review with more bars and a faster tempo. Home's
   Continue card shows a bar with what a lesson is about: the symbols it is the first to use, else what it adds over
   the lesson before, with the dot, tie or triplet when it has them (`src/ui/lib/lessons.ts`). Where the title names
   something else, or the lesson adds what its exercises never have (a half rest in three-four), say what the bar must
   show with `preview` (*Eighths with half notes*: `['note:eighth', 'note:half']`; *Dotted quarters in three-four*:
   `['dotted:quarter']`; *Rests in three-four*: `['rest:quarter']`). A title that names a figure gets the figure
   (*Eighth and two sixteenths*: `['figure:eighth-sixteenths']`, an eighth and two sixteenths that fill a beat; also
   *Eighth-note pairs*, *Dotted quarter + eighth* and *Four sixteenths*); a new figure gets its id and notes in
   `FIGURES`, `src/game/intro.ts`. Every exercise of the lesson shows it too, with what the lesson introduces
   and its dot or tie (`makeLessonRun` in `src/ui/store.tsx`), so `preview` names only what most exercises of the
   lesson can have.
2. **Text:** `path.u{n}.title` and `path.u{n}.l1` … `l5` in `en.json`.
3. **Place it:** add `['rhythm', n]` to `ORDER` in `src/game/tracks.ts`, where it belongs in the Learning path
   (DESIGN.md §8.2: rhythm units take turns with the note units). The path numbers its units in that order.
4. **Run `npm test`.** `src/game/path.test.ts` checks the numbering, the texts, that every lesson can be played, and
   the teaching order of §8.2 in DESIGN.md; `src/game/tracks.test.ts` checks the path order, and
   `src/ui/lib/helpers.test.ts` that each lesson's Home preview shows the symbols it introduces, and all of what it is
   about (but in the unit review).

Then link it from the chapter that explains it: the chapter's `units` in `chapters.ts` (by its number in the path),
its row of DESIGN.md §9.1 and `LEARN-CHAPTERS.md` §5.

### A note unit (First notes, Read notes or Keys)

Note units (DESIGN.md §8.2) work the same way, in `src/game/notesPath.ts`:

1. **Data:** add a `unit('notes' | 'keys', n, glyph, base, lessons)` to `NOTES_UNITS` or `KEYS_UNITS`. The glyph is
   what the unit's node on the Path shows: signs or a short figure as written (`'1♯'`, `'3♭'`), or for a word a
   message key (`'path.keys.u6.glyph'`, *Mix*), so it is translated. The base and each lesson are Read notes settings
   (clefs, keys, mix keys, input, range, extra signs, count, timer, and the `tasks` read, write and hear, the positions
   it draws from `only` and the one it stresses `stress`); a lesson's preset is laid over its unit's base, and the Read
   notes defaults fill the rest. First notes units come from `FIRST_NOTES` (`pitchUnit`): a new note there is one
   entry, with its name and staff position. A lesson with a key signature or extra signs needs nothing more for its
   sign: every round, and Home's preview, is picked to show it (`noteLessonSeed`, `noteLessonMisses`).
2. **Text:** `path.notes.u{n}.title` and `l1` … `l5` (or `path.keys.…`, `path.pitch.…`) in `en.json`.
3. **Place it:** add it to `ORDER` in `src/game/tracks.ts`.
4. **Run `npm test`.** `src/game/notesPath.test.ts` checks the numbering, the texts, that every preset is valid and
   can be played, that every Keys round asks for its sign, and the order of the units; `src/game/tracks.test.ts` the
   path order.

## Skill levels and achievements

The Progress tab's skill levels (DESIGN.md §8.6, `src/game/skills.ts`) read this content, so check them when you add
some:

- **A Learn section** in chapters 1–11 becomes a check (*Read 5.3 …*) of its chapter's Theory level at once (chapters
  10 and 11 share level 10). Players who passed that level keep it. A **new chapter** is not on the ladder until
  `theoryChapters` in `skills.ts` gives it a level.
- **Rhythm units 9 and 10** open Rhythm reading's and Rhythm by ear's levels 9 and 10, which say *This level comes
  later* until then. Raise `RHYTHM_UNITS` in `skills.ts`, add the unit's skill-map cell to `UNIT_CELL` if it has one,
  add what the unit brings to `materialLevel` in `src/game/cells.ts` with its `skills.material.{n}` text, and let
  `ECHO_KEY` in `src/game/storage.ts` keep the new material level (it keeps "1"–"8"). The level then takes the unit's
  checks and its name (`path.u{n}.title`), and `skills.level.rhythm.{n}` can go. Update the ladder in DESIGN.md §8.6
  and the tests in `skills.test.ts` and `cells.test.ts`.
- **A note or keys unit** changes no skill level: the clef levels read what a Read notes round covers, not the units.
- **An achievement** is an id in `AchievementId` and `ACHIEVEMENT_IDS` (`src/game/storage.ts`: the sanitizer keeps
  only those, and the Progress card shows them in that order), a rule in `src/game/achievements.ts`, an icon in
  `src/ui/lib/achievementIcons.ts`, and `achievements.{id}.name` and `.text` in every catalog. It is a new feature, so
  it needs its board first and a minor release.
