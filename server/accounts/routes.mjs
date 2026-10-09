import { accountAction, publicAccount } from "./service.mjs";
import { SyncError } from "../sync/duolingo.mjs";
export const accountJson = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export async function accountRoutes(request, env, context) {
  const url = new URL(request.url);
  if (url.pathname === "/api/account/me" && request.method === "GET") return accountJson({ user: publicAccount(context.user) });
  if (request.method !== "POST") throw new SyncError("找不到帳號操作。", 404);
  if (request.headers.get("Origin") !== url.origin || request.headers.get("X-Cijian-Account") !== "1" || !request.headers.get("Content-Type")?.startsWith("application/json")) throw new SyncError("操作來源不合法。", 403);
  if (Number(request.headers.get("Content-Length") || 0) > 16000) throw new SyncError("請求過大。", 413);
  const reader = request.body?.getReader();
  let text = "", size = 0;
  const decoder = new TextDecoder();
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) { await reader.cancel(); throw new SyncError("請求過大。", 413); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let body;
  try { body = JSON.parse(text); } catch { throw new SyncError("請求格式不正確。"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SyncError("請求格式不正確。");
  const result = await accountAction(url.pathname.slice("/api/account/".length), body, request, env, context);
  const response = accountJson({ user: result.user });
  if (result.cookie) response.headers.set("Set-Cookie", result.cookie);
  return response;
}
