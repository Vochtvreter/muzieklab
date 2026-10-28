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
5. **Works offline**, installable on a phone (PWA), no account needed. Accounts (since 0.12.0) are optional and by
   invitation; everything else works without one.

### Non-goals (for v1)

- Pitch reading / melodic dictation (see §13, possible later module).
- Multiplayer.
- Teacher dashboards: planned after v1 ([BACKEND-PLAN.md](BACKEND-PLAN.md) §10). Accounts came first, in 0.12.0:
  optional and by invitation, next to the account-free app, and since 0.15.0 they keep progress across devices. The app
  needs no account, and a site without the API shows no account at all (§9.2).

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
2. **Count-in** — one bar of metronome clicks (configurable: silent, 1 or 2 bars) with big
   on-screen counts "1 – 2 – 3 – 4". *Silent* keeps the bar and the counts, without clicks,
   so the first note never comes without warning.
   The count-in looks different from the music (since 0.10.0; before, it already looked like bar 1). Until the music's
   first beat (the lead-in, the count-in, and the count-in after a pause), the header line reads *Count-in* (nl
   *Voortellen*) instead of *Bar 1 of N*, and no note is highlighted (none before the start either). The beat counter
   draws the current beat as an outlined slate ring, with the digit in slate, instead of the filled circle. On desktop
   the stat card's label reads COUNT-IN and the active digit is hollow. From beat 1 everything looks as before. The
   analog metronome is unchanged, and the aria labels stay *Count-in, beat x of y*. The timing lane draws no playhead
   until beat 1. The count-in after a pause already shows the bar it leads into, the one Resume plays again, in the
   staff and lane windows, the progress and the Pause sheet's *Bar x of y*, although its clock is still in the bar
   before.
3. **Play** — a cursor sweeps across the notation in time. The player presses on every
   note and holds it for its length. Rests = nothing pressed. Tied notes = press once and
   keep holding through the tied note (the tie continues the sound, no new onset — an
   important reading lesson). A dotted note is held for its extra half.
4. **Live feedback** — each notehead turns green / yellow / red as its start is judged; a
   short sound plays on every press and sustains while held. The **tap pad** shows a ring
   that fills while you hold, reaching full at the moment the note ends. Under the notation
   a **length lane** draws every note to scale in gray (so durations are visible at a
   glance) and your holds on top in color; a note let go too early gets a dashed outline.
   The lane has four bars a row, and its head names the bars it shows (*bars 1–8*). Tablet and desktop show every
   bar; Results shows the whole exercise. A phone shows two rows (eight bars) at a time, from the row being played, as
   the staff shows a window of its bars. At the end it keeps the last two rows, so the last row is played on the lower
   one (bars 9–16 from bar 9 of 16, bars 5–12 from bar 5 of 12). With every row, 12 or 16 bars took three or four rows
   and pushed the pad and *Skip to results* off a short phone.
   A combo counter grows on consecutive notes that were both started well and held right.
   A missed note also gets a small × under it, so a miss is shape as well as colour (§9).
   The pad itself only says what it is, a quarter-note symbol and **Tap** (nl *Tik*; since 0.10.0, before
   *Rhythm*); it never carries instructions. Its accessible name is *Tap pad* (nl *Tikpad*), and the copy calls it
   that (How to play, the desktop hint, Calibrate). The judgment (GREAT, GOOD · LATE…) shows just above the pad.
5. **First time** — the first time a player opens a rhythm exercise, a *How to play*
   sheet slides up over the paused exercise: a small press → hold → lift diagram and
   three steps (press when a note starts; hold for its length and lift when it ends;
   stay off on rests, keep holding on ties), plus "any key works on a computer".
   *Got it* closes it. To see it again there is a small, muted **?** icon in the top bar,
   next to Pause (desktop: the ? key). It pauses the exercise and opens the same sheet,
   labelled *Paused* instead of *First time here*. The icon stays quiet (muted gray,
   no label) because it is rarely needed once the player knows the game.
   Unit 1 is tap only, so a beginner's first sheet is the tap version ("no need to hold the note"). The first
   exercise that judges holds (usually lesson 2.1) opens How to play once more, with the hold steps and the eyebrow
   *New: hold each note*; *Got it* starts it (since 0.8.0). After that it opens only from **?**.

   **Before the count-in, one sheet at a time** (since 0.10.0), each closed with one tap:
   1. *How to play*, when it is due (above).
   2. The **intro sheet**, when a lesson brings a symbol the player has not been shown yet. `game/intro.ts` works out
      what each lesson brings that no earlier lesson used (1.2 the half note, 2.2 the quarter rest, 3.1 three-four,
      4.1 the eighth, 6.1 the tie, 7.1 the dot …); lesson 1.1 brings nothing, because How to play covers it. Every
      lesson run (Continue, the Path, *Next lesson*, *Next exercise*) has an exercise that shows all of what its lesson
      brings: the start tries new seeds until the spelled exercise has each of them (`makeLessonRun` in `ui/store.tsx`,
      `exerciseHas` in `game/intro.ts`; up to 200 seeds, because 3.4's whole rest is in only about 1 exercise in 22,
      where most lessons need a few), and keeps the last one tried if none has. The sheet lists only what the
      exercise shows, so it never names a symbol the staff does not have (nor saves it as shown). What was shown is
      kept in `prefs.seenIntros`. The sheet has the eyebrow *New in this lesson* and the lesson title as its heading.
      Each symbol gets a 72 px accent-soft tile with its glyph (Noto Music, as the Setup buttons draw it; a
      time signature as two stacked digits in the display face), its name and one fact (*Half note · 2 beats*,
      *Quarter rest · 1 beat of silence*, *Three-four · 3 beats in a bar*, *Tie · adds the second note's length*,
      *Dot · adds half the note's length*, *Triplet · 3 in the time of 2*), and *Learn more →* to its Learn section
      (2.1 note values, 4.1 eighths, 4.2 sixteenths, 3.1 rests, 1.2 time signatures, 5.1 ties, 5.2 dots, 7.1
      triplets). Under them is an action row: an outline *Listen*, as wide as its label, that plays this exercise once
      with the beat (as Results' Listen does; it reads *Stop* while playing), and an accent *Start* that fills the
      rest. Start marks the symbols as shown and starts the count-in. **?** on the sheet opens How to play and leads
      back to it; when How to play was not due, its eyebrow names the run (*Lesson 3.1*) instead of *First time here*
      (also from Ready). When How to play is due as well, it comes first and *Got it* brings the intro sheet.
   3. **Ready**, when no tap led here (a reload, Back / Forward into Play), or when the run is a lesson other than the
      last finished run's (Results → *Next lesson*, another lesson from the Path or Home), so the new rhythm can be
      read first. Retry and Next exercise of the same lesson, free practice, and the first run of a session count in
      straight away.

   The intro sheet uses the same Sheet as the others: a bottom sheet on phone and tablet (landscape too), a 440 px
   dialog on desktop. On desktop the intro and Ready dialogs sit low (aligned to the bottom, 48 px padding), so the
   staff stays readable; How to play and Pause stay centred.
5. **Results** (§6.4).

**Input**

- Desktop: **any key** (except Esc = pause) or mouse button: `keydown` = press,
  `keyup` = release. Key auto-repeat events are ignored. If several keys are down, the
  hold lasts until the last one is released. A key (or finger) going down while another is
  held starts a new press, so rolling two fingers over fast notes works; within 50 ms of the
  held press it counts as the same press (a chord).
- Mobile: a large **tap pad** in the bottom half of the screen: `pointerdown` = press,
  `pointerup` / `pointercancel` = release. The pad captures the pointer
  (`setPointerCapture`), so sliding off the pad does not end the hold.
- Releases are timestamped with the same clock as presses (§6.1).

**Setting: Hold notes for their length** (Settings → Input: *Tap & hold*, the default, or *Tap only*). Tap only
judges note starts alone. Tap & hold means holding counts once the path teaches it: the lessons of unit 1 are tap
only, and the Learning Path switches holding on from unit 2 (lesson 2.1), where lengths start to matter. Since 0.10.0
the rest of the game follows the path, so the rules do not change when the player leaves it: free practice (Tap and
Echo, and the Learn practice links) holds only once unit 2 is open (`practiceHold` in `ui/store.tsx`), and so does the
daily challenge (§3.4). The setup's *Hold notes for their length* switch shows that state and can turn holding on
earlier: it sets Input to *Tap & hold* and keeps the Input setting it replaced (`prefs.holdEarly`). Turning it off
before unit 2 takes that early choice back and puts that Input setting back, so on and off again leaves *Tap only*
as it was; after unit 2 it sets Input to tap only, as before. *Tap only* in Settings always wins. Echo's How to play
has a tap-only step 2.

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
| **Daily Challenge** | One exercise per day at the player's place among the rhythm units of the Learning path, seeded by the date and the highest open unit, so everyone at the same unit gets the same one (below). Keeps the streak alive. |
| **Weak Spots** | Adaptive (later): the generator boosts the cells the player scores worst on. Since 0.19.0 *Practice weak spots* on the Progress tab's skill map is a practice-setup preset instead (§8.4). |
| **Learn** | Theory library: one topic per thing you can practise (§9.1), each with notation examples, counting and a quick check, linking straight to a matching practice preset. |

**Daily challenge at the player's level** (since 0.10.0; before, everyone got one of eight mid-path presets, so day
one could bring eight bars of sixteenths). The daily is seeded by the date and the tier: the highest open rhythm unit
(1–8, `reachedUnit` in `game/daily.ts`). The tier is fixed for the day when the daily is first played (kept in
`progress.daily.tier`, `dailyTier`): a player who passes a unit later that day keeps that day's exercise, so Home's
*Done today* and *Play again* and the result it records all belong to the exercise Play starts; the next day follows
the new unit. Each preset carries the unit that teaches its hardest material and is picked only once that unit is open:

| Unit | Adds |
|---|---|
| 1 | 4/4, quarter and half notes |
| 2 | quarter and half rests |
| 3 | 3/4, and whole notes |
| 4 | eighths |
| 5 | 2/4, eighth rests and mixed meters |
| 6 | ties |
| 7 | dotted notes |
| 8 | sixteenths |

Below unit 3 the daily uses only the unit 1–2 presets, at 60–72 BPM over 4 bars, like the path's first lessons. From
unit 3 it uses the mid-path presets (unit 3 up to the reached unit), at 72–104 BPM over 4 or 8 bars. It is tap only
until unit 2, where the path starts teaching holds; from then on hold follows the Input setting. The first-daily bonus
XP (20), *Streak kept* and *New personal best* work as before. On Home the card reads *Daily challenge · 4 bars · new
every day*, and its Play is an outlined button: Continue is the only filled button on Home (§9).

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
- Both name inputs (do re mi and letters) have a **sign row: ♭ · ♮ · ♯** when a note in the round can carry a sign:
  a key with a signature (any of the Mix keys counts), or *Extra sharps and flats* (`roundHasSigns` in
  `core/noteRound.ts`). The player picks the sign first (♮, no sign, is the default) and the seven buttons
  update to show it (D♯, re♯). The written spelling is required: right letter with the
  wrong sign is wrong, and F♯ is not accepted for a written G♭. Desktop keys: − = ♭,
  0 = ♮, = = ♯, then the letter.
  After a wrong letter or a timeout the right button turns green with the note's own name (F♯ also when ♮ is picked,
  D when ♯ is), so the green mark never sits on a name that is wrong; a right letter with the wrong sign stays red, as
  it reads.
  A round in C major / A minor with no extra signs has no sign row, no *Pick the sign if there is one, then the name.*
  line and no − 0 = keys: seven buttons for seven answers (since 0.10.0). The idle line is then empty on phone and
  tablet (the question *Which note is highlighted?* sits above the staff); desktop shows *Which note is highlighted?*
  in the answer card, and its key hint reads *Type the letter of the note*. The setup's *Answer with* line drops
  "each with ♭ ♮ ♯ keys" in that case.
- Desktop: names are typed with the letter keys (A–G); the piano maps to the
  computer keyboard with the common layout **A S D F G H J** = C D E F G A B and
  **W E T Y U** = C♯ D♯ F♯ G♯ A♯.
- Enter or Space goes to the next note once one is answered, and checks a note to write, except on a control the
  player reached with Tab, as in Scales: a button takes Space and Enter itself (Skip to summary, another answer mode,
  a piano key, ▲ ▼), and the Quit link Enter. A name button, or the answer mode or key labels already chosen, has
  nothing to do once its note is answered, so there they still go on.
- **Do re mi or letters** on the name buttons is a saved preference, switched on the play screen. A new player gets
  do re mi when the device language is French, Italian, Spanish, Portuguese, Romanian or Dutch in Belgium (`nl-BE`),
  and letters otherwise (since 0.10.0; before, do re mi for everyone). A new player is one with nothing saved at all,
  no preferences and no progress; their names are saved at once. Players with saved preferences keep their choice.
  Preferences saved before the choice existed keep do re mi, and so does a player with progress but no saved
  preferences (they are saved only when one changes, so a player who only ever played Read notes from Home has none).
- A **Hint** marks the note as assisted. Off a landmark it names the landmark first and then the way to the note, in
  two sentences, so the landmark's name does not read as the answer: *The top line is fa (F). This note is one step
  higher.* (nl *De bovenste lijn is fa (F). Deze noot ligt één stap hoger.*; since 0.10.0, before *One step above the
  top line, fa (F)*). On a landmark it says *This is the top line: fa (F).* In a key with sharps or flats the pointer
  to the key signature still follows (*… Look at the sharp after the clef.*).

**Hearing the notes** (since 0.10.0). The setup has a *Hear the notes* switch, on by default. With it on, a piano key
sounds as it is pressed, in the octave of the note on the staff, so the right key sounds as the note. The other keys
sound in the C–B octave of the note's letter: for B♯4, which sounds as C5, the B key sounds B4, the letter the player
read, a half step under the note (not B5), and for C♭5 (B4) the C key sounds C5 (so the C♯ key for B♯4 sounds C♯4,
and the B♭ key for C♭5 sounds B♭5). After every answer (names or piano; right, wrong or timed out) the note on the
staff sounds as written, with the key signature and its own sign applied. After a wrong piano key, the right note
follows half a second later. Once a note is answered, the piano keys only sound, so the player can compare them. The
sound is the Scales piano tone, at the Playback volume. Read notes and Keys path lessons keep the player's choice (the
lesson presets do not set it). Audio is unlocked from the Start tap and from every answer tap.

**Write it, hear it** (path lessons, since 0.11.0; §8.2). A round's notes can ask three things, set by the lesson
(`tasks`; with more than one they take turns every 5 notes, in order):

- **Read it** (all of the above): name the highlighted note.
- **Write it**: the question names the note (*Write la (A) on the staff*; the name in the player's names, the other
  system in brackets) and its slot on the staff is empty, with the cursor. The player taps the staff where the note
  goes: the nearest line or space gets a note in the cursor's slate, which can be dragged, moved a line or space at a
  time with ▲ ▼ (or ↑ ↓ on a keyboard), and is taken with **Check** (Enter). The staff is drawn taller in a round
  that writes (4 bars on a phone, on its side too) so a line or space is easy to point at, and does not scroll the page
  while dragging. Screen readers get the staff as a slider whose value is the place (*the 2nd space*). After Check the
  note is drawn where it belongs, green or red as when reading; a wrong one says where it went: *You wrote sol (G), on
  the 2nd line; la (A) goes on the 2nd space.* The staff has a second D, E, F and G: the right letter an octave off is
  still wrong (the lesson teaches the place), and the feedback says so, as in Scales: *Right note, wrong octave: write
  the lower sol (G), on the 2nd line.* The hint is the reading hint (the nearest landmark and the way from it).
- **Hear it**: sol (G4) sounds, then the note, 0.9 s apart; the slot stays empty until the note is named, and *Hear
  it again* plays both again. The note always sounds, also with *Hear the notes* off. Answers are the name buttons (or
  the piano), and the feedback places the note from sol: *Right: mi (E), 2 steps below sol.* The hint says only that:
  *Hint: it is 2 steps below sol.*

A lesson can also narrow the notes (`only`: the positions it draws from; the name buttons show just their names, one
to seven, centred and no wider than 96 px each) and stress one (`stress`: three times as often). A note that has
only one position to come from repeats (sol in unit 1).

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
  only lasts until the next bar line, so a sign never carries over to the next note. Each bar has room for its note
  and its sign: in a narrow bar the note moves back toward its bar line, and where that is not enough the staff is
  drawn smaller (§9). The highlight around the note to name, its sign included, stays inside that note's bar.
- With **Extra sharps and flats** on, a note can also carry a sign that changes the key
  signature's note: ♯ or ♭, or ♮ to cancel it (F♮ in G major). Alterations that would
  need a double sharp or double flat are left out. So *Sharps* adds none in C♯ major, where every letter is sharp
  already: there the setup's summary does not say *extra signs appear*, and the round is not counted as harder (XP).
- Learn chapter 9 *Sharps, flats and naturals* and chapter 10 *Key signatures* explain all of this; the Key screen
  ("What is a key?") links to 10.1.

**Settings** (Read notes setup screen)

| Setting | Options | Default |
|---|---|---|
| Clefs | treble · bass (at least one) | treble (both until 0.9.0: one set of landmarks for a first round) |
| Key | any of the 15 key signatures; one key or a mix | C major |
| Answer with | names · piano · mixed | names |
| Range | on the staff (11 positions: lines, spaces, and the space just outside each end) · +1 ledger line (15) · +2 ledger lines (19) | on the staff |
| Extra sharps and flats (signs next to notes, on top of the key signature) | none · sharps · sharps and flats | none |
| Notes per round | 10 – 50 | 20 |
| Time per note | off · 5 s · 3 s | off |
| Hear the notes (since 0.10.0) | on · off | on |

**Note generator:** draws from the allowed positions, spelled in the chosen key, with no immediate repeats and no
more than two steps of the same direction in a row, and boosts notes the player recently
got wrong or answered slowly (spaced repetition per note). In mixed-clef rounds the clef
changes at most every 4 notes, with a visible clef change.

**Scoring:** correct / total, average response time, and a per-note weak-spot list. Stars: ★ ≥ 70% · ★★ ≥ 85% ·
★★★ ≥ 95% with an average under 2 s (starting values, to tune). XP and streaks work as in the rhythm modes.
Round done's *Needs practice* shows each missed, hinted or slow note as the player reads it (since 0.10.0; before, in
scientific pitch, *F5 ×3*): a chip with a small staff (the note's clef and the note, with its own sign; no key signature at this
size), the name in the player's note names (fa♯ or F♯), and ×count or the seconds. Screen readers hear e.g. *fa, F on
the top line (treble clef), missed 3 times* or *…, answered with a hint*. A note right only with a hint is not right
(the score), and *Practice missed notes* drills it, so it has a row of its own, *With a hint*, between *Missed* and
*Slow*; *Nothing to practise: every note right, and quick.* shows only when all three are empty. The desktop play
screen's Needs practice card also uses the player's names, and names each note missed or hinted with its own sign (F♯
missed on a line where an F was right reads F♯).

### 3.7 Scales — *every key*

Learn and practice major and minor scales in all 15 keys.

- **Scales hub = the circle of fifths.** The 12 positions run clockwise from C (one sharp
  more each step) and anticlockwise (one flat more). Major keys are the outer ring, their
  relative minors the inner ring; a *Major / Minor* switch makes one ring the active one.
  The three positions at the bottom carry both spellings (B/C♭, F♯/G♭, D♭/C♯); tapping
  the selected key again switches spelling. Each key is filled by progress (★ light,
  ★★ mid, ★★★ dark slate); for minor, by how many of the three forms have ★★ or more.
  A key on the faint ring switches the ring and keeps the focus: the keys come in one order on both tabs, the major
  ring first, so a keyboard or screen-reader user stays on the key just chosen.
  The centre shows the selected key signature; six or seven signs take two balanced lines (*F♯ C♯ G♯* over
  *D♯ A♯ E♯ B♯*), so none runs under the inner ring's keys beside it. Under the circle: the scale's notes (each
  letter once, sharps and flats tinted), stars, *Options* and *Practice*, plus *Go round
  the circle* (all 15 in circle order).
- **Where the hub sits:** it is a Home page, opened from Home's Scales tile, so it keeps the
  app's navigation with Home current (§9): the tab bar on phone, with a back arrow as on a
  Learn chapter; the top header on tablet and desktop. Tablet and desktop put the circle and
  the selected key side by side: the key signature, the stars per form (one rating for major,
  natural / harmonic / melodic for minor), the scale's notes and *Options* / *Practice*.
- **Starts on C major** (since 0.8.0): no sharps or flats and only white keys, where method books start; G, one sharp,
  is the next step round the circle.
- **Settings:** keys (the selected key · all 15 · choose, using the Key screen from Read
  notes) · scales (major, natural minor, harmonic minor, melodic minor; each shows its
  step pattern) · answer with (piano · names · mixed) · direction (up · up and down) ·
  write with (♯ ♭ signs · key signature) · show the steps (W and H) · play each note.
  A minor scale uses the relative minor of the chosen key (G → E minor). The summary above Start says how the round
  goes: shuffled, or in circle order when it goes round the circle (all 15).
- **Piano:** a keyboard window that starts on the tonic, or on the white key just below it
  when the tonic is a black key (F♯, D♭ …): 9 white keys, enough for one octave from any
  starting note. The white keys always show their letters (A–G), whatever the label setting in
  Read notes: the window starts somewhere new with every scale, so the letters find the keys.
  The player plays the scale note by note; each right
  note is written on the staff and fills the next degree box. The W/H steps sit between
  the boxes: those still to come in `--muted`, a W passed in `--accent-ink` (about 1.6:1 from `--muted`, so the two
  tell apart) and an H or a step and a half passed in gold (`--reward-ink`), each 4.5:1 or more on the page and on a
  card (§11); the degree numbers take their box's ink, not faded. The ScalePlay and ScaleSpell boards (phone and
  desktop) draw the steps still to come fainter (#a7b1b0, under 2:1), a W passed in the accent, an H in `--gold-ink`
  and the numbers at 70–75%.
  A wrong key flashes red and the feedback names the step ("From G, go a whole
  step: skip one key"). The note's own key an octave off is a mistake too, as the octave counts; the feedback says so
  (*Right note, wrong octave: play the lower C.*), not *Not C*. A key the window has twice, an octave apart, reads
  *low* or *high* after its name to a screen reader (*C, low*), and each degree box reads its note once answered, else
  *now* or *not yet* (after the given letter when spelling: *F, now*). *Hear it so far* and *Start over* appear once
  the first note is played (since 0.10.0; before that they would do nothing). They are hidden but keep their place,
  so nothing moves when they come. When the scale is done, *Hear it so far* reads *Hear the scale*. This holds for
  play and spell, on phone and tablet (the row under the feedback) and on desktop (the side panel). Computer keys
  on desktop, as in Read notes: A S D F G H J K L for the white keys, and for a black key
  the letter above the gap between its two white keys (W E R T Y U I O). Space is *Hear it so far* and Enter goes on,
  except on a button the player reached with Tab: that button takes Space and Enter itself (since 0.9.0). After a click
  Space stays *Hear it so far*, and Enter does nothing until the scale is done, so a piano key or a sign that kept the
  focus is not pressed again.
- **Names (spelling):** the letters are given, one per degree, because a scale uses each
  letter once; the player chooses ♭, ♮ or ♯ for each (keys − 0 =, as in Read notes). This
  drills exactly what changes between keys and between the minor forms (D♯ in E harmonic
  minor). Double sharps (F𝄪 in G♯ harmonic minor, C𝄪 in D♯, G𝄪 in A♯) appear only in keys
  that need them: then a fourth button, 𝄪 (key X), joins the row. No scale here needs a
  double flat. *Hint* names the step from the note before. Right after a wrong sign it takes the place of why and of
  the sign's red mark; the next mistake says why again, and Hint can be asked once more.
- **Up and down** adds the way back: the degree row gets a second line, from 7 down to 1, and
  the piano window stays the same.
- **Melodic minor down** is written as natural minor (the classical form).
- **Scoring:** a scale is right when it was finished without mistakes; stars by mistakes
  (0 → ★★★, 1 → ★★, 2–3 → ★). A scale with mistakes comes back at the end of the round.
  XP: 2 per star for each scale (doubled for up and down), + 5 when every scale in the round
  has ★★★ (starting values, to tune).
- **Round done** lists each scale with its mistakes and stars (a scale with mistakes is
  marked *Came back at the end of the round*) and how far the circle is filled, with
  *Change setup* and *New round* (the same setup: shuffled again, or round the circle in circle order again). Its back
  arrow goes to the Scales hub.
- **Layout:** setup, play, spell and round done are exercise screens (no tab bar or header):
  the phone layout, in the 640 px column on tablet. On desktop, play and spell use the wide
  exercise layout of Read notes: the exercise header (title, scale *n* of *m*, progress,
  Quit · Esc), the staff across the top, then the degree row with the piano or the sign
  buttons, and beside it the mistakes, then *Hear it so far* / *Hear the scale* (Space) and *Start over* once the
  first note is played.

### 3.6 Test yourself — *flash cards*

A quick theory check on any **chapters the player chooses**, opened from the Learn tab.

- **Setup:** tick chapters (1–10; chapters marked *later* have no cards yet; a "Chapters I
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
| **Hold notes for their length** | on (tap & hold) · off (tap only) | follows the path: off until unit 2 is open, then on (since 0.10.0, §3.1) |
| **Time signatures** | 2/4 · 3/4 · 4/4 *(v1)*; 2/2 · 3/8 · 6/8 · 9/8 · 12/8 · 5/4 *(later)*. Multi-select: each exercise picks one at random. The setup shows only the playable ones; there is no disabled "6/8 soon" chip (since 0.10.0). | 4/4 |
| **Note values** | whole · half · quarter · eighth · sixteenth | half, quarter |
| **Rests** | whole · half · quarter · eighth · sixteenth (independent of notes) | quarter |
| **Extras** | dotted notes · ties / syncopation · triplets | off |
| **Bars** | 1 – 16 (stepper) | 4 |
| **Tempo** | 40 – 200 BPM (slider) + presets (Largo 50, Adagio 70, Andante 90, Moderato 112, Allegro 132); the slider shows the tempo word for the current range (§14) | 80 |
| **Metronome during play** | on / accent first beat only / off | on |
| **Count-in** | silent / 1 / 2 bars (silent = one bar with only the on-screen count, no clicks) | 1 |
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
  bar gets a single whole rest centred in the bar, in every time signature: midway between its bar lines (after the
  time signature in the first bar).
- **Beaming** per beat (simple meters) or per dotted-quarter (compound); never across
  beats 2–3 in 4/4. Four eighths may be beamed as a half-bar group (beats 1–2 or 3–4) in
  4/4, an accepted alternative; the default beams per beat. Sixteenths beamed per beat.
- Triplets get a bracket/number per beat. The staff keeps room above its first row for the number. Play keeps it on
  every window of an exercise with triplets, and the Setup preview whenever Triplets is on, so neither changes height
  as the window moves or a new preview bar is drawn.
- The final barline (thin and thick) closes the exercise's last bar. Play shows two rows of bars at a time: a window
  that stops before the exercise's end closes with a plain bar line.

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
- The calibration screen says it in plain words (since 0.10.0): *Tap along with 16 clicks. Muzieklab measures how
  late or early your taps land and takes that off every score.* The measured median is labelled *Your delay* (nl
  *Jouw vertraging*) on the card and on the result card, which said *Median* and *Your offset*, and the result text
  starts with *Measured over N taps*. The stored value is still the median offset. The Dutch start prompt is *TIK OM
  TE BEGINNEN*; it must fit on one line on a 320 px phone.
- Calibrate opens from Settings, and from a coaching tip on Results (§6.4) as `#/calibrate?from=results`: then its
  back arrow (*Back to results*) and Save return to `#/results`, which shows the last run again. When Results goes back
  to a Learn section (`?from=7.3`), Calibrate carries it as `&learn=7.3` and returns to `#/results?from=7.3`, so the
  way back to the section stays. Opened any other way, or after a reload (the store then has no last run to show),
  they return to Settings (*Back to settings*).

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
| Great | ≤ 70 ms | 90 |
| Good | ≤ 120 ms | 70 |
| Miss | — | 0 |
| Extra tap | — | −25 |

A *lenient* setting (×1.5 windows) exists for young beginners.

Getting the rhythm right matters more than millisecond accuracy, so a note started anywhere
inside its window keeps most of its points (70): the Perfect / Great step on top rewards
timing. Missed notes, extra taps and wrong lengths are the rhythm errors and cost the most.
Playtesting showed the first values (Great 80, Good 50) made three stars need near-perfect
timing: in a simulation of normal human tapping spread (σ ≈ 30–40 ms after calibration),
3 stars came in only 7–30 % of runs, against 65–95 % with these values.

**Release (hold) judgment**, with holding on. `end` = the moment the note (including ties
and dots) stops sounding.

| Hold judgment | Rule (default) | Points |
|---|---|---|
| Held right, next note follows | released after `end − max(min(50% of the note, 1 beat), 200 ms)` | ±0 |
| Held right, before a rest or the end | released between `end − max(25% of the note, 150 ms)` and `end + max(min(25% of the note, ½ beat), 150 ms)` | ±0 |
| Cut short | released earlier than that | −1 … −20 |
| Held too long | released later than that (only possible before a rest, or at the end) | −1 … −20 |

When the next note follows directly, the player must lift to press again, so "held too
long" cannot happen there. Every note in the game is a repeated note on the same key, and
players lift well before the next one: expert pianists hold repeated notes for about 60 % of
the time to the next note (Bresin & Battel 2000), and lifting and pressing again takes about
100–200 ms however fast the music is. So a release from halfway through the note counts as
right; that still catches a half note held like a quarter. The 200 ms floor leaves room to
lift on short notes (a note shorter than that cannot be cut short), and the one-beat cap keeps
long notes held. Before a rest the release is where the sound stops, so it is judged both
ways; going late, never more than half a beat into the rest.

A wrong hold costs in proportion to how far out it is: 1 point just past the limit, rising
to the full −20 a further quarter of the note out. Leniency scales every limit (×0.75 strict,
×1.5 relaxed). The first rule (`end − max(25% of the note, 120 ms)` before a note, a flat −20)
was calibrated like a machine: in a simulation of human players from beginner to professional
(press spread σ ≈ 50 down to 13 ms, lifting 100–170 ms plus a share of the note before the
next press), even professionals had a third of their eighth-note holds cut short, and an
amateur playing default exercises reached three stars in 12 % of runs. With these rules that
is 0 % and 79 %, and the levels are still told apart, mainly by press timing.

### 6.3 Scores

- **Accuracy %** = points / max points (floored at 0).
- **Stars:** ★ ≥ 50% · ★★ ≥ 75% · ★★★ ≥ 90% · ★★★★ ≥ 95% with no Good and no Miss (no
  yellow or red noteheads).
- **Three star slots are shown** (☆☆☆) on the results, the lesson tiles and the Path. The 4th star is a hidden
  bonus: once earned, the results show the three as a small arc over one big star (tiles and the Path: ★★★★ in gold).
- **Diamond star (all perfect, 100%):** every start Perfect, every hold right, no extra taps.
  It is also hidden until earned. Results then shows one big diamond star; the lesson tiles and the Path show four
  stars in the diamond-blue gradient (since 0.10.0; before, one blue star next to three empty slots, which read as one
  star). Its label is *Diamond: every note perfect*. Path totals count three stars per lesson (e.g. 79 / 120 ★), so the
  4th star and the diamond count as three there.
- **One way to draw lesson stars** (since 0.10.0): `StarsMark` (`ui/components/Bits.tsx`) draws them everywhere they
  show for a lesson: Home's tiles, the desktop path card, and the Path's rows, tiles and closed-unit stars (locked ones
  too). 0–3 stars are three slots (★★☆), the 4th star four gold stars, the diamond four diamond stars, so a better
  result never shows fewer stars. The accessible label stays on the tile or button.
- **Tendency:** mean signed offset → *"rushing"* / *"dragging"* / *"steady"*. People
  tapping along to a beat naturally land tens of milliseconds early (*negative mean
  asynchrony*, Repp 2005), so a small early average is normal and is reported as
  *steady*. The rushing tip only appears beyond about −40 ms (tunable after playtesting);
  dragging beyond about +30 ms. Device latency is removed separately by calibration (§6.1); when a dragging player's
  offsets are steady and the device is not calibrated, the tip points there (§6.4). A device delay only makes taps
  late, so rushing is never blamed on it.
- **Steadiness:** standard deviation of offsets.
- **Combo:** consecutive notes started Perfect/Great **and** held right; a Good, Miss,
  cut-short or held-too-long note resets it. It shows during play; Results no longer shows the max combo (since
  0.10.0).
- Dictation: % of beats correct; plays used; 3 stars = all correct with ≤ 2 plays.

### 6.4 Results screen

- Stars, accuracy, XP earned (animated). The line under the percentage reads *accuracy · +30 XP* (since 0.10.0; the
  max combo is no longer on Results, it still shows during play).
- The exercise again with every note colored by judgment, and a × under each missed note (§9).
- Counts per judgment, plus a hold line: *held right · cut short · held too long*.
- **Timing and length lane:** the exercise drawn to scale (two bars per row): every note's
  length in gray, the player's hold on top in color, starting where they pressed. Early or
  late presses show as a shifted start; cut-short notes show a dashed outline for the part
  that was not held; misses show ×; taps that matched no note show as a red outline.
  In tap-only exercises a press is a short mark where it landed (holding does not count).
- Tendency + steadiness, one-line **coaching tip**: the first of these that applies (`core/coach.ts`; this order since
  0.10.0):
  1. No taps at all: *No taps came in. Tap the pad, or press any key, when each note starts.* The player did not know
     what to do, or the taps did not register; "read one beat ahead" would not help.
  2. A steady delay: *Your taps came about 125 ms late every time. That is usually the speaker or headphones:
     calibrate once and it is taken off every score.* A steady player 125 ms late (Bluetooth, an uncalibrated phone)
     gets 0% with every note Miss + Extra, and the old tip blamed their reading. The offsets are the hit notes'
     offsets plus, for each missed note, the nearest unpaired extra tap after it (late) or before it (early), within
     350 ms and before the neighbouring note. It is a delay when all of these hold: those offsets cover at least 60% of
     the notes (and at least 3); every one is at least 20 ms off the same way; the mean is at least 80 ms; the SD is at
     most 60 ms; and unpaired extra taps are at most a quarter of the notes. Sloppy timing spreads both ways and wider,
     and mashing the pad leaves many unpaired extra taps. On evenly spaced notes both ways can pass (at 120 BPM a tap
     200 ms early is also the previous note's tap, 300 ms late): the way that pairs more notes wins, as the other
     leaves the first or last note without a tap, then the nearer one. A device delay only makes taps late, so a steady
     early offset never blames the speaker. On a run played with a calibration, that calibration no longer fits (made
     with Bluetooth, now played on the speaker): *Your taps came about 110 ms early every time. If you calibrated with
     other headphones or another speaker, calibrate again.* On a run played before any calibration it is the player
     rushing: *You were rushing: on average 110 ms early. Wait for each note.*
  3. Off track (misses + extra taps add up to a quarter or more of the notes): timing advice is beside the point when
     the player lost their place, so it names the misses, with the bar that had the most (*You missed 3 notes, most in
     bar 2. Read one beat ahead.*; one note: *You missed 1 note in bar 2.*) or, when bars tie, without a bar (*You
     missed 8 notes. Read one beat ahead.*); or the extra taps.
  4. The worst hold problem, e.g. "You let go of the dotted quarter in bar 2 too early".
  5. The tendency (only from 4+ hit notes). When the player drags steadily (every hit at least 20 ms late, SD
     ≤ 45 ms) on a run played before any calibration, it points to calibration instead of "press sooner": *Your taps
     came on average 60 ms late, about the same on every note. That is often the speaker or headphones: calibrate
     once and it is taken off every score.* Taps on both sides of the beat are the player, and so is rushing: *Wait
     for each note.*
  6. Misses (the same tie rule), extra taps, unsteady, then praise. A perfect run that offers Next lesson says *Every
     note perfect. On to the next lesson.* (a lesson fixes tempo and bars); free practice and the daily keep *Every
     note perfect. Try a faster tempo or more bars.*
- **Calibrate in the tip** (since 0.10.0): with the delay tip, or a dragging tip on a run played before any
  calibration (`prefs.calibratedAt` was null), the tip box shows a quiet **Calibrate** action (a ghost button with the
  metronome icon, titled *Measure the delay of your speaker or headphones*) under its text. It opens
  `#/calibrate?from=results`, which comes back to Results (§6.1).
- The tip is about the run as it was played: the result keeps the calibration in force when the run finished, and
  the tip reads that, not the current setting. After calibrating from the tip, Results shows the same tip, and one
  line in place of Calibrate: *Calibrated. Your next exercise uses it.*
- Buttons: **Listen** (correct playback) and **Practice settings** as quiet ghost buttons, then the main pair:
  - from 2 stars on: **Retry** (outline; the same exercise) and **Next exercise** (filled; a new exercise, same
    settings), or **Next lesson** after a lesson (below);
  - under 2 stars, after a lesson, free practice, Echo or the daily challenge (since 0.10.0; before, the filled button
    moved on): **Try again** (filled; the same exercise) and **New exercise** (outline; same settings, a new seed), at
    equal widths. Moving on is not the next step yet. A lesson that already had 2 stars and is replayed under 2 stars
    keeps **Next lesson** as the outline button, so the way on along the path stays.
- **Copy code** (since 0.10.0; before, the exercise code and Copy were the first row under the title, though a code
  cannot be entered yet): one quiet action that copies the exercise code (§4.2). It says *Copied* with a check for
  2 s and has the code in its title. On tablet and desktop it is the third ghost button, after Listen and Practice
  settings (in the side panel since 0.13.0, on a row of its own when the panel is narrow); on a phone (< 700 px) that
  row has no room, so it is a small muted link (13 px, 44 px target) at the very
  bottom, under the main buttons. A daily challenge's date line (*Oct 22*) sits under the title, as on Round done; it
  no longer says *same for everyone*, as the daily follows the player's unit (§3.4).
- After a lesson (since 0.8.0), a badge under the score says what the run means for the Learning Path, and the main
  button follows it:
  - the lesson reached 2 stars for the first time: *Lesson 7.4 unlocked* (slate tint, an open lock), and **Next
    lesson** starts the path's next lesson in place of Next exercise;
  - under 2 stars: *Get 2 stars to open lesson 7.4* (quiet, a lock), with Try again and New exercise (above);
  - the last lesson to 2 stars: *Learning path done*;
  - a lesson played again that already had 2 stars shows no badge, and Next lesson goes to the path's current lesson.

  Free practice and the daily challenge have no path badge. MVP canvas, Rhythm practice: the Results row and *Results ·
  lesson under 2 stars*. Read notes' Round done does the same after a Read notes or Keys lesson (since 0.9.0, §8.2;
  MVP canvas, Read notes: *Round done · after a path lesson*).
- A run that earns an achievement without a new level shows a gold *Achievement unlocked · Perfect bar* badge with the
  other badges (since 0.19.0, §8.3; no board). With a new level, the level-up sheet lists it instead.
- On a short screen (an 8-bar exercise, a 1280 × 800 laptop) Results scrolls and Listen, Retry and Next stay at the
  bottom, as Start does on Setup; the round summaries of Read notes and Scales do the same. A control that is scrolled
  or tabbed to (Calibrate in the tip) stays above those sticky actions (`scroll-padding-bottom`, since 0.10.0), and on
  a phone above the setups' Start and the key lists' Use too (Rhythm, Read notes, Scales; before, only Scales' setup
  had it, and Tab could leave Dotted or a key under Start).

---

## 7. Audio

- Sounds synthesised in Web Audio (no downloads): metronome click (accented high click on
  beat 1), woodblock/clave for rhythm playback, short soft "tok" as tap feedback, and a short
  piano tone (Scales, Read notes and Learn's scales and piano diagrams, since 0.10.0: §3.5, §9.1).
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

**One Learning path (since 0.11.0).** The Path tab holds one path that learns notes and rhythm together. The notes
of the treble staff come in one at a time, in the order **sol → mi → fa → la → do → re → si**, and each note unit
takes turns with a rhythm unit (the units above), so the player reads, writes and hears notes from the first day.
After si come the rest of Read notes and then Keys. Before 0.11.0 the Path held three separate paths (Rhythm, Read
notes and Keys, picked with a switcher; Keys opened after Read notes unit 3); one path replaced them because a new
player saw only the rhythm path (Home's Continue card followed it, and the switcher was easy to miss).

| Path units | What |
|---|---|
| 1 Sol · 3 Mi · 5 Fa · 7 La · 9 Do · 11 Re · 13 Si | First notes: one new note each (below) |
| 2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 | Rhythm units 1–8 (the table above) |
| 15 · 17 · 18 · 19 · 20 | Read notes: the whole treble staff, the bass clef, both clefs, middle C and ledger lines, quick reading |
| 21–26 | Keys: sharps and flats, G major, F major, two and three sharps, two and three flats, mix the keys |

**First notes** (`PITCH_UNITS` in `src/game/notesPath.ts`). Sol comes first because the treble (G) clef curls around
its line; mi and fa sit just below it, then la, do, re and si above. All seven are on the staff (E4–D5: the bottom
line to the 4th line), so there are no ledger lines and no key signature, and with all seven learned the next unit
reads the whole treble staff. A note unit's lessons draw only the notes learned so far (the name buttons show just
those), and the new note comes up three times as often:

| Lesson | Task |
|---|---|
| 1 Meet the note | read it: name the note on the staff (10 notes) |
| 2 Write it | write it: put the named note on the staff (10 notes) |
| 3 Hear it | hear it: sol sounds, then the note; name it (10 notes) |
| 4 On the piano | read it, answering on the piano (15 notes) |
| 5 Unit review | read, write and hear, taking turns every 5 notes (30 notes) |

Sol alone cannot be heard against itself, so unit 1 has *Meet sol*, *Write sol*, *Sol on the piano*, *Write sol,
quickly* (5 s a note) and a review that reads and writes; hearing starts with mi, the classic first interval (sol–mi).
How write and hear work is in §3.5, *Write it, hear it*.

- Every lesson is a preset on top of its unit's base: a rhythm preset (`src/game/path.ts`) or a Read notes preset
  (`src/game/notesPath.ts`: clefs, keys, mix keys, answer with, range, extra signs, notes, timer, and since 0.11.0 the
  tasks, the notes it draws from and the note it stresses). The preset is the whole setup: the player's own setup is
  left as it is.
- `src/game/tracks.ts` puts the units in path order and numbers them 1, 2, 3, …; that number is what the player sees
  everywhere (*Lesson 4.2*, *Unit 4 of 26*, Results, Round done, the Learn chapter headers). The rules are those of
  `src/game/track.ts`: two stars open the next lesson, and two stars on every lesson of a unit open the next unit.
- Results stay where they were kept: rhythm lessons under their own rhythm id ("7.3", as since 0.1), the others with
  their kind in front ("pitch:2.3", "notes:4.3", "keys:2.1"). A lesson that already has stars stays open, so lessons
  played before 0.11.0 can be played again; the path goes on from its first lesson without two stars (for a player
  with rhythm progress: sol).
- Every open unit is a button that opens and closes it (the current unit is open). An open unit shows its lessons by
  name: rows on phone, five tiles on tablet and desktop. A closed unit shows its lessons as stars; any open lesson can
  be played again. The current unit has no *Next: lesson …* line under it (since 0.10.0): its Start button already
  says it. A note unit's node shows its note (*sol*), a rhythm unit's its glyph.
- A locked unit shows its title and a lock at the right of its row (screen readers hear *Locked*). What opens it is
  said once, under the first locked unit: *Opens with 2 stars on every unit N lesson* (since 0.10.0; before, every
  locked unit repeated it).
- Under the header: *Unit N of 26 · stars* and *Theory: Learn*; a screen reader hears *Unit N of 26, 40 of 390 stars*
  (at the end *All done, …*), not only the stars. Desktop: the title and a *Notes and rhythm* card with
  a progress bar on the left; the current unit's name, the same line and Start over the units on the right.
- In Dutch a path unit is a *blok* (*Blok 3 · Les 1 van 5*, *Blok 1 van 8*, *Leerpad, blokken 1, 3, 5*), so it is not
  confused with a Learn chapter, which stays a *hoofdstuk* (since 0.10.0, §11).
- A lesson round counts every note: skipping to the summary counts the notes left as missed, so a lesson cannot be
  passed on its first few notes. Play names the lesson; Quit goes back to the Path. Results and Round done name the
  lesson and its unit, show what the run did for the path (§6.4) and offer Next lesson once the lesson has two stars;
  Next lesson starts the next lesson of either kind.
- Home's Continue card follows the Learning path (since 0.11.0): a rhythm lesson shows a bar of its rhythm, a First
  notes lesson the notes learned so far with their names (the new one highlighted), and a later note lesson a few
  notes of its round. The daily challenge follows the highest open rhythm unit (§3.4).
- Not yet: free practice cannot write or hear notes. The Progress tab (since 0.19.0, §8.5) counts every kind of
  practice: its accuracy, timing and skill map count rhythm rounds (free practice, lessons, the daily, Echo), its Notes
  view every Read notes round (free practice and note lessons), and its minutes every mode. The skill levels (§8.6)
  follow the path: Rhythm reading's levels are the rhythm units.

### 8.3 Progression & rewards

- **XP** = base × difficulty × accuracy (+ bonus for no replays, max combo, 3 stars).
- **Levels / ranks** (e.g. *Tick → Count → Measure → Groove → Metronome → Maestro*).
- **Where XP and the level show** (since 0.10.0; before, Home had a block with the level, rank, *0 / 100 XP*, a bar and
  *100 XP to level 2*): on phone and tablet Home a **level chip** (*Level N* with a small gold ring for the XP into the
  level) sits beside the streak chip. It opens the **level sheet** (`LevelContent` in `ui/components/Reward.tsx`): the
  badge, *Level N · Rank*, the next rank (*Count at level 3*, or *The top rank*), the rank ladder, one XP bar with one
  label (*100 XP to level 2*) and Close. Escape also closes it, and focus returns to the chip. Desktop Home keeps its
  level card, with one label under the bar (§9); the sheet closes when the layout becomes desktop (a tablet turned to
  landscape), so it does not open again by itself when it is turned back.
- The **level-up sheet** after a result uses the same layout with the *Level up* eyebrow. Its line names the new rank
  (*New rank: up from Tick*), or else the next rank (*Count at level 3*), instead of *Up from level N*. Its bar fills
  the old level, then the new one, and only then shows its one label.
  - Since 0.19.0 (App design canvas, Mobile · Results · level up) a bordered list follows the bar: an *Achievement
    unlocked* row for each achievement the run earned (medal icon on the gold tint, the name, what it asks for) and a
    *New personal best* row when the run set one (trophy icon, *Lesson 7.3 · 80%* and *Your best accuracy on this lesson
    so far*, or *Daily challenge · 80%*). The rows fade in one after another (450 ms, then every 150 ms; at once with
    reduced motion). The list shows only when there is a row.
  - Then two buttons side by side, 1 : 1.5 but never narrower than their words: **See progress** (outlined, opens the
    Progress tab) and **Continue** (filled; it closes the sheet, as before). On a short screen the sheet scrolls rather
    than cutting a row off. The rest of the sheet (badge, ladder, the one label under the bar, a dialog on desktop) stays
    as built, because Home's level sheet shares it.
- **Streak** of practice days. MVP: one finished exercise with at least one note hit keeps it
  (as the Home card says); later a daily challenge or any 3 exercises.
- **Daily Challenge** (date-seeded, the same for everyone at the same unit of the rhythm path; §3.4).
- **Achievements** (since 0.19.0, `game/achievements.ts`): five, in this order. Each is earned once and keeps the day
  it was earned (`progress.achievements`).

  | Achievement | What it asks for (the line under its name) | Earned when |
  |---|---|---|
  | *7-day streak* | Practice on seven days in a row | the practice days hold seven days in a row; dated the 7th day of the first such run, so a streak from before 0.19.0 counts as it happened |
  | *Perfect bar* | A whole bar with every note Perfect | a rhythm round (tap or Echo) has a bar whose notes, at least one, are all Perfect |
  | *No replays needed* | Tap back an Echo without hearing it again | an Echo round at ★★★ or more heard once: a replay on the listen card or *Hear again* both count as hearing it again |
  | *First sixteenths* | Two stars on a rhythm with sixteenths | a rhythm round with a written sixteenth note at ★★ or more |
  | *Played at 160 BPM* | Two stars at 160 BPM or faster | a rhythm round at 160 BPM or faster at ★★ or more |

  They are checked after every finished exercise (the 7-day streak after any mode) and once when the app starts. They
  show in three places: the Achievements card on Progress (§8.5; earned in gold with its icon, the others with a lock),
  a row on the level-up sheet (above) when the run also reached a new level, and otherwise a gold *Achievement unlocked ·
  Perfect bar* badge (medal icon) beside the other badges on Results, Read notes' Round done or Scales' round done (no
  board; Scales' round done gained a badge row under the score for it). *50 perfect taps in a row* and the rest wait for
  the full achievements list (Later, §9).
- **Personal bests** (since 0.19.0): a lesson played before whose best accuracy goes up, in whole percent (87.45% after
  87.4% is not a new best), or the daily challenge's best (as Results' *New personal best* badge, §3.4), is a *New
  personal best* row on the level-up sheet. Rhythm and note lessons count; Scales rounds do not. Bests per settings
  combination and a history of them are still Later.

### 8.4 Skill tracking (Weak Spots)

The first plan: every judged note is attributed to the cell and meter it came from, per cell a rolling accuracy (an
exponential moving average), and a Weak Spots mode that boosts the generator weights of the weakest cells. What is
built (since 0.19.0, `game/cells.ts`, `game/stats.ts`, `game/weakSpots.ts`):

- **Cells.** Every judged note of a rhythm round (tap and Echo; free practice, lessons and the daily) counts for one of
  eight cells by its written value (the speller, as Results' tip names a note): a tied note for *Ties*; else a dotted
  half for *Dotted half*; a dotted quarter, and the eighth right after it, for *Dotted quarter + eighth*; else a
  quarter, half, eighth or sixteenth for its own cell (the dotted eighth of a sixteenth figure counts for
  *Sixteenths*). Whole notes and triplets count for none. The first note after a rest also counts for *Rests*. A note
  adds the points the accuracy gives it (§6.3) to its cells, out of a Perfect's.
- **Rolling accuracy.** The points are kept per local day (`progress.stats.days`, the newest 42 days), and a cell's
  accuracy is its points earned over points possible across the last 42 days, as a whole percent. It shows from 12
  notes in that window (*—* before). A per-day sum instead of a moving average, because two devices' days merge (each
  day keeps one device's record, BACKEND-PLAN §6.2) and old figures drop out of the window as practice moves on.
- **Bands and weak spots.** 90% and up, 80–89%, and under 80%: a **weak spot**. A cell is locked until the Learning path
  opens the first lesson of the rhythm unit that teaches it (Quarter and Half: unit 1, Rests: 2, Eighths: 4, Ties: 6,
  the dotted cells: 7, Sixteenths: 8), unless it already has notes in any day kept (not only the window, so a cell
  played does not lock again when its notes leave the window: it shows *—*); it says so with the path's unit number
  (*Sixteenths: locked until unit 16*).
- **Practice weak spots** is a practice-setup preset (as §9 v1.5 planned), not a generator mode. It takes the rhythm
  setup as it is and switches on what the weak cells need: their note value (quarter, half, eighth, sixteenth); for
  Rests, quarter rests (and eighth rests when eighths are on) with *many* rests; for Ties, ties; for Dotted half, dotted
  notes with halves and 3/4; for Dotted quarter + eighth, dotted notes with quarters and eighths. With no cell under 80%
  it uses the two weakest open cells. It puts the result on the rhythm setup (the player's own setup changes, as a
  Learn practice link does) and opens it, where Start plays it: a setup Start could not play (every time signature or
  note value switched off, or none that fills a bar) first gets 4/4 when it has no time signature, then quarter notes
  when it still needs them. It is hidden while no cell has 12 notes.
- **Meters are not tracked separately.** A round has one meter, so a meter score would be the accuracy of whole rounds,
  not of the notes that are hard. The meters are taught by rhythm units (3/4 in unit 3, 2/4 in unit 5) that the
  Rhythm reading levels already check (§8.6), and every board's skill map draws cells only. A boost in the generator
  is still Later: it has no weights to boost a cell, and a boost must not change what a seed or an exercise code
  gives.

### 8.5 Progress screen

The first plan: accuracy over time, minutes practised, streak calendar, skill map per cell/meter, tendency trend
(rushing/dragging over time). Built in 0.19.0 as the **Progress tab** (`#/progress`, `ui/screens/progress/`; App design
canvas, Mobile · Progress, Tablet · Progress and Desktop · Progress), the 4th of five tabs (§9). Everything it shows is
worked out by `game/progressView.ts` from the progress and today's date; the screens add no logic.

**Head.** A segmented switch, *Show progress for*: **Rhythm · Notes · Scales** (Rhythm first). It changes only the
cards below it, and is not remembered: every visit starts on Rhythm.
- Phone: the title with the streak chip (*12-day streak*), the level line and the switch stay at the top while the
  cards scroll under them. The level line reads *Level 7 · Measure* and *1445 / 1750 XP* (the total, and the XP where
  the next level starts), then the bar, filled for the XP into the level, then *305 XP to level 8 · next rank Groove*.
  On a phone under 700 px tall (the phone browser sizes) the whole page scrolls, head included, so the cards still
  show.
- Tablet and desktop: the title and the switch (340 px, 360 px on desktop) in one row, no streak chip. The level is
  the **Level card**: *Level 7 · Measure*, the bar, *1445 / 1750 XP* and *305 XP to level 8*, and the *Ranks* ladder
  (six rows: reached, *Level 7 · now*, next, later). The bar's label says *95 of 400 XP, 23 percent of the way to
  level 8*. Numbers have no thousands separator, as everywhere in the app.

**Layout.**
- Phone: the **Skill levels** card heads every view. Rhythm: streak calendar, Accuracy · 14 days, Minutes this week,
  the skill map, Timing tendency, Achievements. Notes: Accuracy per clef, Slowest notes, Key. Scales: Major scales,
  Minor scales.
- Tablet (and a phone in landscape): the Level card beside the streak calendar, then Skill levels across the width,
  then the view: Rhythm in pairs (Accuracy | Timing, the skill map across the width with its button in the legend row,
  Minutes | Achievements); Notes as (Accuracy per clef above Key) | Slowest notes; Scales as Major | Minor. The streak
  calendar shows in every view.
- Desktop (and a tablet in landscape): a column on the left with the Level card, Skill levels and the streak calendar
  (which grows to fill), and the view's cards beside it in the same pairs. On a 1280 × 800 laptop the page scrolls
  about 77 px, because Skill levels makes the left column taller than the cards.

**The cards.** Each is a section with an eyebrow heading (`h2`); the charts are SVG drawn at the card's width, each a
`role="img"` with a sentence built from the data, and a title per point.
- **Skill levels:** *25 of 60 levels · 6 skills · 1 review due*, a link to the Skill levels screen (§8.6).
- **Streak calendar:** five weeks, Monday to Sunday, ending this week. Days of the current streak are gold (with dark
  ink on the gold in both themes), earlier practice days a gold tint, missed days plain, today outlined, later days
  empty; a legend, and *Practised 28 of 32 days* over the calendar's days so far.
- **Accuracy · 14 days:** rhythm rounds only (tap and Echo): each day the mean of its rounds' accuracy, a line with a
  gap and a tick for a day without one, the latest value at the end and the average beside the title. The scale is
  60–100%, and drops to 20% or 0% when a day is under 60%.
- **Timing tendency:** each day the mean offset of the hit notes, against the steady band from −40 to +30 ms (the
  tendency's thresholds, §6.3; the range widens past −70 and +50 ms when needed). The caption names the latest day's
  tendency (*Steady · −22 ms*) and how it started (*Was rushing (−52 ms). A little early is normal.*).
- **Minutes this week:** every mode, a bar per day, Monday to Sunday, and the total. A rhythm round counts its played
  length with the count-in (Echo also every time it was heard); Read notes the answer times, each at most 15 s; Scales
  the time on its play screen, at most 90 s a scale. A day with any practice shows at least 1 minute.
- **Skill map · rhythm cells:** the eight cells (§8.4) as tiles, 2 a row on phone and 4 on tablet and desktop, coloured
  by band, locked, or *—* under 12 notes; the legend (*90%+*, *80–89%*, *Under 80% · weak spot*) and **Practice weak
  spots** when a cell has enough notes.
- **Achievements:** the five (§8.3) and *3 earned*; 5 a row, or 3 when the longest name would not fit (a narrow phone,
  a tablet's half column, a narrow desktop).
- **Accuracy per clef:** treble and bass over every Read notes round.
- **Slowest notes:** the three notes with the longest average answer time (from 3 answers), named as the Note names
  setting says, with the sign the last round's key gives them, where they sit (*top space · treble*) and the seconds.
- **Key:** the last Read notes round's key signature on its staff, its name and what it does, and **Read notes**.
- **Major scales:** the 15 major scales round the circle of fifths with their best stars; *9 of 15* with ★★ or more.
- **Minor scales:** the minor keys started, with the best stars of each form (natural, harmonic, melodic), and **Open
  the circle of fifths** (the Scales hub).

**A new player** (no board) sees every card: short muted lines instead of a chart (*No rhythm rounds in the last 14
days.*, *No practice this week yet.*, *No Read notes round yet.*, *No minor scale started yet.*, and for slowest notes
with too few answers *Answer each note a few times to see which ones are slow.*), locked or *—* tiles, every
achievement locked and empty stars.

**What is recorded** (`progress.stats`, synced with the account, BACKEND-PLAN §6.1): per day for the newest 42 days
the seconds, the rhythm rounds and their accuracies, the timing offsets and the cells; Read notes' right and answered
per clef and answer times per note; the last round's key; the bests the skill levels check; Echo rounds per material;
and the last day each skill was practised. A round counts only when it counts as practice (a note hit, a note
answered, a scale played), as for the streak.

### 8.6 Skill levels

Since 0.19.0 (`game/skills.ts`; App design canvas, Mobile · Progress · skill levels and its one-skill board). Six
skills of ten levels each, 60 in all: **Rhythm reading**, **Rhythm by ear**, **Treble clef**, **Bass clef**,
**Scales** and **Theory**, always in that order. The Progress tab's Skill levels card opens the list
(`#/progress/skills`); each skill has its own screen (`#/progress/skills/rhythm`).

**Passing a level.** A level is passed when all its checks are met, and it stays passed, with the day it was passed
(`progress.skills`). A skill's level is the number of levels passed in order from level 1. Levels are checked after
every finished exercise, after a Learn section is marked read, and once when the app starts, so progress from before
0.19.0 counts at once where a level reads only what was kept before: Scales (the scale stars) and Theory (the Learn
sections read). The other levels also read figures recorded from 0.19.0 on (`game/stats.ts`), so they count rounds
played since: Rhythm reading needs each unit's skill-map cell from rhythm rounds as well as its lessons (a player with
every rhythm lesson from before starts at level 0 until those rounds), and Rhythm by ear and the clefs count Echo and
Read notes rounds. A level met only by putting two devices' progress together is passed on the next round (it is not
checked after a sync).

**The ladders and their checks.**

| Level | Rhythm reading and Rhythm by ear | Treble clef | Bass clef | Scales | Theory |
|---|---|---|---|---|---|
| 1 | Quarter and half notes | Lines: E G B D F | Lines: G B D F A | C major | Ch. 1 Pulse and meter |
| 2 | Rests | Spaces: F A C E | Spaces: A C E G | G and F major | Ch. 2 Note values |
| 3 | Three-four, whole notes | The whole staff | The whole staff | D and B♭ major | Ch. 3 Rests |
| 4 | Eighth notes | Middle C up to G | Middle C down to F | A and E♭ major | Ch. 4 Dividing the beat |
| 5 | Two-four, eighth rests | One ledger line | One ledger line | E and A♭ major | Ch. 5 Making notes longer |
| 6 | Ties | Keys with 1♯ or 1♭ | (as treble) | All 15 major scales | Ch. 6 Off the beat |
| 7 | Dotted notes | Up to 3♯ or 3♭ | (as treble) | Natural minor, up to 2♯ or 2♭ | Ch. 7 Beats in three |
| 8 | Sixteenths | Two ledger lines | (as treble) | Harmonic minor | Ch. 8 Notes on the staff |
| 9 | Syncopation (later) | Up to 5♯ or 5♭ | (as treble) | Melodic minor | Ch. 9 Sharps, flats and naturals |
| 10 | Six-eight (later) | Every key, under 1.5 s | (as treble) | Every scale at ★★★ | Keys and scales (ch. 10 and 11) |

- **Rhythm reading:** level *n* is rhythm unit *n* of the Learning path (§8.2). Its checks: *Lessons 14.1–14.4 at ★★ or
  more* (the unit's first four lessons, by their path numbers), the unit's skill-map cell at 85% (§8.4; unit 1 Half,
  2 Rests, 4 Eighths, 5 Rests, 6 Ties, 7 Dotted quarter + eighth, 8 Sixteenths; unit 3 has none), and *Unit review
  14.5 at ★★★*. Button: *Continue unit 14* (the Path); with level 8 passed, *Free practice*.
- **Rhythm by ear:** the same ladder, measured with **Echo** (§3.3) until dictation (§3.2, v1.6) is built. An Echo
  round's material is the highest rhythm unit whose material it has (8 a sixteenth, 7 a dotted note, 6 a tie, 5 an
  eighth rest or 2/4, 4 an eighth, 3 3/4 or a whole note, 2 any rest, else 1). Checks: *3 Echo rounds with eighth notes
  at ★★* and *Echo 4 bars with eighth notes at ★★★* (a round of 4 bars or more), each counting rounds of that material
  or later. Button: *Practice Echo*, which turns Echo on in the rhythm setup and opens it (made playable first, as
  Practice weak spots does).
- **Rhythm reading and Rhythm by ear levels 9 and 10** (Syncopation, Six-eight) have no lessons yet. They are listed,
  and once level 8 is passed the next-level card says *This level comes later, with its lessons.* with no checks
  (no board). When their units are added, the levels take their checks and the units' names (docs/ADDING-CONTENT.md).
  The boards name level 10 *Six-eight*, but rhythm unit 10 in §8.2 is the dotted eighth + sixteenth, and compound
  meters are unit 12 (later).
- **Treble clef and Bass clef** (Read notes): a round counts for a level of a clef when it covers it, with at least 5
  notes of that clef answered. It covers level 1 when it draws every line of the staff, 2 every space, 3 every staff
  position, 4 every note from middle C up to G (treble) or down to F (bass), 5 and 8 every note of the one- or
  two-ledger-line range; 6, 7, 9 and 10 when it covers the whole staff in a key with 1, 2–3, 4–5 or 6–7 sharps or
  flats. Checks: *A round over the whole staff at 90%* (the best accuracy of that clef's notes in such a round) and,
  from level 3, *Average answer under 2.0 s* (level 10: 1.5 s). Middle C is a ledger line, so level 4 needs a round
  with ledger lines. Button: *Read treble notes* / *Read bass notes*, which puts that one clef on the Read notes setup
  (the rest as set up) and opens it.
- **Scales** (the Scales hub's best stars): levels 1–5 one check per scale, *A major at ★★*; level 6 all 15 major
  scales at ★★; levels 7–9 the five minor keys up to 2♯ or 2♭ (A, E, D, B and G minor) in their natural, harmonic or
  melodic form at ★★; level 10 all 60 scales at ★★★. Button: *Practice scales* (the Scales hub).
- **Theory:** the Learn chapters (§9.1), measured with **sections read** until Test yourself (§3.6) exists. One check
  per section, *Read 5.2 Dotted notes*. Button: *Continue chapter 5*, the first chapter from the next level on with a
  section not read (*Open Learn* once all are read). A section added to a chapter becomes a check of its level; a
  level already passed stays passed.

**The clef ladders' order** follows the Learning path: it reads the whole treble staff (path unit 15) before middle C
and ledger lines (unit 19), so level 3 is *The whole staff* and level 4 middle C. The boards have the two the other way
round.

**Review due.** A skill with a level that was last practised 14 or more days ago is due for review; one round of it
clears it, and its level stays. A rhythm round practises Rhythm reading, an Echo round Rhythm by ear, a Read notes
round each clef in it, a Scales round Scales, and a Learn quick check answered right Theory. Its screen then starts
with a gold card, *Review due · Last practised 16 days ago. Your level stays; one round clears this.*, and the skill's
button (Theory's opens its chapter, as there is no Test yourself yet).

**The list** (phone as the board; tablet and desktop, which have no board, in the 640 px column under the top header,
as Settings' sub-pages, with Progress current; on a phone at least 700 px tall the head stays at the top):
- *‹ Progress*, the title and *25 / 60 levels*.
- Two tiles for the last 30 days: *+4 levels up in 30 days* and *1 review due · Theory* (*0 · No review due*, neutral,
  when none is).
- *Your skills · 10 levels each*: a row per skill, a link to its screen, with its icon, a chip (*Review due*, or *+2
  this month* for levels passed in the last 30 days), a 10-segment meter (passed levels slate, the next one gold for
  the share of its checks done) and *Level 6 · next: Dotted notes*. Below 335 px of list width (345 px in Dutch) every
  chip goes under its name.
- **Focus next:** the lowest skill, ties by the order above: *Bass clef is your lowest skill: level 3, 2 levels behind
  treble clef.* It is compared with its pair (Rhythm reading and Rhythm by ear, Treble and Bass clef) when that is
  higher, else with the highest skill; with all level, *Your skills are all at level 3.* Then the skill's button.
- The footnote on passing and Review due.

**One skill:** *‹ Skill levels*, the icon, the name and *Level 6 of 10* with the meter; the Review due card when due;
**Next · level 7**: its name, a bar, the checks (a done circle, the label, and while not done a mini bar with *now
72%*), and the skill's button; **Level · 12 weeks**: a bar per week for the level at its end (this week: today), with
*+1 in 30 days* or *No change in 30 days*; and **All levels**: the ten, passed, next (*1 of 3*) or later (*Later* for
a level that comes later). With all ten passed the next card reads *Level 10 · Every level passed* (no board).

---

## 9. Screens & UX

See the [Muzieklab App Design canvas](https://claude.ai/artifact/BDXaeTSb188RhDqTY3LHgE)
for the screen designs. It has three pages:

- **Light**: every app screen in the light theme.
- **Dark**: the same screens, in the same positions, in the dark theme.
- **Foundations & engine**: the design foundations (tokens, type, motion, scrolling) and the
  exercise engine overview.

On Light and Dark, each feature (Home, Rhythm, Learn, Read notes, Test yourself, Scales) is one
row. The row has three columns: its **mobile** screens (390 × 844), then the **tablet**
(834 × 1194) and **desktop** (1280 wide, fluid) versions of its main screens.

**MVP canvas.** The [Muzieklab MVP canvas](https://claude.ai/artifact/JG3FiE3WgPsph3dcSGrjrS) holds the smallest
product that proves the core promise: endless rhythm exercises built from real theory, with fair timing feedback. It is
one loop, *pick → play → feedback → next*:
- Home (Continue + Free practice + streak)
- Practice setup (tap mode, with validation)
- Play (first-time How to play, Pause)
- Results (timing lane, tip, Listen, Retry / Next)
- Learning Path (stars and locks)
- Lean Settings and Calibration
- Desktop Home and Play
- Light theme only

**v1.1 · Quick wins** (a page on the MVP canvas) holds the first features after the MVP. Each one reuses the MVP's
engine and screens:
- **Daily challenge:** a date-seeded preset; one Home card and a results badge.
- **XP and levels:** one formula on the existing score, plus a level-up sheet.
- **Exercise codes:** settings + seed, already encoded by the engine, shown with Copy.
- **Echo mode:** Play with the notation hidden until it has been tapped back.
- **Dark theme:** generated from the light screens by colour role.

Built in v0.2 (dark theme was already in the MVP):
- **Daily challenge** (`game/daily.ts`): the date picks one of eight mid-path presets, a tempo (72–104) and 4 or 8 bars,
  then the seed. The day's first finish earns 20 bonus XP; Results shows *Streak kept* and *New personal best* (best
  daily accuracy so far). Next after a daily is free practice with the same settings. Since 0.10.0 the daily follows
  the player's place on the rhythm path (§3.4).
- **XP and levels** (`game/xp.ts`): XP = bars × (4 + difficulty) × accuracy, + 5 / 10 / 20 for 3 / 4 stars / the
  diamond; nothing when no note was hit. Level *n* takes 100 + 50 (*n* − 1) XP. Ranks start at levels 1, 3, 5, 8, 12
  and 16: Tick, Count, Measure, Groove, Metronome, Maestro.
- **Exercise codes** (`core/code.ts`): `T44-HQE-RQ-4B-120-7K2QF` = mode and meters, notes, rests, bars, tempo, optional
  `X` flags for settings off their default, and the seed in Crockford base 32. Shown on Results with Copy; entering a
  code is still later. Since 0.10.0 Results no longer shows the code itself, only a quiet *Copy code* (§6.4).
- **Echo mode:** a Tap · Echo switch on Practice setup. Play first shows a listen card (two plays), then the normal
  Play session with the notation and length lane hidden (Hear again goes back to listening). Results is the reveal.

**v1.2 · Learn** (the next page on the MVP canvas) adds the theory pages for rhythm only: chapters 1–7. Two things
change in the app:
- The tab bar becomes Home · Path · Learn · Settings.
- Every section ends with a practice link.

Results tips stay plain text: they do not link to a Learn section (dropped from the plan). The one action a tip can
carry is Calibrate, when the device may be the cause (since 0.10.0, §6.4).

Chapters 8–11 and flash cards arrive later, with note reading.

**v1.3 · Read notes** adds naming notes in treble and bass clef, in any of the 15 keys. You answer with names or on
the piano, and a round summary follows. Home's free practice splits into Rhythm and Read notes, and Learn gains
chapter 8 · Notes on the staff (since 0.3.4 chapters 8–10, see §9.1).

Built in v0.3 (ahead of v1.2, whose rhythm chapters 1–7 come next; the Learn tab holds chapter 8 until then):
- **Pitch engine** (`core/pitch.ts`): staff positions as letter steps (C4 = 28), the 15 key signatures with their major
  and relative minor, written names and pitch classes.
- **Rounds** (`core/noteRound.ts`): the seeded generator (allowed positions per range, no immediate repeats, at most two
  moves the same way, clef runs of 4–6 notes, a new key every 5 notes when mixed, extra signs on a quarter of the notes,
  weak spots and *Practice missed notes* boosted), judging (names need the written spelling; the piano accepts the
  sounding key), the score (right without a hint / answered; hints count as not right), weak spots (misses +2, hints and
  answers over 3 s +1, quick right answers −1; 0–5 per note) and XP: notes × (2 + difficulty / 4) × accuracy, + 5 for 3
  stars. Mixed input alternates names and piano every 5 notes.
- **Screens:** Home's free practice is two tiles (Rhythm, Read notes); Read notes setup, Key, Name it (names with the
  sign row, or the piano; computer keys on desktop; a right answer moves on by itself after 0.7 s, a wrong one waits
  for Next note), Round done (time per note, needs practice, by sign, New round / Practice missed notes), and Learn
  (the tab bar becomes Home · Path · Learn · Settings) with chapter 8, its quick check and read status per section.

**v1.4 · Scales** builds on that, reusing the key signatures and the piano. It adds major and minor scales (natural,
harmonic, melodic) in all 15 keys: the circle of fifths hub, playing on the piano, spelling with ♭ ♮ ♯, and a round
summary. Free practice becomes Rhythm · Read notes · Scales, and Learn gains chapter 11 · Scales.

Built in v0.7.0: the Scales hub (`/scales`, a Home page with the circle of fifths), the setup (`/scales/setup`, with the
Read notes Key screen for *Choose…*), play and spell (`/scales/play`; the wide exercise layout and computer keys on
desktop), round done (`/scales/done`), the third Home tile and Learn chapter 11. The engine is `core/scale.ts` and
`core/scaleRound.ts`; progress keeps the best stars per scale.

**v1.5 · Progress** adds the Progress tab (the tab bar becomes Home · Path · Learn · Progress · Settings) with
Rhythm / Notes / Scales views. Weak spots are a practice-setup preset launched from the skill map, and achievements
appear on Progress and on the level-up sheet.

Built in 0.19.0 (MVP canvas, Progress & rewards page; App design canvas, the Progress boards, the skill levels boards
and Mobile · Results · level up):
- **The Progress tab** (§8.5) with its three views on phone, tablet and desktop, from the App design canvas, which the
  MVP canvas's own notes say to follow. Its figures are recorded per day from 0.19.0 on (`game/stats.ts`), so the
  charts start empty; the streak calendar, the scale stars, the 7-day streak and the Scales and Theory levels use what
  was kept before. Rhythm reading also needs each unit's skill-map cell, and Rhythm by ear and the clefs count rounds,
  all from 0.19.0 on (§8.6).
- **The skill map and Practice weak spots** (§8.4): cells only, a weak spot under 80%, the preset on the rhythm setup.
- **Skill levels** (§8.6): the list and one skill per skill, and a Skill levels card on Progress.
- **Achievements and personal bests** (§8.3): five achievements on Progress, on the level-up sheet and as a badge on
  the summary screens; a personal-best row on the level-up sheet, with See progress and Continue under it.
- **The shell** gains Progress (§9, Breakpoints).
- Where the code differs from the boards, and why:
  - Tablet: the App design canvas's grid, not the MVP canvas's phone layout in a 640 px column (the newer canvas).
  - Shell: the built tablet header (icon and word, on the right; Breakpoints, below), not the App design canvas tablet
    board's words after the brand.
  - The Skill levels card on tablet and desktop too, though only the phone board has it (large screens show the same
    content); the skill screens on tablet and desktop use the 640 px column (no board).
  - The level numbers come from the app's XP curve (the boards' *1 445 / 1 500 XP* does not fit it), the bar fills for
    the XP into the level, and numbers have no thousands separator. The Progress tab shows the boards' two XP labels;
    Home and the level-up sheet keep their one label (§8.3).
  - *Locked until unit 16*: the path's number for rhythm unit 8, not the boards' *unit 8*.
  - Dark ink on the gold streak days and every button arrow in the text colour (the dark boards put light text on
    gold).
  - *Practice* as the verb, as everywhere in the app (the skill boards write *Practise*).
  - Rhythm by ear is measured with Echo and Theory with Learn sections, as the boards' dictation and Test yourself are
    not built; Theory's levels follow the app's chapters; the clef ladders' levels 3 and 4 are swapped to follow the
    Learning path (§8.6). The checks' wording follows from that.
  - A skill's row links to its own screen (the board opens it in place).
  - The level-up sheet's Continue closes it (the boards go on to Home or Play), its list shows only with a row, and on
    desktop it stays a dialog.
  - Charts widen their scale for values outside the boards' ranges.
  - States no board draws: the empty cards, a level that comes later, every level passed, the summary screens'
    achievement badge, the narrow tablet header.

**v1.6 · Flash cards and listen & write** adds *Test yourself* over all eleven Learn chapters (flip or choose from 3),
started from the Learn tab. It also adds dictation as a third practice mode (Tap · Listen · Echo) and a fourth Home tile.

Everything else on the full canvas comes after the MVP, including read notes, scales, flash cards, dictation, Learn,
Progress, XP and levels.

**Design scope: MVP vs later.** MVP is what v1 (milestones M1–M6) needs so that every loop
closes and every tab leads somewhere. All MVP screens are designed on the canvas.

| MVP (designed) | Later (nice to have, not designed yet) |
|---|---|
| Progress (rhythm / notes / scales; streak calendar, accuracy, skill map with *Practice weak spots*, tendency, achievements strip; built in 0.19.0 with the skill levels, §8.5–8.6) | A dedicated Weak Spots mode screen (for now it is a practice-setup preset) |
| Settings (sound, timing leniency, tap & hold, counting syllables, notation style, theme) and Calibration (tap along with 16 clicks) | Echo mode play screen (reuses Play without notation) |
| Pause menu (sheet on phone and tablet, dialog on desktop) | Daily challenge intro and result variant (uses the normal Play and Results) |
| Results with Listen, Settings and the exercise code (copy) | A full achievements list and personal-best history |
| Level-up / achievement / personal-best moment after a result (built in 0.19.0, §8.3) | Onboarding and day-one empty states (the Progress tab's empty cards are built without a board, §8.5) |
| Round summaries for Read notes, Scales and Flash cards | Entering an exercise code to play a shared exercise |
| Working dictation (Listen & write) with check and feedback | Tablet and desktop versions of the screens still to build (listen, flip cards); the built ones have theirs since 0.13.0 |
| Setup validation (unplayable time signatures, disabled Start) and the first-time How to play | |
| The unit boss on the Learning Path | |

**Breakpoints.** Phone < 700 px; tablet 700–1099 px; desktop ≥ 1100 px.
- A phone in landscape (height ≤ 560 px) lays the exercise screens (Play, Echo, Read notes, Scales, Calibration) out in
  two columns, so the pad or the answer buttons stay in view next to the notation (Scales: the staff and the degree row
  on the left, the piano or the sign buttons on the right). Its Read notes staff is the phone's (1.45, or 2.1 with 4
  bars in a round that writes), in the narrow column, not the tablet's. Play's analog beat counter is 44 px tall
  there, as the digits' row beside the lesson line, so the timing lane's two rows stay in the staff card. With a
  triplet, the room for its 3 above the staff comes out of the card's padding there (10 px at the top, not 14 px), for
  the same reason.
- The rhythm staff on Play and Results is drawn at its screen's size, or smaller, down to 0.75, when a busy bar's
  notes need more room than its share of the row leaves them (sixteenths on a phone, a busy 4/4 bar on tablet Play or
  desktop Results). VexFlow never sets notes in less room than they need, so they would run over the bar line and off
  the staff's end, where the drawing cuts them off. Play draws every window of the exercise at the size the busiest
  one needs, after the time signature each window starts with, so the staff keeps one height as the window moves
  (`fitWindows` in `render/staffDraw.ts`). Learn's examples are drawn smaller the same way (§9.1, Narrow phones).
  At 0.75 the busiest bars can still run over the bar line, and on a phone past the staff's end, where their last
  notes are cut off: sixteenths at Setup's Busy density on a phone, on tablet Play and on desktop Results, and lesson
  8.5 on a 320 px phone (about 1 exercise in 20). A lower floor for the rhythm staff (about 0.65) or a bar per row on a
  phone is waiting on a design decision.
- A pitch staff (Read notes, Scales, Learn, Home's Continue card) is drawn at its screen's size, or smaller when its
  notes need more room than its width leaves at that size: a key signature with many signs, sharps and flats before
  the notes, a 320 px phone. A bar first gives up the room VexFlow leaves before its note (on a phone, keys with up to
  three sharps or flats keep the full size), and a staff without bar lines keeps its size as long as its notes, the
  cursor and the labels fit on it with the notes apart (on a phone, C, G and D major with their signs; Learn's scales
  at 375 px and wider). Every whole note keeps its own bar, and the notes, the cursor and the labels stay inside the
  staff; with bar lines, the cursor stays in the bar of the note it marks. So do the clef, the key signature and the
  signs: above and below its lines the staff keeps the room its screen gives it for ledger lines, or more where
  something reaches further, as the drawing cuts off what is past its edge (the treble clef's tail 1.67 spaces under
  the bottom line, a flat on B5 3.3 spaces over the top line; `staffRoom`). A key staff keeps the room every key's
  signature needs, so all keys have one height. It keeps one size while its notes come in or stay hidden: on every
  page of a Read notes key and clef, and through a scale's page (`fitNotes` in `render/pitchDraw.ts`).
- A screen's title is never narrower than its longest word, so it does not draw over what is beside it. A text link
  beside it (the Scales hub's *Learn scales* on a phone, Key's *What is a key?*) takes two lines, right aligned, when
  the two do not fit on one, and under 375 px wide such a title is 18 px (20 px on the board): in Dutch both fit on one
  line at 360 px, and at 320 px the link takes two (*Toonladders* beside *Over toonladders*).
- The Key screen (Read notes and Scales) under 360 px wide draws each key's signature 66 px wide (72 px on the board),
  fitted to that width, so the longest Dutch names (*C♭ majeur*, 13 px) end inside their buttons.
- Setup's tempo value (*112 BPM · Moderato*) is never broken in two. Under about 345 px wide it does not fit beside
  *Tempo*, so it takes a line of its own under it, right aligned. The *Bars* and *Tempo* labels stay level at the top,
  with the stepper and the slider level below them.
- **Phone browsers** (since 0.10.0). In Safari or Chrome the toolbars take about 180 px of a phone's screen, so the
  sizes to check include the visible area: 390 × 664 (an iPhone 14 in Safari) and 375 × 553 (an iPhone SE in Safari),
  `phone-browser` and `phone-se-browser` in `e2e/helpers.ts`, next to the whole-screen sizes. The exercise screens
  (Play, Echo, Read notes, Scales, Calibration) must fit them without scrolling during play, with the pad, the piano
  and the answer buttons in view and at least 44 px tall. A phone in portrait has two short-screen steps (CSS
  `max-height: 699.98px` and `599.98px`; `SHORT_PHONE` and `SHORTER_PHONE` in `ui/hooks.ts`). 390 × 844, tablets and
  phone landscape do not change. The analog beat counter, Read notes' ranges with ledger lines and Scales' Up & down,
  which take more height, have steps of their own. Up & down has one in phone landscape too: its degree rows are
  32 px high and 4 px apart, the gaps 6 px and the staff card 6 px above and below, so the feedback stays in view in
  the left column. Play's timing lane takes at most two rows on a phone (§3.1), so the 16 bars Setup allows fit as 8
  do.
  - Under 700 px tall (390 × 664, 375 × 667): the gaps tighten to 10 px, and so do the page padding (10 px at the top,
    12 px at the bottom) and the staff card's. Then the pad and the pianos give up height, down to 112 px for the pad
    (214 px on the board), 120 px for the Read notes piano (200 px) and 140 px for the Scales piano (210 px). The pad
    is a size container: its ring follows the pad's height, and a pad lower than 104 px shows only *Tap* in the ring,
    without the note. Calibration's Save and Try again sit side by side and stay in view at the bottom, as on Results.
    The analog beat counter is 52 px tall, on a phone up to 800 px tall too (84 px on the board, which taller phones
    keep). Read notes draws a staff more than 8 staff spaces high smaller, at 8 spaces (*On the staff* is about 7.3):
    a range with ledger lines (about 1.03 for +2 ledger lines, 1.26 for +1), and signs or the cursor that reach far
    over or under the staff. From 360 px wide its key labels sit beside *Any octave counts*. The scale's name is 18 px
    (22 px on the board), so a long one (*A♯ harmonisch mineur*) stays on one line at 375 px, and Up & down's two
    degree rows are 40 px high, 4 px apart.
  - Under 600 px tall (375 × 553, 320 × 568): the gaps are 8 px, and the staves are drawn smaller: the rhythm staff at
    0.8, the Read notes staff at 1.15 (not 1.45; about 0.82 and 1.0 with ledger lines) and the Scales staff at 1.1 (not
    1.25; 1 with Up & down, its staff card 4 px above and below), or smaller still to fit their notes. With a time per
    note, Read notes' staff card has 6 px above and below and its timer bar sits 4 px under the staff, so a why of three
    lines with two ledger lines leaves Hint and Next note in view at 375 × 553. The floors are lower (pad 72 px, Read
    notes piano 64 px with its black keys kept at 44 px and the white keys' labels below them, Scales piano 110 px), and
    so are the name buttons (56 px), the feedback, the degrees (32 px with Up & down, where the gaps are 6 px), the sign
    buttons (64 px, 56 px with Up & down), the analog beat counter (44 px, as the digits' row), Echo's listen card and
    Calibration's intro. At 320 px wide Read notes leaves out *Any octave counts* above the key labels (screen readers
    still read it), so the why of a wrong key in a lesson in a key fits on its three lines. Up & down's done line leaves
    out the scale's 15 notes, which its degree rows show right above it (screen readers still read them): it takes two
    lines at most, in Dutch at 320 px too. Like a why of two lines, it leaves Hint and Next scale in view beside the
    tallest staff, a B♭ scale's (its high B♭ with its flat), also in B♭ harmonic minor, whose eyebrow takes two lines at
    375 px beside *2 mistakes*.
- **Short desktop windows.** Desktop Play and Echo do not scroll either (Scrolling, below). Under 800 px tall (a
  1280 × 720 laptop, `laptop-720`) the page's padding (20 px at the top, 16 px at the bottom), its gap (16 px) and the
  staff card's padding (20 × 40 px, 16 px at the bottom) tighten, and the stat cards are lower (12 px × 18 px), so two
  staff rows, a timing lane of four rows (16 bars) and the analog pendulum fit. Under 822 px only the room under the
  pad row is smaller (12 px, not 36 px), which shows only when 16 bars with the pendulum and the room for a triplet's 3
  fill a 1280 × 800 window or a 1180 × 820 tablet on its side.
  Read notes and Scales keep their spacing; on a laptop their page scrolls.
- A touch-only screen at desktop width (a tablet in landscape) gets the desktop layout, without the keyboard hints
  (Esc, ?, the letter on each key).
- On tablet and desktop, the mobile bottom tab bar becomes a top header with the same items as the
  tab bar of that release (Home · Path · Settings in the MVP, + Learn from v1.2, + Progress from
  v1.5). The active item has the soft slate pill and `aria-current="page"`. Tablet keeps the icon
  with each word and puts the items on the right; desktop puts them right after the brand, as words
  only. There is no sidebar. A screen opened from a tab (the Scales hub from Home's practice tile, a
  Learn chapter) marks that tab as current; on phone it keeps the tab bar and adds a back arrow.
  Since 0.19.0 there are five items, **Home · Path · Learn · Progress · Settings**: Progress is the 4th, with a
  three-bar icon (MVP canvas, Home & shell page, the *Home · 5-item tab bar* boards), *Voortgang* in Dutch. The phone's
  tab bar has five equal columns (the pill still fits at 320 px, in Dutch too). On a narrow tablet (700–820 px) the
  header tightens (14 × 20 px padding, at least 16 px between brand and items, 2 px between items, 10 px inside each
  item and 6 px from icon to word) so five items with their icons fit beside the brand, in Dutch too. The Skill levels
  screens keep Progress current.
- Desktop Home has two columns (App design canvas, Desktop · Home): streak and level (with one label under the XP
  bar, *100 XP to level 2*; no *0 / 100 XP* since 0.10.0), the daily challenge and the learning path (unit N of M, a
  bar of all units, the lesson tiles, and the next lesson by its id: *Next: lesson 1.4 · A little faster · 80 BPM*)
  on the left; Continue (the lesson title over its staff) and the Free practice tiles on the right.
- A Learn chapter on desktop has the top header, a chapter list on the left and the chapter's
  sections as cards on the right (App design canvas, Desktop · chapter 5 page).
- What's new (Settings → About) on tablet uses the full width under the header: the latest release on a two-column
  accent card (title and Try on the left, each change with its kind chip on the right), then the timeline of earlier
  releases. On desktop the releases are a list on the left and the chosen one is a card on the right, with Newer and
  Older under it; the list scrolls on its own on a short screen. The desktop boards have no All · New · Fixes filter
  (MVP canvas, Settings page; App design canvas, ChangelogTablet and ChangelogDesktop).
- Settings on tablet and desktop (since 0.13.0; App design canvas, SettingsTablet and SettingsDesktop): the title and
  a list of the sections (Account when it shows, §9.2, then Language, Sound, Timing, Playing, Display, About) on the
  left, and the cards in two columns (Account, Language, Sound, Timing; Playing, Display, About), each with its title
  inside the card. A section picked in the list
  comes into view and gets the focus; the highlight slides like any pick-one group. Until one is picked the first is
  current, Account once it shows (since 0.13.1). On tablet the columns are narrow, so
  a row's control goes under its label and a volume's slider under its name. The MVP canvas's Settings boards still
  show the phone column on tablet and desktop.
- Every screen has a tablet and a desktop layout (since 0.13.0); before, the setups, Key, Results, the round summaries,
  Calibration and the play screens on tablet were the phone layout in a 640 px column. The setups (Rhythm, Read notes,
  Scales), Key, Results and the round summaries use the **wide exercise layout** from 700 px: the screen head across
  the top, the main content on the left, and a side panel on the right (300 px on tablet, 360 px on desktop, up to
  1160 px in all) that holds the summary and the screen's main button and stays in view while the main content
  scrolls. Setups: the options on the left; the preview (Rhythm) or the summary, and Start, on the right. Key: the keys
  on the left; the one key's signature drawn large, what it means, and Use on the right. Results: the judged staff (4
  bars a row on desktop, 2 on tablet), the timing lane and the tip on the left; the stars, the score line, the badges,
  the counts and every button on the right. Round done (Read notes, Scales): the cards (time per note, needs practice,
  by sign; the scales played and the circle of fifths) on the left; the score, its line and the buttons on the right.
  A Read notes round with nothing answered has no cards, so it keeps the one column. A phone keeps the one column, in
  the same order. On a phone in landscape the side panel scrolls with the page until its end is in view (Results'
  is taller than the screen), and the buttons stay at the bottom as on a phone. Calibration on tablet uses the whole width with the pad filling the height under the plot (as Play
  on the App design canvas's PlayTablet); on desktop the intro and the plot are on the left and the pad or the result
  on the right, as on a phone in landscape.
- Exercise screens swap that header for the exercise header: title, progress, and
  Pause / Quit. It has its own spacing (20 px × 40 px) and is not the tab header. On tablet (since 0.13.0) it is
  18 px × 32 px with the progress bar under the row, as on the App design canvas's PlayTablet and NoteTablet boards.
- The play screens on tablet (since 0.13.0; before, the phone layout in a 640 px column). A tablet-wide screen that is
  also a phone on its side (landscape, ≤ 560 px tall) keeps the phone layout and its two columns (`useExerciseLayout`
  in `ui/hooks.ts`).
  - Play (App design canvas, PlayTablet): the exercise header with help, Pause and Quit; the staff and lane across the
    width (four bars a row); the Count and Combo cards (the pendulum in the Count card with the analog look); the
    judgement; a big pad that fills the rest of the height (its ring grows with it, up to 230 px); Skip to results.
    Echo's tap-back phase is the same.
  - Echo's listen phase, on tablet like Play with the listen card where the staff goes, the Count and Combo cards, *Listen
    first* and the pad off; on desktop Play's desktop layout with the listen card in the staff card and a key cap that is
    off. Its header has help and Quit, no Pause.
  - Read notes (App design canvas, NoteTablet): the exercise header; the eyebrow, the question and the correct count; a
    big staff card (six bars, not the board's eight: eight leave no room for a sign before the last note); the feedback;
    the answer card with the input switch, the sign row, 200 px name keys or the piano, and Hint / Next note; Skip to
    summary.
  - Scales (no board; as Read notes): the exercise header; the scale's name and mistakes; the staff card with the degree
    rows and Hear it so far / Start over; the feedback; the answer card with the piano, or the signs with Hint / Next
    scale; Skip to summary.
  - A shorter tablet window tightens the gaps (Play under 900 px tall, Read notes and Scales under 1100 px); under
    960 px Read notes' and Scales' keys keep their height and the page scrolls, as the desktop layout does on a laptop.
- Large screens show the same content and data as mobile, laid out side by side. They add no
  extra features.

**Dark theme.** Every colour maps by role, as in the token table below. There are three rules
on top of the table:
- Text on a filled accent (white on slate, white on ink) becomes dark ink, because those fills
  turn light.
- Pianos keep piano colours in both themes: light keys, near-black black keys.
- A raised control (the segmented thumb) is lighter than its track.

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
| Perfect / great text (`--good-ink`) | `#176c47` | `#7ad9a8` |
| Good (early/late) | `#b7791f` | `#f0b429` |
| Miss | `#d64545` | `#ff6b6b` |
| Field border (`--field-line`, since 0.12.0) | `#7a8687` | `#738080` |
| Gold text (`--reward-text`, since 0.19.0) | `#7a540c` | `#f0c35a` |
| Ink on gold (`--on-reward`, since 0.19.0) | `#161b1c` | `#101415` |

`--reward-text` is the boards' gold text on the gold tint or on paper (Progress: a practised day, *Earned*, the stars
on a scale tile, the level-up rows' eyebrows). `--on-reward` is the text on a gold fill (a streak day on the
calendar); it stays dark in dark mode, because the gold stays bright there (the dark boards' light text on gold is
about 1.5:1).

A text field's border (§9.2) is `--field-line`, not Line. Line is 1.2–1.4:1 against paper and ground, under the 3:1
that WCAG 1.4.11 asks of a field's edge. `--field-line` is 3.76:1 on paper and 3.31:1 on ground in light, and 4.08:1
and 4.53:1 in dark (`src/styles/fieldContrast.test.ts` checks it). The Foundations boards do not have it yet.

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

**Scrolling.** Screens are laid out to fit and never scroll during play. Lists that can grow scroll (chapter list, key
list, results history); they use the app scrollbar: a 4 px fully rounded thumb in a 10 px gutter on a clear track, no
arrows, `#b9c3c2` (hover `#8a9596`), dark `#3d4849` (hover `#5d6a6b`). A page taller than the window (a Learn chapter,
Setup or Results on a 1280 × 800 laptop) shows the same app scrollbar when there is a mouse or trackpad, so it is clear
there is more below (since 0.9.0; before, no page showed one). Touch screens keep their own indicator: long Learn pages
scroll the whole page on phones with the system scrollbar hidden. At every size the scrollbar is at the window's right
edge, never at the side of the content (since 0.13.2; before, a page in a centred column, such as the setups and
Results (1160 px) or Account (640 px), had it at the column's edge): the page spans the window and pads its content into
the column, and the Learning path's units, which scroll in a box of their own, reach the window's edge the same way.
Only a side menu (a Learn chapter's sections, What's new's releases on desktop) scrolls where it stands.

**Notation colour rule:** notes are always drawn in the *Ink* token of the current theme
(black on paper, light on dark), never a hard-coded black. VexFlow output must have every
glyph's fill set from the theme, including paths that VexFlow leaves without a fill
attribute (they default to black and disappear on a dark background).

After play the notes are coloured by judgment: Perfect and Great green, Good (early or late) amber, Miss red. A missed note also
gets a small × in the miss token under its note head (since 0.10.0), so a miss is shape as well as colour. It is the
timing lane's miss mark: 8 px across, a 2 px round stroke (`missMarkPath` in `render/staffDraw.ts`). It sits about
17 px below the head, because rhythm-staff stems go up and the beams, tuplet numbers and the play cursor are above. A
tied note gets one ×, on the note it starts on. Early and late stay colour only (the lane shows their direction).
This holds on Results and on the live staff in Play. The Read notes staff is unchanged.

| Screen | Key elements |
|---|---|
| **Home** | Level and streak chips; big *Continue* card; *Daily challenge*; *Free practice*; *Listen (dictation)*; *Progress* (below). |
| **Practice setup** | Mode switch; chips for meters; icon toggles for note values and rests; extras; bars stepper; tempo slider; live preview + difficulty meter; *Start*. |
| **Play (Tap)** | Top bar: bar x/y (*Count-in* until the music's first beat), tempo, combo, pause. Notation (wraps 2 bars/line on phone, 4 on desktop, auto-scrolls). Beat dots. Big tap pad (mobile) / "press any key" hint (desktop). |
| **Dictation** | Play/replay button with plays left; staff showing what you've entered; bar fill meter; note palette; *Check*. |
| **Results** | Stars, accuracy, timing strip, tips (with Calibrate when it may be the device), Retry / Next, or Try again under 2 stars (§6.4). |
| **Path** | One Learning path (since 0.11.0; before, three paths behind a switcher): note units and rhythm units taking turns, as a vertical path whose units open to show their lessons by name, with stars and locks (§8.2). |
| **Progress** | Since 0.19.0 (§8.5): a Rhythm · Notes · Scales switch; the level, the streak calendar, accuracy and timing over 14 days, minutes this week, the skill map with *Practice weak spots*, achievements; accuracy per clef, the slowest notes and the last key; the scale stars; Skill levels (§8.6). |
| **Learn** | Topic list with read status and search; topic pages (mobile) and a full theory reference (desktop). |
| **Settings** | Account first, once the API answers (since 0.12.0; §9.2), language (English and Nederlands since 0.4; follows the device's language until one is picked; a segmented control for up to three languages, a drop-down list beyond that), sounds & volumes (one *Metronome* row, for its volume and on/off), calibration, timing leniency (in words, no milliseconds), input (tap & hold or tap only), notation style (common/strict), theme, beat counter style (digital: beat numbers light up; analog: a pyramid metronome whose pendulum reaches a side on every beat, stepping instead of swinging with reduced motion). |

**Home** (since 0.10.0). On phone and tablet the order is the brand or title, then the level and streak chips (they
wrap under the brand on narrow phones, and in Dutch on a new profile), Continue, the daily challenge and Free practice.
There is no XP block: XP, level and rank are in the level sheet that the chip opens (§8.3). The Continue card has the
lesson title over its staff and no meter, bars or BPM line (nor on desktop); a note lesson shows its notes instead
of a rhythm (§8.2). When no lesson of the path has been played, it reads *Unit 1 · Lesson 1 of 5* with **Start lesson**; after that *Continue · Unit N · Lesson M of 5* with **Continue
lesson**. Continue is the only filled button on Home: the daily's Play is outlined (§3.4). On tablet the Continue card
and its staff keep their own height (about 110 px for one line of notes) and do not stretch to fill the screen; on a
phone the card still fills the screen. The lesson tiles show their stars as on the Path (§6.3).

**Settings** (since 0.10.0). Sound has one *Metronome* row (volume and on/off). The Display row for the digital or
analog look is *Beat counter* (nl *Telteller*), with the group label *Beat counter style*. The leniency hints describe
each level in words, with no milliseconds: Strict *Tight timing, for confident players.*, Normal *Fair timing for most
players.*, Relaxed *Wide timing, for young beginners.* Calibration is in §6.1. Picking another language redraws the
screen in that language, and the focus stays on the language control.

### 9.1 Learn: theory in chapters

The theory is split into eleven chapters in teaching order: seven on rhythm, three on reading notes and one on scales.
Each chapter only relies on earlier chapters, and each setting the player can practise is explained in a section
(the full map is in [`LEARN-CHAPTERS.md`](LEARN-CHAPTERS.md) §5). Every section has a short explanation, rendered
notation (with the counting under the notes in the rhythm chapters; held or silent counts in grey brackets), key facts,
an *In the game* tip where one helps, a quick check of one question on what the section explained, and a *Practice*
link (below). A section is marked read when its quick check is
answered right (since 0.6.0; before, scrolling past it was enough). A wrong answer says what to look at again, without
giving the answer away, and the player tries again. Chapter headers show which Learning Path units use them. The contents follow the research in
`LEARN-CHAPTERS.md`, which compares them with Flemish and Dutch courses (*Allemaal nootjes*, AMV, HaFaBra) and with
ABRSM, Trinity, RCM and Kodály.

**Narrow phones.** A rhythm example keeps two bars a row on every phone. When its counts would touch (two busy bars on
a 320 px phone, or Dutch *en*, wider than *&*, at 375 and 390 px) or its notes would run into the bar line (the note
tree's sixteenths at 320 px), the staff is drawn smaller, down to 0.75, as Play's staff is on a short screen. A held
count shares the room between its neighbours by how wide their words are. Where everything fits, nothing changes.

**Practice links** start practice for the section straight away (since 0.10.0; before, they opened the setup, with
13 controls between the section and the exercise):
- Rhythm links start an exercise with the section's preset in Tap mode (Echo would hide the notation the section
  teaches). Tempo, bars and the metronome stay the player's, and hold follows the free-practice rule (§3.1).
- Read notes links start the round.
- Play, Results and Round done carry the section (`?from=8.3`). Quit and their back arrow (*Back to chapter 8*) return
  to it, and Retry, Next, New round and Practice missed notes keep it, as does a visit to Calibrate from the tip
  (§6.1). The browser's Back from the screen the link opened returns to the section too: the link first sets the
  chapter's own place in the history to it (`#/learn/8?s=8.3`).
- Results' *Practice settings* and Round done's *Change setup* open the setup with the preset. Its back arrow still
  returns to the section, also after a visit to the Key screen (since 0.9.0).
- Scales links still open the Scales setup, and the chapter's big Practice button still opens the setup.

**Hearing the examples** (since 0.10.0). Examples that show music can be heard. A small round slate play button sits
with the example: a 36 px accent circle in a 44 px touch target, with an on-fill icon and the label *Play* / *Stop*.
While it plays, the icon becomes a stop square and the circle gets an accent-halo ring.
- Rhythm examples: a one-bar count-in, then the rhythm on the woodblock with every beat clicking, at 80 BPM or the
  block's `tempo`. Ties are merged and rests are silent.
- The note tree (2.2): each row plays its bar the same way; the Rests row plays only the clicks.
- The 1.1 pulse: each tempo row has its own button, which clicks four seconds of beats; the dot of the beat just heard
  grows.
- The chapter 11 scales (`play: true`) play up as piano tones.
- Piano diagrams: every key sounds when tapped (C4–B4). A diagram with marked keys gets a play button that plays them
  in order, each above the one before, so E–F and B–C are heard as half steps.
- Silent: tables, text, the beat grids (4.2, 5.3, 7.1) and the pitch staves of chapters 8–10.
- One example sounds at a time: starting one stops the other, and opening another chapter or leaving Learn stops it.
- Sound starts from the tap and follows the Sound volumes: clicks use the Metronome volume, the woodblock and the piano
  tones use Playback. The beat clicks under a rhythm follow the Metronome switch, as Results' Listen does; the
  count-in and the pulse clicks always sound.
- Layout: on tablet and desktop the button stands in front of the notation. On phones (< 700 px) it starts the
  example's first line (its title or *Write* / *Avoid* label), or has a line of its own, so the notation keeps the full
  width. Under 390 px the pulse's BPM label sits above its time line.

`docs/ADDING-CONTENT.md` (*Sound*) says which blocks get a button and what each plays.

The table counts rhythm units in their own order (§8.2's first table, including the ones not built yet). In the
Learning path rhythm unit *n* is path unit *2n* (since 0.11.0), and a chapter's header shows those path numbers
(*Path units 2, 6, 10*).

| Chapter | Sections | Practice |
|---|---|---|
| **1 · Pulse and meter** | 1.1 The beat and tempo (BPM, tempo words, ♩ = 80) · 1.2 Bars and time signatures (barlines, final barline, 2/4 3/4 4/4, C = common time) · 1.3 Strong and weak beats · 1.4 The upbeat (no practice yet) | Rhythm units 1, 3, 5 |
| **2 · Note values** | 2.1 Reading the shape (from the quarter: half, whole, then eighth and sixteenth) · 2.2 The note tree | Rhythm units 1, 3, 4, 8 |
| **3 · Rests** | 3.1 The five rests · 3.2 Writing rests correctly (centred whole-bar rest in any meter, half-rest placement, dotted rests, no ties) | Rhythm units 2, 3, 5 |
| **4 · Dividing the beat** | 4.1 Eighths: 1 & 2 & (and the eighth rest) · 4.2 Sixteenths: 1 e & a (and eighth + two sixteenths) · 4.3 Beams show the beat | Rhythm units 4, 5, 8 |
| **5 · Making notes longer** | 5.1 Ties (not slurs) · 5.2 Dotted notes (a dot as a shortcut for a tie) · 5.3 Dotted eighth + sixteenth | Rhythm units 6, 7, 10 |
| **6 · Off the beat** | 6.1 Syncopation (eighth–quarter–eighth, quarter–half–quarter) | Rhythm unit 9 |
| **7 · Beats in three** | 7.1 Triplets · 7.2 Six-eight (counted in two; *later*, no practice until 6/8 is playable) | Rhythm units 11, 12 |
| **8 · Notes on the staff** | 8.1 The staff and two clefs (landmark notes) · 8.2 Treble clef (lines E G B D F, spaces F A C E) · 8.3 Bass clef (lines G B D F A, spaces A C E G) · 8.4 Middle C and ledger lines · 8.5 Two ways to name notes (C–B = do–si) | Read notes: clefs, range · Path units 1, 3, 5, 7, 9, 11, 13 (sol to si), 15 and 17–20 |
| **9 · Sharps, flats and naturals** | 9.1 The piano octave (groups of 2 and 3 black keys) · 9.2 Half steps and whole steps · 9.3 Sharp, flat and natural (two names for a black key; E♯ = F, C♭ = B) · 9.4 A sign lasts for the bar (same line or space, same octave) | Read notes: piano, extra signs · Path unit 21 |
| **10 · Key signatures** | 10.1 The key signature (every octave; a sign next to a note wins until the bar line) · 10.2 The order of sharps F C G D A E B and flats B E A D G C F (start with up to three signs) · 10.3 Naming the key · 10.4 Major and minor (relative minor) | Read notes: keys, mix keys · Path units 22–26 |
| **11 · Scales** | 11.1 The major scale (W W H W W W H) · 11.2 Major scales in every key (each letter once; the scale's signs = its key signature) · 11.3 The circle of fifths (15 key signatures, 12 sounding keys) · 11.4 Minor scales (natural W H W W H W W, harmonic with raised 7th, melodic with raised 6th and 7th going up) · 11.5 Scale degrees and intervals (tonic … leading tone, intervals by number, the tonic triad; fixed do in this app) | Scales |

Chapters 8–10 are built (0.3.4); they were one chapter 8 with seven sections before, and the canvas still draws that
version. Chapters 1–7 are built (0.5.0) from the canvas (v1.2 and v1.7), without 1.4 and 7.2, which wait until the game
can play an upbeat and 6/8. On the canvas, 5.3 and the new chapter 7 (triplets moved there from chapter 6) still need
boards, and the desktop boards of chapters 1–7 still draw the 640 px column that chapter 8 replaced with the full width
in 0.3.3: the built chapters use the full width, with diagrams up to 640 px and each rhythm as wide as its notes need.

Why this order: pulse and meter come first because every later rule refers to beats and
strong positions. Note values come before rests because each rest is defined by its note.
Dividing the beat (and its counting syllables) comes before ties and dots, because a dotted
quarter + eighth can only be counted once "&" is known. Ties come before dots so the dot can
be explained as a tie. Syncopation needs strong and weak beats, ties and eighths, so it
comes late. Triplets and compound meter both split a beat in three, so they share the last
rhythm chapter. Reading notes follows the courses: clefs and names, then half steps and signs, then key signatures, and
scales last.

**Each chapter is its own page**, never one long page with everything. A chapter page has:
its number and title, what it builds on and which Path units use it, its sections (each with its own quick check),
a quick check question for the chapter, and previous / next chapter links. Sources are not shown to the player;
they live in `THEORY-SOURCES.md`, where every claim on the page is checked. On
mobile the Learn tab lists the chapters as cards that expand into their sections, with read
status; on desktop a sidebar lists all chapters, with the open chapter's sections nested
under it. The canvas draws chapters 1–7 (v1.2 and v1.7), the old chapter 8 (v1.3) and scales (v1.4, still numbered 9).
On tablet (≥ 700 px) and desktop (≥ 1100 px) a chapter page keeps one column of
sections in reading order, each filling the width. Inside a section, related parts sit side
by side (lines | spaces, example | rule, text | keyboard) and stack again on narrow screens,
so notation keeps a readable size instead of stretching. Desktop adds the chapter sidebar;
on tablet the sidebar becomes a row of section chips under the title. The canvas shows chapter 8 at 834 px (tablet) and 1280 px (desktop).
Both use the full width (up to 1160 px of content) instead of the 640 px column, and the Learn tab's chapter list
(up to 960 px) shows a chapter's sections in two columns, read down. A jump to a section (a chip, the sidebar, or a
link to `#/learn/8?s=8.3`) brings it into view and gives it focus, so Tab goes on inside the section.

The bottom tab bar gains a **Learn** tab: Home · Path · Learn · Progress · Settings (Progress since 0.19.0). The active tab is unmistakable: its icon sits in a slate-tint pill (#dfeaea, 56 × 30) and its label turns ink and bold, while the other tabs stay muted gray. It is marked `aria-current="page"` for screen readers.

### 9.2 Accounts: the account and admin screens

Since 0.12.0, progress on the account since 0.15.0 ([BACKEND-PLAN.md](BACKEND-PLAN.md) §6), and deleting an account
with the choice to keep an anonymous copy, and the admin screen *Deleted accounts*, since 0.16.0 (BACKEND-PLAN.md §3.7).
The feedback tool, and the screens *Feedback* and one report where its reports are reviewed, since 0.17.0
([FEEDBACK-LOOP.md](FEEDBACK-LOOP.md) §3, BACKEND-PLAN.md §3.9).
**No board exists yet** for any of these screens, on either canvas.
They were built from the built Settings screen (§9) and the foundations, and this section describes them as built.
Their boards are still to be drawn (phone, tablet and desktop, in light and dark), and so are the components below,
on Foundations. The Settings boards they would extend disagree with each other: the App design canvas draws tablet
and desktop Settings with a list of sections and two columns of cards, while the MVP canvas's Settings row uses one
640 px column. Since 0.13.0 the built Settings follows the App design canvas (§9), with the Account section as the
first card and the first item of its list; the account screens it opens (Account, Privacy, the admin screens) keep
one 640 px column on tablet and desktop.

**Where accounts are.** Accounts are optional and by invitation. The app needs none, and nothing in it waits for the
server.
- Settings has an **Account** section first, on every size, once the API has answered or an account is cached on the
  device. A site without an API shows no Account section at all.
  - Signed out: one row, *Sign in* (*Accounts are by invitation.*).
  - Signed in: the account (name and email) → Account; under it, joined to it without a hairline, a quiet line (13 px,
    muted) that says whether the progress is on the account: a green check and *Progress saved to your account*; a
    clock and *Saving your progress…*; a clock and *Not saved yet. Your progress is saved when you're back online.*;
    or an alert icon, *Your progress couldn't be saved.* and **Try again** beside it (under it when the words need the
    room). It is not read out: it changes after every exercise. Then *Accounts* (*Invite people and manage roles*) →
    the admin screens, only with `accounts.read`; since 0.17.0 *Feedback* (*Review the reports sent from the app*) →
    the feedback reports, only with `feedback.review`, and a *Feedback button* switch (*On this device: mark part of a
    screen and send what should change.*), only with `feedback.give` and only while feedback mode is on (0.18.0); and
    *Sign out*.
  - *Sign out* opens a confirm in place (as *Sign out everywhere*: the question in ink, a tonal button): *Sign out on
    this device?*, *Your progress stays on your account. On a shared device, remove it from this one.*, then a
    two-choice segmented control, *Progress on this device*: **Keep** (chosen, and focused, when it opens) · **Remove**,
    then Cancel and Sign out. It saves the last change first. Cancel puts the choice back to Keep. On a link opened
    while someone else is signed in (Accept invite, New password), the same confirm opens on Remove and goes back to
    it.
  - No answer from the API, with a cached account: the account row, then *Muzieklab can't be reached right now. You
    can change your account again once it can.* with **Try again**. (Not "Offline": the device may be online while
    the API restarts or answers 502.) Try again keeps its focus while it checks and shows *Checking…* for at least
    0.6 s. The outcome is read out: *Muzieklab still can't be reached.* (Try again is ready again), or *Muzieklab can
    be reached again.*, and focus goes to the account row (on Account, to the Profile heading). The app also asks
    again when Settings or an account screen opens (at most once every 10 s), when it comes back into view, and when
    the device is back online.
  - After an action that ends on Settings, one line with a green check says what happened: *Signed out.*, *Signed out
    on every device.*, *Your account and its data were deleted.* or *Your account was deleted. An anonymous copy of
    your progress is kept.* (after Delete account, by the choice made), *You're signed in. Welcome to Muzieklab.*, *Password saved. Your
    other devices are signed out.*, or, after a first sign-in on a device that had progress, *The progress on this
    device is on your account now too.* It is read out once, when it happens (not again when the language is switched),
    and it goes when Settings is left.
- Settings → About has a **Privacy** row (*What stays on this device, and what an account stores*), with or without an
  API. Its *Reset progress* confirm says, while signed in, *Streak, stars and XP, on every device with your account.
  No undo.*, and resets the account's progress too.
- **The feedback tool** (0.17.0, [FEEDBACK-LOOP.md](FEEDBACK-LOOP.md); no board yet): while feedback mode is on (0.18.0,
  switched by an admin on *Feedback*, below), for an account with `feedback.give`, a button floats over every screen (phone: a 48 px round icon above the tab bar; tablet and desktop: a
  pill with the word, bottom right). It marks an element or a drawn box, then a sheet (desktop: a dialog beside the
  spot) takes the kind, what should change (at most 5000 characters, as the API stores) and a title. A muted note
  under the fields says what happens to it: *Saved for the team to review, with this screen, the marked spot, the
  screen size, the theme, the language and the settings. Not your progress. If it is picked up, it becomes a public
  GitHub issue, without your name.* Then *Copy* (the report in Markdown) and **Send**.
  - Sent, the sheet says *Saved for review* over *An admin reads it in Settings → Account → Feedback, and picks what
    goes on to GitHub.*, with **Review it** (outlined) for an account that also has `feedback.review`: it opens the
    report (`#/admin/feedback/<id>`) and closes the tool. Then *Mark another* and *Close*.
  - When sending fails, why shows above the buttons as an alert (*Can't reach Muzieklab right now…*, or *Too many
    tries. Try again in 12 minutes.* after 30 reports in an hour), and the form stays as it was, so Send tries again.
  - Closing the tool (Cancel or Esc while marking; the X, Esc or *Close* on the sheet) puts the focus back on the
    Feedback button. *Review it* leaves it to the report's screen.
  - Built from the sheet, button and field styles of the existing screens.
- **Feedback reports** (0.17.0; no board yet): the screens *Feedback* and one report, for an account with
  `feedback.review`, are in the table below. They are built from *Deleted accounts* and *One account*. A report is not
  the feedback on *Deleted accounts*, which is what people wrote when they deleted their account.
- **Roles on the admin screens** (0.17.0): the role switches list the built-in roles (Admin, Editor, Teacher, in the
  app's words), then the custom roles admins made, by their names and descriptions. On *One account* a switch gives or
  takes away only its own role, in the roles the account has then: a role another admin changed meanwhile stays as they
  left it, and the switches show it once the answer comes.

**Two frames.**
- **A Settings sub-page** (Account, Privacy and the admin screens) keeps the shell, with Settings current. That is the
  bottom tab bar on phone, and the top header on tablet (icons, on the right) and desktop (words, after the brand). The
  page starts with a back arrow (*Back to settings*; *Back to accounts* from Invite someone, one account and Deleted
  accounts; *Back to feedback* from one report), the title (`.screen-title`, Unbounded 500) and, on some screens, a
  muted line under it. Then come Settings' sections, 12 px apart: an uppercase label above a paper card, with hairlines
  between rows. On tablet and desktop the page is Settings' centred 640 px column, 40 px from the top. It scrolls as
  one page.
- **A form on its own** (Sign in, Accept invite, New password) has no tab bar or header at any size, like Calibrate. It
  shows a back arrow and the title, then the form on one paper card (radius 20). On a phone it takes the width, with
  Calibrate's top space (52 px on a board, status bar included); from 700 px it is a centred 480 px column, 64 px from
  the top.
- **Other sizes.** A phone in landscape (844 × 390) starts the page nearer the top (20 px; 16 px for a form on its
  own). The phone browser sizes (390 × 664, 375 × 553) keep the phone layout and scroll. Fields stay 48 px tall and
  buttons at least 44 px everywhere. A tablet in landscape (1180 × 820, touch) gets the desktop layout.

**The screens.**

| Screen | Frame | What it shows | States |
|---|---|---|---|
| **Sign in** `#/signin` | form on its own | Email, Password (with Show), **Sign in**. Under the card: *Forgot your password? Ask the person who invited you.* and a Privacy link. | An empty field says what is missing. A wrong email or password: *Email or password is not right.*, with the password selected. Too many tries: *Too many tries. Try again in 2 seconds.* The server busy (its line for password checks is full, so it counted no try): *Muzieklab is busy. Try again in a moment.*, never "too many tries". Both are form errors. No answer. Already signed in: Account. Success: Settings. |
| **Accept invite** `#/invite/<token>` | form on its own | *Checking the link…*, then *Welcome, {name}* over *Choose a password for {email}.* Name (filled in; it may be changed), New password with the rules (*At least 10 characters. Not a common password, and not your email.*), **Create account**. | A link that no longer works: the message and **Home**. No answer, or too many tries at checking the link: the message and **Try again**. Someone else signed in on this device: one card, *You're signed in as {name} on this device. Sign out first to use this link. Progress you keep on this device is added to this link's account too.* and *Sign out*, Settings' confirm, instead of the form. It opens on **Remove** (the device is shared, and their progress is saved to their account first); with **Keep** their progress stays here, and this account's first sign-in on the device adds it, as any first sign-in does. Signed out, the form, with focus on its first field. Too many tries or the server busy when the form is sent: as Sign in, the form error. A name with a tab or another hidden character (pasted from a spreadsheet, say): *Remove the tabs and other hidden characters.* under Name, and nothing is sent. Success: Settings, with the welcome line. |
| **New password** `#/reset/<token>` | form on its own | The same with one field, *Saving it signs out your other devices.*, and **Save password**. | As Accept invite; signed in to the link's own account, the form. Success: Settings, with *Password saved…* |
| **Account** `#/account` | sub-page | *Profile*: Name (Save); Email, where *Change email* opens the new email and the current password in place; the roles and premium as a muted line. *Password*: the current and a new one, Change password. *Devices*: Sign out everywhere. *Your data*: Download my data (`muzieklab-account.json`), Delete account (*You choose whether an anonymous copy of your progress is kept.*). Its confirm: *Delete your account?*, *Your name, email, password and devices are deleted, and you're signed out. Progress on this device stays. No undo.*; then *Your progress and settings*, a two-choice segmented control, **Keep anonymously** (chosen, and focused, when it opens) · **Delete too**, with a muted line under it saying what the chosen one does (*They're kept without your name, email or anything else that says they were yours…* / *They're deleted with your account. Nothing of your account is kept.*); *Why are you leaving? (optional)*, a text area (at most 1000 characters) with *It helps us make Muzieklab better. It's kept without your name or email, also when you delete everything, so leave out anything that says who you are.*; Password; Cancel and Delete. Cancel puts the choice back to Keep anonymously and empties the feedback. | Loading. Signed out: Sign in. No answer from the API with a cached account: the note (*Muzieklab can't be reached right now…*) with Try again at the top, the profile read only, the other sections hidden. No answer with nothing cached: the message and Try again. Too many tries and the server busy, where the current password is asked (Change email, Change password, Delete account): as Sign in, the form error. A name with a tab or another hidden character (pasted from a spreadsheet, say): *Remove the tabs and other hidden characters.* under Name, and nothing is sent. A save ends with a green-check line (*Name saved.*, *Email changed. Sign in with it from now on.*, *Password changed. Your other devices are signed out.*); a saved email closes its form, with focus back on *Change email*, as Cancel does. |
| **Privacy** `#/privacy` | sub-page | A lead line, then *Without an account*, *With an account* (the last item: the feedback reports someone sends from the app, if their account can, and what they hold), *Why*, *Where*, *How long* (with *Deleted accounts: the anonymous copy, the feedback and the day, 2 years.* and *Feedback reports: until the team deletes them, or you delete your account.*), *When you delete your account* (the two choices; that the feedback reports go with the account whichever is chosen, and stay without the name when an admin deletes it; the feedback; and that backups hold the account for up to 14 days), *Your rights*, *Age*, and the day it was last updated. | None. Opened from Sign in (`?from=signin`), its back arrow goes to Sign in. |
| **Accounts** `#/admin` | sub-page | **Invite someone**, the screen's one filled button: in the title row from 700 px, full width under the title on a phone. A search field (*Search*, *Name or email*; it searches once typing pauses for 250 ms, or on Enter), the status filter (All · Invited · Active · Blocked), then one section whose label counts (*4 accounts*, *1 account found*). Each row: the name (*(you)* after your own), the email, a status pill and the roles, and a chevron. | Checking; loading; *No accounts match.*; an error with Try again (outlined, as Invite someone is the filled button); no access (a lock, *You don't have access to this page.*, *Only admins manage accounts.*, Back to settings); no answer; signed out: Sign in. After Cancel invite or Delete account, a line saying so, once (*The invite for {name} was canceled.*). Under the list, a *History* section with one row: *Deleted accounts* (*Accounts that were deleted, and why people left*). |
| **Deleted accounts** `#/admin/deleted` | sub-page | *Back to accounts*. A lead line: *Every account deleted in the last 2 years, with what its owner wrote. Nothing here says whose an account was.* A filter (*How it was deleted*: All · Archived · Data deleted · By an admin, chips in two pairs as on Accounts), then one section whose label counts (*4 deleted accounts*, *2 deleted accounts found*). Each entry (an `article`, not a link): the day (bold) and a pill on the right (*Archived*, *Data deleted*, *By an admin*); the feedback as written, line breaks kept, on a Ground panel (radius 12), or *No feedback.* (muted; not for an admin's deletion); for an archived one a muted line, *Joined March 2026 · Level 8 · 1840 XP · 2 lessons · 3 days practiced*, or *… · No progress saved*. Then *File*: *Download as a file* (*Every entry, with the anonymous progress, as JSON.*, `muzieklab-deleted-accounts.json`; every entry, whatever the filter). Needs `accounts.read`. | Checking; loading; *No account has been deleted yet.* (no filter or file then); *None of these.* for a filter with none; an error with Try again; no access; no answer; signed out: Sign in. A filter's count is read out. |
| **Invite someone** `#/admin/invite` | sub-page | *Person*: Email, Name. *Roles* (only with `roles.grant`): a switch per role with what it does (*Makes classes and follows pupils (coming later).*), and *Without a role, they can practice and keep their own progress.* **Create invite**. Then a card: *Invite for {name} is ready* (it gets focus), *Send the link yourself, for example with the message below.*, the link with **Copy link**, *Works until {date and time}.* **This link is shown only now. Make a new one if it gets lost.**, and the message with **Copy message**. Under it *Invite someone else* (outlined) and **Done**. | An empty field. *There's already an account with this email.* under Email. A name with a tab or another hidden character (pasted from a spreadsheet, say): *Remove the tabs and other hidden characters.* under Name, and nothing is sent. No access; no answer. |
| **One account** `#/admin/account/<id>` | sub-page | The name as the title, with the status pill and email under it. *Details*: Added, Last signed in, Devices signed in, and for an invite when its link stops working (*No working link. Make a new one below.*). *Name and email* (Save). *Roles*: switches, saved at once. *Premium*: a switch, and *Last day (optional)*, a date field with **Save date**. Then by status: invited, *New invite link* and *Cancel invite*; active, *New password link*, *Block* and *Delete account*; blocked, *Unblock* and *Delete account*. A new link shows as in Invite someone. | Each part shows only with its permission. On your own account the role switches are disabled, with *You can't change your own roles.*, and one row to Account (*This is your account*) replaces the links, Block and Delete. Loading; an error with Try again; *This account isn't there anymore…* with Back to accounts; no access. An invite accepted meanwhile: *{name} accepted the invite meanwhile, so the account was not removed.*, and the account reloads. Such a message (also *{name} was blocked meanwhile, so no new link was made.*) stays through that reload, and goes at the admin's next press under Access or Invite (Unblock, Block, a new link…). A name with a tab or another hidden character (pasted from a spreadsheet, say): *Remove the tabs and other hidden characters.* under Name, and nothing is sent. A new email saved: a link shown under *New invite link* or *New password link* goes with its message, as it stops working (BACKEND-PLAN.md §5.3), and only the button is left; a new name keeps it. *New invite link* or *New password link* pressed again: each answer keeps its place until the next one replaces it, so the page keeps its height and does not move under the admin's finger. While the press runs (the button says *Making a link…*), the earlier link, or why the last press failed, stays dimmed (45%) and cannot be used (inert). A new link takes the earlier one's place, and its *New link ready. Send it yourself.* is read out again. If the press fails, why takes the place of *New link ready…* (an alert, read out each time, ending *The link below may not work anymore.*), and the earlier link and its message stay under it, dimmed and not usable, until a new link replaces them. A first press that fails shows only why. When the answer lands below the screen's edge (the button was at the bottom of the screen), the page scrolls just enough to show it, all of it where it fits; not when the admin has scrolled away from the button meanwhile. |
| **Feedback** `#/admin/feedback` | sub-page | Opened from Settings → Account. A lead line: *Reports sent from the app.* Then a *Feedback mode* section (0.18.0): one switch row, *Feedback mode*, with *On: everyone who can send feedback sees the Feedback button on every screen.* or *Off: nobody sees the Feedback button. Turn it on to collect feedback.* under it. It is for everyone, saved at once, and starts off. A filter (New · Accepted, Declined · All, chips in two pairs as on Accounts), each chip with its count after the word in a lighter weight (*New 3*): New is chosen first, and the filter stays as it was when coming back from a report. Then one section whose label counts (*3 new reports*, *4 reports*). Each row links to the report: its title as written, or one made up in the app's language from the kind and the screen (*Bug on #/settings*), and a muted line, *Bug · button “Start” · Ann · October 25, 2026* (the kind, the marked spot, who sent it or *A deleted account*, the day). Under All, each row also has a status pill on the right. More than the newest 500: *Showing the newest 500.* under the list. Needs `feedback.review`. | Checking; *Loading reports…*; *No reports yet. They appear here when someone sends feedback from the app.* (no filter then); *No reports with this status.* for a filter with none; an error with Try again (under the filter, which stays with the counts it had, so another filter can be chosen; without counts when the first list did not come); no access (*Only admins review feedback reports.*); no answer; signed out: Sign in. Feedback mode that could not be switched: the switch goes back, with the form error under it. After Delete report, *The report was deleted.*, once. A filter's count is read out; another filter keeps the rows it has, dimmed, until the answer comes. |
| **One report** `#/admin/feedback/<id>` | sub-page | *Back to feedback*. The title as in the list. *Report*: Kind, then *What should change*, the description as written, line breaks kept, on a Ground panel (as on Deleted accounts), or *No description.* *Where*: Screen (`#/settings`, mono), Marked (its name), Text there, Selector (mono), Marked as (*An element* or *A drawn area*), Box (*x 12, y 340, 366 × 48 px*, and where the page was scrolled to), then *Open this screen*, a row link, only for a screen the app has. *Device*: Viewport (*390 × 844 px, pixel ratio 3*), Size (Phone, Tablet or Desktop), Orientation, Input (Touch or Mouse), Theme (*Dark, from the system setting*), Language, App version (mono) and Browser (the user agent, mono). *Sent*: From (the name, or *A deleted account*) and Date (the day and time). *Review*: *Status*, a segmented control New · Accepted · Declined, saved at once, with *Reviewed by Ann, October 25, 2026* under it (or *Not reviewed yet.*), which is read out when it changes; *Note for the team*, a text area (at most 2000 characters) with *Only people who review feedback see it, not the person who sent it. Up to 2000 characters.*, and **Save note** (tonal; *Saved.*). *Actions*: *Copy as Markdown* (*The title and text for a GitHub issue, to make by hand for now.*), whose row turns into a check and *Copied* for 2 s, and *Delete report*, a confirm: *Delete this report?*, *It is removed from the app for everyone. No undo.*, Cancel and Delete. A long value (the marked text, the selector, the browser) sits under its label, read from the left. Needs `feedback.review`. | Checking; *Loading the report…*; an error with Try again; *This report isn't there anymore.* with Back to feedback, also when another reviewer deleted it meanwhile; no access; no answer. A status or note that could not be saved: the form error under it. A status picked while the note saves (or the other way round) is sent after it, so the screen ends on the newest. Typing that goes on while the note saves stays in the field, still to be saved, without *Saved.* A note with a tab or another hidden character: *Remove the tabs and other hidden characters.* under the field. Where copying is not allowed, the Markdown shows in a copy field, to copy by hand. After Delete: the list, with *The report was deleted.* |

**Components** (`src/ui/components/Form.tsx`, `src/styles/account.css`). They use tokens only, so light and dark
both work.
- **Text field** (`TextField`, `PasswordField`):
  - The label sits above it: 14.5 px, 700, Ink.
  - The field: Paper, a 1.5 px `--field-line` border (below), radius 14, at least 48 px tall, 11 × 14 px inside, and
    16 px / 500 text, so iOS does not zoom in.
  - Focus: an accent border and the gold focus ring (3 px, 2 px away).
  - A hint under it: 12.5 px, Muted.
  - An error under it: 13.5 px / 600 in `--miss-ink`, with an alert icon, and the border turns Miss. It is read out
    when it appears (`role="alert"`), and it is the field's description (`aria-describedby`, `aria-invalid`).
  - Read only: a Ground fill. Disabled: Track, with `--disabled` text.
  - A password field has *Show* / *Hide* inside it, on the right (accent ink, 700; *Show password* for screen readers).
  - Types: text, email, search and date.
  - A text area (`TextAreaField`: a deleted account's feedback, a report's note): the same field, three lines tall to
    start (96 px), and taller by hand.
- **Which error goes where:** a field error is only about what was typed in that field: it is empty, not an address,
  taken, a new password that cannot be used, or a current password that is not right. Everything else is the **form
  error**: a wrong email or password on Sign in (which of the two is not told), and every request that failed (no
  answer, a server error). It is a box above the button in `--miss-soft` / `--miss-ink`, radius 12, 14 px / 600, with
  the alert icon, and it is read out. A done message is a green check and one line, 14 px / 600, read out once by the
  live region (below).
- **Buttons:** one filled button per screen, as elsewhere: Sign in, Create account, Save password, Invite someone,
  Create invite, Done, Try again. A card's own small form (Save, Save email, Change password, Save date, Save note) has
  a **tonal** button: `--accent-soft` with `--accent-ink` text. A busy button says so (*Signing in…*) and cannot be
  pressed twice.
- **Rows** in Settings' cards, with hairlines between them:
  - a row button: 54 px, an icon, the words in Ink, or red for Delete account;
  - a switch row, for roles and premium: 56 px, with Settings' switch (`role="switch"`);
  - label and value rows (Email, Details, a report's facts). On one report a long value goes under its label, read
    from the left, and code (a route, a selector, a version, the browser) is in JetBrains Mono, 13 px.
- **Status pill:** 11.5 px / 700, fully rounded. Invited is `--reward-soft` / `--reward-ink`, Active `--good-soft` /
  `--good-ink`, and Blocked `--miss-soft` / `--miss-ink`. On Deleted accounts the same pill says how an account went:
  Archived in the reward colours, Data deleted in the miss colours, By an admin in `--accent-soft` / `--accent-ink`. On
  Feedback it says where a report stands: New in the reward colours (waiting for a look), Accepted in the good colours,
  Declined in `--track` / `--muted`.
- **Copy field:** the value, read only, with a 48 px Copy button that turns into a check and *Copied* for 2 s, as
  Results' Copy code does. A link is in JetBrains Mono; a message is in Figtree, as tall as its text. Where copying is
  not allowed, it selects the text instead: *Selected. Copy it with your device's copy command.*
- **Status filter:** the foundations' chips, as one pick-one group (`aria-pressed`), in two pairs (All · Invited,
  Active · Blocked). A line breaks only between the pairs, so the filter is all four on one line where they fit and
  otherwise an even 2 × 2 grid, in every language and at every width (in Dutch, *Uitgenodigd* and *Geblokkeerd*, two
  and two up to about 373 px). Never three and a lone one, which reads as a separate wide button. On a phone they
  fill the row. It is not a segmented control: four statuses do not fit one track at 320 px, or at phone width in
  Dutch. Feedback's filter (New · Accepted, Declined · All) has the same pairs, with each choice's count after its
  word, at 500 and in tabular figures.
- **Announcements:** one polite live region for the whole app (`#announcer`) reads out results whose button is gone,
  busy or far away: Settings' one-line notices, the accounts list's line after Cancel invite or Delete account, the
  feedback list's after Delete report, Block and Unblock, the count after a search, a filter or Try again, the outcome
  of Try again on the note for no answer, every form's done line (*Name saved.*, *Saved.*, *New link ready. Send it
  yourself.*) and Settings' *Progress was reset.* Those lines are plain text, not a `role="status"` of their own, so
  nothing is read twice.

**Destructive confirm** (`ConfirmAction`) is Settings' Reset progress pattern.
- The row button (red words and icon) turns, in place, into the question in bold, one line on what happens, any field
  it needs, then *Cancel* (outlined) and the verb, on the right. On a phone the two buttons share the row.
- Only the confirm step has the red fill: `--miss`, with `--on-fill` text.
- It is a form (`role="alertdialog"`): Enter confirms from its field, and Escape or Cancel closes it, putting focus
  back on the row button. When it opens, focus goes into it (its first choice or field, or Cancel when it has none),
  so a screen reader reads it out and Escape reaches it.
- Used for Delete account (your own, with the choice of what happens to your progress, feedback and your password),
  Block, Cancel invite, an admin's Delete account, and Delete report.
- A choice inside a confirm (Sign out's Keep · Remove, Delete account's Keep anonymously · Delete too) is a segmented
  control with 44 px buttons, and so is a report's status (New · Accepted · Declined), outside a confirm. Words that do
  not fit half the confirm (*Keep anonymously* at 320 px) take a second line instead of being cut. Cancel invite's
  other button says *Keep invite*, as its verb is Cancel.
- Sign out everywhere uses the same confirm without red: the question in Ink and a tonal button, because it loses
  nothing. Unblock and a new link need no confirm.

**Copy.** The same rules as the rest of the app: sentence case, second person, no exclamation marks, and errors say
what to do. For accounts:
- One answer for a wrong email and a wrong password: *Email or password is not right.* There is no "forgot password"
  flow: *Forgot your password? Ask the person who invited you.* Signed out, the Account section says *Accounts are by
  invitation.* (nl *Alleen met een uitnodiging.*).
- A confirm asks a question and says in one line what happens. Where nothing brings it back, that line ends with *No
  undo.* (*Delete your account?* / *Your name, email, password and devices are deleted, and you're signed out.
  Progress on this device stays. No undo.*).
- What is kept after Delete account is said where the choice is made, in plain words, and again in Privacy: no
  promise the copy cannot be traced back further than BACKEND-PLAN.md §3.7 says. A done line says what happened (*Blocked. They're signed out.*).
- A link says *Works until {date and time}.*: a new-password link lasts 24 hours, so the time counts. It adds *This
  link is shown only now.* The message to send is in the admin's app language and uses the person's full name (*Hi
  {name}, I've made you an account for Muzieklab. Open this link to choose your password: …*).
- Premium's last day is a calendar day, shown as that day in every time zone (*Premium until December 31, 2026*).
- Dutch uses *inloggen*, *uitloggen*, *account* and *wachtwoord*. For one person it says *deze persoon* or the name,
  never *ze* or *hun*, and *Je kunt dit niet ongedaan maken.* for "No undo." Deleted accounts' kinds are short enough
  for the two-and-two filter at 320 px: *Gearchiveerd*, *Gegevens gewist*, *Door beheerder*.

### UX principles

- **One-thumb mobile**: primary actions at the bottom; tap pad is huge; no scroll during play.
- No accidental zoom/scroll during play (`touch-action: none` on the pad, Wake Lock on). A double tap on a Start
  button starts once: a touch tap that comes down within 450 ms of the tap that started is dropped, so it does not
  press what the exercise screen has there (Skip to results, an answer, a piano key; `ui/lib/tapGuard.ts`). The same
  goes for the buttons on Play's sheets that start or resume the run (How to play's Got it, the intro's and Ready's
  Start, Resume, Restart exercise), whose sheet is gone in 240 ms, for Echo's Tap it back (Hear again is under it), and
  for every tap that opens another screen (`App.tsx`): See summary and See the round open Round done, with New round
  or Change setup under the finger, and Change setup, Options or a Key screen's Use open a setup, with its Start or a
  switch there.
- Feedback by **colour + shape/icon** (colour-blind safe), sound optional. A missed note gets a × on the staff as
  well as the red (since 0.10.0; §9).
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
| Storage | `localStorage` (settings) + **IndexedDB** (history, stats); the signed-in account's cache, `muzieklab.account.v1` | Offline, no account needed. The cache holds only what `GET /me` returns (never a password or a token), so a signed-in device shows its account offline. The tabs of one browser share it: each takes up the prefs and progress another tab saves (the `storage` event), so none saves its older copy over them. |
| Offline / install | **PWA** (`vite-plugin-pwa`) | Home-screen app on phones. |
| Tests | **Vitest** + **fast-check** (property tests) | Generator correctness over thousands of seeds. |
| Hosting | Static, on our own server ([DEPLOY.md](DEPLOY.md)), with an optional API on the same server under `/api` | The app needs no backend: it works fully without the API, and shows no account then. |
| Accounts (since 0.12.0) | **Node** API (Fastify, one bundled file) + **MongoDB** on the same server ([BACKEND-PLAN.md](BACKEND-PLAN.md)); the contract `shared/api.ts`; the app's client `src/api/client.ts` | Optional, invite-only accounts with roles; progress across devices since 0.15.0. |

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
    notationText.ts     # rhythm written as text ('q [8 8] h') -> NotatedBar[]
  game/
    xp.ts  path.ts  storage.ts
    stats.ts            # the Progress tab's figures: per day (minutes, accuracy, timing, cells), Read notes totals
    cells.ts            # which skill-map cell each judged rhythm note counts for (§8.4)
    achievements.ts     # the five achievements (§8.3)
    skills.ts           # skill levels: ladders, checks, review due, focus next (§8.6)
    weakSpots.ts        # Practice weak spots: the rhythm setup preset (§8.4)
    progressView.ts     # progress + today -> everything the Progress screens show (§8.5)
  api/
    client.ts           # fetch to /api/v1: JSON, a 15 s timeout, errors as stable codes ('unavailable': no answer)
  ui/
    screens/ Home, Setup, Play, Dictation, Results, Path, Settings, Learn
    screens/progress/   # the Progress tab, its cards and charts, Skill levels and one skill (§8.5–8.6)
    screens/account/    # Settings → Account section, Sign in, Accept invite, New password, Account, Privacy (§9.2)
    screens/admin/      # Accounts, Invite someone, one account, Deleted accounts, Feedback, one report (§9.2)
    account.ts          # useAccount(): who is signed in, GET /me, the account cache
    sync.ts             # progress on the account: when it syncs, saves and merges (game/merge.ts, BACKEND-PLAN §6)
    learn/ chapters.ts  # the Learn chapters as data (docs/ADDING-CONTENT.md); Blocks.tsx draws them
    components/ ...     # Form.tsx: text fields, confirm, copy field (§9.2)
  i18n/ en.json nl.json # every user-facing string, one catalog per locale (found automatically)
  feedback/             # reading the page for a feedback report (docs/FEEDBACK-LOOP.md); ui/feedback/ draws the tool
shared/
  api.ts                # the API's contract: request and response types, error codes, permissions (types only)
server/                 # the API (Fastify + MongoDB), its own package and tests (BACKEND-PLAN.md §1.2)
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

**Languages:** **English** (American spelling and note names: quarter, eighth) and, since 0.4,
**Dutch** (*Nederlands*: kwartnoot, achtste noot, voortekening, majeur/mineur). Settings → Language picks one;
until then the app follows the device's languages (`nl-BE` matches `nl`) and falls back to English. Never mix
languages in the UI.

**One word, one thing.** In Dutch a Learning Path unit is a *blok* (*Blok 3 · Les 1 van 5*, *Blokken*, *Leerpad,
blokken 1, 3, 5*) and a Learn chapter is a *hoofdstuk* (since 0.10.0; before, both were *hoofdstuk*, so the Path showed
*Hoofdstuk 1 van 8* next to *Theorie: hoofdstukken 1–7*). Older changelog entries keep the word they shipped with. The
count-in is *Voortellen* everywhere (Setup's count-in option, the play header, the aria label). The Tap pad is the
*tikpad* and its label *Tik*.

**Adding a language** needs no code changes:

1. Copy `src/i18n/en.json` to `src/i18n/<code>.json` (a BCP 47 code such as `de`) and translate every value. Set
   `meta.name` to the language's own name ("Deutsch"): Settings → Language shows it.
2. Keep every key and the ICU structure. A translation may drop a param it does not need, but must not invent one;
   plural categories follow the language (`one`/`other` for Dutch and German). Words that change with the
   language's grammar go in the message (Dutch `notes.spoken` turns F + kruis into "fis" with a `select`).
3. Run `npm test`: `src/i18n/i18n.test.ts` fails on a missing or extra key, an unknown param or an unbalanced
   brace. Then run `npm run e2e`: the layout suite checks that no label is cut off (it runs every screen in Dutch;
   add the new language there too when its text is longer).

A key a catalog lacks falls back to English at run time, so a partial catalog still works while it is written.

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
  counting syllables ("1 & 2 &" differs per language and teaching method; Dutch counts "1 en 2 en"), rank names.
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
- Focus is never left on the page when the control that had it goes away (`ui/lib/screenFocus.ts`). A new screen puts
  it on its heading, so a screen reader hears it (*Exercise done* when a run ends), unless the screen took it itself
  (a field, a sheet); the first screen is left to the page load. A sheet that closes gives it back to the control that
  opened it, else to Pause on Play (How to play, the intro and Ready open by themselves) or the screen's heading (the
  level-up sheet). Echo's Tap it back and Hear again swap the screen inside Play, so the new phase's heading takes it.
  On What's new (desktop), Newer or Older that goes away at the end hands it to the one left. In Read notes and Scales
  a control that a step disables or removes hands it on: an answer that ends the note or the scale (the last sign or
  key, the staff written on and checked) to Next note or Next scale; Hint, Next note, Next scale and Start over to the
  answers (the first name button, sign or piano key, or the next note's staff to write on). Echo's play button keeps
  it while the rhythm plays (`aria-disabled`), then Tap it back takes it.
- High-contrast theme; big touch targets (≥ 48 px).
- Text contrast meets WCAG AA on its surface: at least 4.5:1 for text under 24 px (under 18.7 px if bold), 3:1 for
  larger text and for icons. Green text uses `--good-ink`: `--good` is 4.3:1 on paper, so it stays for fills, dots,
  borders and bars. The total after a score (Read notes' "2 / 3", Scales' "1 / 1" on Round done) is `--muted`:
  `--faint` is 2.7:1 on the page in light.

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
| M7 | **Accounts** (phases 1 and 2 done in 0.12.0 and 0.15.0; phases 3–5 planned) | Invite-only accounts with roles: sign-in, invite and new-password links, the Account screen, the admin screens and the privacy statement (done, 0.12.0). Progress on the account, synced and merged across devices (done, 0.15.0). Then classes, content editing and premium ([BACKEND-PLAN.md](BACKEND-PLAN.md) §10). |

---

## 13. Open questions

1. **Language:** decided: English and Dutch since 0.4, fully localizable (§11). Dutch counts the "&" as "en"; the
   sixteenth and triplet syllables (e, a, trip, let) stay as in English until a Dutch method is confirmed (question 2).
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
7. **Accounts:** where the account sits in the shell is decided: an Account section at the top of Settings, on every
   size, with Accounts inside it for admins, and no new tab (built in 0.12.0, §9.2). Its boards are still to be drawn
   on both canvases. The questions still open (children's accounts, two-step sign-in for admins, content editing,
   premium) are in [BACKEND-PLAN.md](BACKEND-PLAN.md) §11.

---

## 14. Theory sources

The music theory and notation rules in this document and in the app's Learn pages are
checked against published sources. The claim-by-claim list, with what was corrected, is in
[`THEORY-SOURCES.md`](THEORY-SOURCES.md). What the chapters should contain, compared with Dutch, Flemish and international courses, is in
[`LEARN-CHAPTERS.md`](LEARN-CHAPTERS.md).
