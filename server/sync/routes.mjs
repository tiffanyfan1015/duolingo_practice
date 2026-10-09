import { repository } from "./repository.mjs";
import { createDuolingoClient, SyncError } from "./duolingo.mjs";
import { syncService, publicJob } from "./service.mjs";
import { userRepository } from "./user-repository.mjs";
import { accountCredential, publicAccount } from "../accounts/service.mjs";
export const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function baseCatalog(request, env) {
  try {
    const response = await env.ASSETS.fetch(
      new Request(new URL("/data.json", request.url)),
    );
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.courses)) return data;
    }
  } catch {
    /* Cloud deployments need not contain personal vocabulary files. */
  }
  return {
    courses: ["de", "ja"].map((id) => ({
      id,
      name: id === "de" ? "德文" : "日文",
      units: [],
      words: [],
    })),
  };
}
export async function api(request, env, user = null) {
  const url = new URL(request.url);
  try {
    if (
      url.pathname === "/api/sync/status" &&
      request.method === "GET" &&
      !env.DB
    )
      return json({ available: false, message: "此環境尚未設定雲端同步。" });
    if (url.pathname === "/api/catalog" && request.method === "GET" && !env.DB)
      return json(await baseCatalog(request, env));
    const repo = user ? userRepository(env.DB, user) : repository(env.DB);
    await repo.init();
    if (url.pathname === "/api/catalog" && request.method === "GET") {
      const base = user ? emptyUserCatalog() : await baseCatalog(request, env),
        saved = await repo.courses();
      return json({
        ...(user ? { user: publicAccount(user) } : {}),
        courses: base.courses.map(
          (course) => saved.find((item) => item.id === course.id) || course,
        ),
      });
    }
    const language = url.searchParams.get("language");
    if (!["de", "ja"].includes(language))
      throw new SyncError("請選擇德文或日文。");
    if (url.pathname === "/api/sync/status" && request.method === "GET")
      return json({
        available: user ? !!user.credential : !!env.DUOLINGO_JWT,
        job: publicJob(await repo.get(language)),
        message: user ? (user.credential ? "" : "請到「帳號與 Duolingo」連接你的帳號。") : env.DUOLINGO_JWT
          ? ""
          : "請先在 Cloudflare 設定 DUOLINGO_JWT。",
      });
    if (
      request.method !== "POST" ||
      request.headers.get("Origin") !== url.origin ||
      request.headers.get("X-Cijian-Sync") !== "1"
    )
      throw new SyncError("同步操作來源不合法。", 403);
    if (user && request.headers.get("X-Cijian-User") !== user.id)
      throw new SyncError("登入帳號已變更，請重新整理頁面。", 409);
    if (Number(request.headers.get("Content-Length") || 0) > 1024)
      throw new SyncError("同步請求過大。", 413);
    const text = await request.text();
    if (text.length > 1024) throw new SyncError("同步請求過大。", 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new SyncError("同步請求格式不正確。");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new SyncError("Invalid request body.");
    const client = createDuolingoClient(user ? await accountCredential(user, env) : env.DUOLINGO_JWT);
    const service = syncService(
      repo,
      client,
      url.pathname.endsWith("/step")
        ? (user ? { courses: await repo.courses() } : await baseCatalog(request, env))
        : { courses: [] },
    );
    if (url.pathname === "/api/sync/start")
      return json({
        job: await service.start(language, body.restart === true),
      });
    if (url.pathname === "/api/sync/step" && typeof body.id === "string")
      return json({ job: await service.step(language, body.id) });
    throw new SyncError("找不到同步操作。", 404);
  } catch (error) {
    return json(
      {
        error:
          error instanceof SyncError
            ? error.message
            : "雲端同步暫時失敗，舊字庫未被部分資料覆蓋。",
      },
      error instanceof SyncError ? error.status : 500,
    );
  }
}
export function emptyUserCatalog() {
  return { courses: ["de", "ja"].map((id) => ({ id, name: id === "de" ? "德文" : "日文", units: [], words: [] })) };
}
