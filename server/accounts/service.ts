import type { Account, AccountContext, Env } from "../types.ts";
import { record } from "../types.ts";
import { randomSecret, digestSecret, sameSecret, passwordHash, credentialKey, sealCredential, openCredential } from "./crypto.ts";
import { accountRepository } from "./repository.ts";
import { createDuolingoClient, userId, SyncError } from "../sync/duolingo.ts";
import { refreshCourseList, saveCourseSelection } from "../courses/service.ts";
import { discoverCourses } from "../courses/domain.ts";

export const publicAccount = (user: Account | null) => user ? ({ id: user.id, username: user.username, connected: !!user.credential, duolingoId: user.duolingo_id || null }) : null;
export function accountCookie(token: string, maxAge = 604800) {
  return `__Host-cijian=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function sessionToken(request: Request) {
  const token = (request.headers.get("Cookie") || "").split(";").map((s) => s.trim()).find((s) => s.startsWith("__Host-cijian="))?.slice(14);
  return /^[a-f0-9]{64}$/.test(token || "") ? token! : "";
}
export async function accountContext(request: Request, env: Env): Promise<AccountContext> {
  if (!env.DB) throw new SyncError("多人模式尚未設定資料庫。", 503);
  try { await credentialKey(env.CREDENTIAL_KEY); }
  catch { throw new SyncError("多人模式尚未設定憑證加密金鑰。", 503); }
  const repo = accountRepository(env.DB);
  await repo.init();
  const token = sessionToken(request);
  const user = token ? await repo.session(await digestSecret(token), Date.now()) : null;
  return { repo, user, token };
}
export function requireAccount(request: Request, context: AccountContext): asserts context is AccountContext & { user: Account } {
  if (!context.user) throw new SyncError("請先登入 Duolingo 單字庫。", 401);
  const expected = request.headers.get("X-Cijian-User");
  if (expected && expected !== context.user.id) throw new SyncError("登入帳號已變更，請重新整理頁面。", 409);
}
export async function accountAction(action: string, body: Record<string, unknown>, request: Request, env: Env, context: AccountContext) {
  const { repo, token } = context;
  if (["login", "register"].includes(action)) {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (!await repo.throttle(await digestSecret(`auth:${ip}`), 30)) throw new SyncError("嘗試次數過多，請於 15 分鐘後再試。", 429);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = body.password;
    if (!/^[a-z0-9_-]{3,32}$/.test(username) || typeof password !== "string" || password.length < 12 || password.length > 128) throw new SyncError("帳號須為 3–32 個英數字、底線或連字號；密碼須為 12–128 字元。");
    if (!await repo.throttle(await digestSecret(`name:${username}`), 15)) throw new SyncError("此帳號嘗試次數過多，請於 15 分鐘後再試。", 429);
    let found = await repo.byName(username);
    if (action === "register") {
      if (typeof env.REGISTRATION_CODE !== "string" || env.REGISTRATION_CODE.length < 20) throw new SyncError("目前未開放註冊。", 403);
      if (typeof body.invite !== "string" || !await sameSecret(body.invite, env.REGISTRATION_CODE)) throw new SyncError("邀請碼不正確。", 403);
      if (found) throw new SyncError("此帳號名稱無法使用。", 409);
      const salt = randomSecret();
      found = { id: crypto.randomUUID(), username, salt, password_hash: await passwordHash(password, salt), connection_id: crypto.randomUUID() };
      const created = await repo.register(found);
      if (!created.meta.changes) throw new SyncError("此帳號名稱無法使用。", 409);
    } else {
      const hash = await passwordHash(password, found?.salt || "missing-account-salt");
      if (!await sameSecret(hash, found?.password_hash || "invalid") || !found) throw new SyncError("帳號或密碼不正確。", 401);
    }
    const session = randomSecret();
    await repo.addSession(await digestSecret(session), found.id, Date.now() + 604800000);
    if (token) await repo.deleteSession(await digestSecret(token));
    return { user: publicAccount(found), cookie: accountCookie(session) };
  }
  requireAccount(request, context);
  const user = context.user;
  if (request.headers.get("X-Cijian-User") !== user.id) throw new SyncError("請重新整理帳號頁後再操作。", 409);
  if (action === "logout") {
    await repo.deleteSession(await digestSecret(token));
    return { user: null, cookie: accountCookie("", 0) };
  }
  if (action === "connect") {
    if (!await repo.throttle(await digestSecret(`connect:${user.id}`), 20)) throw new SyncError("連接次數過多，請稍後再試。", 429);
    const credential = typeof body.token === "string" ? body.token.trim() : "";
    if (!credential || credential.length > 12000) throw new SyncError("請輸入有效的 Duolingo jwt_token。");
    const duoId = userId(credential);
    if (user.duolingo_id && user.duolingo_id !== duoId) throw new SyncError("此本站帳號已綁定另一個 Duolingo 帳號；請為另一帳號建立新的本站帳號。", 409);
    const client = createDuolingoClient(credential);
    const [profile, listing] = await Promise.all([client.profile(), client.courses()]);
    if (!record(profile).currentCourse) throw new SyncError("無法確認 Duolingo 的目前課程，請先在 Duolingo 選擇課程。");
    discoverCourses(listing, profile);
    const encrypted = await sealCredential(credential, env.CREDENTIAL_KEY, user.id);
    const result = await repo.connect(user, duoId, encrypted);
    if (!result.meta.changes) throw new SyncError("連線狀態已變更，請重新整理。", 409);
    await refreshCourseList(env, { ...user, credential: encrypted }, { listing, profile });
    return { user: publicAccount({ ...user, duolingo_id: duoId, credential: encrypted }) };
  }
  if (action === "refresh-courses" || action === "save-courses") {
    if (!user.credential) throw new SyncError("請先連接 Duolingo。", 409);
    if (action === "refresh-courses") await refreshCourseList(env, user);
    else await saveCourseSelection(env, user, body);
    return { user: publicAccount(user) };
  }
  if (action === "disconnect") {
    const result = await repo.disconnect(user, crypto.randomUUID());
    if (!result.meta.changes) throw new SyncError("連線狀態已變更，請重新整理。", 409);
    return { user: publicAccount({ ...user, credential: null }) };
  }
  throw new SyncError("找不到帳號操作。", 404);
}
export async function accountCredential(user: Account, env: Env) {
  if (!user.credential) throw new SyncError("請到「帳號與 Duolingo」連接你的帳號。", 409);
  try { return await openCredential(user.credential, env.CREDENTIAL_KEY, user.id); }
  catch { throw new SyncError("無法讀取連線憑證，請到帳號頁重新連接 Duolingo。", 503); }
}
