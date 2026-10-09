export const CARD_TYPES = {
  recognition: {
    name: "辨識卡",
    prompt: "看單字，想釋義",
    short: "單字 → 釋義",
  },
  recall: { name: "回想卡", prompt: "看釋義，想單字", short: "釋義 → 單字" },
  listening: {
    name: "聽力卡",
    prompt: "聽發音，想單字與意思",
    short: "聲音 → 單字",
  },
};

// A word is a note. Each direction is a card with its own memory state.
// Units are shared tags; membership in two units never duplicates a card.
export function cardsForCourse(course) {
  return course.words.flatMap((word) =>
    Object.keys(CARD_TYPES).map((type) => ({
      id: `${word.id}::${type}`,
      noteId: word.id,
      language: course.id,
      learningLanguage: course.language || course.id,
      type,
      word,
      units: word.units,
      homeUnit: word.units[0] || null,
    })),
  );
}

export function effectiveRecord(card, records, legacyWords = {}) {
  if (records[card.id]) return records[card.id];
  const legacy = legacyWords[card.noteId];
  if (card.type === "recognition" && legacy?.reviews) {
    return {
      due: legacy.due || 0,
      reviews: legacy.reviews,
      legacy: true,
      updatedAt: legacy.updatedAt || 0,
    };
  }
  return {};
}

export function cardPhase(record) {
  if (!record.reviews && !record.memory?.reps) return "new";
  if ([1, 3].includes(record.memory?.state)) return "learning";
  return "review";
}
