import type { DuolingoClient } from "../types.ts";
export class SyncError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function userId(token: string | undefined) {
  if (!token)
    throw new SyncError(
      "尚未連接 Duolingo，請先設定登入憑證。",
      503,
    );
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")),
    );
    if (!/^\d+$/.test(String(payload.sub))) throw Error();
    if (
      Object.hasOwn(payload, "exp") &&
      (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) ||
        payload.exp * 1000 <= Date.now())
    )
      throw new SyncError(
        "Duolingo 登入憑證已過期，請重新連接 Duolingo。",
        401,
      );
    return String(payload.sub);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("Duolingo 登入憑證格式不正確。", 401);
  }
}
export function createDuolingoClient(token: string | undefined, fetcher: typeof fetch = fetch): DuolingoClient {
  const id = userId(token);
  async function request(path: string, body?: unknown): Promise<unknown> {
    let response;
    try {
      response = await fetcher("https://www.duolingo.com" + path, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new SyncError("Duolingo 連線逾時或無法連線，請稍後繼續同步。", 502);
    }
    if (!response.ok) {
      const hints: Record<number, string> = {
        401: "Duolingo 登入失效，請重新連接 Duolingo。",
        403: "Duolingo 拒絕雲端存取；需重新登入或網站驗證。",
        429: "請求過於頻繁，請稍後再同步。",
      };
      throw new SyncError(
        hints[response.status] ||
          `Duolingo API 回應 ${response.status}，未更新字庫。`,
        response.status === 429 ? 429 : 502,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new SyncError("Duolingo 未回傳有效資料，可能需要網站驗證。", 502);
    }
  }
  return {
    profile: () => request(`/2023-05-23/users/${id}?fields=currentCourse`),
    courses: () => request(`/2017-06-30/users/${id}?fields=courses,currentCourseId`),
    page: (course, skills, start) =>
      request(
        `/2017-06-30/users/${id}/courses/${course.learningLanguage}/${course.fromLanguage}/learned-lexemes?limit=50&sortBy=LEARNED_DATE&startIndex=${start}`,
        { lastTotalLexemeCount: 0, progressedSkills: skills },
      ),
  };
}
