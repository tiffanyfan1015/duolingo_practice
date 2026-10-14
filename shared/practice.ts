import type { VocabularyWord } from './vocabulary.ts';
import type { StudyPractice } from './study.ts';

export interface WordProgress extends StudyPractice { star?: boolean; note?: string }
export interface PracticeSession {
  words: VocabularyWord[];
  index: number;
  revealed: boolean;
  good: number;
  answer?: string;
  correct?: boolean;
}
export interface VocabularyFilter { query?: string; unit?: string; status?: 'all' | 'star' | 'new' | 'due' }
