import type { D1Database, Fetcher } from '@cloudflare/workers-types';
import type { accountRepository } from './accounts/repository.ts';
import type { Unit, CatalogCourse } from '../shared/vocabulary.ts';
export type { Unit, VocabularyWord, CatalogCourse, Catalog } from '../shared/vocabulary.ts';

export interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  MULTI_USER?: string;
  SITE_PASSWORD?: string;
  CREDENTIAL_KEY?: string;
  REGISTRATION_CODE?: string;
  DUOLINGO_JWT?: string;
}
export interface Account {
  id: string;
  username: string;
  salt: string;
  password_hash: string;
  connection_id: string;
  duolingo_id?: string | null;
  credential?: string | null;
}
export interface AccountContext {
  repo: ReturnType<typeof accountRepository>;
  user: Account | null;
  token: string;
}
export interface CourseSelection {
  id: string;
  courseId: string;
  language: string;
  fromLanguage: string;
  name: string;
  active: boolean;
  available: boolean;
}
export interface CourseSettings { revision: number; courses: CourseSelection[] }
export interface Skill { skillId: { id: string }; finishedLevels: number; finishedSessions: number }
export interface CourseIdentity { id: string; learningLanguage: string; fromLanguage: string }
export interface CourseSnapshot { course: CourseIdentity; skills: Skill[]; units: (Unit & {skillIds: string[]})[] }
export interface Lexeme { text: string; translations: string[]; audioURL?: string | null }
export interface PageState { words: Lexeme[]; expected: number | null; next: number | null; seen: (number | null)[] }
export interface SyncJob extends CourseSnapshot {
  id: string; language: string; learningLanguage?: string; signature: string;
  phase: 'words' | 'units' | 'verify' | 'commit' | 'done';
  page: PageState; words: Lexeme[]; probes: {id: string; words: string[]}[];
  reusedProbeIds?: string[];
  startedAt: number; updatedAt: number; completedAt?: string; revision?: number;
}
export interface SyncRepository {
  init(): Promise<unknown>;
  get(language: string): Promise<SyncJob | null>;
  courses(): Promise<CatalogCourse[]>;
  start(job: SyncJob, previous: SyncJob | null): Promise<SyncJob | null>;
  save(job: SyncJob, course?: CatalogCourse | null): Promise<SyncJob | null>;
}
export interface DuolingoClient {
  profile(): Promise<unknown>;
  courses(): Promise<unknown>;
  page(course: CourseIdentity, skills: Skill[], start: number | null): Promise<unknown>;
}
// Untrusted JSON stays unknown until the consuming domain validates its fields.
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
