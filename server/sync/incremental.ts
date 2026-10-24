import type { CourseSnapshot, SyncJob } from "../types.ts";

// Only completed, internally consistent snapshots may supply reusable probes.
export function reusableProbes(snapshot: CourseSnapshot, previous: SyncJob | null): SyncJob["probes"] {
  if (!previous || previous.phase !== "done" ||
      JSON.stringify(previous.course) !== JSON.stringify(snapshot.course) ||
      JSON.stringify(previous.units) !== JSON.stringify(snapshot.units) ||
      !Array.isArray(previous.skills) || !Array.isArray(previous.probes) || !Array.isArray(previous.words)) return [];
  const skills = new Map(previous.skills.map(s => [s.skillId.id, s]));
  const probes = new Map(previous.probes.map(p => [p.id, p]));
  const words = new Set(previous.words.map(w => w.text));
  if (!words.size || skills.size !== previous.skills.length || probes.size !== skills.size ||
      probes.size !== previous.probes.length || previous.skills.some(s => !probes.has(s.skillId.id)) ||
      previous.probes.some(p => !Array.isArray(p.words) || p.words.some(w => typeof w !== "string" || !words.has(w)))) return [];
  // Removing a learned skill can indicate a reset or a changed course structure.
  const current = new Set(snapshot.skills.map(s => s.skillId.id));
  if (previous.skills.some(s => !current.has(s.skillId.id))) return [];
  return snapshot.skills.flatMap(skill => {
    const old = skills.get(skill.skillId.id), probe = probes.get(skill.skillId.id);
    if (!old || !probe || old.finishedLevels !== skill.finishedLevels ||
        old.finishedSessions !== skill.finishedSessions ||
        new Set(probe.words).size === words.size) return [];
    // A probe equal to the entire vocabulary may mean the API ignored skill filtering.
    return [{id: probe.id, words: [...probe.words]}];
  });
}

export function finishProbePhase(job: SyncJob) {
  if (job.probes.length !== job.skills.length) return;
  const covered = new Set(job.probes.flatMap(p => p.words));
  if (job.reusedProbeIds?.length && job.words.some(w => !covered.has(w.text))) {
    // New/unassigned words may belong to an unchanged skill. Recheck reused probes once.
    const reused = new Set(job.reusedProbeIds);
    job.probes = job.probes.filter(p => !reused.has(p.id));
    job.reusedProbeIds = [];
  } else job.phase = "verify";
}
