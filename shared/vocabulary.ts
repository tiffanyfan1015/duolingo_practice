/** Catalog format shared by the Worker and the browser; no runtime dependencies. */
export interface Unit { id: string; section: number; position: number; title: string }
export interface VocabularyWord {
  id: string; text: string; meanings: string[]; units: string[];
  audio?: string | null; reading?: string; romaji?: string; readingPending?: boolean;
}
export interface CatalogCourse {
  id: string; name: string; language?: string; fromLanguage?: string;
  words: VocabularyWord[]; units: Unit[]; exportedAt?: string;
  sync?: { source: string; courseId: string; mapping: string; rawMeanings: boolean; learnedSkills: number };
}
export interface Catalog { courses: CatalogCourse[] }
