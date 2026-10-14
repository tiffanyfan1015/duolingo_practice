import { kanaPronunciation } from "./services/language-tools.mjs";

// At most two lookups run together. A lookup failure does not block practice.
export function createReadingController({ client, store, present }) {
  const waiting = new Map(), attempted = new Map();
  let active = 0;
  function apply(word, value) {
    if (!value) return;
    Object.assign(word, value);
    present(word);
  }
  function accept(word, result) {
    if (!result?.pronunciation) return;
    store.put(word.text, result.pronunciation);
    apply(word, result.pronunciation);
  }
  async function pump() {
    if (active >= 2 || !waiting.size) return;
    const [text, words] = waiting.entries().next().value;
    waiting.delete(text);
    active++;
    attempted.set(text, Date.now());
    try {
      const result = await client.lookup(text, "ja");
      for (const word of words) accept(word, result);
    } catch { /* Detailed errors are shown only when the user opens the dictionary. */ }
    finally { active--; void pump(); }
  }
  return {
    accept,
    restore(courses) {
      for (const course of courses) if ((course.language || course.id) === "ja")
        for (const word of course.words) {
          const value = kanaPronunciation(word.reading) || store.get(word.text) || kanaPronunciation(word.text);
          if (value) Object.assign(word, value);
        }
    },
    ensure(words, language) {
      // Drop queued words from the previous page/course, but allow active requests to finish.
      waiting.clear();
      if (language !== "ja") return;
      for (const word of words.slice(0, 30)) {
        if (!word.readingPending || word.reading) continue;
        const cached = store.get(word.text) || kanaPronunciation(word.text);
        if (cached) { apply(word, cached); continue; }
        if (Date.now() - (attempted.get(word.text) || 0) < 60000) continue;
        if (!waiting.has(word.text)) waiting.set(word.text, []);
        waiting.get(word.text).push(word);
      }
      void pump(); void pump();
    },
  };
}
