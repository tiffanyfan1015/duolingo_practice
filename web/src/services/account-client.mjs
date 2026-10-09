export function createAccountClient(fetcher = fetch) {
  let owner = null;
  async function request(action, body) {
    const response = await fetcher(`/api/account/${action}`, body === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "Content-Type": "application/json", "X-Cijian-Account": "1", ...(owner ? { "X-Cijian-User": owner } : {}) }, body: JSON.stringify(body),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("帳號服務無法使用，請確認已啟用多人模式。"); }
    if (!response.ok) throw new Error(data.error || "操作失敗，請稍後再試。");
    owner = data.user?.id || null;
    return data.user;
  }
  return { me: () => request("me"), action: (action, body = {}) => request(action, body) };
}
