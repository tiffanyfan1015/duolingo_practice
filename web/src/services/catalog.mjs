export async function loadCatalog(fetcher = fetch, expectedUserId = null) {
  let response = await fetcher("./api/catalog", { cache: "no-store", ...(expectedUserId ? { headers: { "X-Cijian-User": expectedUserId } } : {}) });
  if (response.status === 401) {
    location.assign("/account");
    throw new Error("請先登入。");
  }
  if (response.status === 404 || response.status === 503)
    response = await fetcher("./data.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load catalog");
  const data = await response.json();
  if (expectedUserId && data.user?.id !== expectedUserId) throw new Error("登入帳號已變更，請重新整理頁面。");
  if (!Array.isArray(data.courses) || (!data.courses.length && !data.user))
    throw new Error("Invalid catalog");
  return data;
}
