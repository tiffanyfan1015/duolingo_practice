import type { Env } from "./types.ts";
import { accountContext, requireAccount } from "./accounts/service.ts";
import { accountRoutes, accountJson } from "./accounts/routes.ts";
import { api } from "./sync/routes.ts";
import { SyncError } from "./sync/duolingo.ts";
import { studyRoutes } from "./study/routes.ts";
const accountPublicAssets = new Set([
  "/account.html", "/account.js", "/styles/account.css", "/styles/playful.css",
  "/src/account-controller.mjs", "/src/services/account-client.mjs",
  "/src/ui/views/account.mjs", "/src/ui/views/shared.mjs", "/src/ui/account-events.mjs",
]);
const studyAsset = (path: string) => ["/", "/index.html", "/app.js", "/style.css", "/learning.mjs"].includes(path) || /^\/(src|styles|vendor)\/[a-zA-Z0-9_./-]+\.(mjs|js|css|map)$/.test(path);
export async function multiUserFetch(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== "https:") return accountJson({ error: "多人模式需要 HTTPS。" }, 400);
    const context = await accountContext(request, env);
    if (url.pathname.startsWith("/api/account/")) return await accountRoutes(request, env, context);
    if (!accountPublicAssets.has(url.pathname) && url.pathname !== "/account") {
      if (!context.user && ["/", "/index.html"].includes(url.pathname) && request.method === "GET") return new Response(null, { status: 302, headers: { Location: "/account", "Cache-Control": "no-store" } });
      requireAccount(request, context);
      if (url.pathname === "/api/study") return await studyRoutes(request,env,context.user);
      if (url.pathname === "/data.json") return accountJson({ error: "多人模式不提供共用私人字庫。" }, 404);
      if (url.pathname.startsWith("/api/")) return await api(request, env, context.user);
      if (!studyAsset(url.pathname)) return accountJson({ error: "找不到資源。" }, 404);
    }
    if (!["GET", "HEAD"].includes(request.method)) return accountJson({ error: "Method not allowed" }, 405);
    // Workers Assets maps /account to account.html. Rewriting to .html here
    // would conflict with its canonical URL redirect and cause a loop.
    const asset = await env.ASSETS.fetch(new Request(url, request));
    const response = new Response(asset.body, asset);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return response;
  } catch (error) {
    return accountJson({ error: error instanceof SyncError ? error.message : "帳號服務暫時無法使用，請稍後再試。" }, error instanceof SyncError ? error.status : 500);
  }
}
