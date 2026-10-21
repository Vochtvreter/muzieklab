# Music theory sources and fact check

Every music theory or notation claim that Muzieklab presents (Learn pages, generator rules,
feedback text) is listed here with its source. Status:

- **Verified**: matches the cited source as written.
- **Corrected**: the earlier design was wrong or overstated; the fix is described.
- **Convention**: sources agree it is common practice, but details vary; the app says so.
- **Design choice**: a game decision, not a theory claim; listed so it isn't mistaken for one.

Checked on 2026-10-15. Online sources were read directly. For the printed books marked
*standard reference* we rely on secondary sources that cite them; their wording was not
checked page by page.

---

## Pulse and bars (chapter 1)

| Claim | Status | Source |
|---|---|---|
| The beat is the basic unit of time, the steady pulse you would tap your foot to | Verified | [Wiki-Beat] |
| The downbeat (beat 1) is the strongest; in 4/4 beats 2 and 4 are weak | Verified | [Wiki-Beat], [OMT] |
| Barlines divide music into bars (measures); a thin line followed by a thick one ends a piece | Verified | [Wiki-Bar] |
| At 60 BPM there is one beat per second | Verified (definition of BPM) | — |
| A metronome mark (♩ = 80) gives the tempo in beats per minute of the note shown | Verified | [Wiki-Tempo] |
| C (common time) is another way to write 4/4 | Verified | [Wiki-TimeSig] |
| "Beat 1" metronome: clicks only on the downbeat, the player keeps the other beats | Design choice (the existing Accent setting) | — |

## Reading notes and keys (chapters 8–10, Read notes mode)

| Claim | Status | Source |
|---|---|---|
| Treble clef = G clef: its curl marks line 2 as G4 (the G above middle C) | Verified | [Wiki-Clef], [MTN-Staff] |
| Bass clef = F clef: its two dots mark line 4 as F3 (the F below middle C) | Verified | [Wiki-Clef], [MTN-Staff] |
| Middle C (C4) sits on one ledger line below the treble staff and one above the bass staff | Verified | [MTN-Staff] |
| Ledger lines extend the staff for notes above or below it | Verified | [MTN-Staff] |
| Treble lines E G B D F, spaces F A C E; bass lines G B D F A, spaces A C E G | Verified | [Dummies-Staff], [MTP-Mnemonics] |
| Read from landmark notes (treble G, bass F, middle C) by step; memory aids as a help that is dropped later | Convention: common piano teaching; little research on how notation reading is learned | [Pianodao-Mnemonics], [Musicnotes-Read] |
| Memory aids ("Every Good Boy Does Fine", "FACE", "Good Boys Do Fine Always", "All Cows Eat Grass") | Convention: many variants exist; shown as optional aids | [MTP-Mnemonics] |
| Fixed do: do re mi fa sol la si are the note names C D E F G A B | Verified | [Wiki-Solfege] |
| "ti" replaced "si" in English use (Sarah Glover, 19th century) | Verified | [Wiki-Solfege] |
| An octave on the piano has 7 white and 5 black keys; black keys are the sharps/flats (C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭) | Verified | [Wiki-Keyboard] |
| Black keys come in groups of two and three; C is the white key just left of the group of two | Verified (standard piano teaching) | [KeyNotes-Layout] |
| A sharp raises a note to the very next key on the right, a flat lowers it to the next key on the left | Verified (a semitone; follows from the keyboard layout) | [Wiki-Keyboard] |
| E–F and B–C are half steps with no black key between them; a whole step is two half steps | Verified | [Wiki-Major], [Wiki-Keyboard] |
| Half and whole steps are taught before or with sharps, flats and naturals | Convention: Flemish AMV course, Amphion A, RCM level 1 | [Wilrijk-AMV], [Amphion-A], [RCM-LO] |
| A sign can land on a white key: E♯ sounds as F, C♭ as B | Verified (follows from the keyboard layout: the next key right of E is F, left of C is B) | [Wiki-Keyboard] |
| "On the staff" = 11 positions per clef (5 lines, 4 spaces, the space just outside each end) | Design choice for the Range setting | — |
| Computer-keyboard piano layout A S D F G H J / W E T Y U | Convention used by many music apps; a design choice | — |
| A key signature applies to every note on its line or space, in every octave, for the rest of the piece | Verified | [Wiki-KeySig] |
| Sharps are added in the order F C G D A E B, flats in the order B E A D G C F; up to seven of each | Verified | [Wiki-KeySig] |
| There are 15 standard key signatures (none, 1–7 sharps, 1–7 flats) | Verified | [Wiki-KeySig] |
| Sharp keys: the major key is a semitone above the last sharp (F♯ → G major). Flat keys: the second-to-last flat names the major key (B♭ E♭ → B♭ major); one flat is F major | Verified | [MT21C-KeySig] |
| Each major key shares its key signature with its relative minor (G major / E minor) | Verified | [Wiki-KeySig], [MT21C-KeySig] |
| An accidental applies to its note and to later notes on the same position until the bar line; a natural cancels a sharp or flat | Verified | [Wiki-Accidental] |
| An accidental holds only in its own octave: the same letter an octave away needs its own sign | Convention: modern practice and the Dutch and Flemish courses; some older notation applied it across octaves | [Amphion-A], [Wilrijk-AMV], [Wiki-Accidental] |
| Start with key signatures of up to three sharps or flats | Convention: HaFaBra A reads up to 3♯ / 3♭, ABRSM grades 1–3 reach 4 | [LKCA-Blaas], [ABRSM-Outline] |
| One whole note per bar in Read notes, so an accidental never carries to the next note | Design choice (follows from the rule above) | — |
| Mix keys: a new key every 5 notes, announced first | Design choice | — |

## Scales (chapter 11, Scales mode)

| Claim | Status | Source |
|---|---|---|
| A half step (semitone) is the next key on the piano; a whole step is two half steps | Verified | [Wiki-Major], [Wiki-Keyboard] |
| Major scale step pattern: W W H W W W H | Verified | [Wiki-Major] |
| C major is the only major scale with no sharps or flats (white keys only) | Verified | [Wiki-Major] |
| Each letter is used once in a major or minor scale, so G major has F♯ (not G♭) | Verified (diatonic spelling) | [Wiki-Major], [MT21C-KeySig] |
| The sharps or flats of a major scale are its key signature | Verified | [Wiki-KeySig] |
| Clockwise on the circle of fifths each key adds a sharp; anticlockwise each adds a flat | Verified | [Wiki-CoF] |
| B/C♭, F♯/G♭ and C♯/D♭ are enharmonic keys at the bottom of the circle; 15 key signatures | Verified | [Wiki-CoF], [Wiki-KeySig] |
| Natural minor uses the notes of its relative major from the 6th degree (A minor = C major from A); pattern W H W W H W W | Verified | [Wiki-Minor] |
| Harmonic minor raises the 7th degree, giving an augmented second (1½ steps) between 6 and 7 | Verified | [Wiki-Minor] |
| Melodic minor raises the 6th and 7th ascending and uses natural minor descending | Verified | [Wiki-Minor] |
| Degree names: tonic, supertonic, mediant, subdominant, dominant, submediant, leading tone | Verified | [Wiki-Major] |
| The 7th a whole step below the tonic is called the subtonic | Verified | [Wiki-Subtonic] |
| The dominant is next in importance after the tonic | Verified | [Wiki-Dominant] |
| Movable do (do = degree 1) exists alongside fixed do | Verified; the app uses fixed do | [Wiki-Solfege] |
| An interval's number counts the letters from the lower note, both ends included (C–E a 3rd, C–G a 5th, C–C an octave) | Verified | [Wiki-Interval] |
| The tonic triad is degrees 1, 3 and 5 sounding together: C E G in C major, A C E in A minor | Verified (a triad stacks thirds: root, third, fifth) | [Wiki-Triad] |
| G♯, D♯ and A♯ harmonic minor raise a sharp 7th to a double sharp (F𝄪, C𝄪, G𝄪) | Verified (raised 7th, each letter once) | [Wiki-Minor], [Wiki-Accidental] |
| Letters given, player picks the sign (spelling drill); stars by mistakes | Design choice | — |

## Note values and rests

| Claim | Status | Source |
|---|---|---|
| Whole = 4 beats, half = 2, quarter = 1, eighth = ½, sixteenth = ¼ in 2/4, 3/4, 4/4 (quarter-note beat) | Verified | [OMT] |
| Each flag or beam halves the value; quarters are never beamed | Verified | [OMT] |
| Dutch names: hele, halve, kwart-, achtste, zestiende noot / rust (used by the Dutch translation since 0.4) | Verified | [NL-Nootwaarde], [NL-Rust] |
| A dot adds half the value (dotted half 3, dotted quarter 1½, dotted eighth ¾); also on rests | Verified | [Wiki-Dotted], [NL-Rust], [Wiki-Rest] |
| A dotted note equals the note tied to one of half its value (dotted quarter = quarter tied to eighth) | Verified | [Wiki-Dotted] |
| A completely empty bar gets one whole rest, **centred**, in any time signature | **Corrected**: the rest tree drew it on beat 1; now centred | [Wiki-Rest], [MMT-Rests] |
| Whole rest hangs below the line, half rest sits on it | Verified (standard engraving) | [Gould] *standard reference* |
| In 4/4 a two-beat rest only on beat 1 or 3; on beat 2 use two quarter rests | Verified | [MMT-Rests] |
| In simple meters, dotted rests only when shorter than one beat | **Corrected**: was "dotted rests avoided in simple meters" | [MMT-Rests], [Wiki-Rest] |
| Rests are not tied | Verified (a tie joins two notes of the same pitch) | [OMT] |
| On the one-line staff the whole rest hangs below the line and the half rest sits on it | Design choice of the renderer, drawn so the hang / sit difference of the five-line staff stays visible | — |
| The note tree: each row one bar of 4/4, each value half the one above | Verified | [OMT] |

## Meter, beaming, ties

| Claim | Status | Source |
|---|---|---|
| Simple meter: top number = beats per bar, bottom number = note value of the beat | **Corrected**: now says "in simple meters" (6/8 works differently) | [OMT] |
| Beat 1 (downbeat) is strongest; in 4/4 beat 3 is next strongest | Verified | [OMT], [MMT-Beam], [GTTM] *standard reference* |
| 2/4 = strong-weak, 3/4 = strong-weak-weak, 4/4 = strong-weak-medium-weak | Verified | [GTTM], [MMT-Beam] |
| "2/4: marches", "4/4: most pop music" | **Removed**: genre generalisations without a source. "The waltz is in 3/4" kept. | — |
| 6/8 is compound: two dotted-quarter beats, each split into three eighths | Verified | [OMT-Compound] |
| Beam by beat; never beam across beats 2–3 in 4/4 | Verified | [OMT], [MMT-Beam] |
| Four eighths may be beamed as a half-bar group in 4/4 | Convention: accepted alternative; app default beams per beat | [Gould] *standard reference* |
| In 4/4 a note must not hide the middle of the bar; it is split with a tie | Verified | [MMT-Beam], [Gould] |
| Play-screen exercise had a dotted quarter on beat 2 of 4/4, crossing beat 3 | **Corrected**: exercise now starts with dotted quarter on beat 1 | [MMT-Beam] |
| Quarter–half–quarter syncopation spelled with a tie by default | **Corrected**: default changed from "common" to "strict"; the simplified spelling is a teacher option | [MMT-Beam] |
| A tie joins two notes of the same pitch into one sound; tap only the first | Verified | [OMT] |
| A slur joins different notes, which are played "without separation"; on the one-line staff every curve is a tie | Verified; the second half follows from a one-line staff having one pitch | [Wiki-Slur] |

## Counting, syncopation, triplets

| Claim | Status | Source |
|---|---|---|
| Beats counted 1 2 3 4; eighths "&"; sixteenths "e & a" ("a" said "uh") | Verified | [OMT] |
| Pronunciation of "1 e & a" as "one-ee-and-uh" ("e" said "ee") | Convention: [OMT] gives "uh" for "a" but no pronunciation for "e"; "ee" is the usual reading of the syllable | [OMT] |
| This is one counting system; Dutch teaching often uses "1 en 2 en" | Convention: the Learn page says teachers may use other syllables; syllables become a setting | open question in DESIGN §13 |
| Syncopation = a note on a weak position followed by silence or a held note on a stronger position | Verified | [LHL], [Huron] *standard references*, as summarised in [Frontiers-2024] |
| Triplet = three equal notes in the time of two of the same value; "1-trip-let" | Verified (definition); syllable is a common convention | [OMT] |
| Eighth–quarter–eighth and quarter–half–quarter as the first syncopations | Convention: the figures Trinity grade 2 names; the generator's syncopation cells | [Trinity-Theory] |
| Counting under the notes: the beat and its "&" always, "e", "a", "trip", "let" where a note or rest starts; held and silent counts in brackets, so dotted eighth + sixteenth is "1 (&) a" and eighth + two sixteenths "1 & a" | Convention: brackets for held counts are common in teaching material and on the canvas boards; which held syllables to show varies by teacher | — |

## Tempo

| Claim | Status | Source |
|---|---|---|
| Largo 40–60, Adagio 66–76, Andante 76–108, Moderato 108–120, Allegro 120–156, Presto 168–200 BPM | **Corrected**: earlier values (Moderato 96, Allegro to 160) did not match published tables | [HMT-Metronome] |
| Tempo words are traditions, not exact numbers; they vary by composer and source | Verified | [Ewell-Tempo] |

## Generator and timing (design choices backed by research)

| Claim | Status | Source |
|---|---|---|
| Metric weights 4/0/1/0/2/0/1/0/3/… in 4/4 | Verified (encodes the metrical hierarchy) | [GTTM] |
| Syncopation score = weight(strong) − weight(weak) | Verified | [LHL], formalised in [Fitch-Rosenfeld] |
| Ties taught before dotted notes; dot explained as a tie shortcut | Convention: common teaching approach | [MRA-Dotted], [MMF-Dotted] |
| Dotted quarter + eighth is hard because it combines a lengthened and a divided beat | Verified | [MRA-Dotted] |
| People tapping to a beat land tens of ms early on average (negative mean asynchrony) | Verified | [Repp-2005], [Repp-Su-2013] |
| Results tip said "rushing by 18 ms" | **Corrected**: 18 ms is within normal anticipation; tendency tip now only beyond about −40 ms | [Repp-2005] |
| Perfect ≤ 35 ms, Great ≤ 70, Good ≤ 120 | Design choice, to tune in playtesting | — |

---

## References

- **[OMT]** Gotham, M., Gullings, K., Hamm, C., Hughes, B., Jarvis, B., Lavengood, M., & Peterson, J. *Open Music Theory*, 2nd ed., "Simple Meter and Time Signatures" and following rhythm chapters. https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/01%3A_Fundamentals/1.09%3A_Simple_Meter_and_Time_Signatures
- **[OMT-Compound]** Gotham, M. et al. *Open Music Theory*, 2nd ed., "Compound Meter and Time Signatures". https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/01%3A_Fundamentals/1.10%3A_Compound_Meter_and_Time_Signatures
- **[Wiki-Clef]** "Clef". Wikipedia. https://en.wikipedia.org/wiki/Clef
- **[MTN-Staff]** musictheory.net, "The Staff, Clefs, and Ledger Lines". https://www.musictheory.net/lessons/10
- **[Dummies-Staff]** "Size Up the Staff: How to Read Treble and Bass Clef". Dummies. https://www.dummies.com/article/academics-the-arts/music/instruments/piano/size-up-the-staff-how-to-read-treble-and-bass-clef-155363
- **[MTP-Mnemonics]** Music Theory Practice, "Clef Mnemonics". https://music-theory-practice.com/reference/clef-mnemonics
- **[Wiki-Solfege]** "Solfège". Wikipedia. https://en.wikipedia.org/wiki/Solf%C3%A8ge
- **[Wiki-Keyboard]** "Musical keyboard". Wikipedia. https://en.wikipedia.org/wiki/Musical_keyboard
- **[KeyNotes-Layout]** Key-Notes, "Layout of piano keys". https://www.key-notes.com/blog/layout-of-piano-keys
- **[Wiki-KeySig]** "Key signature". Wikipedia. https://en.wikipedia.org/wiki/Key_signature
- **[MT21C-KeySig]** Hutchinson, R. *Music Theory for the 21st-Century Classroom*, "Major Key Signatures". https://musictheory.pugetsound.edu/mt21c/MajorKeySignatures.html
- **[Wiki-Major]** "Major scale". Wikipedia. https://en.wikipedia.org/wiki/Major_scale
- **[Wiki-Minor]** "Minor scale". Wikipedia. https://en.wikipedia.org/wiki/Minor_scale
- **[Wiki-CoF]** "Circle of fifths". Wikipedia. https://en.wikipedia.org/wiki/Circle_of_fifths
- **[Wiki-Subtonic]** "Subtonic". Wikipedia. https://en.wikipedia.org/wiki/Subtonic
- **[Wiki-Dominant]** "Dominant (music)". Wikipedia. https://en.wikipedia.org/wiki/Dominant_(music)
- **[Wiki-Interval]** "Interval (music)". Wikipedia. https://en.wikipedia.org/wiki/Interval_(music)
- **[Wiki-Triad]** "Triad (music)". Wikipedia. https://en.wikipedia.org/wiki/Triad_(music)
- **[Wiki-Accidental]** "Accidental (music)". Wikipedia. https://en.wikipedia.org/wiki/Accidental_(music)
- **[Amphion-A]** Amphion, *Theorieboek A* (HaFaBra A). https://www.amphion.nl/site/assets/files/9088/theorieboek_a.pdf
- **[Wilrijk-AMV]** Academie Wilrijk, *Theorie in een notendop* (AMV for adults, 2010). http://amapledoesntvoice.weebly.com/uploads/5/2/5/4/5254538/amv_volw_theoriecursus_vs_2010.pdf
- **[LKCA-Blaas]** LKCA, *Raamleerplan blaasinstrumenten* (2016). https://www.lkca.nl/~/media/downloads/publicaties/raamleerplannen/raamleerplan_blaasinstrumenten.pdf
- **[ABRSM-Outline]** ABRSM, Music Theory syllabus outline, grades 1–5 (from 2020). https://www.abrsm.org/sites/default/files/2023-09/music-theory-syllabus-outline-grades-1-5-from-2020.pdf
- **[RCM-LO]** RCM, learning objectives Prep to Level 4. https://admin.rcmusic.com/sites/default/files/digital-learning/theory/learning-objectives-prep-to-4.pdf
- **[Pianodao-Mnemonics]** Pianodao, "Who really needs mnemonics?". https://pianodao.com/2026/04/29/who-really-needs-mnemonics/
- **[Musicnotes-Read]** Musicnotes, "5 ways to learn how to read music at the piano". https://www.musicnotes.com/blog/5-ways-to-learn-how-to-read-music-at-the-piano
- **[Wiki-Dotted]** "Dotted note". Wikipedia. https://en.wikipedia.org/wiki/Dotted_note
- **[Wiki-Beat]** "Beat (music)". Wikipedia. https://en.wikipedia.org/wiki/Beat_(music)
- **[Wiki-Bar]** "Bar (music)". Wikipedia. https://en.wikipedia.org/wiki/Bar_(music)
- **[Gould]** Gould, E. (2011). *Behind Bars: The Definitive Guide to Music Notation*. London: Faber Music.
- **[MMT-Beam]** Williams, V. *MyMusicTheory*, "Grouping and beaming". https://mymusictheory.com/rhythm/grouping-and-beaming/
- **[MMT-Rests]** Williams, V. *MyMusicTheory*, "Rests (grade 3)". https://mymusictheory.com/rhythm/rests-grade-3/
- **[Wiki-Rest]** "Rest (music)". Wikipedia. https://en.wikipedia.org/wiki/Rest_(music)
- **[NL-Nootwaarde]** "Nootwaarde". Wikipedia (nl). https://nl.wikipedia.org/wiki/Nootwaarde
- **[NL-Rust]** "Rust (muziek)". Wikipedia (nl). https://nl.wikipedia.org/wiki/Rust_(muziek)
- **[GTTM]** Lerdahl, F., & Jackendoff, R. (1983). *A Generative Theory of Tonal Music*. Cambridge, MA: MIT Press.
- **[LHL]** Longuet-Higgins, H. C., & Lee, C. S. (1984). The rhythmic interpretation of monophonic music. *Music Perception*, 1(4), 424–441.
- **[Fitch-Rosenfeld]** Fitch, W. T., & Rosenfeld, A. J. (2007). Perception and production of syncopated rhythms. *Music Perception*, 25(1), 43–58.
- **[Huron]** Huron, D. (2006). *Sweet Anticipation: Music and the Psychology of Expectation*. Cambridge, MA: MIT Press.
- **[Frontiers-2024]** "Syncopation as structure bootstrapping: the role of asymmetry in rhythm and language". *Frontiers in Psychology* (2024). https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1304485/full
- **[Wiki-Tempo]** "Tempo". Wikipedia. https://en.wikipedia.org/wiki/Tempo
- **[Wiki-TimeSig]** "Time signature". Wikipedia. https://en.wikipedia.org/wiki/Time_signature
- **[Wiki-Slur]** "Slur (music)". Wikipedia. https://en.wikipedia.org/wiki/Slur_(music)
- **[Trinity-Theory]** Trinity College London, Theory of Music syllabus. https://www.trinitycollege.com/resource/?id=2886
- **[Ewell-Tempo]** Ewell, P., & Schmidt-Jones, C. *Music Fundamentals*, "Tempo". https://human.libretexts.org/Bookshelves/Music/Music_Theory/Music_Fundamentals_(Ewell_and_Schmidt-Jones)/02%3A_Rhythm_and_Meter/2.11%3A_Tempo
- **[HMT-Metronome]** Hello Music Theory, "Online Metronome" (tempo marking table). https://new.hellomusictheory.com/resources/metronome/
- **[Repp-2005]** Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. *Psychonomic Bulletin & Review*, 12(6), 969–992. https://doi.org/10.3758/BF03206433
- **[Repp-Su-2013]** Repp, B. H., & Su, Y.-H. (2013). Sensorimotor synchronization: A review of recent research (2006–2012). *Psychonomic Bulletin & Review*, 20(3), 403–452.
- **[MRA-Dotted]** "Why are dotted rhythms such a problem?" *MRA Music Place* (2016). https://mramusicplace.net/2016/04/21/why-are-dotted-rhythms-such-a-problem/
- **[MMF-Dotted]** "Rhythm Made Easy for Kids: The Dotted Quarter Note–Eighth Note Lesson". *MakingMusicFun.net*. https://makingmusicfun.net/htm/music_academy/counting-dotted-quarter-eighth-note.php
