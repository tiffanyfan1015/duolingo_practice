import { Converter } from "opencc-js/cn2t";
import type { CatalogCourse } from "../types.ts";

// Same Taiwan phrase conversion as the local Python OpenCC("s2twp") path.
// Build the static conversion tables during isolate startup, not on a user's request.
// No network, native binaries, or user data in the converter.
const converter = Converter({ from: "cn", to: "twp" });
export function traditionalChinese(text: string): string {
  return converter(text);
}

export function enrichCourse(course: CatalogCourse): CatalogCourse {
  const chinese = course.fromLanguage
    ? /^(?:zh|zs|zt)(?:[-_]|$)/i.test(course.fromLanguage)
    : ["de", "ja"].includes(course.id); // Legacy catalogs only supported Chinese instruction.
  if (!chinese) return course;
  return {
    ...course,
    words: course.words.map(word => ({
      ...word,
      meanings: [...new Set(word.meanings.map(traditionalChinese))],
    })),
    units: course.units.map(unit => ({ ...unit, title: traditionalChinese(unit.title) })),
    ...(course.sync ? { sync: { ...course.sync, rawMeanings: false } } : {}),
  };
}
