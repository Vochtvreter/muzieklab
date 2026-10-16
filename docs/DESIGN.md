# Muzieklab — Design Document

> Status: **Draft v0.1** — design only, no code yet.
> Visual design (screens, foundations, engine): [Muzieklab App Design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE).

---

## 1. Vision

Muzieklab is a browser game for practising **rhythm reading** and **rhythm hearing**.
The player picks exactly what they want to train (time signatures, note values, rests,
number of bars, tempo) and the app generates a new, musically sensible exercise every
time. The player then either:

- **reads** the rhythm and taps it in time (any key, mouse button or the phone screen), or
- **hears** a rhythm and writes down which note values they heard.

Short rounds, instant feedback, stars, streaks and a learning path make it feel like a
game rather than homework.

### Goals

1. **Endless, unique exercises** built from actual music-theory rules (meter, metric
   hierarchy, beaming and rest-notation conventions, phrase structure), not random noise.
2. **Full control** over the material: every time signature, note value and rest can be
   switched on or off, plus the number of bars.
3. **Accurate timing** on desktop *and* mobile, so feedback is fair to the millisecond range.
4. **Game feel**: short rounds, scores, stars, combos, XP, streaks, a progression path.
5. **Works offline**, installable on a phone (PWA), no account needed.

### Non-goals (for v1)

- Pitch reading / melodic dictation (see §13, possible later module).
- Multiplayer, accounts, cloud sync.
- Teacher dashboards.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Note value** | Duration symbol: whole, half, quarter, eighth, sixteenth (American names; British names such as crotchet and quaver can come with localization). |
| **Rest** | Silence with a duration, same family of values. |
| **Meter / time signature** | e.g. 2/4, 3/4, 4/4: beats per bar and the beat unit. |
| **Tick** | Internal integer time unit. **48 ticks = 1 quarter note** (see §5.1). |
| **Onset** | The moment a note starts; what the player taps. |
| **Cell** | A small rhythmic building block that fills one metric unit (e.g. "dotted eighth + sixteenth" filling one beat). |
| **Spelling** | How a rhythm is *written* (ties, beams, rest choice). One sounding rhythm can have several spellings. |

---

## 3. Game modes

### 3.1 Tap the Rhythm — *read & play* (core mode)

The player sees the notation and plays it with one "button": **press when a note starts,
hold it for the note's length, and let go when it ends** (*tap & hold*, the default).
Because the release counts, note lengths and rests are tested, not only where notes start.
In pure tapping, a quarter note and an "eighth + eighth rest" would feel identical.

**Flow**

1. **Preview** — the exercise is shown. Optional *"Listen first"* button plays it once.
2. **Count-in** — one bar of metronome clicks (configurable 0–2 bars) with big
   on-screen counts "1 – 2 – 3 – 4".
3. **Play** — a cursor sweeps across the notation in time. The player presses on every
   note and holds it for its length. Rests = nothing pressed. Tied notes = press once and
   keep holding through the tied note (the tie continues the sound, no new onset — an
   important reading lesson). A dotted note is held for its extra half.
4. **Live feedback** — each notehead turns green / yellow / red as its start is judged; a
   short sound plays on every press and sustains while held. The **tap pad** shows a ring
   that fills while you hold, reaching full at the moment the note ends. Under the notation
   a **length lane** draws every note to scale in gray (so durations are visible at a
   glance) and your holds on top in color; a note let go too early gets a dashed outline.
   A combo counter grows on consecutive notes that were both started well and held right.
   The pad itself only says what it is, a quarter-note symbol and **Rhythm**; it never
   carries instructions. The judgment (GREAT, GOOD · LATE…) shows just above the pad.
5. **First time** — the first time a player opens a rhythm exercise, a *How to play*
   sheet slides up over the paused exercise: a small press → hold → lift diagram and
   three steps (press when a note starts; hold for its length and lift when it ends;
   stay off on rests, keep holding on ties), plus "any key works on a computer".
   *Got it* closes it. To see it again there is a small, muted **?** icon in the top bar,
   next to Pause (desktop: the ? key). It pauses the exercise and opens the same sheet,
   labelled *Paused* instead of *First time here*. The icon stays quiet (muted gray,
   no label) because it is rarely needed once the player knows the game.
5. **Results** (§6.4).

**Input**

- Desktop: **any key** (except Esc = pause) or mouse button: `keydown` = press,
  `keyup` = release. Key auto-repeat events are ignored. If several keys are down, the
  hold lasts until the last one is released.
- Mobile: a large **tap pad** in the bottom half of the screen: `pointerdown` = press,
  `pointerup` / `pointercancel` = release. The pad captures the pointer
  (`setPointerCapture`), so sliding off the pad does not end the hold.
- Releases are timestamped with the same clock as presses (§6.1).

**Setting: Hold notes for their length** (on by default). Off = *tap only*: only note
starts are judged, for beginners and the first Path units. The Learning Path switches it
on from unit 2 (rests), where lengths start to matter.

### 3.2 Rhythm Dictation — *listen & write*

The app plays a rhythm; the player notates what they heard.

**Flow**

1. Count-in + rhythm playback on a woodblock/clave sound, metronome optional.
2. Player can replay (default **3 plays**; fewer plays = bonus XP). Can also replay a single bar.
3. Player enters the rhythm, bar by bar, with one of two input styles:

| Style | For | How it works |
|---|---|---|
| **Choose** | beginners | 3–4 notated options; pick the one you heard. Distractors are generated by mutating one beat of the real answer, so they're close but distinguishable. |
| **Build** | everyone | A palette with only the *enabled* note & rest values (+ dot, tie, triplet if enabled). Tapping a button appends that value to the current bar. A fill meter shows how much of the bar is left; buttons that don't fit are disabled; bar auto-advances when full; backspace undoes. |

4. **Check** — the answer is compared **as rhythm, not as spelling** (onset positions +
   note/rest + durations in ticks). So a quarter note and two tied eighths are both
   accepted. Feedback is shown per beat ("beat 3 of bar 2 differs") and the correct
   answer can be played back next to the player's answer.

**Keyboard shortcuts (Build):** `1` whole · `2` half · `4` quarter · `8` eighth ·
`6` sixteenth · `R` toggle rest · `.` dot · `T` tie · `Backspace` undo · `Space` replay.

### 3.3 Echo — *listen & tap back* (bonus mode)

The rhythm is played (no notation shown); the player taps it back from memory; afterwards
the notation is revealed with the timing analysis. Trains ear + inner pulse. Uses the same
engine as 3.1 and 3.2, so it's cheap to add.

### 3.4 Wrappers around the modes

| Wrapper | Description |
|---|---|
| **Free Practice** | Full custom settings (§4). Always available. |
| **Learning Path** | Curated units that unlock step by step (§8.2). Each lesson is just a preset of settings + a pass requirement. |
| **Daily Challenge** | One exercise per day, seeded by the date, so everyone gets the same one. Keeps the streak alive. |
| **Weak Spots** | Adaptive: the generator boosts cells/meters the player scores worst on (§8.4). |
| **Learn** | Theory library: one topic per thing you can practise (§9.1), each with notation examples, counting and a quick check, linking straight to a matching practice preset. |

### 3.5 Read Notes — *pitch reading*

A separate mode for reading **which** note is written, in the **treble clef** and the
**bass clef** (other clefs later). A line of whole notes is shown on a five-line staff;
the current note is highlighted and the player names it. Answered notes turn green or red,
like the rhythm notation.

**Three ways to answer** (switchable at any time, also mid-round):

| Input | How it works |
|---|---|
| **do re mi** | Seven buttons: do re mi fa sol la si, in that order. Fixed do: *do* is always C. |
| **Letters** | Seven buttons in alphabetical order: A B C D E F G. Each button also shows the do re mi name in small type, so the two systems are learned together. |
| **Piano** | One octave, C to B: 7 white and 5 black keys. Black keys answer sharps and flats; both names of a black key (F♯ = G♭) are accepted. Optional key labels: letters, do re mi, or none. |

- The answer is the **pitch class**: the octave does not matter (any C answers a C),
  because the input is one octave. Naming the octave (C4 vs C5) could be a later option.
- Both name inputs (do re mi and letters) have a **sign row: ♭ · ♮ · ♯**, always visible.
  The player picks the sign first (♮, no sign, is the default) and the seven buttons
  update to show it (D♯, re♯). The written spelling is required: right letter with the
  wrong sign is wrong, and F♯ is not accepted for a written G♭. Desktop keys: − = ♭,
  0 = ♮, = = ♯, then the letter.
- Desktop: names are typed with the letter keys (A–G); the piano maps to the
  computer keyboard with the common layout **A S D F G H J** = C D E F G A B and
  **W E T Y U** = C♯ D♯ F♯ G♯ A♯.
- A **Hint** shows the nearest landmark ("just below the bottom line, E") and marks the
  note as assisted. In a key with sharps or flats it also points at the key signature
  ("the top line is F; look at the sharp after the clef").

**Keys.** The player chooses which key to read in, on its own screen (*Key*, opened from
the setup). All 15 standard key signatures are offered: C major (no signs), then sharps
and flats side by side by count (G | F, D | B♭, A | E♭, E | A♭, B | D♭, F♯ | G♭,
C♯ | C♭). Each key is shown as a small treble staff with its key signature, with the major
key and its relative minor (G major · E minor), because a key signature fits both and the
notes read the same.

- **One key** (default) or **Mix keys** (pick several; a new key every 5 notes, announced
  with the new key signature before the next note).
- The key signature is drawn after the clef on every staff in the round, in both clefs.
- Notes affected by the key signature have **no sign next to them**, but the answer is
  still the full written name: in G major the top line of the treble staff is **F♯**, so
  the player picks ♯ and F (or the F♯ black key). F without ♯ is wrong, and the feedback
  says why ("G major has F♯ in the key signature").
- Every whole note is drawn in **its own bar** (a bar line after each note). An accidental
  only lasts until the next bar line, so a sign never carries over to the next note.
- With **Extra sharps and flats** on, a note can also carry a sign that changes the key
  signature's note: ♯ or ♭, or ♮ to cancel it (F♮ in G major). Alterations that would
  need a double sharp or double flat are left out.
- The Learn chapter 8.7 *Key signatures* explains all of this, linked from the Key screen
  ("What is a key?").

**Settings** (Read notes setup screen)

| Setting | Options | Default |
|---|---|---|
| Clefs | treble · bass (at least one) | both |
| Key | any of the 15 key signatures; one key or a mix | C major |
| Answer with | names · piano · mixed | names |
| Range | on the staff (11 positions: lines, spaces, and the space just outside each end) · +1 ledger line (15) · +2 ledger lines (19) | on the staff |
| Extra sharps and flats (signs next to notes, on top of the key signature) | none · sharps · sharps and flats | none |
| Notes per round | 10 – 50 | 20 |
| Time per note | off · 5 s · 3 s | off |

**Note generator:** draws from the allowed positions, spelled in the chosen key, with no immediate repeats and no
more than two steps of the same direction in a row, and boosts notes the player recently
got wrong or answered slowly (spaced repetition per note). In mixed-clef rounds the clef
changes at most every 4 notes, with a visible clef change.

**Scoring:** correct / total, average response time, and a per-note weak-spot list
("E on the top space"). Stars: ★ ≥ 70% · ★★ ≥ 85% · ★★★ ≥ 95% with an average under 2 s
(starting values, to tune). XP and streaks work as in the rhythm modes.

### 3.7 Scales — *every key*

Learn and practice major and minor scales in all 15 keys.

- **Scales hub = the circle of fifths.** The 12 positions run clockwise from C (one sharp
  more each step) and anticlockwise (one flat more). Major keys are the outer ring, their
  relative minors the inner ring; a *Major / Minor* switch makes one ring the active one.
  The three positions at the bottom carry both spellings (B/C♭, F♯/G♭, D♭/C♯); tapping
  the selected key again switches spelling. Each key is filled by progress (★ light,
  ★★ mid, ★★★ dark slate); for minor, by how many of the three forms have ★★ or more.
  The centre shows the selected key signature. Under the circle: the scale's notes (each
  letter once, sharps and flats tinted), stars, *Options* and *Practice*, plus *Go round
  the circle* (all 15 in circle order).
- **Settings:** keys (the selected key · all 15 · choose, using the Key screen from Read
  notes) · scales (major, natural minor, harmonic minor, melodic minor; each shows its
  step pattern) · answer with (piano · names · mixed) · direction (up · up and down) ·
  write with (♯ ♭ signs · key signature) · show the steps (W and H) · play each note.
  A minor scale uses the relative minor of the chosen key (G → E minor).
- **Piano:** a keyboard window that starts on the tonic (9 white keys, enough for one
  octave from any starting note). The player plays the scale note by note; each right
  note is written on the staff and fills the next degree box. The W/H steps sit between
  the boxes. A wrong key flashes red and the feedback names the step ("From G, go a whole
  step: skip one key"). *Hear it so far* and *Start over* are always there.
- **Names (spelling):** the letters are given, one per degree, because a scale uses each
  letter once; the player chooses ♭, ♮ or ♯ for each. This drills exactly what changes
  between keys and between the minor forms (D♯ in E harmonic minor). Double sharps and
  flats (F𝄪 in G♯ harmonic minor) appear only in keys that need them.
- **Melodic minor down** is written as natural minor (the classical form).
- **Scoring:** a scale is right when it was finished without mistakes; stars by mistakes
  (0 → ★★★, 1 → ★★, 2–3 → ★). A scale with mistakes comes back at the end of the round.

### 3.6 Test yourself — *flash cards*

A quick theory check on any **chapters the player chooses**, opened from the Learn tab.

- **Setup:** tick chapters (1–8; chapters marked *later* have no cards yet; a "Chapters I
  read" shortcut selects the read ones), card types (*symbols*: "which rest is this?";
  *facts and rules*: "how long is a dotted quarter?"; *staff reading*: name a note or a
  staff line), 10 / 20 / 30 cards, and **Flip** or **Choice** (three options).
- **Flip mode:** the front shows a question and a symbol or a bit of notation. Tapping the
  card (or *Show answer*) turns it over: the answer, a one-line explanation and a link
  to the Learn section it comes from. The player rates it **Again · Almost · Knew it**.
- **Choice mode:** the same card with three answers (A, B, C) under it. The two wrong
  answers are real terms from the same chapter (for "lines of the treble staff": E G B D F,
  with F A C E, the spaces, and G B D F A, the bass lines), so a guess is never free.
  After a pick, the right answer turns green and a wrong pick red, and the card shows the
  explanation and the Learn link. No self-rating: right counts as *Knew it*, wrong as
  *Again*. *Next card* stays disabled until an answer is picked.
- **Spaced repetition:** a simple Leitner scheme per card. *Again* puts the card back in
  this round, *Almost* brings it back tomorrow, *Knew it* moves it up a box (4 days, then
  longer). Cards the player missed come first in the next round.
- **Card content** is written from the Learn chapters only, so every answer is covered
  by `THEORY-SOURCES.md`. Cards are localizable content like the chapters.

---

## 4. Exercise settings

All settings are shown on one *Practice setup* screen, with a live preview bar that
regenerates as you change things, plus a difficulty meter.

| Setting | Options | Default |
|---|---|---|
| **Mode** | Tap · Dictation (Choose / Build) · Echo | Tap |
| **Hold notes for their length** | on (tap & hold) · off (tap only) | on |
| **Time signatures** | 2/4 · 3/4 · 4/4 *(v1)*; 2/2 · 3/8 · 6/8 · 9/8 · 12/8 · 5/4 *(later)*. Multi-select: each exercise picks one at random. | 4/4 |
| **Note values** | whole · half · quarter · eighth · sixteenth | half, quarter |
| **Rests** | whole · half · quarter · eighth · sixteenth (independent of notes) | quarter |
| **Extras** | dotted notes · ties / syncopation · triplets | off |
| **Bars** | 1 – 16 (stepper) | 4 |
| **Tempo** | 40 – 200 BPM (slider) + presets (Largo 50, Adagio 70, Andante 90, Moderato 112, Allegro 132); the slider shows the tempo word for the current range (§14) | 80 |
| **Metronome during play** | on / accent first beat only / off | on |
| **Count-in** | 0 / 1 / 2 bars | 1 |
| **Density** | sparse · balanced · busy (bias toward longer or shorter values) | balanced |
| **Rest amount** | few · some · many | some |

### 4.1 Settings validation

Not every combination can fill a bar (e.g. *only half notes* in 3/4). A small
dynamic-programming check (§5.6) runs on every change:

- Unreachable time signatures are greyed out with a hint:
  *"3/4 needs a quarter note, quarter rest or dotted half"*.
- The *Start* button is disabled until at least one time signature is playable.
- Whole notes/rests are only used in meters where they fit (a whole rest is also allowed
  as a "full-bar rest" in 2/4 and 3/4, per notation convention, when rests are on).

### 4.2 Presets and sharing

Every exercise has a short **exercise code** (settings + seed), e.g.
`T44-HQE-rQ-4b-120-7K2QF`, which regenerates the exact same exercise. Useful for teachers
("everyone try code …") and bug reports.

---

## 5. The rhythm generator (music theory engine)

The heart of the app. Requirements:

- Only uses the values the player enabled.
- Every bar adds up exactly to the meter.
- Respects the **metric hierarchy** (strong vs weak beats) so rhythms "feel" like the meter.
- Produces notation that follows standard **engraving conventions** (beaming per beat,
  ties across the middle of a 4/4 bar, correct rest grouping).
- Has **phrase structure** (repetition + variation), like real sight-reading material.
- Is **seeded and deterministic**, so any exercise can be reproduced from its code.
- Has a practically infinite space: e.g. 4/4 with quarters, eighths and sixteenths has
  8 onset patterns per beat → 8⁴ = 4 096 bars → 4 096⁴ ≈ 2.8 × 10¹⁴ different 4-bar
  exercises, before rests are even added.

### 5.1 Time representation

Integer ticks, **PPQ = 48** (ticks per quarter). 48 divides cleanly by 2, 3, 4, 16, so it
covers straight values, dotted values and triplets without fractions:

| Value | Ticks | Value | Ticks |
|---|---|---|---|
| whole | 192 | dotted half | 144 |
| half | 96 | dotted quarter | 72 |
| quarter | 48 | dotted eighth | 36 |
| eighth | 24 | quarter-note triplet | 32 |
| sixteenth | 12 | eighth-note triplet | 16 |
| | | sixteenth-note triplet | 8 |

### 5.2 Meter model

Each time signature is described by a **metric tree**: how the bar divides into beats and
how beats divide further. Every tick position gets a **metric weight**.

```
4/4  bar(192) ─┬─ half(96) ─┬─ beat 1 (48) ─┬─ 8th (24) ─┬─ 16th (12)
               │            │               │            └─ 16th
               │            │               └─ 8th ...
               │            └─ beat 2 (48) ...
               └─ half(96) ─┬─ beat 3 (48) ...
                            └─ beat 4 (48) ...

3/4  bar(144) ─┬─ beat 1 ─ beat 2 ─ beat 3   (no half-bar level; 3 equal beats)
2/4  bar(96)  ─┬─ beat 1 ─ beat 2
6/8  bar(144) ─┬─ dotted-quarter beat (72) ─┬─ 8th 8th 8th     (compound: beat splits in 3)
               └─ dotted-quarter beat (72) ─┘
```

Metric weights (higher = stronger), 4/4 example:

| Position | 1 | e | & | a | 2 | e | & | a | 3 | … |
|---|---|---|---|---|---|---|---|---|---|---|
| Weight | 4 | 0 | 1 | 0 | 2 | 0 | 1 | 0 | 3 | … |

```ts
interface Meter {
  id: '2/4' | '3/4' | '4/4' | '6/8' | ...;
  barTicks: number;            // 96 / 144 / 192 / 144
  beatTicks: number;           // 48, or 72 for compound meters
  beatsPerBar: number;
  tree: MetricNode;            // the hierarchy above
  beamGroups: number[];        // in ticks, e.g. 4/4 -> [48,48,48,48] (or [96,96] for 8ths)
  weightAt(tick: number): number;
}
```

### 5.3 Generation: hierarchical subdivision with cells

A bar is generated **top-down along the metric tree**. At each node (bar, half-bar, beat,
eighth) the generator chooses one option with weighted randomness:

1. **Fill** — one single value covers the whole node (e.g. a half note on beats 1–2),
   if that value is enabled and legal at this position.
2. **Split** — recurse into the node's metric children (bar → beats, beat → eighths,
   eighth → sixteenths; or beat → triplet eighths if triplets are on).
3. **Cell** — use a figure from the **cell library** that spans the node but isn't a plain
   split (dotted and syncopated figures):

| Cell | Spans | Needs |
|---|---|---|
| dotted quarter + eighth | 2 beats | dotted, quarter, eighth |
| eighth + quarter + eighth (syncopation) | 2 beats | ties/syncopation, quarter, eighth |
| quarter + half + quarter | bar of 4/4 | ties/syncopation, half, quarter |
| dotted eighth + sixteenth | 1 beat | dotted, eighth, sixteenth |
| sixteenth + dotted eighth (Scotch snap) | 1 beat | dotted, eighth, sixteenth |
| sixteenth + eighth + sixteenth | 1 beat | sixteenth, eighth |
| eighth + 2 sixteenths / 2 sixteenths + eighth | 1 beat | eighth, sixteenth |
| triplet eighths | 1 beat | triplets, eighth |
| dotted half | bar of 3/4 | dotted, half |

Cells are only placed on metric nodes they exactly span. In 4/4 the 2-beat cells start on
beat 1 or beat 3 (the half-bar nodes), so they never hide the middle of the bar. In 3/4 a
2-beat cell may start on beat 1 or 2, since 3/4 has no half-bar.

Each leaf is then made a **note or rest**:
`P(rest)` depends on the *rest amount* setting and is lower on strong positions (weight ≥ 3)
and lower for the very first event of the exercise, so the rhythm "lands" on the beat.

**Weighting** of the options at each node comes from a *difficulty profile*:

- The deeper the split, the less likely (keeps rhythms readable at low difficulty).
- *Density* setting biases toward Fill (sparse) or Split (busy).
- Options whose required values are disabled get weight 0.
- In Weak Spots mode, cells the player struggles with get boosted (§8.4).

Because every choice follows the metric tree, results are always correctly aligned to the
beat — no "random" quarter note starting on the "e" of a beat unless syncopation is enabled.

### 5.4 Phrase structure (musical sense)

Real rhythm exercises repeat and vary ideas. For an exercise of *N* bars the generator
first picks a **form plan**, then fills it:

| Bars | Example plans (one chosen at random) |
|---|---|
| 1 | `a` |
| 2 | `a b` · `a a'` |
| 3 | `a a' b` · `a b a` |
| 4 | `a a' b a` · `a b a c` · `a a b c` · `a b a' b'` |
| 8 | two 4-bar phrases: antecedent / consequent, e.g. `a b a c │ a b a' d` |
| other | built from 2- and 4-bar groups |

`a'` = a **variation** of `a`, made with one music-theory operation:

- **Diminution** — split one note into two of half the length.
- **Augmentation** — merge two adjacent notes in one beat-group into one.
- **Rest substitution** — replace a weak-position note with a rest.
- **Cell swap** — replace one beat's cell with another of similar difficulty.

**Cadence rule:** the last bar ends with a note on a strong beat lasting at least one beat
(or the last note before a final rest is on a strong position), so the exercise sounds
"finished". Option: the final bar may end with a long note (half / dotted half / whole).

### 5.5 Musical constraints (rejection sampling)

After generation, the exercise is checked; if a rule fails, the bar (or whole exercise) is
regenerated with the next random draw (deterministically from the seed):

- First event of the exercise is a note on beat 1 (configurable).
- No more than one full bar of continuous rest.
- Note density stays within the bounds of the density setting.
- No bar is identical to the previous bar unless the form plan says so.
- Each enabled value that *can* appear does appear at least once over the exercise
  (so selecting "sixteenths" actually gives you sixteenths), when there are ≥ 2 bars.
- Exercise hash not in the player's recent history (last ~500), to avoid repeats.

### 5.6 Feasibility check (for settings validation)

Coin-change style DP per meter: can `barTicks` be built from the allowed values while
respecting the metric tree? Runs in microseconds; used by the settings screen (§4.1) and as
a guard in the generator.

### 5.7 Rhythm vs notation: the speller

Generation produces a **semantic rhythm** (list of events with tick start + duration +
note/rest). A separate **speller** turns it into **notation** following engraving rules:

- **Notes** that cross a structural boundary are split with **ties**: in 4/4 a note may
  not cross the middle of the bar (beat 3) unless it starts on beat 1 (half, dotted half,
  whole). For example quarter–half–quarter is written quarter–(quarter⁀quarter)–quarter.
  This *strict* style is the default. A teacher setting allows the *common* simplified
  spelling of a few well-known syncopations (e.g. quarter–half–quarter), which many method
  books print as-is.
- **Rests** are never tied; they are written to show the beat. In 4/4 a two-beat (half)
  rest only on beat 1 or 3; a two-beat silence starting on beat 2 is two quarter rests.
  In simple meters, dotted rests are used only when shorter than one beat. A fully empty
  bar gets a single whole rest centred in the bar, in every time signature.
- **Beaming** per beat (simple meters) or per dotted-quarter (compound); never across
  beats 2–3 in 4/4. Four eighths may be beamed as a half-bar group (beats 1–2 or 3–4) in
  4/4, an accepted alternative; the default beams per beat. Sixteenths beamed per beat.
- Triplets get a bracket/number per beat.

Keeping rhythm and spelling separate lets dictation compare *what you heard* rather than
*how you wrote it*, and lets the scoring engine ignore ties (a tie is not an onset).

### 5.8 Difficulty rating

Each generated exercise gets a score so the Learning Path and Weak Spots can pick the right
level:

```
difficulty = w1·subdivisionDepth + w2·onsetsPerBeat + w3·syncopation
           + w4·restRatio + w5·ties + w6·distinctValues + w7·tempoFactor
```

Syncopation uses the Longuet-Higgins & Lee (1984) measure, as formalised by Fitch &
Rosenfeld (2007): a note on a weak position followed by silence (rest or held note) on a
stronger position scores `weight(strong) − weight(weak)`. The weights follow the metrical
hierarchy of Lerdahl & Jackendoff (1983).

### 5.9 Data model

```ts
type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

interface RhythmEvent {
  start: number;          // ticks from start of bar
  duration: number;       // ticks
  kind: 'note' | 'rest';
  tieFromPrev?: boolean;  // continues previous note: no onset
}

interface Bar { events: RhythmEvent[]; }

interface Exercise {
  code: string;           // shareable, encodes settings + seed
  seed: number;
  meter: Meter;
  tempo: number;          // BPM of the beat unit
  bars: Bar[];
  form: string;           // e.g. "a a' b a"
  difficulty: number;
}

// Output of the speller, consumed by the renderer
interface NotatedSymbol {
  value: NoteValue; dots: 0 | 1; kind: 'note' | 'rest';
  tieToNext: boolean; beamGroup?: number; tuplet?: { num: 3; den: 2; id: number };
}
```

RNG: small seeded PRNG (e.g. `sfc32` / `mulberry32`), never `Math.random()`, so exercise
codes are reproducible across devices.

---

## 6. Timing, judging and scoring

### 6.1 Clocks

- All playback is scheduled on the **Web Audio clock** (`AudioContext.currentTime`) with a
  look-ahead scheduler (~25 ms timer, schedules ~100 ms ahead), never with `setTimeout`
  directly.
- Player input uses `event.timeStamp` (high-resolution, same timebase as
  `performance.now()`), converted to audio time via `AudioContext.getOutputTimestamp()`.
- Compensation: `outputLatency` from the browser **plus** a per-device offset measured in
  the **calibration** screen (tap along with 16 clicks; median offset is stored).

### 6.2 Matching taps to notes

1. Expected onsets = start times of all note events that are not tie continuations.
2. Taps and onsets are both sorted in time; each tap is matched to the nearest unmatched
   onset inside its judgement window (greedy in time order is sufficient for 1-D).
3. Unmatched onsets = **miss**. Unmatched taps = **extra tap** (penalized, so mashing doesn't pay).
4. With holding on, each matched press is paired with its release, and the release is
   judged against the note's end (below).

**Windows** are absolute, but shrink for fast passages so neighboring sixteenths can't be
confused: `window = min(base, 0.4 × gap to the neighbouring onset)`.

| Judgement | Window (default) | Points |
|---|---|---|
| Perfect | ≤ 35 ms | 100 |
| Great | ≤ 70 ms | 80 |
| Good | ≤ 120 ms | 50 |
| Miss | — | 0 |
| Extra tap | — | −25 |

A *lenient* setting (×1.5 windows) exists for young beginners.

**Release (hold) judgment**, with holding on. `end` = the moment the note (including ties
and dots) stops sounding.

| Hold judgment | Rule (default) | Points |
|---|---|---|
| Held right | released between `end − max(25% of the note, 120 ms)` and `end + 120 ms` | ±0 |
| Cut short | released earlier than that | −20 |
| Held too long | released more than 120 ms after `end` (only possible before a rest, or at the end) | −20 |

When the next note follows directly, the player must lift to press again, so "held too
long" cannot happen there; any release between the early limit and the next press is
right. Release windows are deliberately looser than press windows (a design choice, not a
sourced rule); the values are starting points to tune in playtesting.

### 6.3 Scores

- **Accuracy %** = points / max points (floored at 0).
- **Stars:** ★ ≥ 60% · ★★ ≥ 80% · ★★★ ≥ 95% and no misses.
- **Tendency:** mean signed offset → *"rushing"* / *"dragging"* / *"steady"*. People
  tapping along to a beat naturally land tens of milliseconds early (*negative mean
  asynchrony*, Repp 2005), so a small early average is normal and is reported as
  *steady*. The rushing tip only appears beyond about −40 ms (tunable after playtesting);
  dragging beyond about +30 ms. Device latency is removed separately by calibration (§6.1).
- **Steadiness:** standard deviation of offsets.
- **Combo:** consecutive notes started Perfect/Great **and** held right; a Good, Miss,
  cut-short or held-too-long note resets it. Max combo shown on results.
- Dictation: % of beats correct; plays used; 3 stars = all correct with ≤ 2 plays.

### 6.4 Results screen

- Stars, accuracy, XP earned (animated).
- The exercise again with every note colored by judgment.
- Counts per judgment, plus a hold line: *held right · cut short · held too long*.
- **Timing and length lane:** the exercise drawn to scale (two bars per row): every note's
  length in gray, the player's hold on top in color, starting where they pressed. Early or
  late presses show as a shifted start; cut-short notes show a dashed outline for the part
  that was not held; misses show ×.
- Tendency + steadiness, one-line coaching tip (it names the worst hold problem first,
  e.g. "You let go of the dotted quarter in bar 2 too early").
- Buttons: **Retry** (same exercise) · **Next** (new exercise, same settings) · **Listen**
  (correct playback) · **Settings**.

---

## 7. Audio

- Sounds synthesised in Web Audio (no downloads): metronome click (accented high click on
  beat 1), woodblock/clave for rhythm playback, short soft "tok" as tap feedback.
- Optional sample pack later (piano note, snare).
- Volume sliders: metronome / rhythm / tap feedback.
- iOS: audio context unlocked on the first tap of the *Start* button; silent-switch note.

---

## 8. Gamification

### 8.1 Core loop

`Pick (or continue) → Play 20–60 s → Instant feedback → Stars + XP → Next`

Keep rounds short; *Next* is one tap; the next exercise is pre-generated during results.

### 8.2 Learning Path (default curriculum)

Each unit has ~5 lessons (settings presets) and a "boss" exercise (more bars, faster).
Two stars on a lesson unlocks the next.

| Unit | Content |
|---|---|
| 1 | Quarter & half notes in 4/4 |
| 2 | Quarter & half rests |
| 3 | 3/4, whole note & whole rest |
| 4 | Eighth notes (pairs) |
| 5 | 2/4, eighth rests, mixed meters |
| 6 | Ties |
| 7 | Dotted notes: dotted half, then dotted quarter + eighth |
| 8 | Sixteenths (four, then 8th+2×16th combinations) |
| 9 | Syncopation |
| 10 | Dotted eighth + sixteenth |
| 11 | Triplets |
| 12 *(later)* | Compound meters 6/8, 3/8, 9/8, 12/8 |

Ties come before dotted notes on purpose: a dot can then be taught as a shortcut for a tie
(a dotted quarter sounds exactly like a quarter tied to an eighth), a common approach in
rhythm teaching. Eighths come before dotted quarter + eighth because that figure combines a
lengthened beat with a divided beat.

Each unit offers both *Tap* and *Dictation* lessons.

### 8.3 Progression & rewards

- **XP** = base × difficulty × accuracy (+ bonus for no replays, max combo, 3 stars).
- **Levels / ranks** (e.g. *Tick → Count → Measure → Groove → Metronome → Maestro*).
- **Streak** of practice days (a daily challenge or any 3 exercises keeps it).
- **Daily Challenge** (date-seeded, same for everyone).
- **Achievements**: *Perfect bar*, *50 perfect taps in a row*, *First sixteenths*,
  *No replays needed*, *Played at 160 BPM*, *7-day streak*, …
- **Personal bests** per lesson and per settings combination.

### 8.4 Skill tracking (Weak Spots)

Every judged note is attributed to the **cell** and **meter** it came from. Per cell we keep
a rolling accuracy (exponential moving average). Weak Spots mode boosts the generator
weights of the weakest cells; the Progress screen shows them as a "heat map" of skills.

### 8.5 Progress screen

Accuracy over time, minutes practised, streak calendar, skill map per cell/meter,
tendency trend (rushing/dragging over time).

---

## 9. Screens & UX

See the [Muzieklab App Design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE)
for the screen designs (mobile flow, desktop play, dark mode), the foundations and the
engine overview.

### Visual design tokens

Neutral greys with a slight green-blue cast, near-black ink, one slate accent. Colour is
reserved for feedback; gold only for rewards (stars, streak, XP).

| Token | Light | Dark |
|---|---|---|
| Ground | `#eef1f0` | `#101415` |
| Paper / surface | `#ffffff` | `#191f20` |
| Line | `#d8dfde` | `#2f3839` |
| Muted text | `#5a6667` | `#9aa7a7` |
| Ink (text and notes) | `#161b1c` | `#e8eeed` |
| Accent (slate) | `#2f6669` | `#8fbfc1` |
| Accent soft | `#dfeaea` | `#1c3031` |
| Reward gold | `#e0a526` | `#e0a526` |
| Perfect / great | `#1f8a5b` | `#4cc38a` |
| Good (early/late) | `#b7791f` | `#f0b429` |
| Miss | `#d64545` | `#ff6b6b` |

Type: **Unbounded** (display, scores, counts), **Figtree** (UI and body),
**JetBrains Mono** (numbers, ms, BPM, codes), **Noto Music** (note and rest glyphs on
buttons). Corners 12–14 px on controls, 20 px on cards, 32 px on the tap pad; touch
targets ≥ 44 px.

**Motion.** Every change of highlight eases instead of jumping, and stays subtle:

| What | Motion | Time |
|---|---|---|
| A button or chip turns on/off (color, border, shadow) | cross-fade | 180 ms, ease-out |
| Pressing any button | scales to 97 % while pressed | 120 ms |
| Any pick-one group, including segmented controls (sign row ♭ ♮ ♯, range, key list, circle of fifths) | the highlight **slides** from the old choice to the new one in a straight line, resizing to fit if the choices differ in size. No stretching or reshaping: a plain transform slide with a standard ease-out (cubic-bezier(.2, 0, 0, 1)), as in iOS and Material segmented controls. Chips get a translucent slate tint; the chosen chip's slate edge fades in | 260 ms |
| Pick-many chips (time signatures, note values, chapters) | each chip cross-fades on or off | 180 ms |
| Switches, check boxes, progress bars | knob slides, fill grows | 200–300 ms |
| Something appears (feedback, the answer side) | fades in from 4 px above | 220 ms |
| Opening or closing a chapter (accordion) | the panel's height eases open or shut while its content fades; opening one chapter closes the other at the same time | 340 ms |
| A sheet (How to play) | slides up 32 px and fades in; closing plays it in reverse (slides down, backdrop fades) | 320 ms in, 240 ms out |
| Beat counter in play | the highlight moves to the next beat | 120 ms (shorter than the shortest beat) |

Nothing loops or bounces, and nothing animates during timing-critical input except the
beat highlight. With *reduce motion* set on the device, all of it is switched off.
The *Foundations* board on the design canvas has a **Motion · try it** section with a live
demo of each row of this table.

**Scrolling.** Screens are laid out to fit, so a page never shows a scrollbar, and never
scrolls during play. Only lists that can grow scroll (chapter list, key list, results
history); they use the app scrollbar: a 4 px fully rounded thumb in a 10 px gutter on a
clear track, no arrows, `#b9c3c2` (hover `#8a9596`), dark `#3d4849` (hover `#5d6a6b`).
Long Learn pages scroll the whole page on phones with the system scrollbar hidden.

**Notation colour rule:** notes are always drawn in the *Ink* token of the current theme
(black on paper, light on dark), never a hard-coded black. VexFlow output must have every
glyph's fill set from the theme, including paths that VexFlow leaves without a fill
attribute (they default to black and disappear on a dark background).

| Screen | Key elements |
|---|---|
| **Home** | Streak + XP header; big *Continue path* card; *Daily challenge*; *Free practice*; *Listen (dictation)*; *Progress*. |
| **Practice setup** | Mode switch; chips for meters; icon toggles for note values and rests; extras; bars stepper; tempo slider; live preview + difficulty meter; *Start*. |
| **Play (Tap)** | Top bar: bar x/y, tempo, combo, pause. Notation (wraps 2 bars/line on phone, 4 on desktop, auto-scrolls). Beat dots. Big tap pad (mobile) / "press any key" hint (desktop). |
| **Dictation** | Play/replay button with plays left; staff showing what you've entered; bar fill meter; note palette; *Check*. |
| **Results** | Stars, accuracy, timing strip, tips, Retry / Next. |
| **Path** | Units as a vertical path with lessons, stars and locks. |
| **Progress** | Charts, skill map, achievements. |
| **Learn** | Topic list with read status and search; topic pages (mobile) and a full theory reference (desktop). |
| **Settings** | Language (English only in v1; the picker appears once translations exist), sounds & volumes, calibration, timing leniency, notation style (common/strict), theme. |

### 9.1 Learn: theory in chapters

The theory is split into seven chapters in teaching order. Each chapter only relies on
earlier chapters, and each section matches a setting in Free practice. Every section has a
short explanation, rendered notation with the counting under the notes (held or silent
counts in grey brackets), key facts, and a *Practise* link that opens Free practice with
the matching preset. Chapter headers show which Learning Path units use them.

| Chapter | Sections | Path units |
|---|---|---|
| **1 · Pulse and meter** | 1.1 The beat and tempo (BPM, tempo words) · 1.2 Bars and time signatures (barlines, final barline, 2/4 3/4 4/4) · 1.3 Strong and weak beats | 1, 3, 5 |
| **2 · Note values** | 2.1 Reading the shape (head, stem, flags; beats) · 2.2 The note tree | 1, 3, 4, 8 |
| **3 · Rests** | 3.1 The five rests · 3.2 Writing rests correctly (centred whole-bar rest, half-rest placement, dotted rests, no ties) | 2, 3, 5 |
| **4 · Dividing the beat** | 4.1 Eighths: 1 & 2 & · 4.2 Sixteenths: 1 e & a · 4.3 Beams show the beat | 4, 8 |
| **5 · Making notes longer** | 5.1 Ties · 5.2 Dotted notes (a dot as a shortcut for a tie) | 6, 7, 10 |
| **6 · Off the beat** | 6.1 Syncopation · 6.2 Triplets | 9, 11 |
| **7 · Compound meter** *(later)* | 7.1 Six-eight | 12 |
| **8 · Notes on the staff** | 8.1 The staff and two clefs · 8.2 Treble clef (lines E G B D F, spaces F A C E) · 8.3 Bass clef (lines G B D F A, spaces A C E G) · 8.4 Middle C and ledger lines · 8.5 Two ways to name notes (C–B = do–si) · 8.6 The piano octave (groups of 2 and 3 black keys, sharps and flats) · 8.7 Key signatures (order of sharps F C G D A E B and flats B E A D G C F, naming the key, relative minor, a sign lasts until the bar line) | Read notes |
| **9 · Scales** | 9.1 Half steps and whole steps · 9.2 The major scale (W W H W W W H) · 9.3 Major scales in every key (each letter once; the scale's signs = its key signature) · 9.4 The circle of fifths (15 key signatures, 12 sounding keys) · 9.5 Minor scales (natural W H W W H W W, harmonic with raised 7th, melodic with raised 6th and 7th going up) · 9.6 Scale degrees (tonic … leading tone; fixed do in this app) | Scales |

Why this order: pulse and meter come first because every later rule refers to beats and
strong positions. Note values come before rests because each rest is defined by its note.
Dividing the beat (and its counting syllables) comes before ties and dots, because a dotted
quarter + eighth can only be counted once "&" is known. Ties come before dots so the dot can
be explained as a tie. Syncopation needs strong and weak beats, ties and eighths, so it
comes late. Compound meter changes what the time signature means, so it is last.

**Each chapter is its own page**, never one long page with everything. A chapter page has:
its number and title, what it builds on and which Path units use it, its sections, a quick
check question, and previous / next chapter links. Sources are not shown to the player;
they live in `THEORY-SOURCES.md`, where every claim on the page is checked. On
mobile the Learn tab lists the chapters as cards that expand into their sections, with read
status; on desktop a sidebar lists all chapters, with the open chapter's sections nested
under it. The design canvas shows chapter 2 (mobile) and chapter 5 (desktop) as examples.
On tablet (≥ 700 px) and desktop (≥ 1100 px) a chapter page keeps one column of
sections in reading order, each filling the width. Inside a section, related parts sit side
by side (lines | spaces, example | rule, text | keyboard) and stack again on narrow screens,
so notation keeps a readable size instead of stretching. Desktop adds the chapter sidebar;
on tablet the sidebar becomes a row of section chips under the title. The canvas shows chapter 8 at 834 px (tablet) and 1280 px (desktop).

The bottom tab bar gains a **Learn** tab: Home · Path · Learn · Progress · Settings.

### UX principles

- **One-thumb mobile**: primary actions at the bottom; tap pad is huge; no scroll during play.
- No accidental zoom/scroll during play (`touch-action: none` on the pad, Wake Lock on).
- Feedback by **colour + shape/icon** (colour-blind safe), sound optional.
- Full keyboard support; `prefers-reduced-motion` respected; light & dark theme.
- Notation is the hero: big, high-contrast, single-line rhythm staff (percussion style).

---

## 10. Technical architecture

### 10.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Generator/speller logic benefits from types. |
| Build | **Vite** | Fast dev server, simple static build. |
| UI | **React** + small store (Zustand) | Familiar, enough for a handful of screens. |
| Notation | **VexFlow** (SVG) | Mature engraving: beams, ties, tuplets, rests. |
| Audio | **Web Audio API**, own scheduler | Sample-accurate timing, zero dependencies. |
| Storage | `localStorage` (settings) + **IndexedDB** (history, stats) | Offline, no account. |
| Offline / install | **PWA** (`vite-plugin-pwa`) | Home-screen app on phones. |
| Tests | **Vitest** + **fast-check** (property tests) | Generator correctness over thousands of seeds. |
| Hosting | Static (GitHub Pages / Netlify) | No backend needed. |

### 10.2 Module layout

```
src/
  core/                 # pure TS, no DOM — fully unit-testable
    ticks.ts            # PPQ, value <-> ticks
    meter.ts            # Meter definitions, metric tree, weights
    rng.ts              # seeded PRNG
    cells.ts            # cell library
    generator.ts        # hierarchical generator + constraints
    phrase.ts           # form plans + variation operators
    feasibility.ts      # DP check for settings
    speller.ts          # rhythm -> notation (ties, beams, rests)
    difficulty.ts       # difficulty + syncopation measures
    exerciseCode.ts     # encode/decode shareable codes
    judge.ts            # tap matching & scoring
    dictation.ts        # answer comparison, distractor generation
  audio/
    engine.ts           # AudioContext, look-ahead scheduler
    sounds.ts           # synthesised click / woodblock / tok
    calibration.ts
  input/
    tapInput.ts         # keyboard + pointer -> timestamped taps
  render/
    vexflowStaff.tsx    # NotatedSymbol[] -> SVG, cursor, colouring
  game/
    xp.ts  path.ts  achievements.ts  skills.ts  storage.ts
  ui/
    screens/ Home, Setup, Play, Dictation, Results, Path, Progress, Settings
    components/ ...
  i18n/ en.json         # every user-facing string; other locales added later
```

### 10.3 Testing strategy

Property tests over thousands of random seeds and random settings:

- every bar sums exactly to `barTicks`;
- only enabled values appear (after spelling);
- every event starts on a position allowed by the metric tree;
- speller output re-sums to the same rhythm (round trip);
- same code ⇒ same exercise;
- judge: perfect synthetic taps ⇒ 100%; taps shifted by *x* ms ⇒ expected judgement.

---

## 11. Accessibility & localization

**Language:** v1 is **English only**, with American English spelling and note names
(quarter, eighth) throughout. Never mix languages in the UI.

**The whole app must be localizable** so translations can be added later
without code changes:

- No hard-coded user-facing text. Every string (buttons, Learn chapters, feedback, tips,
  achievements, aria labels and image alt text) lives in a message catalog (`i18n/en.json`)
  and is looked up by key. Use ICU message format for plurals and variables
  ("{count, plural, one {# beat} other {# beats}}").
- Note names are locale data, not just strings: letter names differ by language (German
  uses H for B), fixed-do languages use do re mi as the note names, and English
  movable-do teaching says "ti" instead of "si". Memory aids ("Every Good Boy Does
  Fine") are per-language content.
- Theory terms are message keys too, not literals: note and rest names, tempo words,
  counting syllables ("1 & 2 &" differs per language and teaching method), rank names.
- Format numbers, dates and BPM with `Intl` for the active locale.
- Layout must survive longer translations (Dutch and German text is often noticeably
  longer than English): no fixed-width text boxes; labels may wrap.
- Notation images carry no baked-in words. Counting under notes is drawn from the
  locale's syllables at render time.
- Theory content (Learn pages) is stored as structured, translatable content, with its
  sources kept per locale (for example Dutch Wikipedia for Dutch note names, already
  checked in `THEORY-SOURCES.md`).
- `lang` attribute set from the active locale; right-to-left support is not planned.
- Screen-reader labels for controls; notation itself gets a text alternative
  ("quarter, quarter, half").
- High-contrast theme; big touch targets (≥ 48 px).

---

## 12. Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | **Core engine** | Generator, speller, feasibility, codes — with property tests; dev page renders random exercises with VexFlow. |
| M2 | **Tap mode** | Audio engine, count-in, metronome, tap input, judging, results screen. |
| M3 | **Setup & persistence** | Practice setup screen with validation + live preview; settings saved. |
| M4 | **Dictation** | Choose + Build input, comparison, replays. Echo mode. |
| M5 | **Game layer** | XP, levels, Learning Path, daily challenge, streaks, achievements. |
| M5b | **Read notes** | Note generator, treble and bass clef rendering, names / piano input, setup, scoring, Learn chapter 8. |
| M6 | **Polish** | Calibration, PWA/offline, mobile tuning, localization-ready check (all strings in the catalog), progress screen, Weak Spots. |

---

## 13. Open questions

1. **Language:** decided: English only for v1, fully localizable (§11). Which language comes next, and when?
2. **"Muzieklab" curriculum:** is this based on a specific school method whose order of
   topics and notation conventions we should follow? In particular, which counting
   syllables does it use? Dutch teaching commonly counts "1 en 2 en", but I could not
   confirm a single standard for sixteenths, so the app ships the English system
   (Open Music Theory) and makes syllables a setting until this is confirmed.
3. **Pitch reading:** should a later module add note *names* on a 5-line staff
   (treble/bass clef), or stay rhythm-only?
4. **Compound meters** (6/8 etc.) in v1, or after the core is solid?
5. **Counting aid:** show counting text under the notes ("1 & 2 &") as an optional help?
6. **Tap vs hold:** decided: tap & hold is the default in v1; tap only stays as a setting
   for beginners (§3.1).

---

## 14. Theory sources

The music theory and notation rules in this document and in the app's Learn pages are
checked against published sources. The claim-by-claim list, with what was corrected, is in
[`THEORY-SOURCES.md`](THEORY-SOURCES.md).
