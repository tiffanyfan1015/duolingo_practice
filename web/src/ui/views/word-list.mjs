import { dueNow } from "../../domain/learning.mjs";
import { esc, reading } from "./shared.mjs";

export function listView(
  words,
  {
    page,
    pageSize,
    hideMeaning,
    records,
    language,
    showRomaji,
  },
) {
  if (!words.length) {
    return '<p class="empty">這裡還沒有單字。<br>試著切換單元、狀態或搜尋條件。</p>';
  }
  const size = pageSize || words.length;
  page = Math.min(page, Math.ceil(words.length / size) - 1);
  const rows = words.slice(page * size, (page + 1) * size);
  return /* HTML */ `<table class="word-table">
      <thead>
        <tr>
          <th>單字 / WORD</th>
          <th>釋義</th>
          <th>學習狀態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((w) => {
            const r = records[w.id] || {};
            return /* HTML */ `<tr>
              <td>
                <button class="word-title" data-detail="${esc(w.id)}">
                  ${esc(w.text)}</button
                >${reading(w, language, showRomaji)}
              </td>
              <td>
                <div
                  class="meaning ${hideMeaning ? "concealed" : ""}"
                  tabindex="${hideMeaning ? "0" : "-1"}"
                  aria-label="${hideMeaning ? "點擊顯示釋義" : "釋義"}"
                >
                  ${esc(w.meanings.slice(0, 3).join("、"))}
                </div>
                ${w.meanings.length > 3 ? '<div class="word-meta">點單字看完整釋義</div>' : ""}
              </td>
              <td>
                <span class="tag ${dueNow(r) ? "review" : ""}"
                  >${!r.reviews
                    ? "尚未練習"
                    : dueNow(r)
                      ? "待複習"
                      : "已安排複習"}</span
                >
              </td>
              <td>
                <div class="actions">
                  <button
                    class="icon-btn"
                    data-audio="${esc(w.id)}"
                    aria-label="播放 ${esc(w.text)} 發音"
                  >
                    ♫</button
                  ><button
                    class="icon-btn ${r.star ? "starred" : ""}"
                    data-star="${esc(w.id)}"
                    aria-label="收藏 ${esc(w.text)}"
                    aria-pressed="${!!r.star}"
                  >
                    ${r.star ? "★" : "☆"}
                  </button>
                </div>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <div class="pagination">
      <button id="prev" ${page === 0 ? "disabled" : ""}>← 上一頁</button
      ><span>${page + 1} / ${Math.ceil(words.length / size)}</span
      ><button id="next" ${(page + 1) * size >= words.length ? "disabled" : ""}>
        下一頁 →
      </button>
    </div>`;
}
