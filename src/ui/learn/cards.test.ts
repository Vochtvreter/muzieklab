import { describe, expect, it } from 'vitest';
import { hasMessage, LOCALES, setLocale, t } from '../../i18n';
import { ALL_CARDS, chapterCards, countDeck, deckIds, findCard, roundQueue } from './cards';
import { CHAPTERS, TOPICS, topicChapters } from './chapters';

describe('Test yourself cards come from the Learn chapters', () => {
  it('every quick check is one card: each section, then the chapter check', () => {
    const checks = CHAPTERS.reduce((n, c) => n + c.sections.length + 1, 0);
    expect(ALL_CARDS).toHaveLength(checks);
    expect(new Set(ALL_CARDS.map((c) => c.id)).size).toBe(checks);
    expect(chapterCards(CHAPTERS[0]).map((c) => c.id)).toEqual([...CHAPTERS[0].sections.map((s) => s.id), 'ch1']);
  });

  it('every card is a valid card: question, three answers, one right, explanation and a glyph', () => {
    for (const card of ALL_CARDS) {
      expect(card.quiz.answers, card.id).toHaveLength(3);
      expect(card.quiz.right, card.id).toBeGreaterThanOrEqual(0);
      expect(card.quiz.right, card.id).toBeLessThan(3);
      expect(hasMessage(`${card.base}.question`), card.id).toBe(true);
      expect(hasMessage(`${card.base}.right`), card.id).toBe(true);
      expect(card.glyph.trim(), card.id).not.toBe('');
    }
  });

  it('in every language, the explanation starts with the word the card leaves out', () => {
    for (const { code } of LOCALES) {
      setLocale(code);
      for (const card of ALL_CARDS) expect(t(`${card.base}.right`).startsWith(t('test.rightLead')), `${code} ${card.id}`).toBe(true);
    }
    setLocale('en');
  });

  it('every chapter sits in a topic, and each topic has its texts', () => {
    expect(TOPICS.flatMap((x) => topicChapters(x.id))).toHaveLength(CHAPTERS.length);
    for (const { id } of TOPICS) for (const key of ['title', 'sub', 'intro']) expect(hasMessage(`learn.topics.${id}.${key}`)).toBe(true);
  });
});

describe('the deck and a round', () => {
  const today = '2026-10-20';

  it('holds the sections read and the chapter checks passed, in chapter order', () => {
    expect(deckIds({ learnRead: ['2.1', '1.2'], learnQuiz: [1] })).toEqual(['1.2', 'ch1', '2.1']);
    expect(deckIds({ learnRead: ['99.1'], learnQuiz: [] })).toEqual([]);
  });

  it('counts the due cards: new ones and those whose day has come', () => {
    const ids = ['1.1', '1.2', '1.3'];
    expect(countDeck(ids, { '1.1': { box: 2, due: '2026-10-24', missed: false }, '1.2': { box: 1, due: today, missed: true } }, today)).toEqual({ total: 3, due: 2 });
  });

  it('asks due cards first (missed ones before the rest), then the others, only from the chosen chapters', () => {
    const ids = ['1.1', '1.2', '1.3', 'ch1', '2.1'];
    const cards = {
      '1.1': { box: 3, due: '2026-10-28', missed: false },
      '1.2': { box: 2, due: '2026-10-19', missed: false },
      '1.3': { box: 1, due: '2026-10-20', missed: true },
      ch1: { box: 2, due: '2026-10-22', missed: false },
    };
    expect(roundQueue(ids, [1], cards, today)).toEqual({ queue: ['1.3', '1.2', 'ch1', '1.1'], due: 2 });
    expect(roundQueue(ids, [2], cards, today)).toEqual({ queue: ['2.1'], due: 1 });
    expect(findCard('ch1')?.section).toBeNull();
  });
});
