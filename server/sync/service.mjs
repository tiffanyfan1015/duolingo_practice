import { SyncError } from "./duolingo.mjs";
import {
  courseState,
  fingerprint,
  appendPage,
  emptyPage,
  transform,
} from "./domain.mjs";
export function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    language: job.language,
    phase: job.phase,
    count: job.words.length,
    expected: job.page.expected,
    mapped: job.probes.length,
    totalSkills: job.skills.length,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
  };
}
export function syncService(repo, client, baseCatalog = { courses: [] }, target = null) {
  return {
    async start(language, restart = false) {
      const previous = await repo.get(language);
      if (
        previous &&
        previous.phase !== "done" &&
        !restart &&
        Date.now() - previous.startedAt < 86400000
      )
        return publicJob(previous);
      if (previous && Date.now() - previous.startedAt < 15000)
        throw new SyncError("請稍候 15 秒再重新開始同步。", 429);
      const snapshot = courseState(await client.profile(), target?.language || language, target);
      const job = {
        id: crypto.randomUUID(),
        language,
        learningLanguage: target?.language || language,
        ...snapshot,
        signature: fingerprint(snapshot),
        phase: "words",
        page: emptyPage(),
        words: [],
        probes: [],
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };
      return publicJob(await repo.start(job, previous));
    },
    async step(language, id) {
      const job = await repo.get(language);
      if (!job || job.id !== id)
        throw new SyncError("同步工作已更換，請重新按同步。", 409);
      if (job.phase === "done") return publicJob(job);
      if (Date.now() - job.startedAt > 86400000)
        throw new SyncError("同步工作已超過一天，請重新開始。");
      if (job.phase === "words" || job.phase === "units") {
        const skills =
          job.phase === "words" ? job.skills : [job.skills[job.probes.length]];
        job.page = appendPage(
          job.page,
          await client.page(job.course, skills, job.page.next),
          job.phase === "units",
        );
        if (job.phase === "words") job.words = job.page.words;
        if (job.page.next === null) {
          if (job.phase === "words") {
            job.phase = "units";
          } else
            job.probes.push({
              id: skills[0].skillId.id,
              words: job.page.words.map((word) => word.text),
            });
          job.page = emptyPage();
          if (job.probes.length === job.skills.length) job.phase = "verify";
        }
      } else if (job.phase === "verify") {
        const snapshot = courseState(await client.profile(), target?.language || language, target);
        if (fingerprint(snapshot) !== job.signature)
          throw new SyncError(
            "同步期間 Duolingo 進度或課程改變，請重新開始；舊字庫已保留。",
          );
        job.phase = "commit";
      } else if (job.phase === "commit") {
        const previous =
          (await repo.courses()).find((course) => course.id === language) ||
          baseCatalog.courses.find((course) => course.id === language);
        const result = transform(job, previous);
        job.phase = "done";
        job.completedAt = new Date().toISOString();
        job.updatedAt = Date.now();
        // Both the new catalog and completed state publish in the same transaction.
        return publicJob(await repo.save(job, result));
      } else throw new SyncError("未知同步狀態，請重新開始。");
      job.updatedAt = Date.now();
      return publicJob(await repo.save(job));
    },
  };
}
