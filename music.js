(() => {
  const BASE_VOL = 0.35;
  const DUCK_VOL = 0.08;

  const tracks = (window.PLAYLIST || []).map(item => {
    const clean = String(item).trim();
    if (!clean) return null;
    const isUrl = /^https?:\/\//i.test(clean);
    const src = isUrl ? clean : `music/${encodeURIComponent(clean)}`;
    const label = clean.split("/").pop().replace(/\.(mp3|ogg|wav|m4a)$/i, "");
    return { src, label };
  }).filter(Boolean);

  const audio = new Audio();
  audio.volume = BASE_VOL;

  let active = false, isPlaying = false, history = [], histPos = -1, bag = [], duckTimer = null;
  let barEl, titleEl, playBtnEl, prevBtnEl, nextBtnEl;

  function pickRandom() {
    if (tracks.length <= 1) return 0;
    if (!bag.length) {
      bag = tracks.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[bag.length - 1] === history[histPos]) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    return bag.pop();
  }

  function updateUI() {
    if (!barEl) return;
    barEl.classList.toggle("hidden", !active);
    barEl.classList.toggle("playing", isPlaying);
    if (playBtnEl) playBtnEl.textContent = isPlaying ? "⏸" : "▶";
    if (prevBtnEl) prevBtnEl.disabled = histPos <= 0;
    if (!tracks.length) {
      titleEl.textContent = "Chưa có nhạc trong playlist.js";
      return;
    }
    const cur = tracks[history[histPos]];
    titleEl.textContent = cur ? cur.label : "...";
    titleEl.title = titleEl.textContent;
  }

  function playIndex(idx) {
    const t = tracks[idx];
    if (!t) return;
    audio.src = t.src;
    audio.volume = BASE_VOL;
    audio.play().then(() => { isPlaying = true; updateUI(); })
                .catch(() => { isPlaying = false; updateUI(); });
    updateUI();
  }

  audio.addEventListener("ended", () => { if (active) next(); });
  audio.addEventListener("error", () => {
    if (active && tracks.length > 1) next();
    else if (titleEl) titleEl.textContent = "Không tải được file nhạc";
  });

  function startSession() {
    active = true;
    if (!tracks.length) return updateUI();
    if (histPos === -1) { history = [pickRandom()]; histPos = 0; }
    playIndex(history[histPos]);
  }

  function stopSession() {
    active = false; isPlaying = false;
    clearTimeout(duckTimer);
    audio.pause(); audio.currentTime = 0;
    updateUI();
  }

  function togglePlay() {
    if (!active || !tracks.length) return;
    if (isPlaying) { audio.pause(); isPlaying = false; }
    else { audio.play(); isPlaying = true; }
    updateUI();
  }

  function next() {
    if (!active || !tracks.length) return;
    if (histPos < history.length - 1) histPos++;
    else { history.push(pickRandom()); histPos = history.length - 1; }
    playIndex(history[histPos]);
  }

  function prev() {
    if (!active || !tracks.length) return;
    if (histPos > 0) { histPos--; playIndex(history[histPos]); }
    else { audio.currentTime = 0; }
  }

  function duck(ms = 1600) {
    if (!active || !isPlaying) return;
    clearTimeout(duckTimer);
    audio.volume = DUCK_VOL;
    duckTimer = setTimeout(() => { audio.volume = BASE_VOL; }, ms);
  }

  function initUI() {
    barEl = document.getElementById("musicBar");
    titleEl = document.getElementById("musicTitle");
    playBtnEl = document.getElementById("musicPlay");
    prevBtnEl = document.getElementById("musicPrev");
    nextBtnEl = document.getElementById("musicNext");
    if (prevBtnEl) prevBtnEl.onclick = prev;
    if (playBtnEl) playBtnEl.onclick = togglePlay;
    if (nextBtnEl) nextBtnEl.onclick = next;
    updateUI();
  }

  window.MusicPlayer = { initUI, startSession, stopSession, togglePlay, next, prev, duck };
})();
