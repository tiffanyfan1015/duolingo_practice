// @ts-check
import { validWeights } from './fsrs-model.mjs';
import { validCourseKey } from './languages.mjs';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {value is number} */
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
/** @param {unknown} value @returns {value is string} */
const safe = value => typeof value === 'string' && value.length > 0 && value.length <= 2000 && !['__proto__', 'prototype', 'constructor'].includes(value);
/** @param {unknown} value @param {string[]} allowed @returns {value is Record<string, unknown>} */
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));

/**
 * Validate untrusted wire data before it reaches either storage implementation.
 * @param {unknown} cells
 * @returns {import('../../../shared/study.ts').StudyCells}
 */
export function validateStudyCells(cells) {
  if (!object(cells) || Object.keys(cells).length > 100000) throw Error('學習資料格式不正確。');
  for (const [key, value] of Object.entries(cells)) {
    /** @type {unknown} */
    let path;
    try { path = JSON.parse(key); } catch { throw Error('學習欄位格式不正確。'); }
    if (!Array.isArray(path) || !path.every(safe) || JSON.stringify(path) !== key) throw Error('學習欄位格式不正確。');
    const [kind, id, field] = path;
    let valid = false;
    if (kind === 'romaji') valid = path.length === 1 && typeof value === 'boolean';
    if (kind === 'word') valid = path.length === 3 && (field === 'note' ? typeof value === 'string' && value.length <= 10000 : field === 'updatedAt' ? finite(value) : field === 'star' && typeof value === 'boolean');
    if (kind === 'practice') valid = path.length === 2 && keys(value, ['reviews', 'stage', 'due', 'updatedAt']) && Object.values(value).every(finite);
    if (kind === 'card' && object(value)) {
      valid = path.length === 2 && keys(value, ['due', 'reviews', 'buriedUntil', 'updatedAt', 'suspended', 'legacy', 'memory']) && Object.entries(value).every(([key, item]) => key === 'memory' || (['suspended', 'legacy'].includes(key) ? typeof item === 'boolean' : finite(item)));
      if (Object.hasOwn(value, 'memory')) {
        const fields = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'state', 'learning_steps'];
        const memory = value.memory;
        valid = valid && keys(memory, [...fields, 'last_review']) && fields.every(key => finite(memory[key])) && Object.values(memory).every(finite) && typeof memory.state === 'number' && [0, 1, 2, 3].includes(memory.state) && typeof memory.difficulty === 'number' && memory.difficulty <= 10;
      }
    }
    if (kind === 'log') valid = path.length === 2 && keys(value, ['id', 'cardId', 'language', 'day', 'at', 'rating', 'wasNew', 'wasReview']) && value.id === id && safe(value.cardId) && validCourseKey(value.language) && typeof value.day === 'string' && value.day.length <= 20 && finite(value.at) && typeof value.rating === 'number' && [1, 2, 3, 4].includes(value.rating) && typeof value.wasNew === 'boolean' && typeof value.wasReview === 'boolean';
    if (kind === 'setting') valid = path.length === 3 && (field === 'templates' ? Array.isArray(value) && value.length > 0 && value.length <= 3 && value.every(item => ['recognition', 'recall', 'listening'].includes(item)) : field === 'burySiblings' ? typeof value === 'boolean' : ['newLimit', 'reviewLimit', 'retention'].includes(field) && finite(value) && value <= (field === 'newLimit' ? 100 : field === 'reviewLimit' ? 1000 : 0.97) && (field !== 'retention' || value >= 0.8));
    if (kind === 'model') valid = path.length === 2 && keys(value, ['weights', 'modelTrainedAt']) && validWeights(value.weights) && typeof value.modelTrainedAt === 'string' && value.modelTrainedAt.length <= 100;
    if (['setting', 'model'].includes(kind)) valid = valid && validCourseKey(id);
    if (!valid) throw Error('學習資料含有不支援或無效的欄位。');
  }
  return /** @type {import('../../../shared/study.ts').StudyCells} */ (cells);
}
