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
2. **Count-in** — one bar of metronome clicks (configurable: silent, 1 or 2 bars) with big
   on-screen counts "1 – 2 – 3 – 4". *Silent* keeps the bar and the counts, without clicks,
   so the first note never comes without warning.
   The count-in looks different from the music (since 0.10.0; before, it already looked like bar 1). Until the music's
   first beat (the lead-in, the count-in, and the count-in after a pause), the header line reads *Count-in* (nl
   *Voortellen*) instead of *Bar 1 of N*, and no note is highlighted (none before the start either). The beat counter
   draws the current beat as an outlined slate ring, with the digit in slate, instead of the filled circle. On desktop
   the stat card's label reads COUNT-IN and the active digit is hollow. From beat 1 everything looks as before. The
   analog metronome is unchanged, and the aria labels stay *Count-in, beat x of y*.
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
| **Daily Challenge** | One exercise per day at the player's place on the rhythm path, seeded by the date and the highest open unit, so everyone at the same unit gets the same one (below). Keeps the streak alive. |
| **Weak Spots** | Adaptive: the generator boosts cells/meters the player scores worst on (§8.4). |
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
  A round in C major / A minor with no extra signs has no sign row, no *Pick the sign if there is one, then the name.*
  line and no − 0 = keys: seven buttons for seven answers (since 0.10.0). The idle line is then empty on phone and
  tablet (the question *Which note is highlighted?* sits above the staff); desktop shows *Which note is highlighted?*
  in the answer card, and its key hint reads *Type the letter of the note*. The setup's *Answer with* line drops
  "each with ♭ ♮ ♯ keys" in that case.
- Desktop: names are typed with the letter keys (A–G); the piano maps to the
  computer keyboard with the common layout **A S D F G H J** = C D E F G A B and
  **W E T Y U** = C♯ D♯ F♯ G♯ A♯.
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
sounds as it is pressed, in the octave of the note on the staff, so the right key sounds as the note. After every
answer (names or piano; right, wrong or timed out) the note on the staff sounds as written, with the key signature and
its own sign applied. After a wrong piano key, the right note follows half a second later. Once a note is answered,
the piano keys only sound, so the player can compare them. The sound is the Scales piano tone, at the Playback volume.
Read notes and Keys path lessons keep the player's choice (the lesson presets do not set it). Audio is unlocked from the
Start tap and from every answer tap.

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
Round done's *Needs practice* shows each missed or slow note as the player reads it (since 0.10.0; before, in
scientific pitch, *F5 ×3*): a chip with a small staff (the note's clef and the note, with its own sign; no key signature at this
size), the name in the player's note names (fa♯ or F♯), and ×count or the seconds. Screen readers hear e.g. *fa, F on
the top line (treble clef), missed 3 times*. The desktop play screen's Needs practice card also uses the player's
names.

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
  A minor scale uses the relative minor of the chosen key (G → E minor).
- **Piano:** a keyboard window that starts on the tonic, or on the white key just below it
  when the tonic is a black key (F♯, D♭ …): 9 white keys, enough for one octave from any
  starting note. The white keys always show their letters (A–G), whatever the label setting in
  Read notes: the window starts somewhere new with every scale, so the letters find the keys.
  The player plays the scale note by note; each right
  note is written on the staff and fills the next degree box. The W/H steps sit between
  the boxes. A wrong key flashes red and the feedback names the step ("From G, go a whole
  step: skip one key"). *Hear it so far* and *Start over* appear once the first note is played (since 0.10.0; before
  that they would do nothing). They are hidden but keep their place, so nothing moves when they come. When the scale is
  done, *Hear it so far* reads *Hear the scale*. This holds for play and spell, on phone and tablet (the row under the
  feedback) and on desktop (the side panel). Computer keys
  on desktop, as in Read notes: A S D F G H J K L for the white keys, and for a black key
  the letter above the gap between its two white keys (W E R T Y U I O). Space is *Hear it so far* and Enter goes on,
  except on a button the player reached with Tab: that button takes Space and Enter itself (since 0.9.0). After a click
  Space stays *Hear it so far*, so a piano key that kept the focus is not pressed again.
- **Names (spelling):** the letters are given, one per degree, because a scale uses each
  letter once; the player chooses ♭, ♮ or ♯ for each (keys − 0 =, as in Read notes). This
  drills exactly what changes between keys and between the minor forms (D♯ in E harmonic
  minor). Double sharps (F𝄪 in G♯ harmonic minor, C𝄪 in D♯, G𝄪 in A♯) appear only in keys
  that need them: then a fourth button, 𝄪 (key X), joins the row. No scale here needs a
  double flat.
- **Up and down** adds the way back: the degree row gets a second line, from 7 down to 1, and
  the piano window stays the same.
- **Melodic minor down** is written as natural minor (the classical form).
- **Scoring:** a scale is right when it was finished without mistakes; stars by mistakes
  (0 → ★★★, 1 → ★★, 2–3 → ★). A scale with mistakes comes back at the end of the round.
  XP: 2 per star for each scale (doubled for up and down), + 5 when every scale in the round
  has ★★★ (starting values, to tune).
- **Round done** lists each scale with its mistakes and stars (a scale with mistakes is
  marked *Came back at the end of the round*) and how far the circle is filled, with
  *Change setup* and *New round* (the same setup, shuffled again). Its back arrow goes to the
  Scales hub.
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
- The calibration screen says it in plain words (since 0.10.0): *Tap along with 16 clicks. Muzieklab measures how
  late or early your taps land and takes that off every score.* The measured median is labelled *Your delay* (nl
  *Jouw vertraging*) on the card and on the result card, which said *Median* and *Your offset*, and the result text
  starts with *Measured over N taps*. The stored value is still the median offset. The Dutch start prompt is *TIK OM
  TE BEGINNEN*; it must fit on one line on a 320 px phone.
- Calibrate opens from Settings, and from a coaching tip on Results (§6.4) as `#/calibrate?from=results`: then its
  back arrow (*Back to results*) and Save return to `#/results`, which shows the last run again. Opened any other way,
  they return to Settings. After a reload the store has no last run, so Results falls back to Home as it always does.

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
  dragging beyond about +30 ms. Device latency is removed separately by calibration (§6.1); when the offsets are
  steady and the device is not calibrated, the tip points there (§6.4).
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
  2. A steady delay: *Your taps came about 125 ms late (early) every time. That is usually the speaker or headphones:
     calibrate once and it is taken off every score.* A steady player 125 ms late (Bluetooth, an uncalibrated phone)
     gets 0% with every note Miss + Extra, and the old tip blamed their reading. The offsets are the hit notes'
     offsets plus, for each missed note, the nearest unpaired extra tap after it (late) or before it (early), within
     350 ms and before the neighbouring note. It is a delay when all of these hold: those offsets cover at least 60% of
     the notes (and at least 3); every one is at least 20 ms off the same way; the mean is at least 80 ms; the SD is at
     most 60 ms; and unpaired extra taps are at most a quarter of the notes. Sloppy timing spreads both ways and wider,
     and mashing the pad leaves many unpaired extra taps.
  3. Off track (misses + extra taps add up to a quarter or more of the notes): timing advice is beside the point when
     the player lost their place, so it names the misses, with the bar that had the most (*You missed 3 notes, most in
     bar 2. Read one beat ahead.*) or, when bars tie, without a bar (*You missed 8 notes. Read one beat ahead.*); or
     the extra taps.
  4. The worst hold problem, e.g. "You let go of the dotted quarter in bar 2 too early".
  5. The tendency (only from 4+ hit notes). When the hit offsets are steady (SD ≤ 60 ms) and the device is not
     calibrated, it points to calibration instead of "press sooner" or "wait": *Your taps came on average 60 ms late,
     about the same on every note. That is often the speaker or headphones: calibrate once and it is taken off every
     score.* (early: *… Calibrate once and a steady offset like that is taken off every score.*)
  6. Misses (the same tie rule), extra taps, unsteady, then praise. A perfect run that offers Next lesson says *Every
     note perfect. On to the next lesson.* (a lesson fixes tempo and bars); free practice and the daily keep *Every
     note perfect. Try a faster tempo or more bars.*
- **Calibrate in the tip** (since 0.10.0): with the delay tip, or a rushing or dragging tip while the device is not
  calibrated (`prefs.calibratedAt` is null), the tip box shows a quiet **Calibrate** action (a ghost button with the
  metronome icon, titled *Measure the delay of your speaker or headphones*) under its text. It opens
  `#/calibrate?from=results`, which comes back to Results (§6.1).
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
  settings; on a phone (< 700 px) that row has no room, so it is a small muted link (13 px, 44 px target) at the very
  bottom, under the main buttons. A daily challenge's date line (*Oct 22 · same for everyone*) sits under the title,
  as on Round done.
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
- On a short screen (an 8-bar exercise, a 1280 × 800 laptop) Results scrolls and Listen, Retry and Next stay at the
  bottom, as Start does on Setup; the round summaries of Read notes and Scales do the same. A control that is scrolled
  or tabbed to (Calibrate in the tip) stays above those sticky actions (`scroll-padding-bottom`, since 0.10.0).

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

**Three learning paths (since 0.9.0).** The Path tab holds three paths, each with its own units, stars and Start
button: **Rhythm** (the units above; Learn chapters 1–7), **Read notes** (chapter 8) and **Keys** (chapters 9 and 10).
A switcher picks the path on phone and tablet, cards with a progress bar on desktop; the app remembers the last one
(`prefs.pathTrack`). The header counts the stars on every path. The switcher shows the full path names, *Rhythm ·
Read notes · Keys* (since 0.10.0; before, *Notes*, while Home, Learn and the setup said Read notes); below 390 px wide
it drops the glyphs so the names fit on one line.

| Path | Units |
|---|---|
| Read notes | 1 Treble clef · 2 Bass clef · 3 Both clefs · 4 Middle C and ledger lines · 5 Quick reading |
| Keys | 1 Sharps and flats · 2 G major · 3 F major · 4 Two and three sharps · 5 Two and three flats · 6 Mix the keys |

- A Read notes or Keys lesson is a Read notes preset (clefs, keys, mix keys, answer with, range, extra signs, notes,
  timer) on top of its unit's base (`src/game/notesPath.ts`), as a rhythm lesson is a rhythm preset. The preset is the
  whole setup: the player's own Read notes setup is left as it is.
- The rules are the same on every path (`src/game/track.ts`): two stars open the next lesson, and two stars on every
  lesson of a unit open the next unit. Rhythm and Read notes are open from the start; Keys opens with two stars on
  every Read notes unit 3 lesson. Until then its tab shows a lock and "Locked", its units are locked, and Start becomes
  "Go to Read notes".
- Results are kept per path in `progress.lessons`: rhythm under the lesson id ("7.3", as since 0.1), the others with
  the path in front ("notes:4.3", "keys:2.1").
- Every open unit is a button that opens and closes it (the current unit is open). An open unit shows its lessons by
  name: rows on phone, five tiles on tablet and desktop. A closed unit shows its lessons as stars; any open lesson can
  be played again. The current unit has no *Next: lesson …* line under it (since 0.10.0): its Start button already
  says it.
- A locked unit shows its title and a lock at the right of its row (screen readers hear *Locked*). What opens it is
  said once, under the first locked unit: *Opens with 2 stars on every unit N lesson*, or on a closed Keys path *Opens
  after Read notes unit 3* (since 0.10.0; before, every locked unit repeated it, 63 of the Path's 94 words on day one).
- In Dutch a path unit is a *blok* (*Blok 3 · Les 1 van 5*, *Blok 1 van 8*, *Leerpad, blokken 1, 3, 5*), so it is not
  confused with a Learn chapter, which stays a *hoofdstuk* (since 0.10.0, §11).
- A lesson round counts every note: skipping to the summary counts the notes left as missed, so a lesson cannot be
  passed on its first few notes. Play names the lesson; Quit goes back to the Path. Round done names the lesson and
  its unit, shows what the round did for the path (§6.4) and offers Next lesson once the lesson has two stars.
- Not yet: Home's Continue card follows the rhythm path only, and the Progress screen (§8.5) does not count the other
  paths.

### 8.3 Progression & rewards

- **XP** = base × difficulty × accuracy (+ bonus for no replays, max combo, 3 stars).
- **Levels / ranks** (e.g. *Tick → Count → Measure → Groove → Metronome → Maestro*).
- **Where XP and the level show** (since 0.10.0; before, Home had a block with the level, rank, *0 / 100 XP*, a bar and
  *100 XP to level 2*): on phone and tablet Home a **level chip** (*Level N* with a small gold ring for the XP into the
  level) sits beside the streak chip. It opens the **level sheet** (`LevelContent` in `ui/components/Reward.tsx`): the
  badge, *Level N · Rank*, the next rank (*Count at level 3*, or *The top rank*), the rank ladder, one XP bar with one
  label (*100 XP to level 2*) and Close. Escape also closes it, and focus returns to the chip. Desktop Home keeps its
  level card, with one label under the bar (§9).
- The **level-up sheet** after a result uses the same layout with the *Level up* eyebrow. Its line names the new rank
  (*New rank: up from Tick*), or else the next rank (*Count at level 3*), instead of *Up from level N*. Its bar fills
  the old level, then the new one, and only then shows its one label.
- **Streak** of practice days. MVP: one finished exercise with at least one note hit keeps it
  (as the Home card says); later a daily challenge or any 3 exercises.
- **Daily Challenge** (date-seeded, the same for everyone at the same unit of the rhythm path; §3.4).
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

**v1.6 · Flash cards and listen & write** adds *Test yourself* over all eleven Learn chapters (flip or choose from 3),
started from the Learn tab. It also adds dictation as a third practice mode (Tap · Listen · Echo) and a fourth Home tile.

Everything else on the full canvas comes after the MVP, including read notes, scales, flash cards, dictation, Learn,
Progress, XP and levels.

**Design scope: MVP vs later.** MVP is what v1 (milestones M1–M6) needs so that every loop
closes and every tab leads somewhere. All MVP screens are designed on the canvas.

| MVP (designed) | Later (nice to have, not designed yet) |
|---|---|
| Progress (rhythm / notes / scales; streak calendar, accuracy, skill map with *Practice weak spots*, tendency, achievements strip) | A dedicated Weak Spots mode screen (for now it is a practice-setup preset) |
| Settings (sound, timing leniency, tap & hold, counting syllables, notation style, theme) and Calibration (tap along with 16 clicks) | Echo mode play screen (reuses Play without notation) |
| Pause menu (sheet on phone and tablet, dialog on desktop) | Daily challenge intro and result variant (uses the normal Play and Results) |
| Results with Listen, Settings and the exercise code (copy) | A full achievements list and personal-best history |
| Level-up / achievement / personal-best moment after a result | Onboarding and day-one empty states |
| Round summaries for Read notes, Scales and Flash cards | Entering an exercise code to play a shared exercise |
| Working dictation (Listen & write) with check and feedback | Tablet and desktop versions of the remaining screens (path, setups, results, listen, scale exercises, flip cards) |
| Setup validation (unplayable time signatures, disabled Start) and the first-time How to play | |
| The unit boss on the Learning Path | |

**Breakpoints.** Phone < 700 px; tablet 700–1099 px; desktop ≥ 1100 px.
- A phone in landscape (height ≤ 560 px) lays the exercise screens (Play, Echo, Read notes, Scales, Calibration) out in
  two columns, so the pad or the answer buttons stay in view next to the notation (Scales: the staff and the degree row
  on the left, the piano or the sign buttons on the right).
- **Phone browsers** (since 0.10.0). In Safari or Chrome the toolbars take about 180 px of a phone's screen, so the
  sizes to check include the visible area: 390 × 664 (an iPhone 14 in Safari) and 375 × 553 (an iPhone SE in Safari),
  `phone-browser` and `phone-se-browser` in `e2e/helpers.ts`, next to the whole-screen sizes. The exercise screens
  must fit them without scrolling during play, with the pad, the piano and the answer buttons in view. On a short
  screen the empty space above the pad, the piano or the answer buttons shrinks first, then the staff.
- A touch-only screen at desktop width (a tablet in landscape) gets the desktop layout, without the keyboard hints
  (Esc, ?, the letter on each key).
- On tablet and desktop, the mobile bottom tab bar becomes a top header with the same items as the
  tab bar of that release (Home · Path · Settings in the MVP, + Learn from v1.2, + Progress from
  v1.5). The active item has the soft slate pill and `aria-current="page"`. Tablet keeps the icon
  with each word and puts the items on the right; desktop puts them right after the brand, as words
  only. There is no sidebar. A screen opened from a tab (the Scales hub from Home's practice tile, a
  Learn chapter) marks that tab as current; on phone it keeps the tab bar and adds a back arrow.
- Desktop Home has two columns (App design canvas, Desktop · Home): streak and level (with one label under the XP
  bar, *100 XP to level 2*; no *0 / 100 XP* since 0.10.0), the daily challenge and the learning path (unit N of M, a
  bar of all units, the lesson tiles, and the next lesson by its id: *Next: lesson 1.4 · A little faster · 80 BPM*)
  on the left; Continue (the lesson title over its staff) and the Free practice tiles on the right.
- A Learn chapter on desktop has the top header, a chapter list on the left and the chapter's
  sections as cards on the right (App design canvas, Desktop · chapter 5 page).
- Exercise screens swap that header for the exercise header: title, progress, and
  Pause / Quit. It has its own spacing (20 px × 40 px) and is not the tab header.
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
scroll the whole page on phones with the system scrollbar hidden.

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
| **Path** | Three learning paths (Rhythm, Read notes, Keys) behind a switcher; units as a vertical path that open to show their lessons by name, with stars and locks (§8.2). |
| **Progress** | Charts, skill map, achievements. |
| **Learn** | Topic list with read status and search; topic pages (mobile) and a full theory reference (desktop). |
| **Settings** | Language (English and Nederlands since 0.4; follows the device's language until one is picked; a segmented control for up to three languages, a drop-down list beyond that), sounds & volumes (one *Metronome* row, for its volume and on/off), calibration, timing leniency (in words, no milliseconds), input (tap & hold or tap only), notation style (common/strict), theme, beat counter style (digital: beat numbers light up; analog: a pyramid metronome whose pendulum reaches a side on every beat, stepping instead of swinging with reduced motion). |

**Home** (since 0.10.0). On phone and tablet the order is the brand or title, then the level and streak chips (they
wrap under the brand on narrow phones, and in Dutch on a new profile), Continue, the daily challenge and Free practice.
There is no XP block: XP, level and rank are in the level sheet that the chip opens (§8.3). The Continue card has the
lesson title over its staff and no meter, bars or BPM line (nor on desktop). When no rhythm lesson has been played,
it reads *Unit 1 · Lesson 1 of 5* with **Start lesson**; after that *Continue · Unit N · Lesson M of 5* with **Continue
lesson**. Continue is the only filled button on Home: the daily's Play is outlined (§3.4). On tablet the Continue card
and its staff keep their own height (about 110 px for one line of notes) and do not stretch to fill the screen; on a
phone the card still fills the screen. The lesson tiles show their stars as on the Path (§6.3).

**Settings** (since 0.10.0). Sound has one *Metronome* row (volume and on/off). The Display row for the digital or
analog look is *Beat counter* (nl *Telteller*), with the group label *Beat counter style*. The leniency hints describe
each level in words, with no milliseconds: Strict *Tight timing, for confident players.*, Normal *Fair timing for most
players.*, Relaxed *Wide timing, for young beginners.* Calibration is in §6.1.

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

**Practice links** start practice for the section straight away (since 0.10.0; before, they opened the setup, with
13 controls between the section and the exercise):
- Rhythm links start an exercise with the section's preset in Tap mode (Echo would hide the notation the section
  teaches). Tempo, bars and the metronome stay the player's, and hold follows the free-practice rule (§3.1).
- Read notes links start the round.
- Play, Results and Round done carry the section (`?from=8.3`). Quit and their back arrow (*Back to chapter 8*) return
  to it, and Retry, Next, New round and Practice missed notes keep it.
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

| Chapter | Sections | Practice |
|---|---|---|
| **1 · Pulse and meter** | 1.1 The beat and tempo (BPM, tempo words, ♩ = 80) · 1.2 Bars and time signatures (barlines, final barline, 2/4 3/4 4/4, C = common time) · 1.3 Strong and weak beats · 1.4 The upbeat (no practice yet) | Path units 1, 3, 5 |
| **2 · Note values** | 2.1 Reading the shape (from the quarter: half, whole, then eighth and sixteenth) · 2.2 The note tree | Path units 1, 3, 4, 8 |
| **3 · Rests** | 3.1 The five rests · 3.2 Writing rests correctly (centred whole-bar rest in any meter, half-rest placement, dotted rests, no ties) | Path units 2, 3, 5 |
| **4 · Dividing the beat** | 4.1 Eighths: 1 & 2 & (and the eighth rest) · 4.2 Sixteenths: 1 e & a (and eighth + two sixteenths) · 4.3 Beams show the beat | Path units 4, 5, 8 |
| **5 · Making notes longer** | 5.1 Ties (not slurs) · 5.2 Dotted notes (a dot as a shortcut for a tie) · 5.3 Dotted eighth + sixteenth | Path units 6, 7, 10 |
| **6 · Off the beat** | 6.1 Syncopation (eighth–quarter–eighth, quarter–half–quarter) | Path unit 9 |
| **7 · Beats in three** | 7.1 Triplets · 7.2 Six-eight (counted in two; *later*, no practice until 6/8 is playable) | Path units 11, 12 |
| **8 · Notes on the staff** | 8.1 The staff and two clefs (landmark notes) · 8.2 Treble clef (lines E G B D F, spaces F A C E) · 8.3 Bass clef (lines G B D F A, spaces A C E G) · 8.4 Middle C and ledger lines · 8.5 Two ways to name notes (C–B = do–si) | Read notes: clefs, range · Read notes path units 1–5 |
| **9 · Sharps, flats and naturals** | 9.1 The piano octave (groups of 2 and 3 black keys) · 9.2 Half steps and whole steps · 9.3 Sharp, flat and natural (two names for a black key; E♯ = F, C♭ = B) · 9.4 A sign lasts for the bar (same line or space, same octave) | Read notes: piano, extra signs · Keys path unit 1 |
| **10 · Key signatures** | 10.1 The key signature (every octave; a sign next to a note wins until the bar line) · 10.2 The order of sharps F C G D A E B and flats B E A D G C F (start with up to three signs) · 10.3 Naming the key · 10.4 Major and minor (relative minor) | Read notes: keys, mix keys · Keys path units 2–6 |
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
(up to 960 px) shows a chapter's sections in two columns, read down.

The bottom tab bar gains a **Learn** tab: Home · Path · Learn · Progress · Settings. The active tab is unmistakable: its icon sits in a slate-tint pill (#dfeaea, 56 × 30) and its label turns ink and bold, while the other tabs stay muted gray. It is marked `aria-current="page"` for screen readers.

### UX principles

- **One-thumb mobile**: primary actions at the bottom; tap pad is huge; no scroll during play.
- No accidental zoom/scroll during play (`touch-action: none` on the pad, Wake Lock on).
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
    notationText.ts     # rhythm written as text ('q [8 8] h') -> NotatedBar[]
  game/
    xp.ts  path.ts  achievements.ts  skills.ts  storage.ts
  ui/
    screens/ Home, Setup, Play, Dictation, Results, Path, Progress, Settings, Learn
    learn/ chapters.ts  # the Learn chapters as data (docs/ADDING-CONTENT.md); Blocks.tsx draws them
    components/ ...
  i18n/ en.json nl.json # every user-facing string, one catalog per locale (found automatically)
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
- High-contrast theme; big touch targets (≥ 48 px).
- Text contrast meets WCAG AA on its surface: at least 4.5:1 for text under 24 px (under 18.7 px if bold), 3:1 for
  larger text and for icons. Green text uses `--good-ink`: `--good` is 4.3:1 on paper, so it stays for fills, dots,
  borders and bars.

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

---

## 14. Theory sources

The music theory and notation rules in this document and in the app's Learn pages are
checked against published sources. The claim-by-claim list, with what was corrected, is in
[`THEORY-SOURCES.md`](THEORY-SOURCES.md). What the chapters should contain, compared with Dutch, Flemish and international courses, is in
[`LEARN-CHAPTERS.md`](LEARN-CHAPTERS.md).
