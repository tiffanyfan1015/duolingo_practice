// Local-only synthetic Worker harness. Never reads real credentials or vocabulary.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../../server/worker.mjs";
import { testDatabase } from "./database.mjs";
const preview = process.argv.includes("--preview");
const previewPort = 8766;
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const root = fileURLToPath(new URL("../../web/", import.meta.url));
const env = {
  MULTI_USER: "true", DB: testDatabase(), CREDENTIAL_KEY: "ab".repeat(32), REGISTRATION_CODE: "browser-test-invitation-code",
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path === "/account" ? "/account.html" : path));
    if (!file.startsWith(resolve(root) + sep)) return new Response("", { status: 404 });
    try {
      let content = await readFile(file);
      if (preview && extname(file) === ".html") content = content.toString("utf8").replace("<body>", '<body><div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff2cc;color:#493711;padding:8px 16px;text-align:center;font:14px system-ui">本機示範 · 使用模擬 Duolingo 資料 · 帳號 demo / 密碼 demo-study-12345 · 重啟後帳號重設</div>');
      return new Response(content, { headers: { "Content-Type": ({ ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" } });
    } catch { return new Response("", { status: 404 }); }
  } },
};
globalThis.fetch = async (url, options) => {
  if (!url.startsWith("https://www.duolingo.com/")) throw new Error("Unexpected network request");
  const token = options.headers.Authorization.slice(7);
  const { sub } = JSON.parse(atob(token.split(".")[1]));
  if (sub === "999") return new Response("", { status: 403 });
  return Response.json(url.includes("learned-lexemes")
    ? { learnedLexemes: [{ text: "Haus-" + sub, translations: ["房子"] }], pagination: { nextStartIndex: null, totalLexemes: 1 } }
    : { currentCourse: { id: "course", learningLanguage: "de", fromLanguage: "zh", skills: [{ id: "skill", finishedLevels: 1 }], pathSectioned: [] } });
};
const server = createServer(async (req, res) => {
  try {
    if (preview && req.headers.host !== `127.0.0.1:${previewPort}`) {
      res.writeHead(403); res.end("Use the loopback preview URL."); return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = { ...req.headers };
    // Only this loopback-only demo adapts HTTP cookies/origin. Production
    // continues to require HTTPS and __Host- Secure cookies.
    if (preview) {
      if (headers.origin === previewOrigin) headers.origin = "https://cijian.test";
      if (headers.cookie) headers.cookie = headers.cookie.split(";").map((part) => part.trim().replace(/^cijian-preview=/, "__Host-cijian=")).join("; ");
    }
    const response = await worker.fetch(new Request("https://cijian.test" + req.url, {
      method: req.method, headers,
      ...(["GET","HEAD"].includes(req.method) ? {} : { body: Buffer.concat(chunks) }),
    }), env);
    const responseHeaders = Object.fromEntries(response.headers);
    if (preview && responseHeaders["set-cookie"]) responseHeaders["set-cookie"] = responseHeaders["set-cookie"].replace("__Host-cijian=", "cijian-preview=").replace("; Secure", "");
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end("Test harness error"); }
});
if (preview) {
  const invoke = (path, body, auth = {}) => worker.fetch(new Request("https://cijian.test" + path, {
    method: "POST", headers: { Origin: "https://cijian.test", "Content-Type": "application/json", "X-Cijian-Account": "1", "X-Cijian-Sync": "1", ...auth }, body: JSON.stringify(body),
  }), env);
  const registered = await invoke("/api/account/register", { username: "demo", password: "demo-study-12345", invite: env.REGISTRATION_CODE });
  if (!registered.ok) throw new Error("Could not initialize demo account");
  const { user } = await registered.json();
  const auth = { Cookie: registered.headers.get("set-cookie").split(";")[0], "X-Cijian-User": user.id };
  const token = "a." + btoa(JSON.stringify({ sub: "101", exp: 4102444800 })) + ".synthetic";
  const connected = await invoke("/api/account/connect", { token }, auth);
  if (!connected.ok) throw new Error("Could not initialize demo connection");
  let response = await invoke("/api/sync/start?language=de", {}, auth);
  let job = (await response.json()).job;
  for (let i = 0; job && job.phase !== "done" && i < 20; i++) {
    response = await invoke("/api/sync/step?language=de", { id: job.id }, auth);
    job = (await response.json()).job;
  }
  if (job?.phase !== "done") throw new Error("Could not initialize demo vocabulary");
}
server.listen(preview ? previewPort : 0, "127.0.0.1", () => process.stdout.write(preview
  ? `Local demo: ${previewOrigin}/account\nAccount: demo\nPassword: demo-study-12345\nInvitation: ${env.REGISTRATION_CODE}\nSynthetic data only. Account data resets when stopped.\n`
  : String(server.address().port) + "\n"));
