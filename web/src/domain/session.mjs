// @ts-check
import { normalizeAnswer } from "./learning.mjs";
/** @typedef {import('../../../shared/practice.ts').PracticeSession} PracticeSession */

/** @param {import('../../../shared/vocabulary.ts').VocabularyWord[]} words @param {number} limit @returns {PracticeSession} */
export function createSession(words, limit, random = Math.random) {
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return {
    words: shuffled.slice(0, limit || words.length),
    index: 0,
    revealed: false,
    good: 0,
  };
}

/** @param {PracticeSession} session @returns {PracticeSession} */
export function revealAnswer(session, answer = "", language = "") {
  const word = session.words[session.index];
  if (!word) return session;
  const accepted = [
    word.text,
    ...(language === "ja" ? [word.reading] : []),
  ].filter(Boolean);
  return {
    ...session,
    revealed: true,
    answer,
    correct:
      !!answer &&
      accepted.some(
        (value) => normalizeAnswer(value) === normalizeAnswer(answer),
      ),
  };
}

/** @param {PracticeSession} session @param {boolean} good @returns {PracticeSession} */
export function advanceSession(session, good) {
  if (!session.revealed || session.index >= session.words.length)
    return session;
  return {
    ...session,
    index: session.index + 1,
    good: session.good + Number(good),
    revealed: false,
    answer: "",
    correct: false,
  };
}
