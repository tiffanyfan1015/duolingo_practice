import { SyncError } from "./duolingo.mjs";
export function courseState(profile, language) {
  const course = profile?.currentCourse;
  if (!course || course.learningLanguage !== language)
    throw new SyncError(
      `請先在 Duolingo 切換到${language === "de" ? "德文" : "日文"}，再按同步。`,
    );
  if (course.fromLanguage !== "zh" || !course.id)
    throw new SyncError("目前只支援以中文學習的德文／日文課程。");
  const found = new Map();
  function add(id, levels, sessions) {
    id = typeof id === "object" ? id?.id : id;
    levels = Number.isInteger(levels) ? levels : 0;
    sessions = Number.isInteger(sessions) ? sessions : 0;
    if (typeof id !== "string" || !id || Math.max(levels, sessions) <= 0)
      return;
    const previous = found.get(id);
    found.set(id, {
      skillId: { id },
      finishedLevels: Math.max(0, levels, previous?.finishedLevels || 0),
      finishedSessions: Math.max(0, sessions, previous?.finishedSessions || 0),
    });
  }
  function walk(value) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      add(
        value.id,
        value.finishedLevels,
        value.finishedSessions ?? value.finishedLessons,
      );
  }
  walk(course.skills);
  const units = [];
  for (const [sectionIndex, section] of (
    course.pathSectioned || []
  ).entries()) {
    for (const [unitIndex, unit] of (section.units || []).entries()) {
      const ids = new Set();
      for (const level of unit.levels || []) {
        const info = level.pathLevelClientData || {};
        add(info.skillId, info.finishedLevels, info.finishedSessions);
        for (const data of [info, level.pathLevelMetadata || {}]) {
          const id =
            typeof data.skillId === "object" ? data.skillId?.id : data.skillId;
          if (typeof id === "string") ids.add(id);
        }
      }
      units.push({
        id: `s${sectionIndex + 1}u${unitIndex + 1}`,
        section: sectionIndex + 1,
        position: unitIndex + 1,
        title: unit.teachingObjective || unit.title || "未命名單元",
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
    course: { id: course.id, learningLanguage: language, fromLanguage: "zh" },
    skills,
    units,
  };
}
export const fingerprint = (state) =>
  JSON.stringify([state.course, state.skills, state.units]);
export function appendPage(state, page, allowEmpty = false) {
  if (
    !Array.isArray(page?.learnedLexemes) ||
    !page.pagination ||
    !Object.hasOwn(page.pagination, "nextStartIndex")
  )
    throw new SyncError("API 分頁格式不符，保留原字庫。");
  const batch = page.learnedLexemes,
    next = page.pagination.nextStartIndex,
    total = page.pagination.totalLexemes;
  if (
    batch.some(
      (w) =>
        typeof w?.text !== "string" ||
        !w.text ||
        !Array.isArray(w.translations) ||
        w.translations.some((t) => typeof t !== "string"),
    )
  )
    throw new SyncError("API 單字格式不符，保留原字庫。");
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    total > 10000 ||
    (state.expected !== null && state.expected !== total)
  )
    throw new SyncError("同步期間單字總數改變或不合法，請重新同步。");
  if (
    state.seen.includes(state.next) ||
    state.seen.length >= 200 ||
    (next !== null &&
      (!Number.isInteger(next) || next <= state.next || !batch.length))
  )
    throw new SyncError("API 分頁重複或未前進，保留原字庫。");
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
export const emptyPage = () => ({
  words: [],
  expected: null,
  next: 0,
  seen: [],
});
export function transform(job, previous) {
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
      readingPending: job.language === "ja" && !prior?.reading,
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
  return {
    id: job.language,
    name: job.language === "de" ? "德文" : "日文",
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
  };
}
