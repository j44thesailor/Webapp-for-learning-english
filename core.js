(() => {
  const $ = s => document.querySelector(s);
  const body = document.body;
  const frame = $("#frame");
  const modeHost = $("#modeHost");
  const barTools = $("#barTools");
  const hud = $("#hud");
  const ov = $("#ov");
  const ovBody = $("#ovBody");
  const statusEl = $("#status");

  /* =====================================================
   *  ASCII DISPLAY (static Art 2 only)
   * ===================================================== */
  const MAX_SCALE = 4;
  const pre = $("#art"), counter = $("#counter"), vocabMeta = $("#vocabMeta");
  const arts = window.ARTS || [];
  const artText = arts[1] || arts[0] || "";
  let artDim = null;
  let artBox = { left: 0, right: 0, width: 0, height: 0 };

  function measureArt() {
    if (!artText) return;
    pre.style.transform = "none";
    pre.textContent = artText;
    artDim = { w: pre.offsetWidth, h: pre.offsetHeight };
  }
  function fitArt() {
    if (!artDim) return;
    const { w, h } = artDim, pad = 20;
    const fw = frame.clientWidth, fh = frame.clientHeight;
    const s = Math.min((fw - pad * 2) / w, (fh - pad * 2) / h, MAX_SCALE);
    const rw = w * s, rh = h * s;
    const x = (fw - rw) / 2, y = (fh - rh) / 2;
    pre.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    artBox = { left: x, right: x + rw, width: rw, height: rh };
  }
  if (artText) {
    measureArt();
    fitArt();
    counter.textContent = arts[1] ? "tác phẩm 02" : "tác phẩm 01";
  } else {
    pre.textContent = "Không tìm thấy ASCII art trong arts.js";
  }

  /* =====================================================
   *  VOCAB & FLOATING IMPORTED WORDS ON MENU
   * ===================================================== */
  const DEFAULT_VOCAB = [
    ["apple","quả táo"],["knowledge","kiến thức"],["journey","hành trình"],["ancient","cổ xưa"],
    ["borrow","mượn"],["challenge","thử thách"],["delicious","ngon"],["environment","môi trường"],
    ["freedom","sự tự do"],["generous","hào phóng"],["honest","trung thực"],["improve","cải thiện"],
    ["knowledge base","cơ sở tri thức"],["lecture","bài giảng"],["mountain","ngọn núi"],["neighbor","hàng xóm"],
    ["opinion","ý kiến"],["patient","kiên nhẫn"],["quarrel","cãi nhau"],["reliable","đáng tin cậy"],
    ["suggest","gợi ý"],["tremendous","to lớn"],["unusual","khác thường"],["vacation","kỳ nghỉ"],
    ["wisdom","sự thông thái"],["yesterday","hôm qua"],["abandon","từ bỏ"],["brilliant","xuất sắc"],
    ["curious","tò mò"],["essential","thiết yếu"],
  ];
  let vocab = DEFAULT_VOCAB.slice();
  let importedVocab = [];
  try {
    const saved = JSON.parse(localStorage.getItem("wa_vocab") || "null");
    if (Array.isArray(saved) && saved.length) {
      vocab = saved;
      importedVocab = saved.slice();
    }
  } catch (e) {}

  function updateVocabMeta() {
    vocabMeta.textContent = importedVocab.length
      ? `bộ từ đã nạp: ${importedVocab.length} từ`
      : `bộ từ mặc định: ${vocab.length} từ`;
  }
  updateVocabMeta();

  /* ---- Floating words on left & right sides of Art 2 ---- */
  const floatLayer = $("#floatLayer");
  let floatItems = [];
  let floatBag = [];
  let floatSpawnT = 0;
  let floatLast = performance.now();
  let floatSideToggle = 0;

  function nextFloatPair() {
    if (!importedVocab.length) return null;
    if (!floatBag.length) {
      floatBag = importedVocab.map((_, i) => i);
      for (let i = floatBag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [floatBag[i], floatBag[j]] = [floatBag[j], floatBag[i]];
      }
    }
    return importedVocab[floatBag.pop()];
  }

  function clearFloatingWords() {
    floatItems.forEach(it => it.el.remove());
    floatItems = [];
    floatBag = [];
    floatSpawnT = 0;
  }

  function pickSideX(side, elW) {
    const fw = frame.clientWidth;
    const pad = 14;
    if (side === "left") {
      const maxR = Math.max(pad + 60, artBox.left - 14);
      const minL = pad;
      const span = Math.max(0, maxR - minL - elW);
      return minL + Math.random() * span;
    } else {
      const minL = Math.min(fw - pad - 60, artBox.right + 14);
      const maxR = fw - pad;
      const span = Math.max(0, maxR - minL - elW);
      return minL + Math.random() * span;
    }
  }

  function spawnFloatingWord(initialY) {
    const pair = nextFloatPair();
    if (!pair) return;
    const fw = frame.clientWidth, fh = frame.clientHeight;
    if (!fw || !fh) return;

    const side = (floatSideToggle++ % 2 === 0) ? "left" : "right";
    const el = document.createElement("div");
    el.className = "fword" + (Math.random() < 0.45 ? " cyan" : "");

    const enSpan = document.createElement("span");
    enSpan.className = "en";
    enSpan.textContent = pair[0];

    const viSpan = document.createElement("span");
    viSpan.className = "vi";
    viSpan.textContent = pair[1];

    el.appendChild(enSpan);
    el.appendChild(viSpan);
    floatLayer.appendChild(el);

    const elW = el.offsetWidth || 80;
    const elH = el.offsetHeight || 30;
    const baseX = pickSideX(side, elW);
    const y = typeof initialY === "number" ? initialY : fh + elH + Math.random() * 24;

    floatItems.push({
      el, side, baseX, y, h: elH,
      vy: 20 + Math.random() * 18,
      amp: 5 + Math.random() * 8,
      freq: 0.7 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      maxAlpha: 0.55 + Math.random() * 0.35,
      t: 0,
    });
  }

  function seedFloatingWords() {
    clearFloatingWords();
    if (!importedVocab.length) return;
    const fh = frame.clientHeight || 600;
    const count = Math.min(18, Math.max(8, importedVocab.length));
    for (let i = 0; i < count; i++) {
      const y = (fh * (i + 0.5)) / count;
      spawnFloatingWord(y);
    }
  }

  function tickFloatingWords(now) {
    requestAnimationFrame(tickFloatingWords);
    const dt = Math.min((now - floatLast) / 1000, 0.05);
    floatLast = now;

    if (!importedVocab.length || body.classList.contains("game")) return;

    const fh = frame.clientHeight;
    const targetCount = Math.min(20, Math.max(10, importedVocab.length));
    floatSpawnT -= dt;
    if (floatItems.length < targetCount && floatSpawnT <= 0) {
      spawnFloatingWord();
      floatSpawnT = 0.65 + Math.random() * 0.5;
    }

    for (let i = floatItems.length - 1; i >= 0; i--) {
      const it = floatItems[i];
      it.t += dt;
      it.y -= it.vy * dt;
      const sway = Math.sin(it.t * it.freq + it.phase) * it.amp;
      const x = it.baseX + sway;

      const fadeIn = Math.min(1, Math.max(0, (fh - it.y) / 90));
      const fadeOut = Math.min(1, Math.max(0, (it.y + it.h) / 110));
      const alpha = it.maxAlpha * fadeIn * fadeOut;

      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0)`;
      it.el.style.opacity = alpha.toFixed(3);

      if (it.y + it.h < -10) {
        it.el.remove();
        floatItems.splice(i, 1);
      }
    }
  }
  if (importedVocab.length) seedFloatingWords();
  requestAnimationFrame(tickFloatingWords);

  function parseVocab(text, filename) {
    text = text.replace(/^\uFEFF/, "");
    const out = [];
    const push = (en, vi) => {
      en = String(en ?? "").trim().replace(/^["']|["']$/g, "").trim();
      vi = String(vi ?? "").trim().replace(/^["']|["']$/g, "").trim();
      if (!en || !vi) return;
      if (["english", "en", "word"].includes(en.toLowerCase()) && out.length === 0) return;
      out.push([en, vi]);
    };
    const t = text.trim();
    if (/\.json$/i.test(filename) || t[0] === "[" || t[0] === "{") {
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) j.forEach(it => {
          if (Array.isArray(it)) push(it[0], it[1]);
          else if (it && typeof it === "object")
            push(it.en ?? it.english ?? it.word, it.vi ?? it.vietnamese ?? it.meaning);
        });
        else if (j && typeof j === "object") Object.entries(j).forEach(([k, v]) => push(k, v));
        return out;
      } catch (e) {}
    }
    for (const raw of t.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      let idx = -1, len = 1;
      for (const d of ["\t", "|", ";", " - ", " – ", " — ", "=", ",", ":"]) {
        const k = line.indexOf(d);
        if (k > 0) { idx = k; len = d.length; break; }
      }
      if (idx > 0) push(line.slice(0, idx), line.slice(idx + len));
    }
    return out;
  }

  /* =====================================================
   *  WEB SPEECH API (Natural Voice Selection + Auto-Ducking)
   * ===================================================== */
  let bestEnVoice = null;
  function pickBestEnglishVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    const preferredPatterns = [
      /Microsoft Aria Online.*Natural/i,
      /Microsoft Jenny Online.*Natural/i,
      /Microsoft Guy Online.*Natural/i,
      /Microsoft Ava Online.*Natural/i,
      /Google US English/i,
      /Google UK English Female/i,
      /Samantha/i,
      /Karen/i,
      /Daniel/i,
      /Microsoft Zira/i,
      /Microsoft David/i,
    ];
    for (const pat of preferredPatterns) {
      const match = voices.find(v => pat.test(v.name));
      if (match) return match;
    }
    return (
      voices.find(v => /^en[-_]US$/i.test(v.lang) && /natural|neural|google|premium/i.test(v.name)) ||
      voices.find(v => /^en[-_]US$/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang)) ||
      null
    );
  }

  if ("speechSynthesis" in window) {
    bestEnVoice = pickBestEnglishVoice();
    window.speechSynthesis.onvoiceschanged = () => {
      bestEnVoice = pickBestEnglishVoice();
    };
  }

  function speakWord(word, slow = false) {
    if (!word || !("speechSynthesis" in window)) return;
    try {
      if (window.MusicPlayer) window.MusicPlayer.duck(1600);
      window.speechSynthesis.cancel();
      if (!bestEnVoice) bestEnVoice = pickBestEnglishVoice();
      const u = new SpeechSynthesisUtterance(word);
      if (bestEnVoice) {
        u.voice = bestEnVoice;
        u.lang = bestEnVoice.lang || "en-US";
      } else {
        u.lang = "en-US";
      }
      u.rate = slow ? 0.82 : 0.94;
      u.pitch = 1.02;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* =====================================================
   *  META PROGRESSION (Shared across runs)
   * ===================================================== */
  const META_ITEMS = [
    { id: "boundary", kind: "unlock", name: "Định Vị Đầu – Đuôi",     desc: "luôn giữ lộ chữ cái đầu và cuối của từ để dễ định hình mặt chữ", cost: 35 },
    { id: "armor",    kind: "unlock", name: "Mở khóa: Giáp Bảo Vệ",  desc: "thêm Giáp Bảo Vệ vào danh sách nâng cấp",       cost: 20 },
    { id: "turret",   kind: "unlock", name: "Mở khóa: Tháp Pháo Phụ", desc: "thêm Tháp Pháo Tự Động vào danh sách nâng cấp", cost: 40 },
    { id: "curses",   kind: "unlock", name: "Mở khóa: Lời Nguyền",    desc: "chọn lời nguyền mỗi đợt để nhận xu x1.5",       cost: 30 },
    { id: "life",     kind: "perk",   name: "Thêm Tim Khởi Đầu",      desc: "+1 mạng mỗi khi bắt đầu lượt chơi",  max: 2, costs: [40, 90] },
    { id: "seed",     kind: "perk",   name: "Vốn Khởi Nghiệp",        desc: "+15 xu mỗi khi bắt đầu lượt chơi",   max: 3, costs: [15, 30, 50] },
  ];
  const defaultMeta = () => ({ shards: 0, bestScore: 0, bestWave: 0, unlocked: {}, perks: {} });
  let meta = defaultMeta();
  try { meta = Object.assign(defaultMeta(), JSON.parse(localStorage.getItem("wa_meta") || "{}")); } catch (e) {}
  const saveMeta = () => { try { localStorage.setItem("wa_meta", JSON.stringify(meta)); } catch (e) {} };
  const perk = id => meta.perks[id] || 0;

  /* =====================================================
   *  MODE REGISTRY & LIFECYCLE
   * ===================================================== */
  const modes = [];
  let activeMode = null;

  const PLACEHOLDER_MODES = [
    { id: "scramble",  name: "Xếp Chữ Ngược" },
    { id: "hangman",   name: "Đoán Chữ Treo Cổ" },
    { id: "speed",     name: "Đua Gõ Tốc Độ" },
    { id: "listen",    name: "Nghe & Chọn Từ" },
    { id: "sentence",  name: "Ghép Câu Hoàn Chỉnh" },
    { id: "blank",     name: "Điền Vào Chỗ Trống" },
    { id: "translate", name: "Dịch Nhanh Phản Xạ" },
  ];

  function renderSidebar() {
    const listEl = $("#modes");
    listEl.innerHTML = "";

    const all = [
      ...modes.map(m => ({ ...m, ready: true })),
      ...PLACEHOLDER_MODES.filter(p => !modes.some(m => m.id === p.id)).map(p => ({ ...p, ready: false })),
    ];

    all.forEach((m, i) => {
      const b = document.createElement("button");
      b.className = "mode" + (m.ready ? " ready" : "");
      b.innerHTML = `<span>${m.name}</span><span class="idx">${m.ready ? "SẴN SÀNG" : String(i + 1).padStart(2, "0")}</span>`;
      b.onclick = () => {
        if (m.ready) enterMode(m);
        else statusEl.textContent = `[${m.name}] — chế độ này đang được phát triển`;
      };
      listEl.appendChild(b);
    });
  }

  function enterMode(mode) {
    if (activeMode && activeMode.unmount) {
      activeMode.unmount();
    }
    activeMode = mode;
    modeHost.innerHTML = "";
    barTools.innerHTML = "";
    hud.textContent = "";
    hideOv();

    body.classList.add("game");
    statusEl.textContent = "";

    if (window.MusicPlayer) {
      if (mode.useMusic) window.MusicPlayer.startSession();
      else window.MusicPlayer.stopSession();
    }

    setTimeout(() => {
      if (activeMode === mode && mode.mount) {
        mode.mount({
          host: modeHost,
          tools: barTools,
          hud,
          frame,
          ov,
          ovBody,
        });
      }
    }, 740);
  }

  function leaveMode() {
    if (activeMode && activeMode.unmount) {
      activeMode.unmount();
    }
    activeMode = null;
    modeHost.innerHTML = "";
    barTools.innerHTML = "";
    hud.textContent = "";
    hideOv();

    if (window.MusicPlayer) window.MusicPlayer.stopSession();
    body.classList.remove("game");
    setTimeout(() => { fitArt(); }, 740);
  }

  function showOv(html) {
    ovBody.innerHTML = html;
    ov.classList.add("on");
    ov.scrollTop = 0;
  }
  function hideOv() {
    ov.classList.remove("on");
    ovBody.innerHTML = "";
  }

  /* ---- Global Controls (Back + Upload) ---- */
  $("#back").onclick = leaveMode;
  $("#upload").onclick = () => $("#file").click();
  $("#menuUpload").onclick = () => $("#file").click();

  $("#file").onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const list = parseVocab(await f.text(), f.name);
    ev.target.value = "";
    if (!list.length) {
      statusEl.textContent = "file không hợp lệ (định dạng: tiếng anh, tiếng việt)";
      return;
    }
    vocab = list;
    importedVocab = list.slice();
    try { localStorage.setItem("wa_vocab", JSON.stringify(vocab)); } catch (e) {}
    updateVocabMeta();
    fitArt();
    seedFloatingWords();
    statusEl.textContent = `Đã nạp ${list.length} từ từ "${f.name}"`;
    if (activeMode && activeMode.onVocabChange) {
      activeMode.onVocabChange(vocab);
    }
  };

  new ResizeObserver(() => {
    fitArt();
    if (activeMode && activeMode.onResize) activeMode.onResize();
  }).observe(frame);

  window.Arcade = {
    registerMode(def) {
      modes.push(def);
      renderSidebar();
    },
    getVocab: () => vocab,
    speakWord,
    meta,
    META_ITEMS,
    saveMeta,
    perk,
    showOv,
    hideOv,
    ov,
    ovBody,
    norm: s => s.toLowerCase().replace(/\s+/g, " ").trim(),
    rand: (a, b) => a + Math.random() * (b - a),
  };

  renderSidebar();
  if (window.MusicPlayer) window.MusicPlayer.initUI();
})();
