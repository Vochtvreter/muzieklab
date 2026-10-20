/**
 * Test yourself flash cards (DESIGN.md §3.6), built from the Learn chapters: every section's quick check and every
 * chapter's end check is one card, so new Learn content is new cards with no extra step. A card's id is its check's id:
 * the section ("4.2"), or "ch4" for chapter 4's end check.
 *
 * The deck is the cards whose quick check the player has answered right in Learn: a read section, or a passed chapter
 * check. A round asks the due cards first, then the rest of the deck in the chosen chapters.
 */
import { isDue, type CardState } from '../../game/leitner';
import { CHAPTERS, sectionKey, topicGlyph, type Chapter, type Quiz } from './chapters';

export interface Card {
  id: string;
  chapter: number;
  /** The section the check closes; null for the chapter's end check. */
  section: string | null;
  quiz: Quiz;
  /** Where the check's texts live: 'learn.ch5.s2.check', or 'learn.ch5.quiz'. */
  base: string;
  glyph: string;
}

export const chapterCardId = (n: number): string => 'ch' + n;

export function chapterCards(c: Chapter): Card[] {
  const glyph = topicGlyph(c.practice);
  return [
    ...c.sections.map((s) => ({ id: s.id, chapter: c.n, section: s.id, quiz: s.check, base: sectionKey(s.id, 'check'), glyph: s.check.glyph ?? glyph })),
    { id: chapterCardId(c.n), chapter: c.n, section: null, quiz: c.quiz, base: `learn.ch${c.n}.quiz`, glyph: c.quiz.glyph ?? glyph },
  ];
}

export const ALL_CARDS: Card[] = CHAPTERS.flatMap(chapterCards);
const BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));
export const findCard = (id: string): Card | undefined => BY_ID.get(id);

/** What the deck is made of: sections read and chapter checks passed. */
export interface DeckSource {
  learnRead: string[];
  learnQuiz: number[];
}

/** The ids of the cards in the deck, in chapter order. */
export function deckIds(p: DeckSource): string[] {
  const own = new Set([...p.learnRead, ...p.learnQuiz.map(chapterCardId)]);
  return ALL_CARDS.filter((c) => own.has(c.id)).map((c) => c.id);
}

export interface DeckCounts {
  total: number;
  due: number;
}

export function countDeck(ids: string[], cards: Record<string, CardState>, today: string): DeckCounts {
  return { total: ids.length, due: ids.filter((id) => isDue(cards[id], today)).length };
}

/**
 * A round's order in the chosen chapters: the due cards first (the ones last answered wrong, then the longest overdue),
 * then the others, the soonest due first. Ties keep chapter order.
 */
export function roundQueue(ids: string[], chapters: number[], cards: Record<string, CardState>, today: string): { queue: string[]; due: number } {
  const chosen = ids.filter((id) => chapters.includes(BY_ID.get(id)!.chapter));
  const order = new Map(chosen.map((id, i) => [id, i]));
  const due = chosen.filter((id) => isDue(cards[id], today));
  const rest = chosen.filter((id) => !isDue(cards[id], today));
  const dueKey = (id: string): string => cards[id]?.due ?? '';
  due.sort((a, b) => Number(!!cards[b]?.missed) - Number(!!cards[a]?.missed) || dueKey(a).localeCompare(dueKey(b)) || order.get(a)! - order.get(b)!);
  rest.sort((a, b) => dueKey(a).localeCompare(dueKey(b)) || order.get(a)! - order.get(b)!);
  return { queue: [...due, ...rest], due: due.length };
}
