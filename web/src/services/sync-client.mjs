export function createSyncClient(fetcher = fetch, userId = null) {
  async function request(path, language, body) {
    let response;
    try {
      response = await fetcher(
        `./api/sync/${path}?language=${encodeURIComponent(language)}`,
        body === undefined
          ? { cache: "no-store", ...(userId ? { headers: { "X-Cijian-User": userId } } : {}) }
          : {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Cijian-Sync": "1",
                ...(userId ? { "X-Cijian-User": userId } : {}),
              },
              body: JSON.stringify(body),
            },
      );
    } catch {
      throw new Error("網路中斷，請保持頁面開啟並按「繼續同步」。");
    }
    if (response.status === 404)
      throw new Error("此網址是本機靜態版，請改用已部署的雲端網站同步。");
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("雲端服務尚未設定，或登入已失效。");
    }
    if (!response.ok) throw new Error(data.error || "同步失敗，請稍後再試。");
    return data;
  }
  return {
    status: (language) => request("status", language),
    start: (language, restart) => request("start", language, { restart }),
    step: (language, id) => request("step", language, { id }),
  };
}
