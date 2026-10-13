import type { Account, Env } from "../types.ts";
import { createDuolingoClient, SyncError } from "../sync/duolingo.ts";
import { openCredential } from "../accounts/crypto.ts";
import { userRepository } from "../sync/user-repository.ts";
import { courseRepository } from "./repository.ts";
import { discoverCourses, selectCourses } from "./domain.ts";
export async function refreshCourseList(env: Env, user: Account, supplied: {listing: unknown; profile: unknown} | null = null) {
  const repo = courseRepository(env.DB, user), previous = await repo.get();
  let listing, profile;
  if (supplied) ({ listing, profile } = supplied);
  else {
    if (!user.credential) throw new SyncError("請先連接 Duolingo。", 409);
    let token;
    try { token = await openCredential(user.credential, env.CREDENTIAL_KEY, user.id); }
    catch { throw new SyncError("請重新連接 Duolingo。", 409); }
    const client = createDuolingoClient(token);
    [listing, profile] = await Promise.all([client.courses(), client.profile()]);
  }
  const catalog = userRepository(env.DB, user);
  await catalog.init();
  const courses = discoverCourses(listing, profile, previous?.courses || [], await catalog.courses());
  return repo.save(courses, previous?.revision ?? -1);
}
export async function courseSettings(env: Env, user: Account) {
  if (!user.credential) return { courses: [], revision: -1 };
  const saved = await courseRepository(env.DB, user).get();
  return saved || refreshCourseList(env, user);
}
export async function saveCourseSelection(env: Env, user: Account, body: Record<string, unknown>) {
  const repo = courseRepository(env.DB, user), saved = await repo.get();
  if (!saved || !Number.isInteger(body.revision) || saved.revision !== body.revision) throw new SyncError("課程設定已變更，請重新整理帳號頁。", 409);
  return repo.save(selectCourses(saved.courses, body.courses), saved.revision);
}
