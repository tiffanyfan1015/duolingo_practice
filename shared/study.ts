/** Persisted wire format. Dates are epoch milliseconds, never Date objects. */
export interface StudyMemory {
  due: number; stability: number; difficulty: number; elapsed_days: number;
  scheduled_days: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3;
  learning_steps: number; last_review?: number;
}
export interface StudyCard {
  due?: number; reviews?: number; buriedUntil?: number; updatedAt?: number;
  suspended?: boolean; legacy?: boolean; memory?: StudyMemory;
}
export interface StudyLog {
  id: string; cardId: string; language: string; day: string; at: number;
  rating: 1 | 2 | 3 | 4; wasNew: boolean; wasReview: boolean;
}
export interface StudyPractice { reviews?: number; stage?: number; due?: number; updatedAt?: number }
export interface StudyModel { weights: number[]; modelTrainedAt: string }
export type CardTemplate = 'recognition' | 'recall' | 'listening';
export type StudyCell = boolean | string | number | CardTemplate[] | StudyPractice | StudyCard | StudyLog | StudyModel;
export type StudyCells = Record<string, StudyCell>;
export type StudySnapshot = { revision: number; unchanged: true } | { revision: number; cells: StudyCells };
export interface StudyWrite { revision: number; cells: StudyCells }
export interface StudyReceipt { revision: number }
export interface StudyClient {
  get(revision: number): Promise<StudySnapshot>;
  put(revision: number, cells: StudyCells): Promise<StudyReceipt>;
}
