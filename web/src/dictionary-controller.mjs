// @ts-check
/**
 * Owns the request lifetime, independently of the DOM and dictionary transport.
 * @template Result
 * @param {{lookup: (text: string, language: string) => Promise<Result>}} client
 * @param {(word: import('../../shared/vocabulary.ts').VocabularyWord, state: Result | {status: 'loading'} | {status: 'error', message: string}) => void} present
 */
export function createDictionaryController(client, present) {
  let version = 0;
  return {
    invalidate() { version++; },
    /** @param {import('../../shared/vocabulary.ts').VocabularyWord} word @param {string} language */
    async load(word, language) {
      const request = ++version;
      present(word, {status: 'loading'});
      try {
        const result = await client.lookup(word.text, language);
        if (request === version) present(word, result);
      } catch (error) {
        if (request === version) present(word, {
          status: 'error',
          message: error instanceof Error ? error.message : '字典暫時無法查詢，請稍後重試。',
        });
      }
    },
  };
}
