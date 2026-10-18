# Learn chapters 1–7: research and proposal

What the rhythm chapters (DESIGN.md §9.1, built in v1.2 and v1.7 on the canvas) should contain, checked against the
Learning Path lessons (`src/game/path.ts`), the boards on the MVP and release canvas, and real courses: Koen De Wolf's
*Allemaal nootjes*, Flemish academy courses (AMV / MCV), the Dutch HaFaBra A–C exams, ABRSM, Trinity, RCM, Kodály and
Open Music Theory.

Researched on 2026-10-18. Source labels as in `THEORY-SOURCES.md`: **V** read directly, **S** from a summary or a page
only partly readable, **U** not confirmed. Nothing here is in the app yet; claims that go into a chapter still get their
row in `THEORY-SOURCES.md`.

---

## 1. Summary

The current plan holds up. Every course puts pulse and meter, note values and rests first, then the divided beat, then
ties and dots, and leaves syncopation, triplets and compound meter for last. What the courses add, and the boards lack:

1. **The upbeat (*opmaat*)** is in every course: HaFaBra A, the Flemish first year, ABRSM grade 3, RCM level 3.
   Add it as **1.4**, explained without a practice link until the generator can start a piece on a pickup.
2. **Triplets belong with compound meter**, not with syncopation. Both are "a beat in three"; Kodály, Open Music Theory
   and the 3/8-to-6/8 research teach them together. Chapter 6 becomes syncopation only, chapter 7 becomes
   *Beats in three* (7.1 Triplets, 7.2 Six-eight). Path units do not move.
3. **Path unit 10 (dotted eighth + sixteenth) has no section.** Give it **5.3**, with the counting "1 (e &) a".
4. **Common time (C)** is ABRSM grade 1 and RCM level 1: one line and a picture in 1.2.
5. **Tie vs slur** is the classic mistake with ties: one line in 5.1.
6. **6/8 is counted in two**, with six as the slow-tempo help. Dutch HaFaBra booklets still count six eighths; the
   Flemish academy course, Kodály and the research count two dotted-quarter beats, as the canvas does.
7. **Chapter 2 should start from the beat note** (the quarter) and end with the note tree as a summary, not open with the
   whole note. That is the order Path unit 1 already uses.

Two things the research could not settle: the lesson order inside *Allemaal nootjes* (§2.1), and which counting
syllables Dutch and Flemish players expect (§4).

---

## 2. What the courses teach, and in which order

### 2.1 *Allemaal nootjes* (Koen De Wolf)

- A Flemish method for AMV, self-published by Koen De Wolf in four parts, one per year: deel 1 is "voor het eerste jaar
  AMV", deel 3 "voor het derde jaar AMV" (V, Crescendo shop). Each part has a leerlingenboek, a begeleidingsboek (piano
  accompaniments) and an oefenboek ("praktische oefeningen, opgebouwd per lesonderwerp"); the recordings are on the
  author's site. A French edition is *Vive les notes* (V, koen-dewolf.be/publicaties).
- Since the 2018 reform, the four AMV years of the old *lagere graad* are the four years of *Muzikale en Culturele
  Vorming* in the tweede graad, ages 8–12 (V, Wikipedia DKO; the mapping is our inference).
- The blurb promises that "alle muzikale onderwerpen worden progressief en volgens het leerplan behandeld", with "geen
  extremen in … ritmiek" (V). The author's site shows a child singing "Sol mi!", which suggests a song-first, Kodály-style
  start (V for the picture, U for the reading).
- **No table of contents, sample page or lesson list is online.** We did not reconstruct one. To align lesson by lesson,
  the books themselves are needed (deel 1–2 cover our chapters 1–6), or the author can be asked
  (koen-dewolf.be/contact).

What the leerplan behind it asks for (old OVSG AMV leerplan, lagere graad, 1997/1999; S): five strands, "metrum, ritme,
melodie, gehoorvorming, theorie"; rhythm in 2/4, 3/4 and 4/4 first, 6/8 later and not in year 1; 6/8 beaten "in twee
tellen" with the subdivision marked when needed; "benaming en duur van notenwaarden en rusttekens" together. The current
Flemish leerplannen (GO! 2022, OVSG 2026) list competences only and leave the year-by-year content to each academy (V).

### 2.2 A Flemish academy, first year

The clearest Flemish order found is the first-year course "Maat & ritme" of an academy in Wilrijk (V). Its order:

1. halve noot, kwartnoot · 2. achtsten · 3. halve rust, kwartrust · 4. zestienden · 5. achtste rust ·
6. gepunteerde kwart + achtste · 7. achtste + 2 zestienden · 8. gepunteerde achtste + zestiende · 9. opmaat ·
10. koppelteken (tie) · 11. syncope · 12. triool · 13. gepunteerde halve · 14. hele noot, hele rust · 15. 6/8

It counts with *ritmetaal*: TA, TO-HO (half), TI-TI, TIRI-TIRI, "TA –i TI" (dotted quarter + eighth), and in 6/8 TAI for
a dotted-quarter beat. Another Flemish school allows ritmetaal (ta, titi, tiritiri) in year 1 and forbids it in year 2,
where pupils read on "pam" while beating time (*maatslag*) (V, tijdvoormuziek.be).

### 2.3 The Netherlands: HaFaBra exams (KNMO / LKCA)

The *Raamleerplan blaasinstrumenten* (LKCA 2016, V) and the percussion plan (2010, V):

| Level | Rhythm theory |
|---|---|
| **A** | "hele, halve, kwart, achtste, zestiende noten en rusten en de waardeveranderingen door toevoeging van stip of verlengingsboog"; "maat, maatstreep, maatteken, maataccent, opmaat en zwaar-licht"; meters 2/4, 3/4, 4/4, **3/8, 6/8**, "2- en 3-deligheid". Dictation only in 2/4, 3/4, 4/4. Percussion adds "de triool op één tel". |
| **B** | 2/2 (alla breve), 6/4, 9/8, 12/8, 5/4, 7/8 …; "gepuncteerde figuren, syncopen en de antimetrische figuren duool en triool"; enkelvoudige/samengestelde, binaire/ternaire maatsoorten. |
| **C** | 3/2, 4/2, 2/8, 4/8; quadruplets, quintuplets, sextuplets, hemiolas. |

Two A-level theory booklets (V) put the topics in this order:

- *Theorie voor het HaFaBra examen A*: maat en ritme · notenwaarden · punt · maatsoorten · maatstrepen · maattekens ·
  tellen · **opmaat** · maataccenten.
- Amphion *theorieboek A*: notenwaarden en rusttekens · maat en ritme · maatsoorten · **opmaat** · rusten in maatsoorten
  · stip, fermate, overbindingsboog. The double dot is "nog niet voor A".

The sources disagree on triplets (percussion: A, wind: B).

### 2.4 International exams and methods

| Topic | ABRSM | Trinity | RCM | Kodály (Houlahan & Tacka) | Open Music Theory | Draft |
|---|---|---|---|---|---|---|
| Quarter, eighth, quarter rest | G1 | G1 | Prep | grade 1, first | Notating rhythm | 2–4 |
| Half note | G1 | G1 | Prep | grade 2 | same | 2 |
| Sixteenths | G1 | G2 | L3 | grade 3 | same | 4.2 |
| 2/4, 3/4, 4/4 | G1 | G1 | Prep–L1 | duple grade 1, triple grade 4 | Simple meter | 1.2 |
| Common time C | G1 | G1 | L1 | – | – | **missing** |
| Whole-bar rest | G1 | G1 | – | – | – | 3.2 |
| Ties | G1 | G2 | L1 | – | with dots | 5.1 |
| Dotted half | G1 | G1 | L1 | grade 4 | with ties | 5.2 |
| Dotted quarter + eighth | G1 | G2 | L2 | grade 4 | – | 5.2 |
| Dotted eighth + sixteenth | G1 | G3 | L3 | grade 4 | – | **no section** |
| Beaming | G1 | G1 | L2 | – | Beaming | 4.3 |
| Syncopation | (G6) | G2 | – | grade 4 | after compound | 6.1 |
| Triplets | G2 | G3 | L4 | grade 5, with compound | after compound | 6.2 |
| Upbeat (anacrusis) | G3 | G3 | L3 | grade 3 | with simple meter | **missing** |
| 6/8 | G3 | G3 | L5 | grade 5 | own chapter | 7.1 |
| Repeat signs, fermata, metronome mark | G1 | G1–G2 | L1–L2 | – | – | – |

Sources: ABRSM theory specification 2023, Trinity theory syllabus, RCM learning objectives and 2016 syllabus, *Kodály
Today* and the grade 4–5 volumes, Open Music Theory 2e, musictheory.net lesson list (all V). Details in §6.

### 2.5 What teaching research says

- **Start from common patterns, not the note tree.** *Kodály Today* contrasts the older way ("a whole note receives four
  beats", then divide) with starting from the quarters and eighths of children's songs (V).
- **Sound before sign.** Takadimi (Hoffman, Pelto & White 1996) and Gordon's Music Learning Theory start from hearing
  and moving; syncopation can be felt long before it is read (V / S). The game already does this: the player taps before
  reading any Learn page.
- **6/8 is felt in two.** Students hearing 6/8 "almost overwhelmingly tap or conduct two beats"; counting the eighths as
  beats ("123456") is the thing to avoid; triplets in simple meter and 3/8 are good steps towards it (Telesco, V).
- **Counting systems.** A small study (Janssen 2017, V) found no difference between Takadimi, "1 e & a" and
  "1 ta te ta"; older studies found "1 e & a" weakest in triple subdivisions (S).
- **Ties before dots** is a sensible explanation (a dot is a shortcut for a tie) but no course requires the order:
  ABRSM lists both in G1, Trinity even has the dotted half (G1) before ties (G2), and the Dutch plans name "stip of
  verlengingsboog" together. Keep it, labelled a teaching convention as `THEORY-SOURCES.md` already does.
- **Dotted quarter + eighth** is hard because it combines a lengthened and a divided beat; it should follow secure
  eighths (S, Dalby via MRA). The Path already does this (unit 4 before unit 7).

---

## 3. Proposed chapters 1–7

Each row keeps the canvas's chapter page layout: intro, sections with counted notation, an *In the game* tip, a
*Practice* link, a quick check, previous / next. **New** marks content the boards do not have yet; it needs a board
before it is built (CLAUDE.md, *Designs first*).

### Chapter 1 · Pulse and meter — Path units 1, 3, 5

| Section | Content | Notes |
|---|---|---|
| 1.1 The beat and tempo | Beat = the pulse you tap your foot to; BPM; tempo words table. **New:** the metronome mark ♩ = 80, as on the Practice setup. | As on the board. Metronome mark: ABRSM G1, Trinity G2. |
| 1.2 Bars and time signatures | Bar, barline, final barline; top number = beats, bottom = beat note; 2/4, 3/4, 4/4 counted. **New:** C means 4/4 (common time). | C: ABRSM G1, RCM L1, HaFaBra A booklets. Cut time ¢ waits for 2/2 support (HaFaBra B, ABRSM G2). |
| 1.3 Strong and weak beats | S W / S W W / S W M W. | As on the board (*maataccent*, *zwaar-licht* in HaFaBra A). |
| **1.4 The upbeat** (new) | A piece can start before beat 1: the notes before the first full bar are the upbeat, counted from the end of the bar ("4 \| 1 2 3 4"). The last bar is usually short by the same amount. No practice link yet. | Every course: HaFaBra A, Flemish year 1, ABRSM G3, RCM L3. The game's exercises always start on beat 1, so it explains without practice, as chapter 7 does on the board. |

Quick check (board): "How many beats does a bar of 3/4 have?" 2 / **3** / 4.

### Chapter 2 · Note values — Path units 1, 3, 4, 8

| Section | Content | Notes |
|---|---|---|
| 2.1 Reading the shape | Open or filled head, stem, flags, beams. **Order changed:** start from the quarter (one beat, the note of Path unit 1), then the half (two quarters) and the whole (two halves), then the eighth and sixteenth as halves of the beat. | Kodály: from the beat note, not from the whole note. Matches Path units 1 → 3 → 4 → 8. |
| 2.2 The note tree | The tree as the summary of 2.1: each row one 4/4 bar, whole 4 · half 2 · quarter 1 · eighth ½ · sixteenth ¼. Keep the Notes \| Rests toggle. | As on the board. |

The chapter 2 board is the older layout (no meta line, one practice button, no previous / next cards); redraw it like the
v1.7 chapters before building. Quick check (board): "How many eighth notes fit in one half note?" 2 / **4** / 8.

### Chapter 3 · Rests — Path units 2, 3, 5

| Section | Content | Notes |
|---|---|---|
| 3.1 The five rests | Each rest next to its note, with beats; whole rest hangs from line 4, half rest sits on line 3; keep counting through rests (grey brackets). **Add:** in the game, let go when a note ends; a rest is time with nothing pressed. | As on the board. Hangs / sits is the common mistake (Open Music Theory). |
| 3.2 Writing rests correctly | One centred whole rest for a silent bar *in any meter*; keep beat 3 visible in 4/4; dotted rests only inside a beat; rests are never tied. | As on the board. Whole-bar rest in 3/4: ABRSM and Trinity G1, Amphion A. |

Quick check (board): "A bar of 3/4 is completely silent. How do you write it?" **One whole rest, centred**.

### Chapter 4 · Dividing the beat — Path units 4, 5, 8

| Section | Content | Notes |
|---|---|---|
| 4.1 Eighths: 1 & 2 & | Two eighths per beat; the eighth rest on the "&" (Path unit 5). | Add unit 5 to the meta line: it brings the eighth rest. |
| 4.2 Sixteenths: 1 e & a | Four sixteenths; **add** the two mixed figures Path unit 8 practises: eighth + two sixteenths "1 & a", two sixteenths + eighth "1 e &". | The Flemish course and Path unit 8 (lessons 3–4) both teach these as separate figures. |
| 4.3 Beams show the beat | One beam per beat; four eighths may share a beam on beats 1–2 or 3–4, never across 2–3; quarters never beamed. | As on the board. |

Quick check (board): never beam over **beats 2–3**.

### Chapter 5 · Making notes longer — Path units 6, 7, 10

| Section | Content | Notes |
|---|---|---|
| 5.1 Ties | A tie joins two notes of the same pitch into one sound; across the barline and to keep beat 3 visible. **Add:** a curve between *different* notes is a slur, not a tie (on the one-line rhythm staff every curve is a tie). | Tie vs slur: the common mistake (Open Music Theory). |
| 5.2 Dotted notes | A dot adds half the value; dotted half 3 beats (Path unit 7 starts here, in 3/4); dotted quarter + eighth counted "1 (2) & 3". | As on the board. |
| **5.3 Dotted eighth + sixteenth** (new) | The beat split as ¾ + ¼, counted "1 (e &) a"; compared with "1 & " and "1 e & a" in one beat grid; the reversed figure (sixteenth + dotted eighth). | Path unit 10. ABRSM G1, Trinity G3, the Flemish course's "gepunteerde achtste + zestiende". |

Quick check (board): a dotted quarter sounds like a **quarter tied to an eighth**.

### Chapter 6 · Off the beat — Path unit 9

| Section | Content | Notes |
|---|---|---|
| 6.1 Syncopation | A note starts on a weak beat or an "&" and holds over a stronger one. Start with the two figures Trinity G2 names: eighth–quarter–eighth ("1 & (2) &") and quarter–half–quarter. Show that the same sound can be written with a tie. | As on the board, narrowed to the common figures first. |

Triplets move to chapter 7. Quick check (board): eighth, quarter, eighth from beat 1: the quarter starts **on the "&" of
beat 1**.

### Chapter 7 · Beats in three — Path units 11, 12 (was *Compound meter*, unit 12)

| Section | Content | Notes |
|---|---|---|
| 7.1 Triplets (moved from 6.2) | Three equal notes in the time of two, "1 trip let", against "1 &" in one grid. Practice link (the generator has triplets). | Kodály and Open Music Theory teach triplets with compound meter; Telesco: triplets lead to 6/8. |
| 7.2 Six-eight | Six eighths, two beats of a dotted quarter; count "1 & a 2 & a", the same three-in-a-beat as 7.1; "same six eighths, two meters" (3/4 vs 6/8); at a slow tempo you may count all six eighths. No practice link until 6/8 is playable. | As on the board. HaFaBra A already has 3/8 and 6/8, so Dutch players meet it early. |

Quick check: "How many beats are in one bar of 6/8?" **2** / 3 / 6.

### Not in chapters 1–7

Repeat signs, first and second endings, fermata, dynamics and D.C. / Fine are grade-1 signs in every exam, but they are
not rhythm and the game cannot play them. They fit a later chapter on reading a score, or flash cards. The double dot,
duplets, 2/2, 3/8, 9/8 and 12/8 are HaFaBra B or ABRSM G2–G3 and stay out of the first seven chapters.

---

## 4. Counting syllables

| Where | Eighths | Sixteenths | Triplets | Source |
|---|---|---|---|---|
| English (the app now) | 1 & 2 & | 1 e & a | 1 trip let | Open Music Theory (V) |
| Netherlands, instrumental and HaFaBra | 1 en 2 en (HaFaBra A booklet: "1 e 2 e", said "eene, tweeje") | 1 e en a | disagree: "1 en a", "een-e-te", "trip-o-let" | HaFaBra A booklet, NL teaching sites (V / S) |
| Netherlands, primary school | ta, ti-ti | – | – | groep 5 workbook (V) |
| Flanders, academy year 1 | TI-TI (TA = quarter, TO-HO = half) | TIRI-TIRI | TI-TI-TI in 6/8 | Wilrijk course (V), tijdvoormuziek.be (V) |

Recommendation: keep "1 & / 1 e & a / 1 trip let" in English. For the Dutch translation use "1 en 2 en" and
"1 e en a". Make the syllables a setting, as DESIGN.md §13 already proposes, with *ritmetaal* (ta, ti-ti, tiri-tiri) as
the second option, since Flemish beginners and Dutch primary schools use it. This also answers open question 2 in §13:
there is no single Dutch standard, but numbers dominate in the Netherlands and ritmetaal in the first Flemish year.

## 5. Dutch terms for the later translation

| English | Dutch | Notes |
|---|---|---|
| beat, pulse | tel, puls | |
| bar, barline, final barline | maat, maatstreep, slotstreep | double barline: dubbele maatstreep |
| time signature | maatsoort; the sign: maatteken | *maatcijfer* not found in the sources |
| strong / weak beat | zware / lichte tel, maataccent, zwaar-licht | |
| upbeat | opmaat | |
| quarter note, eighth rest … | kwartnoot, achtste rust … | hele, halve, kwart, achtste, zestiende noot / rust |
| flag, beam | vlag, balk | |
| tie | overbindingsboog, verlengingsboog (NL); koppelteken (Flemish course) | |
| dot, dotted | punt / stip; gepunteerd (NL also gepuncteerd) | |
| syncopation, triplet | syncope, triool | |
| duple / triple division | tweedelig (binair) / driedelig (ternair) | |

**Warning:** Dutch *enkelvoudige / samengestelde maatsoort* is not English simple / compound. *Samengesteld* means built
from several accent groups, so Dutch booklets call 4/4 "samengesteld, tweedelig" (V, HaFaBra A booklet,
nl.wikipedia *Maatsoort*). The English *compound meter* is closest to *ternaire* (*driedelige*) *maatsoort*. Chapter 7's
Dutch title should not be "Samengestelde maatsoort".

---

## 6. Sources

Allemaal nootjes and Flanders
- Koen De Wolf, publicaties and audio: https://www.koen-dewolf.be/publicaties/, https://www.koen-dewolf.be/listen-or-download/
- Crescendo, *Allemaal nootjes* deel 1, deel 3, oefenboek deel 2: https://www.crescendo-music.com/en_GB/shop/43271-allemaal-nootjes-deel-1-leerling-46012, https://www.crescendo-music.com/en_GB/shop/48170-allemaal-nootjes-deel-3-leerling-50651, https://www.crescendo-music.com/en_GB/shop/55570-allemaal-nootjes-deel-2-oefenboek-57596
- Deeltijds kunstonderwijs: https://nl.wikipedia.org/wiki/Deeltijds_kunstonderwijs
- GO! leerplan DKO muziek tweede graad (2022): https://pro.g-o.be/download/GOPRO-1830562155-18697/Leerplan%20DKO%20tweede%20graad%20muziek
- OVSG leerplan muziek (2026): https://dkokompas.ovsg.be/dk0olo0kd/assets/files/leerplan_muziek.pdf
- Old OVSG AMV leerplan (S): https://adoc.pub/algemene-muzikale-vorming.html
- Wilrijk academy, L1 "Maat & ritme": https://amapledoesntvoice.weebly.com/uploads/5/2/5/4/5254538/l1v_maat__ritme.pdf
- Tijd voor muziek, notenleer jaar 1 and 2: https://www.tijdvoormuziek.be/notenleer/jaar-1-sem-2, https://www.tijdvoormuziek.be/notenleer/jaar-2-sem-2

Netherlands
- LKCA *Raamleerplan blaasinstrumenten* (2016): https://www.lkca.nl/~/media/downloads/publicaties/raamleerplannen/raamleerplan_blaasinstrumenten.pdf
- LKCA rhythm appendices A and B: https://www.lkca.nl/wp-content/uploads/2020/02/beAeMR1.pdf, https://www.lkca.nl/wp-content/uploads/2020/02/beBeMR1.pdf
- *Raamleerplan slagwerkopleidingen* (2010): https://www.dmpnet.nl/image/catalog/pdf/Raamleerplan.pdf
- *Theorie voor het HaFaBra examen A*: https://www.lesinzinder.nl/2018/leerlingen/docs/HAFA_A.pdf
- Amphion *theorieboek A*: https://www.amphion.nl/site/assets/files/9088/theorieboek_a.pdf
- KNMO exams: https://www.knmo.nl/doelgroepen/educatie-jeugdbeleid/landelijk-examenbureau-en-diplomastelsel/
- Maatsoort: https://nl.wikipedia.org/wiki/Maatsoort
- Groep 5 workbook: https://muziekles4kids.nl/wp-content/uploads/2023/01/Muziekwerkboek-groep-5-Alles-is-een-instrument-Periode-1-Module-1.pdf
- Ritme lezen: https://onlinepianolerenspelen.nl/ritme-lezen

International and research
- ABRSM Music Theory Qualification Specification (2023): https://www.abrsm.org/sites/default/files/2023-09/Music%20Theory%20Qual%20Spec%20April%202023%20[2023%20rebrand].pdf
- Trinity Theory of Music syllabus: https://www.trinitycollege.com/resource/?id=2886
- RCM learning objectives Prep–Level 4: https://admin.rcmusic.com/sites/default/files/digital-learning/theory/learning-objectives-prep-to-4.pdf
- RCM Theory Syllabus 2016 highlights: https://admin.rcmusic.com/sites/default/files/files/RCM-Theory-Syllabus-2016-Highlights.pdf
- Open Music Theory 2e, Rhythm and meter: https://viva.pressbooks.pub/openmusictheory/part/rhythm-and-meter/
- musictheory.net lessons: https://www.musictheory.net/lessons
- Houlahan & Tacka, *Kodály Today* (preview): https://api.pageplace.de/preview/DT0400.9780190236137_A25423973/preview-9780190236137_A25423973.pdf
- Hoffman, Pelto & White, "Takadimi" (JMTP 1996): https://www.takadimi.net/documents/TakadimiArticle.pdf
- Telesco, "Teaching 3/8 as a Prelude to Teaching 6/8": https://journals.ou.edu/jmtp/ojs/ejournal/article/download/904/1795/1815
- Janssen (2017), counting systems study: https://krex.k-state.edu/server/api/core/bitstreams/d26c8c6b-8236-4480-b9ee-a2f16456fe4d/content
- Dotted rhythms (S): https://mramusicplace.net/2016/04/21/why-are-dotted-rhythms-such-a-problem/
