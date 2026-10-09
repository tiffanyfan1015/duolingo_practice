export function createAudioPlayer(notify) {
  let current = null;
  let generation = 0;

  function stop() {
    generation++;
    current?.pause();
    current = null;
    window.speechSynthesis?.cancel();
  }

  return {
    stop,
    async play(word, language) {
      stop();
      const request = generation;
      if (word.audio) {
        try {
          current = new Audio(word.audio);
          await current.play();
          return;
        } catch {
          /* Fall back to device speech when a recording is unavailable. */
        }
      }
      if (request !== generation) return;
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(word.text);
        utterance.lang = language === "de" ? "de-DE" : "ja-JP";
        speechSynthesis.speak(utterance);
        notify("原始音訊無法播放，改用裝置語音。");
      } else {
        notify("目前無法播放音訊，請檢查網路。");
      }
    },
  };
}
