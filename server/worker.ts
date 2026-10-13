import type { Env } from "./types.ts";
import { authenticate } from "./basic-auth.ts";
import { api } from "./sync/routes.ts";
import { multiUserFetch } from "./multi-user.ts";

export default {
  async fetch(request: Request, env: Env) {
    if (env.MULTI_USER === "true") return multiUserFetch(request, env);
    const state = await authenticate(request, env.SITE_PASSWORD);
    if (state === "unconfigured")
      return new Response("Private site is not configured yet.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    if (state !== "allowed")
      return new Response("Please sign in to your private study room.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Cijian", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      });
    if (new URL(request.url).pathname.startsWith("/api/"))
      return api(request, env);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
      });
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  },
};
