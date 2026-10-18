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
   - `builds` and `units` in the data give the line under the intro ("Builds on chapters 1 and 2 · Path units 2, 3,
     5"); units must exist in `UNITS`;
   - `ch{n}.intro`, and `ch{n}.quiz.question`, `.right`, `.wrong` for the quick check;
   - `ch{n}.s{k}.title` for every section, `.practice` for its practice link, and every key its blocks name.
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
| `{ kind: 'staff', clef, keyId?, notes, labels?, title?, value?, slots?, room?, alt }` | a five-line staff, one whole note per bar. `notes: 'E4 G4 F#4 Bb4 Fn5'` (letter, sign `#` `b` `n`, octave; C4 = middle C). `labels: 'name'` writes the names under the notes. `slots: 0` draws only the clef and key signature, with `value` beside it. |
| `{ kind: 'rhythm', meter, bars, title?, value?, verdict?, common?, alt }` | the one-line rhythm staff with the counting under the notes. `bars: ['q [8 8] h', 'q. 8 q qr']`; the tokens are in `src/render/notationText.ts` (`w h q 8 16`, `.` dot, `r` rest, `~` tie, `t` triplet, `W` whole-bar rest, `[ ]` beam). The counts come from the rhythm (`src/render/counting.ts`). `verdict: 'write' \| 'avoid'` adds a green or red label, `common: true` draws 4/4 as C. |
| `{ kind: 'table', rows: [{ glyph?, title, text?, value? }] }` | rows of a name, a line under it and a value on the right (tempo words, the rests) |
| `{ kind: 'beatGrid', rows: [{ title, beat }], alt }` | one beat divided several ways, each row's counts in one grid: `beat: '[8. 16]'` reads 1 (&) a |
| `{ kind: 'timeSig', meter, top, bottom }` | a big time signature beside what its two numbers mean |
| `{ kind: 'accents', meters }` | strong, medium and weak beats per meter, from the engine's metric weights |
| `{ kind: 'pulse', tempos, alt }` | four seconds of beats at each tempo |
| `{ kind: 'noteTree' }` | the note tree, one bar of 4/4 per value, with a Notes \| Rests switch |
| `{ kind: 'piano', marked?, alt }` | one piano octave; `marked: ['E', 'F']` tints white keys |
| `{ kind: 'noteNames' }` | C–B with do re mi |
| `{ kind: 'pair', variant?, columns }` | columns side by side on tablet and desktop, stacked on phones (`'staves'` or `'text'`) |

Every `alt` is the description a screen reader gets for the picture; for a staff it may use `{names}`.

A new kind of block (counting under the notes, for example) is a case in the `Block` type in `chapters.ts`, a case in
`src/ui/learn/Blocks.tsx`, and a line in `blockKeys` in `chapters.test.ts`.

### Practice links and the quick check

- `practice: { notes: { clefs: ['bass'], range: 'staff' } }` opens Read notes with those settings on top of the
  player's own (answer with, notes per round and the timer stay). `practice: { rhythm: { meters: ['3/4'] } }` opens
  rhythm Free practice the same way.
- The chapter's `practice: 'notes' | 'rhythm'` picks the big button at the end.
- `quiz: { answers: [{ note: 'G' }, { note: 'Gb' }, { text: 'a3' }], right: 1 }`: answers are note names or text
  keys under `ch{n}.quiz`.

### Moving or renumbering sections

Read status is stored by section id. When a section moves, map the old id to the new ones in `MOVED_SECTIONS` in
`src/game/storage.ts` (as 0.3.4 did for 8.6 and 8.7), and update links into it (`#/learn/10?s=10.1` on the Key screen).
Set `PLANNED_CHAPTERS` in `chapters.ts` when the plan grows ("chapter 9 of 11").

## A Learning Path unit

1. **Data:** add a `unit(…)` to `UNITS` in `src/game/path.ts`, numbered after the last one: a base with every musical
   setting, and five lessons that each add one thing, the fifth a review with more bars and a faster tempo.
2. **Text:** `path.u{n}.title` and `path.u{n}.l1` … `l5` in `en.json`.
3. **Run `npm test`.** `src/game/path.test.ts` checks the numbering, the texts, that every lesson can be played, and
   the teaching order of §8.2 in DESIGN.md.

Then link it from the chapter that explains it: the Path units in the chapter's row of DESIGN.md §9.1 and in
`LEARN-CHAPTERS.md` §5.
