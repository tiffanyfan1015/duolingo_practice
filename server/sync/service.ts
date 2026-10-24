import type { SyncJob, SyncRepository, DuolingoClient, Catalog, CourseSelection } from "../types.ts";
import { SyncError } from "./duolingo.ts";
import { reusableProbes, finishProbePhase } from "./incremental.ts";
import {
  courseState,
  fingerprint,
  appendPage,
  emptyPage,
  transform,
} from "./domain.ts";
export function publicJob(job: SyncJob | null) {
  if (!job) return null;
  return {
    id: job.id,
    language: job.language,
    phase: job.phase,
    count: job.words.length,
    expected: job.page.expected,
    mapped: job.probes.length,
    reused: job.reusedProbeIds?.length || 0,
    totalSkills: job.skills.length,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
  };
}
export function syncService(repo: SyncRepository, client: DuolingoClient, baseCatalog: Catalog = { courses: [] }, target: CourseSelection | null = null) {
  return {
    async start(language: string, restart = false) {
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
      const probes = restart ? [] : reusableProbes(snapshot, previous);
      const job: SyncJob = {
        id: crypto.randomUUID(),
        language,
        learningLanguage: target?.language || language,
        ...snapshot,
        signature: fingerprint(snapshot),
        phase: "words",
        page: emptyPage(),
        words: [],
        probes,
        reusedProbeIds: probes.map(p => p.id),
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };
      return publicJob(await repo.start(job, previous));
    },
    async step(language: string, id: string) {
      const job = await repo.get(language);
      if (!job || job.id !== id)
        throw new SyncError("同步工作已更換，請重新按同步。", 409);
      if (job.phase === "done") return publicJob(job);
      if (Date.now() - job.startedAt > 86400000)
        throw new SyncError("同步工作已超過一天，請重新開始。");
      if (job.phase === "words" || job.phase === "units") {
        const skills =
          job.phase === "words" ? job.skills : [job.skills.find(s => !job.probes.some(p => p.id === s.skillId.id))!];
        job.page = appendPage(
          job.page,
          await client.page(job.course, skills, job.page.next),
          job.phase === "units",
        );
        if (job.phase === "words") job.words = job.page.words;
        if (job.page.next === null) {
          if (job.phase === "words") {
            job.phase = "units";
            const words = new Set(job.words.map(w => w.text));
            // Deleted words invalidate their cached skill results before mapping.
            job.probes = job.probes.filter(p => p.words.every(w => words.has(w)));
            job.reusedProbeIds = (job.reusedProbeIds || []).filter(id => job.probes.some(p => p.id === id));
          } else
            job.probes.push({
              id: skills[0].skillId.id,
              words: job.page.words.map((word) => word.text),
            });
          job.page = emptyPage();
          finishProbePhase(job);
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
