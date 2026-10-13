// Fixed providers only. Browser credentials and Duolingo tokens never go upstream.
export function createDictionaryProxy(fetcher: typeof fetch = (...args) => fetch(...args)) {
  const cache = new Map<string, {body: string; size: number; expires: number}>(), pending = new Map<string, Promise<string>>(), blockedUntil = new Map<string, number>();
  let bytes = 0;
  const reply = (body: string | undefined, status = 200) => new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  return async function dictionaryProxy(request: Request) {
    if (request.method !== "GET") return reply('{"error":"Method not allowed"}', 405);
    const query = new URL(request.url).searchParams, provider = query.get("provider"), term = query.get("term")?.trim();
    if (!["wiki", "jisho"].includes(provider || "") || !term || term.length > 120 || /[\x00-\x1f\x7f]/.test(term)) return reply('{"error":"查詢格式不正確。"}', 400);
    if (request.headers.get("Sec-Fetch-Site") === "cross-site") return reply('{"error":"請從單字庫查詢。"}', 403);
    const upstream = new URL(provider === "wiki" ? "https://zh.wiktionary.org/w/api.php" : "https://jisho.org/api/v1/search/words");
    upstream.search = new URLSearchParams(provider === "wiki" ? { action: "parse", page: term, prop: "text|revid", format: "json", formatversion: "2", redirects: "1", uselang: "zh-tw" } : { keyword: term }).toString();
    const key = upstream.href, hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return reply(hit.body);
    if (hit) { bytes -= hit.size; cache.delete(key); }
    const limited = () => reply('{"error":"字典查詢次數較多，請稍後重試。"}', 429);
    if ((blockedUntil.get(upstream.hostname) || 0) > Date.now()) return limited();
    try {
      if (!pending.has(key)) {
        if (pending.size >= 4) return reply('{"error":"字典查詢繁忙，請稍後重試。"}', 429);
        const task = (async () => {
          const response = await fetcher(key, { headers: { Accept: "application/json", "User-Agent": "DuolingoVocabulary/1.0 (per-word dictionary lookup)" }, signal: AbortSignal.timeout(15000), redirect: "error" });
          if (response.status === 429) {
            const raw = response.headers.get("Retry-After");
            const delay = /^\d+$/.test(raw || "") ? Number(raw)*1000 : Date.parse(raw || "")-Date.now();
            blockedUntil.set(upstream.hostname,Date.now()+Math.min(3600000,Math.max(1000,Number.isFinite(delay) ? delay : 60000)));
            throw Error("rate-limited");
          }
          if (!response.ok) throw Error("upstream");
          const reader = response.body!.getReader(), chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 2_000_000) throw Error("size");
              chunks.push(value);
            }
          } finally { await reader.cancel(); }
          const buffer = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
          const body = new TextDecoder().decode(buffer), data = JSON.parse(body);
          if (provider === "wiki" && !(data.error?.code === "missingtitle" || (data.parse && typeof data.parse.text === "string"))) throw Error("format");
          if (provider === "jisho" && (!Array.isArray(data.data) || data.meta?.status !== 200)) throw Error("format");
          while (cache.size && (cache.size >= 32 || bytes + size > 8_000_000)) {
            const oldest = cache.keys().next().value!; bytes -= cache.get(oldest)!.size; cache.delete(oldest);
          }
          cache.set(key, { body, size, expires: Date.now() + 7 * 86400000 }); bytes += size;
          return body;
        })();
        pending.set(key, task);
        task.finally(() => pending.delete(key)).catch(() => {});
      }
      return reply(await pending.get(key));
    } catch (error) { return error instanceof Error && error.message === "rate-limited" ? limited() : reply('{"error":"字典暫時無法查詢，請稍後重試。"}', 502); }
  };
}
export const dictionaryRoute = createDictionaryProxy();
