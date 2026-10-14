import { SyncError } from "./duolingo.ts";
import { languageName } from "../../web/src/domain/languages.mjs";
import { enrichCourse } from "./enrichment.ts";
import type { CourseSelection, CourseSnapshot, Skill, PageState, Lexeme, SyncJob, CatalogCourse } from "../types.ts";
import { record } from "../types.ts";
export function courseState(profile: unknown, language: string, target: CourseSelection | null = null): CourseSnapshot {
  const course = record(record(profile).currentCourse);
  if (!course || course.learningLanguage !== language || (target && (course.id !== target.courseId || course.fromLanguage !== target.fromLanguage)))
    throw new SyncError(
      `請先在 Duolingo 切換到所選的${languageName(language)}課程，再按同步。`,
    );
  if (typeof course.id !== "string" || !course.id || typeof course.fromLanguage !== "string" || (!target && course.fromLanguage !== "zh"))
    throw new SyncError("目前只支援以中文學習的德文／日文課程。");
  const found = new Map<string, Skill>();
  function add(rawId: unknown, rawLevels: unknown, rawSessions: unknown) {
    const id = typeof rawId === "object" ? record(rawId).id : rawId;
    const levels = typeof rawLevels === "number" && Number.isInteger(rawLevels) ? rawLevels : 0;
    const sessions = typeof rawSessions === "number" && Number.isInteger(rawSessions) ? rawSessions : 0;
    if (typeof id !== "string" || !id || Math.max(levels, sessions) <= 0)
      return;
    const previous = found.get(id);
    found.set(id, {
      skillId: { id },
      finishedLevels: Math.max(0, levels, previous?.finishedLevels || 0),
      finishedSessions: Math.max(0, sessions, previous?.finishedSessions || 0),
    });
  }
  function walk(value: unknown) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      add(
        record(value).id,
        record(value).finishedLevels,
        record(value).finishedSessions ?? record(value).finishedLessons,
      );
  }
  walk(course.skills);
  const units = [];
  for (const [sectionIndex, section] of (
    Array.isArray(course.pathSectioned) ? course.pathSectioned : []
  ).entries()) {
    const sectionData = record(section);
    for (const [unitIndex, rawUnit] of (Array.isArray(sectionData.units) ? sectionData.units : []).entries()) {
      const unit = record(rawUnit);
      const ids = new Set<string>();
      for (const level of Array.isArray(unit.levels) ? unit.levels : []) {
        const info = record(record(level).pathLevelClientData);
        add(info.skillId, info.finishedLevels, info.finishedSessions);
        for (const data of [info, record(record(level).pathLevelMetadata)]) {
          const id =
            typeof data.skillId === "object" ? record(data.skillId).id : data.skillId;
          if (typeof id === "string") ids.add(id);
        }
      }
      units.push({
        id: `s${sectionIndex + 1}u${unitIndex + 1}`,
        section: sectionIndex + 1,
        position: unitIndex + 1,
        title: typeof unit.teachingObjective === "string" && unit.teachingObjective || typeof unit.title === "string" && unit.title || "未命名單元",
        skillIds: [...ids],
      });
    }
  }
  const skills = [...found.values()].sort((a, b) =>
    a.skillId.id.localeCompare(b.skillId.id),
  );
  if (!skills.length || skills.length > 500)
    throw new SyncError("無法辨識已學技能，未猜測學習進度。");
  return {
    course: { id: course.id, learningLanguage: language, fromLanguage: course.fromLanguage },
    skills,
    units,
  };
}
export const fingerprint = (state: CourseSnapshot) =>
  JSON.stringify([state.course, state.skills, state.units]);
export function appendPage(state: PageState, input: unknown, allowEmpty = false): PageState {
  const page = record(input), pagination = record(page.pagination);
  if (
    !Array.isArray(page?.learnedLexemes) ||
    !Object.hasOwn(pagination, "nextStartIndex")
  )
    throw new SyncError("API 分頁格式不符，保留原字庫。");
  const rawBatch: unknown[] = page.learnedLexemes,
    next = pagination.nextStartIndex,
    total = pagination.totalLexemes;
  if (
    rawBatch.some(
      (value) => {
        const w = record(value);
        return (
        typeof w?.text !== "string" ||
        !w.text ||
        !Array.isArray(w.translations) ||
        w.translations.some((t: unknown) => typeof t !== "string") ||
        (w.audioURL != null && typeof w.audioURL !== "string")
        );
      },
    )
  )
    throw new SyncError("API 單字格式不符，保留原字庫。");
  if (
    typeof total !== "number" || !Number.isInteger(total) ||
    total < 0 ||
    total > 10000 ||
    (state.expected !== null && state.expected !== total)
  )
    throw new SyncError("同步期間單字總數改變或不合法，請重新同步。");
  if (
    state.seen.includes(state.next) ||
    state.seen.length >= 200 ||
    (next !== null &&
      (typeof next !== "number" || !Number.isInteger(next) || state.next === null || next <= state.next || !rawBatch.length))
  )
    throw new SyncError("API 分頁重複或未前進，保留原字庫。");
  // Every required lexeme field was checked above before entering the job state.
  const batch = rawBatch as Lexeme[];
  const words = [...state.words, ...batch];
  if (
    new Set(words.map((w) => w.text)).size !== words.length ||
    words.length > total ||
    (next === null &&
      (words.length !== total || (!allowEmpty && !words.length)))
  )
    throw new SyncError("API 單字不完整或重複，保留原字庫。");
  return { words, expected: total, next, seen: [...state.seen, state.next] };
}
export const emptyPage = (): PageState => ({
  words: [],
  expected: null,
  next: 0,
  seen: [],
});
export function transform(job: SyncJob, previous: CatalogCourse | undefined): CatalogCourse {
  const baseline = new Set(job.words.map((w) => w.text));
  const sets = job.probes.map((probe) => new Set(probe.words));
  if (sets.some((set) => [...set].some((text) => !baseline.has(text))))
    throw new SyncError("技能查詢與單字清單不一致，請重新同步。");
  const proper = sets.filter((set) => set.size > 0 && set.size < baseline.size);
  const supported =
    new Set(proper.map((set) => [...set].sort().join("\0"))).size >= 2;
  const oldWords = new Map(
    (previous?.words || []).map((word) => [word.id, word]),
  );
  const oldUnits = new Map(
    (previous?.units || []).map((unit) => [unit.id, unit]),
  );
  const used = new Set();
  const words = job.words.map((word) => {
    const id = `${job.language}:${word.text}`,
      prior = oldWords.get(id);
    const skills = new Set(
      job.probes.filter((p) => p.words.includes(word.text)).map((p) => p.id),
    );
    const units = supported
      ? job.units
          .filter((u) => u.skillIds.some((id) => skills.has(id)))
          .map((u) => u.id)
      : [];
    units.forEach((id) => used.add(id));
    if (!units.length) {
      units.push("unmapped");
      used.add("unmapped");
    }
    return {
      id,
      text: word.text,
      meanings: [...new Set(word.translations)],
      audio: /^https:\/\//.test(word.audioURL || "") ? word.audioURL : null,
      units,
      reading: prior?.reading || "",
      romaji: prior?.romaji || "",
      readingPending: (job.learningLanguage || job.language) === "ja" && !prior?.reading,
    };
  });
  const units = job.units
    .filter((u) => used.has(u.id))
    .map(({ skillIds, ...u }) => ({
      ...u,
      title: oldUnits.get(u.id)?.title || u.title,
    }));
  if (used.has("unmapped"))
    units.push({
      id: "unmapped",
      section: 0,
      position: 0,
      title: "尚未確認單元",
    });
  return enrichCourse({
    id: job.language,
    language: job.learningLanguage || job.language,
    fromLanguage: job.course.fromLanguage,
    name: languageName(job.learningLanguage || job.language),
    words,
    units,
    exportedAt: new Date().toISOString(),
    sync: {
      source: "duolingo-api",
      courseId: job.course.id,
      mapping: supported ? "inferred" : "unverified",
      rawMeanings: true,
      learnedSkills: job.skills.length,
    },
  });
}
