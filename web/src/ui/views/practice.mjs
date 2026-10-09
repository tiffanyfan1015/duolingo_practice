import { esc, reading } from "./shared.mjs";

const MODE_COPY = {
  flash: {
    title: "想一想，再翻開答案。",
    label: "翻卡練習",
    prompt: "試著回想中文意思",
  },
  spell: {
    title: "把記得的字，親手寫下來。",
    label: "中文 → 單字",
    prompt: "這個意思，怎麼寫？",
  },
  listen: {
    title: "先聽見，再想起來。",
    label: "聽音 → 單字",
    prompt: "點擊播放，寫下你聽到的字",
  },
};

function startView(count, mode) {
  return /* HTML */ ` <div class="practice-start">
    <div class="eyebrow">A MOMENT FOR YOUR WORDS</div>
    <h3>${MODE_COPY[mode].title}</h3>
    <p>
      從目前篩選的 ${count} 個字中，隨機選取練習。<br />每個字的紀錄，在所有單元與練習方式共用。
    </p>
    <button id="start" class="primary" ${count ? "" : "disabled"}>
      開始練習 →
    </button>
  </div>`;
}

function completedView(session) {
  return /* HTML */ ` <div class="practice-start">
    <div class="eyebrow">A LITTLE MORE FAMILIAR</div>
    <h3>今天，又熟悉了一點。</h3>
    <p>
      完成 ${session.words.length} 個字 · ${session.good} 個記得或答對<br />下次複習時間已更新，可以安心休息。
    </p>
    <button id="restart" class="primary">再練一組</button>
  </div>`;
}

function promptView(word, { mode, language, showRomaji, course }) {
  if (mode === "flash") {
    return /* HTML */ ` <h3>${esc(word.text)}</h3>
      ${reading(word, language, showRomaji)}
      <button
        class="icon-btn"
        data-audio="${esc(word.id)}"
        aria-label="播放發音"
      >
        ♫
      </button>`;
  }
  if (mode === "spell") {
    const unit = course.units.find((item) => item.id === word.units[0]);
    return /* HTML */ ` <h3 class="translation">
        ${esc(word.meanings.slice(0, 3).join("、"))}
      </h3>
      <p class="hint">
        ${esc(unit?.title || "")}<br />請填寫這份字庫收錄的單字；同義詞可自行判斷。
      </p>`;
  }
  return /* HTML */ ` <button
      class="listen-button"
      data-audio="${esc(word.id)}"
      aria-label="播放聽力題目"
    >
      ♫
    </button>
    <p class="hint">可以重播，不限次數。</p>`;
}

function answerView(word, { session, mode, language, showRomaji }) {
  if (!session.revealed) return "";
  const meanings = esc(word.meanings.slice(0, 4).join("、"));
  if (mode === "flash")
    return `<div class="detail-block"><h3>${meanings}</h3></div>`;
  return /* HTML */ ` <div class="detail-block">
    <h3>${esc(word.text)}</h3>
    ${reading(word, language, showRomaji)}
    <p>${meanings}</p>
  </div>`;
}

function gradeButtons(negative, positive) {
  return /* HTML */ ` <div class="study-actions">
    <button data-grade="false" class="secondary">${negative}</button>
    <button data-grade="true" class="primary">${positive}</button>
  </div>`;
}

function controlsView({ session, mode, language }) {
  if (mode === "flash") {
    return session.revealed
      ? gradeButtons("還不熟 · 10 分鐘後", "記得了 →")
      : '<div class="study-actions"><button id="reveal" class="primary">翻開答案</button></div>';
  }
  if (!session.revealed) {
    const placeholder =
      language === "ja" ? "輸入日文（可用假名）" : "輸入德文，保留 ä、ö、ü、ß";
    return /* HTML */ ` <form class="answer-form">
        <input
          id="answer"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="輸入單字"
          placeholder="${placeholder}"
          required
        />
        <button class="primary">檢查答案</button>
      </form>
      <div class="study-actions">
        <button id="skip" class="secondary">想不起來，顯示答案</button>
      </div>`;
  }
  const feedback = session.correct
    ? "答對了。"
    : "本題答案如上；近義詞或其他讀法可自行判斷。";
  const next = session.correct ? "記住了，下一題" : "我也答對了，下一題";
  return /* HTML */ ` <div class="feedback ${session.correct ? "" : "wrong"}">
      ${feedback}${session.answer ? `<br>你的答案：${esc(session.answer)}` : ""}
    </div>
    ${gradeButtons("還要再練", next)}`;
}

export function practiceView(words, context) {
  const { session, mode } = context;
  if (!session) return startView(words.length, mode);
  if (session.index >= session.words.length) return completedView(session);
  const word = session.words[session.index];
  return /* HTML */ ` <div class="practice-wrap">
    <div class="practice-top">
      <span>${MODE_COPY[mode].label}</span
      ><span>${session.index + 1} / ${session.words.length}</span>
    </div>
    <div class="progress">
      <i style="width:${(session.index / session.words.length) * 100}%"></i>
    </div>
    <div class="study-card">
      <div class="prompt-label">${MODE_COPY[mode].prompt}</div>
      ${promptView(word, context)} ${answerView(word, context)}
    </div>
    ${controlsView(context)}
  </div>`;
}
