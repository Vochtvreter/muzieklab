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

## Note values and rests

| Claim | Status | Source |
|---|---|---|
| Whole = 4 beats, half = 2, quarter = 1, eighth = ½, sixteenth = ¼ in 2/4, 3/4, 4/4 (quarter-note beat) | Verified | [OMT] |
| Each flag or beam halves the value; quarters are never beamed | Verified | [OMT] |
| Dutch names: hele, halve, kwart-, achtste, zestiende noot / rust (for the future Dutch translation; not shown in v1, which is English only) | Verified | [NL-Nootwaarde], [NL-Rust] |
| A dot adds half the value (dotted half 3, dotted quarter 1½, dotted eighth ¾); also on rests | Verified | [NL-Rust], [Wiki-Rest] |
| A completely empty bar gets one whole rest, **centred**, in any time signature | **Corrected**: the rest tree drew it on beat 1; now centred | [Wiki-Rest], [MMT-Rests] |
| Whole rest hangs below the line, half rest sits on it | Verified (standard engraving) | [Gould] *standard reference* |
| In 4/4 a two-beat rest only on beat 1 or 3; on beat 2 use two quarter rests | Verified | [MMT-Rests] |
| In simple meters, dotted rests only when shorter than one beat | **Corrected**: was "dotted rests avoided in simple meters" | [MMT-Rests], [Wiki-Rest] |
| Rests are not tied | Verified (a tie joins two notes of the same pitch) | [OMT] |

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

## Counting, syncopation, triplets

| Claim | Status | Source |
|---|---|---|
| Beats counted 1 2 3 4; eighths "&"; sixteenths "e & a" ("a" said "uh") | Verified | [OMT] |
| Pronunciation of "1 e & a" as "one-ee-and-uh" ("e" said "ee") | Convention: [OMT] gives "uh" for "a" but no pronunciation for "e"; "ee" is the usual reading of the syllable | [OMT] |
| This is one counting system; Dutch teaching often uses "1 en 2 en" | Convention: the Learn page says teachers may use other syllables; syllables become a setting | open question in DESIGN §13 |
| Syncopation = a note on a weak position followed by silence or a held note on a stronger position | Verified | [LHL], [Huron] *standard references*, as summarised in [Frontiers-2024] |
| Triplet = three equal notes in the time of two of the same value; "1-trip-let" | Verified (definition); syllable is a common convention | [OMT] |

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
- **[Ewell-Tempo]** Ewell, P., & Schmidt-Jones, C. *Music Fundamentals*, "Tempo". https://human.libretexts.org/Bookshelves/Music/Music_Theory/Music_Fundamentals_(Ewell_and_Schmidt-Jones)/02%3A_Rhythm_and_Meter/2.11%3A_Tempo
- **[HMT-Metronome]** Hello Music Theory, "Online Metronome" (tempo marking table). https://new.hellomusictheory.com/resources/metronome/
- **[Repp-2005]** Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. *Psychonomic Bulletin & Review*, 12(6), 969–992. https://doi.org/10.3758/BF03206433
- **[Repp-Su-2013]** Repp, B. H., & Su, Y.-H. (2013). Sensorimotor synchronization: A review of recent research (2006–2012). *Psychonomic Bulletin & Review*, 20(3), 403–452.
- **[MRA-Dotted]** "Why are dotted rhythms such a problem?" *MRA Music Place* (2016). https://mramusicplace.net/2016/04/21/why-are-dotted-rhythms-such-a-problem/
- **[MMF-Dotted]** "Rhythm Made Easy for Kids: The Dotted Quarter Note–Eighth Note Lesson". *MakingMusicFun.net*. https://makingmusicfun.net/htm/music_academy/counting-dotted-quarter-eighth-note.php
