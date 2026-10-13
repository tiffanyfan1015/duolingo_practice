import type { CourseSelection, CatalogCourse } from "../types.ts";
import { record } from "../types.ts";
import { SyncError } from "../sync/duolingo.ts";
import { languageName } from "../../web/src/domain/languages.mjs";
export function discoverCourses(input: unknown, profile: unknown, previous: CourseSelection[] = [], saved: CatalogCourse[] = []) {
  const listing = record(input);
  if (!Array.isArray(listing?.courses) || listing.courses.length > 200) throw new SyncError("無法讀取課程清單，請稍後重新整理。", 502);
  const validCode = (code: unknown): code is string => typeof code === "string" && /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code);
  const found = new Map<string, CourseSelection>();
  for (const raw of listing.courses) {
    const item = record(raw);
    if (item?.subject && item.subject !== "language") continue;
    if (!validCode(item?.learningLanguage) || !validCode(item?.fromLanguage)) continue;
    if (typeof item.id !== "string" || !item.id || item.id.length > 200) throw new SyncError("課程識別資料不完整，未更新清單。", 502);
    if (found.has(item.id)) continue;
    const prior = previous.find((c) => c.courseId === item.id);
    const legacy = saved.find((c) => c.sync?.courseId === item.id);
    const reserved = ["de", "ja"].includes(item.learningLanguage) && item.fromLanguage === "zh" && ![...previous, ...found.values()].some((c) => c.id === item.learningLanguage && c.courseId !== item.id);
    const id = prior?.id || legacy?.id || (reserved ? item.learningLanguage : `course:${encodeURIComponent(item.id)}`);
    found.set(item.id, { id, courseId: item.id, language: item.learningLanguage, fromLanguage: item.fromLanguage, name: languageName(item.learningLanguage), active: prior ? prior.active : !!legacy || (!previous.length && item.id === record(record(profile).currentCourse).id), available: true });
  }
  // Retain disabled/removed courses so refreshing never destroys preferences or IDs.
  return [...found.values(), ...previous.filter((c) => !found.has(c.courseId)).map((c) => ({ ...c, available: false }))];
}
export function selectCourses(courses: CourseSelection[], selected: unknown) {
  if (!Array.isArray(selected) || selected.length > 200 || selected.some((id) => typeof id !== "string" || !courses.some((c) => c.id === id && c.available))) throw new SyncError("課程清單已變更，請重新整理後再設定。", 409);
  const enabled = new Set(selected);
  return courses.map((c) => ({ ...c, active: enabled.has(c.id) }));
}
