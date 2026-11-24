(() => {
  const DIFF = {
    han:    { hide: 0.25, speed: 0.32, hint: 0.20, waveSpeed: 0.025 },
    easy:   { hide: 0.28, speed: 0.90, hint: 0.24, waveSpeed: 0.05  },
    medium: { hide: 0.45, speed: 1.05, hint: 0.18, waveSpeed: 0.06  },
    hard:   { hide: 0.70, speed: 1.20, hint: 0.13, waveSpeed: 0.06  },
  };
  const WAVE_BASE = 12, WAVE_STEP = 3;
  const HIDE_PER_WAVE = 0.04;
  const BASE_SPEED = 0.04;
  const CURSE_COIN_MULT = 1.5;
  const TURRET_HITS = 5;
  const HINT_STEP = 0.35;

  const UPG = {
    slow:   { name: "Trường Làm Chậm", max: 5, cost: l => 30 + 20 * l, desc: "từ và boss di chuyển chậm đi 12%" },
    reveal: { name: "Hé Lộ Thêm",      max: 3, cost: l => 35 + 25 * l, desc: "mỗi từ hiển thị thêm 1 chữ cái" },
    armor:  { name: "Giáp Bảo Vệ",     max: 4, cost: l => 40 + 30 * l, desc: "+1 mạng", meta: "armor" },
    turret: { name: "Tháp Pháo Phụ",   max: 4, cost: l => (l === 0 ? 60 : 50 + 35 * l), desc: `bắn đẩy lùi từ (ưu tiên tên lửa boss), ${TURRET_HITS} phát diệt 1 từ`, meta: "turret" },
  };
  const CURSES = {
    swift: { name: "Tốc Hành", desc: "từ di chuyển nhanh +25%" },
    fog:   { name: "Sương Mù", desc: "ẩn thêm +20% chữ cái" },
  };

  const BOSS_ASCII = [
    "       .---.   .---.       ",
    "    .-/  _  \\_/  _  \\-.    ",
    "   /  | (O) | | (O) |  \\   ",
    "  |===+-----+_+-----+===|  ",
    "  |  [  LEXICON TITAN ] |  ",
    "  |===+=============+===|  ",
    "   \\  |  \\/\\/\\/\\/\\/  |  /   ",
    "    '-\\_____________/--'   ",
    "      //   || ||   \\\\      ",
  ];

  let ui = null;
  let canvas, ctx, input, diffSelect, vocabInfo;
  let W = 0, H = 0, raf = 0, last = 0, state = "idle", prevState = "play", ovKind = null;
  let R = null, enemies = [], boss = null, shots = [], parts = [], floats = [], stars = [], bag = [], laneCount = 3, shakeT = 0, introT = 0;
  const cannon = { x: -90, angle: 0, recoil: 0, tAngle: -0.3 };
  const TOP = 68, BOTTOM = 96, BLOCK_H = 60;

  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const running = () => ["intro", "play", "shop", "paused"].includes(state);
  const isBossWave = w => w > 0 && w % 5 === 0;
  const laneY = i => TOP + (i + 0.5) * (H - TOP - BOTTOM) / laneCount;
  const cannonY = () => TOP + (H - TOP - BOTTOM) / 2;
  const diff = () => DIFF[diffSelect ? diffSelect.value : "han"] || DIFF.han;
  const comboMult = s => (s >= 10 ? 2 : s >= 6 ? 1.5 : s >= 3 ? 1.2 : 1);

  const hideFrac = () => Math.min(1, diff().hide + HIDE_PER_WAVE * (R.wave - 1) + (R.curse === "fog" ? 0.2 : 0));
  const speedNow = () => {
    const d = diff();
    return W * BASE_SPEED * d.speed * (1 + d.waveSpeed * (R.wave - 1)) *
      (R.curse === "swift" ? 1.25 : 1) * Math.pow(0.88, R.upg.slow);
  };
  const toSpawnFor = w => isBossWave(w) ? 1 : (WAVE_BASE + WAVE_STEP * w);
  const spawnGap = () => {
    const slowScale = (diffSelect && diffSelect.value === "han") ? 1.45 : 1;
    return (Math.max(1.5, 3.0 - 0.1 * R.wave) + Arcade.rand(0, 0.7)) * slowScale;
  };
  const hintZoneWidth = (isWeak = false) => {
    const base = W * Math.max(0.08, diff().hint - 0.008 * (R.wave - 1));
    return isWeak ? base * 1.35 : base;
  };

  function initStars() {
    stars = Array.from({ length: 48 }, () => ({
      x: Math.random() * Math.max(W, 800),
      y: Math.random() * Math.max(H, 600),
      r: Arcade.rand(0.6, 1.8),
      a: Arcade.rand(0.12, 0.55),
    }));
  }

  function sizeCanvas() {
    if (!canvas || !ui) return;
    const dpr = window.devicePixelRatio || 1;
    W = ui.frame.clientWidth; H = ui.frame.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!stars.length) initStars();
  }

  /* ---- Weak words tracking ---- */
  function recordWeakWord(en, vi) {
    if (!R || !en) return;
    const key = Arcade.norm(en);
    const vocab = Arcade.getVocab();
    if (!R.weakMap[key]) {
      const found = vocab.find(v => Arcade.norm(v[0]) === key);
      R.weakMap[key] = { en: found ? found[0] : en, vi: vi || (found ? found[1] : ""), count: 0 };
    }
    R.weakMap[key].count++;
  }
  const isWeakKey = en => !!(R && R.weakMap[Arcade.norm(en)]);

  function nextWord(opts = {}) {
    const vocab = Arcade.getVocab();
    if (R) {
      const weakKeys = Object.keys(R.weakMap);
      if (weakKeys.length && Math.random() < 0.40) {
        const k = weakKeys[(Math.random() * weakKeys.length) | 0];
        const w = R.weakMap[k];
        if (w) return [w.en, w.vi];
      }
    }
    if (opts.preferLong) {
      const longWords = vocab.filter(([en]) => en.replace(/\s+/g, "").length >= 7);
      if (longWords.length) return longWords[(Math.random() * longWords.length) | 0];
    }
    if (opts.preferShort) {
      const shortWords = vocab.filter(([en]) => en.replace(/\s+/g, "").length <= 6);
      if (shortWords.length) return shortWords[(Math.random() * shortWords.length) | 0];
    }
    if (!bag.length) {
      bag = vocab.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return vocab[bag.pop()];
  }

  function mask(word) {
    const chars = [...word];
    const allAlpha = chars.map((c, i) => (/[\p{L}\d]/u.test(c) ? i : -1)).filter(i => i >= 0);
    let idx = allAlpha.slice();

    if (Arcade.meta.unlocked.boundary && idx.length >= 3) {
      idx = idx.slice(1, -1);
    }

    for (let i = idx.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    let n = Math.max(1, Math.round(allAlpha.length * hideFrac()));
    n = Math.min(idx.length, Math.max(idx.length > 0 ? 1 : 0, n - R.upg.reveal));
    const order = idx.slice(0, n);
    order.forEach(i => (chars[i] = "_"));
    return { text: chars.join(" "), hidden: n, order };
  }

  function spawn(opts = {}) {
    const busyLanes = new Set(enemies.filter(e => e.x + e.w > W - 30).map(e => e.lane));
    const free = [...Array(laneCount).keys()].filter(l => !busyLanes.has(l));
    if (!free.length) return false;
    const lane = free[(Math.random() * free.length) | 0];
    const [en, vi] = nextWord(opts);
    const m = mask(en);
    const weak = isWeakKey(en);
    ctx.font = "bold 18px monospace"; const w1 = ctx.measureText(m.text).width;
    ctx.font = "13px monospace";      const w2 = ctx.measureText(vi).width;
    const startX = typeof opts.startX === "number" ? opts.startX : (W + 10);
    enemies.push({
      word: en, shown: m.text, vi, hidden: m.hidden, lane,
      w: Math.max(w1, w2) + 36, x: startX, dead: false, targeted: false, hits: 0,
      orig: [...en], order: m.order.slice().sort((a, b) => a - b),
      hintT: 0, step: -1, inZone: false, flash: 0,
      weak, isMissile: !!opts.isMissile
    });
    return true;
  }

  /* ---- BOSS ---- */
  function loadBossWord(b) {
    const [en, vi] = nextWord({ preferLong: true });
    const m = mask(en);
    const weak = isWeakKey(en);
    b.word = en; b.shown = m.text; b.vi = vi; b.hidden = m.hidden;
    b.orig = [...en]; b.order = m.order.slice().sort((a, c) => a - c);
    b.hintT = 0; b.step = -1; b.inZone = false; b.flash = 0.35;
    b.weak = weak; b.targeted = false;
  }

  function spawnBoss() {
    const tier = Math.max(1, Math.floor(R.wave / 5));
    const maxHp = 8 + 2 * tier;
    const bh = Math.max(220, H - TOP - BOTTOM - 18);
    const bw = Math.min(310, Math.max(240, W * 0.26));
    boss = {
      tier, maxHp, hp: maxHp, w: bw, h: bh,
      x: W + 20, y: TOP + (H - TOP - BOTTOM - bh) / 2,
      missileT: 3.4, slowT: 0, hurtT: 0,
      word: "", shown: "", vi: "", hidden: 0,
      orig: [], order: [], hintT: 0, step: -1, inZone: false, flash: 0, weak: false, targeted: false
    };
    loadBossWord(boss);
  }

  function hint(e, dt) {
    if (e.flash > 0) e.flash -= dt;
    const n = e.order.length;
    if (!n) return;
    const build = ri => { const a = [...e.orig]; e.order.forEach(i => { if (i !== ri) a[i] = "_"; }); return a.join(" "); };
    const start = cannon.x + 44 + hintZoneWidth(e.weak);
    if (e.x < start) {
      if (!e.inZone) { e.inZone = true; e.hintT = 0; e.flash = 0.35; }
      e.hintT += dt;
      const frames = n === 1 ? 2 : n;
      const step = Math.floor(e.hintT / HINT_STEP) % frames;
      if (step !== e.step) { e.step = step; e.shown = build(step < n ? e.order[step] : -1); }
    } else if (e.inZone) {
      e.inZone = false; e.step = -1; e.shown = build(-1);
    }
  }

  const center = e => e === boss
    ? ({ x: boss.x + boss.w * 0.42, y: boss.y + boss.h / 2 })
    : ({ x: e.x + e.w / 2, y: laneY(e.lane) });

  function muzzle() {
    const L = 78 - cannon.recoil;
    return { x: cannon.x + Math.cos(cannon.angle) * L, y: cannonY() + Math.sin(cannon.angle) * L };
  }

  function fire(targetObj) {
    targetObj.targeted = true;
    const c = center(targetObj);
    cannon.angle = Math.atan2(c.y - cannonY(), c.x - cannon.x);
    cannon.recoil = 14;
    const m = muzzle();
    shots.push({ x: m.x, y: m.y, target: targetObj, kind: "main" });
  }

  function fireTurret() {
    const missiles = enemies.filter(e => !e.dead && !e.targeted && e.isMissile && e.x < W - 10);
    const regulars = enemies.filter(e => !e.dead && !e.targeted && !e.isMissile && e.x < W - 10);
    let targetObj = null;
    if (missiles.length) targetObj = missiles.reduce((a, b) => (a.x < b.x ? a : b));
    else if (regulars.length) targetObj = regulars.reduce((a, b) => (a.x < b.x ? a : b));
    else if (boss && boss.hp > 0 && boss.x < W - 20) targetObj = boss;

    if (!targetObj) return false;
    const c = center(targetObj);
    const ox = cannon.x, oy = cannonY() - 22;
    cannon.tAngle = Math.atan2(c.y - oy, c.x - ox);
    shots.push({ x: ox + Math.cos(cannon.tAngle) * 30, y: oy + Math.sin(cannon.tAngle) * 30, target: targetObj, kind: "turret" });
    return true;
  }

  function explode(e, auto) {
    e.dead = true; R.kills++;
    const base = 1 + Math.ceil(e.hidden / 2);
    const weakBonus = e.weak ? 2 : 1;
    let gain;
    if (auto) { gain = Math.max(1, Math.ceil(base / 2)) * weakBonus; R.score += 5 * weakBonus; }
    else {
      R.streak++; R.maxStreak = Math.max(R.maxStreak, R.streak);
      gain = Math.max(1, Math.round(base * comboMult(R.streak) * (R.curse ? CURSE_COIN_MULT : 1))) * weakBonus;
      R.score += Math.round((10 + e.hidden * 5) * comboMult(R.streak)) * weakBonus;
    }
    R.coins += gain; R.earned += gain;
    const c = center(e);
    for (let i = 0; i < 20; i++) {
      const a = Arcade.rand(0, Math.PI * 2), v = Arcade.rand(60, 240);
      parts.push({
        x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: Arcade.rand(.45, .85), max: .85,
        ch: "*#%@+✦"[(Math.random() * 6) | 0],
        col: e.weak ? "#fbbf24" : (i % 2 === 0 ? "#a78bfa" : "#38bdf8")
      });
    }
    floats.push({ text: e.word, x: c.x, y: c.y, life: 1.15, col: "#f1effc" });
    floats.push({ text: `+${gain} xu${weakBonus > 1 ? " (x2 Từ yếu)" : ""}`, x: c.x, y: c.y + 26, life: .85, small: true, col: "#fbbf24" });
  }

  function hitBoss() {
    if (!boss || boss.hp <= 0) return;
    boss.hp--;
    boss.hurtT = 0.25;
    boss.x = Math.min(W - boss.w * 0.45, boss.x + W * 0.055);
    R.streak++; R.maxStreak = Math.max(R.maxStreak, R.streak);
    const weakBonus = boss.weak ? 2 : 1;
    const gain = (2 + Math.ceil(boss.hidden / 2)) * weakBonus;
    R.coins += gain; R.earned += gain;
    R.score += Math.round((25 + boss.hidden * 6) * comboMult(R.streak)) * weakBonus;

    const c = center(boss);
    for (let i = 0; i < 18; i++) {
      const a = Arcade.rand(0, Math.PI * 2), v = Arcade.rand(70, 250);
      parts.push({
        x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: Arcade.rand(.4, .8), max: .8,
        ch: "*#%@+✦"[(Math.random() * 6) | 0],
        col: i % 2 === 0 ? "#fb7185" : "#fbbf24"
      });
    }
    floats.push({ text: `${boss.word} (-1 HP)`, x: c.x, y: c.y - 10, life: 1.0, col: "#f1effc" });
    floats.push({ text: `+${gain} xu`, x: c.x, y: c.y + 16, life: .8, small: true, col: "#fbbf24" });

    if (boss.hp <= 0) {
      const bonusCoins = 20 + 5 * R.wave;
      const bonusShards = 6 + 2 * boss.tier;
      R.coins += bonusCoins; R.earned += bonusCoins;
      R.lives++; R.kills++;
      Arcade.meta.shards += bonusShards;
      Arcade.saveMeta();
      enemies.forEach(e => { e.dead = true; });
      shakeT = 0.45;
      for (let i = 0; i < 42; i++) {
        const a = Arcade.rand(0, Math.PI * 2), v = Arcade.rand(80, 320);
        parts.push({
          x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: Arcade.rand(.6, 1.2), max: 1.2,
          ch: "*#%@+✦"[(Math.random() * 6) | 0],
          col: i % 3 === 0 ? "#fbbf24" : (i % 3 === 1 ? "#a78bfa" : "#38bdf8")
        });
      }
      floats.push({ text: `HẠ GỤC BOSS! +${bonusCoins} xu · +1 ♥ · +${bonusShards} mảnh`, x: W / 2, y: H / 2, life: 1.5, col: "#fbbf24" });
      boss = null;
      R.freePick = true;
      setTimeout(() => { if (state === "play") openShop(); }, 950);
    } else {
      loadBossWord(boss);
    }
  }

  function newRun() {
    R = {
      wave: 1, toSpawn: toSpawnFor(1), spawned: 0, banner: 2, spawnT: 1.2,
      score: 0, kills: 0, coins: 15 * Arcade.perk("seed"), earned: 0,
      lives: 3 + Arcade.perk("life"), streak: 0, maxStreak: 0,
      upg: { slow: 0, reveal: 0, armor: 0, turret: 0 },
      curse: null, nextCurse: null, turretT: 4,
      draft: [], rerolls: 0, awarded: false, gain: 0,
      weakMap: {}, freePick: false,
    };
    enemies = []; boss = null; shots = []; parts = []; floats = []; bag = [];
    shakeT = 0; introT = 0;
    laneCount = Math.max(2, Math.min(5, Math.floor((H - TOP - BOTTOM) / 76)));
    cannon.x = -90; cannon.angle = 0; cannon.recoil = 0;
    if (input) input.value = "";
    if (vocabInfo) vocabInfo.textContent = `${Arcade.getVocab().length} từ`;
  }

  function awardShards() {
    if (!R || R.awarded) return;
    R.awarded = true;
    R.gain = Math.floor(R.earned * 0.25) + 8 * (R.wave - 1) + Math.floor(R.kills / 10);
    Arcade.meta.shards += R.gain;
    Arcade.meta.bestScore = Math.max(Arcade.meta.bestScore, R.score);
    Arcade.meta.bestWave = Math.max(Arcade.meta.bestWave, R.wave);
    Arcade.saveMeta();
  }
  function gameOver() { state = "over"; awardShards(); if (input) input.blur(); showOv("over"); }

  /* ---- Overlays ---- */
  const opt = (attr, title, right, desc, off, extraCls = "") =>
    `<button class="opt ${extraCls}" ${attr} ${off ? "disabled" : ""}><div class="r"><b>${title}</b><span>${right}</span></div><div class="d">${desc}</div></button>`;

  function poolIds() {
    return Object.keys(UPG).filter(id => (!UPG[id].meta || Arcade.meta.unlocked[UPG[id].meta]) && R.upg[id] < UPG[id].max);
  }
  function pickOne(exclude) {
    const p = poolIds().filter(id => !exclude.includes(id));
    return p.length ? p[(Math.random() * p.length) | 0] : null;
  }
  function rollDraft() {
    const d = [];
    for (let i = 0; i < 3; i++) { const id = pickOne(d); if (id) d.push(id); }
    return d;
  }
  const rerollCost = () => 10 + 5 * R.rerolls;

  function workshopHTML() {
    let h = `<h3>XƯỞNG NÂNG CẤP — mảnh tinh thể: ${Arcade.meta.shards}</h3>`;
    for (const it of Arcade.META_ITEMS) {
      if (it.kind === "unlock") {
        const owned = !!Arcade.meta.unlocked[it.id];
        h += opt(`data-act="meta" data-id="${it.id}"`, it.name, owned ? "đã sở hữu" : `${it.cost} mảnh`, it.desc, owned || Arcade.meta.shards < it.cost);
      } else {
        const lv = Arcade.perk(it.id), maxed = lv >= it.max, cost = it.costs[lv];
        h += opt(`data-act="meta" data-id="${it.id}"`, `${it.name} (Cấp ${lv}/${it.max})`, maxed ? "tối đa" : `${cost} mảnh`, it.desc, maxed || Arcade.meta.shards < cost);
      }
    }
    return h;
  }

  function weakBookHTML() {
    const list = Object.values(R.weakMap).sort((a, b) => b.count - a.count);
    let h = `<h3>SỔ TỬ HUYỆT HẬU TRẬN (${list.length} từ cần ôn lại)</h3>`;
    if (!list.length) {
      h += `<div class="m">Tuyệt vời! Lượt này mày không gõ sai hay để lọt từ nào.</div>`;
      return h;
    }
    h += `<div class="weak-box">` + list.map(it =>
      `<div class="weak-item">
        <div><span class="weak-word">${it.en}</span><span class="weak-vi">— ${it.vi}</span><span class="weak-cnt">(sai/lọt ${it.count} lần)</span></div>
        <button class="btn-xs" data-act="speak" data-word="${it.en.replace(/"/g, "&quot;")}">🔊 Nghe</button>
      </div>`
    ).join("") + `</div>
    <div class="row"><button class="btn" data-act="exportWeak">⬇ Tải file từ yếu để ôn riêng (.txt)</button></div>`;
    return h;
  }

  function renderOv() {
    if (ovKind === "shop") {
      const nextIsBoss = isBossWave(R.wave + 1);
      let h = `<h2>HOÀN THÀNH ĐỢT ${R.wave}${R.freePick ? " — THƯỞNG HẠ BOSS" : ""}</h2>
        <div class="m">xu: <b>${R.coins}</b> &nbsp;·&nbsp; điểm: <b>${R.score}</b> &nbsp;·&nbsp; mạng: <b>${R.lives}</b> &nbsp;·&nbsp; chuỗi cao nhất: <b>${R.maxStreak}</b></div>` +
        (R.freePick ? `<div class="m" style="color:var(--gold)">★ Chiến lợi phẩm Boss: Chọn miễn phí 1 nâng cấp đầu tiên (0 xu)!</div>` : "") +
        `<h3>NÂNG CẤP TRONG TRẬN &nbsp;[1] [2] [3]</h3>`;
      if (!R.draft.length) h += `<div class="m">đã nâng cấp tối đa tất cả kỹ năng.</div>`;
      R.draft.forEach((id, i) => {
        const u = UPG[id], lv = R.upg[id], cost = R.freePick ? 0 : u.cost(lv);
        h += opt(
          `data-act="buy" data-i="${i}"`,
          `[${i + 1}] ${u.name}  (Cấp ${lv} → ${lv + 1})`,
          R.freePick ? "MIỄN PHÍ (0 xu)" : `${cost} xu`,
          u.desc,
          R.coins < cost,
          R.freePick ? "free" : ""
        );
      });
      h += `<div class="row"><button class="btn" data-act="reroll" ${R.coins < rerollCost() ? "disabled" : ""}>[R] Đổi danh sách — ${rerollCost()} xu</button></div>`;
      if (Arcade.meta.unlocked.curses && !nextIsBoss) {
        h += `<h3>LỜI NGUYỀN CHO ĐỢT SAU (xu x${CURSE_COIN_MULT}) &nbsp;[C]</h3><div class="row">
          <button class="btn ${!R.nextCurse ? "on" : ""}" data-act="curse" data-v="">Không dùng</button>` +
          Object.entries(CURSES).map(([k, c]) => `<button class="btn ${R.nextCurse === k ? "on" : ""}" data-act="curse" data-v="${k}" title="${c.desc}">${c.name} — ${c.desc}</button>`).join("") + `</div>`;
      }
      h += `<h3></h3><button class="opt" data-act="start"><div class="r"><b>[Enter] ${nextIsBoss ? `Đối đầu BOSS Đợt ${R.wave + 1}` : `Bắt đầu đợt ${R.wave + 1}`}</b><span>${nextIsBoss ? "Trùm từ vựng xuất hiện" : `${toSpawnFor(R.wave + 1)} từ vựng`}</span></div></button>`;
      Arcade.showOv(h);
    } else if (ovKind === "over") {
      Arcade.showOv(`<h2>KẾT THÚC</h2>
        <div class="m">đợt: <b>${R.wave}</b> &nbsp;·&nbsp; điểm: <b>${R.score}</b> &nbsp;·&nbsp; bắn hạ: <b>${R.kills}</b> từ &nbsp;·&nbsp; chuỗi cao nhất: <b>${R.maxStreak}</b><br>
        xu kiếm được: ${R.earned} &nbsp;→&nbsp; <b>+${R.gain} mảnh tinh thể</b><br>
        kỷ lục cá nhân: đợt ${Arcade.meta.bestWave}, điểm ${Arcade.meta.bestScore}</div>
        ${weakBookHTML()}
        ${workshopHTML()}
        <h3></h3><button class="opt" data-act="restart"><div class="r"><b>Chơi lại từ đầu</b><span></span></div></button>`);
    } else if (ovKind === "workshop") {
      Arcade.showOv(`<h2>TẠM DỪNG</h2>${workshopHTML()}<h3></h3><button class="opt" data-act="resume"><div class="r"><b>Tiếp tục chơi</b><span></span></div></button>`);
    }
  }
  function showOv(kind) { ovKind = kind; renderOv(); }
  function hideOv() { ovKind = null; Arcade.hideOv(); }

  function buy(i) {
    const id = R.draft[i]; if (!id) return;
    const u = UPG[id], cost = R.freePick ? 0 : u.cost(R.upg[id]);
    if (R.coins < cost) return;
    R.coins -= cost; R.upg[id]++;
    if (R.freePick) R.freePick = false;
    if (id === "armor") R.lives++;
    const others = R.draft.filter((_, k) => k !== i);
    const repl = pickOne(others);
    if (repl) R.draft[i] = repl; else R.draft.splice(i, 1);
    renderOv();
  }
  function reroll() {
    if (R.coins < rerollCost()) return;
    R.coins -= rerollCost(); R.rerolls++;
    R.draft = rollDraft(); renderOv();
  }
  function startNextWave() {
    R.wave++;
    R.toSpawn = toSpawnFor(R.wave);
    R.spawned = 0;
    R.curse = isBossWave(R.wave) ? null : R.nextCurse;
    R.nextCurse = null;
    R.banner = 2.2;
    R.spawnT = 1.2;
    R.turretT = 3;
    boss = null;
    hideOv(); state = "play"; if (input) input.focus();
  }
  function openShop() {
    state = "shop"; R.curse = null; R.nextCurse = null; R.rerolls = 0;
    R.draft = rollDraft(); if (input) input.blur(); showOv("shop");
  }

  function onOvClick(e) {
    if (state === "idle") return;
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === "buy") buy(+b.dataset.i);
    else if (a === "reroll") reroll();
    else if (a === "curse") { R.nextCurse = b.dataset.v || null; renderOv(); }
    else if (a === "start") startNextWave();
    else if (a === "restart") startGame();
    else if (a === "resume") { hideOv(); state = prevState; if (input) input.focus(); }
    else if (a === "speak") { Arcade.speakWord(b.dataset.word, true); }
    else if (a === "exportWeak") {
      const list = Object.values(R.weakMap);
      if (!list.length) return;
      const content = list.map(it => `${it.en}, ${it.vi}`).join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tu-yeu-dot-${R.wave}.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    else if (a === "meta") {
      const it = Arcade.META_ITEMS.find(x => x.id === b.dataset.id);
      const cost = it.kind === "unlock" ? it.cost : it.costs[Arcade.perk(it.id)];
      if (Arcade.meta.shards >= cost) {
        Arcade.meta.shards -= cost;
        if (it.kind === "unlock") Arcade.meta.unlocked[it.id] = true;
        else Arcade.meta.perks[it.id] = Arcade.perk(it.id) + 1;
        Arcade.saveMeta(); renderOv();
      }
    }
    if (document.activeElement && document.activeElement !== input) document.activeElement.blur();
  }

  function onKeyDown(e) {
    if (state === "idle") return;
    if (ovKind === "shop") {
      const k = e.key.toLowerCase();
      if (k === "1" || k === "2" || k === "3") buy(+k - 1);
      else if (k === "r") reroll();
      else if (k === "c" && Arcade.meta.unlocked.curses && !isBossWave(R.wave + 1)) {
        const o = ["", "swift", "fog"];
        R.nextCurse = o[(o.indexOf(R.nextCurse || "") + 1) % 3] || null;
        renderOv();
      }
      else if (k === "enter" || k === " ") startNextWave();
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "Tab" && state === "play") {
      e.preventDefault();
      const frontEnemy = enemies.filter(en => !en.dead && !en.targeted).sort((a, b) => a.x - b.x)[0];
      const targetWord = frontEnemy ? frontEnemy.word : (boss ? boss.word : "");
      if (targetWord) Arcade.speakWord(targetWord, true);
    }
  }

  function update(dt) {
    if (state === "intro") {
      introT += dt;
      const p = Math.min(introT / 0.9, 1);
      cannon.x = -90 + 160 * easeOut(p);
      if (p >= 1) { state = "play"; if (input) input.focus(); }
    }
    if (state === "play") {
      R.banner = Math.max(0, R.banner - dt);
      const danger = cannon.x + 44;

      if (isBossWave(R.wave)) {
        if (R.banner < 1 && R.spawned < 1 && !boss) {
          spawnBoss();
          R.spawned = 1;
        }
        if (boss && boss.hp > 0) {
          boss.hurtT = Math.max(0, boss.hurtT - dt);
          boss.slowT = Math.max(0, boss.slowT - dt);
          const bossSpeed = speedNow() * 0.24 * (boss.slowT > 0 ? 0.35 : 1);
          boss.x -= bossSpeed * dt;
          hint(boss, dt);

          boss.missileT -= dt;
          if (boss.missileT <= 0 && boss.x < W - 40) {
            const count = boss.tier >= 2 ? 2 : 1;
            for (let m = 0; m < count; m++) {
              spawn({ preferShort: true, isMissile: true, startX: boss.x + 12 });
            }
            boss.missileT = Math.max(3.2, 5.2 - 0.35 * boss.tier);
          }

          if (boss.x <= danger) {
            recordWeakWord(boss.word, boss.vi);
            R.lives = 0; shakeT = 0.5;
            gameOver();
          }
        }
      } else {
        if (R.banner < 1 && R.spawned < R.toSpawn) {
          R.spawnT -= dt;
          if (R.spawnT <= 0) { if (spawn()) { R.spawned++; R.spawnT = spawnGap(); } else R.spawnT = 0.3; }
        }
      }

      if (state === "play") {
        const speed = speedNow();
        for (const e of enemies) {
          if (e.dead) continue;
          const mult = e.isMissile ? 1.15 : 1;
          e.x -= speed * mult * dt;
          hint(e, dt);
          if (e.x <= danger) {
            recordWeakWord(e.word, e.vi);
            e.dead = true; R.lives--; R.streak = 0; shakeT = 0.35;
            if (R.lives <= 0) { gameOver(); break; }
          }
        }
      }

      if (state === "play") {
        if (R.upg.turret > 0) {
          R.turretT -= dt;
          if (R.turretT <= 0) { if (fireTurret()) R.turretT = Math.max(2.5, 8 - 1.3 * R.upg.turret); else R.turretT = 0.5; }
        }
        for (const s of shots) {
          if (s.target === boss) {
            if (!boss || boss.hp <= 0) { s.gone = true; continue; }
            const c = center(boss), dx = c.x - s.x, dy = c.y - s.y, d = Math.hypot(dx, dy);
            if (d < 34) {
              if (s.kind === "main") hitBoss();
              else { boss.slowT = 1.2; boss.x = Math.min(W - boss.w * 0.45, boss.x + W * 0.015); }
              s.gone = true;
            } else { const v = (s.kind === "main" ? 1150 : 850) * dt; s.x += dx / d * v; s.y += dy / d * v; }
          } else {
            if (s.target.dead) { s.gone = true; continue; }
            const c = center(s.target), dx = c.x - s.x, dy = c.y - s.y, d = Math.hypot(dx, dy);
            if (d < 26) {
              if (s.kind === "main") explode(s.target, false);
              else {
                s.target.x = Math.min(W + 30, s.target.x + W * 0.07); s.target.hits++;
                if (s.target.hits >= TURRET_HITS) explode(s.target, true);
              }
              s.gone = true;
            } else { const v = (s.kind === "main" ? 1150 : 850) * dt; s.x += dx / d * v; s.y += dy / d * v; }
          }
        }
        shots = shots.filter(s => !s.gone);
        enemies = enemies.filter(e => !e.dead);

        const live = enemies.filter(e => !e.targeted);
        if (!shots.some(s => s.kind === "main")) {
          const aimTarget = live.length
            ? live.reduce((a, b) => (a.x < b.x ? a : b))
            : (boss && boss.hp > 0 ? boss : null);
          if (aimTarget) {
            const c = center(aimTarget);
            const want = Math.atan2(c.y - cannonY(), c.x - cannon.x);
            cannon.angle += (want - cannon.angle) * Math.min(1, 8 * dt);
          }
        }

        if (!isBossWave(R.wave) && R.spawned >= R.toSpawn && !enemies.length && R.banner <= 0) {
          openShop();
        }
      }
    }
    if (state !== "paused") {
      cannon.recoil = Math.max(0, cannon.recoil - 50 * dt);
      shakeT = Math.max(0, shakeT - dt);
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
      parts = parts.filter(p => p.life > 0);
      for (const f of floats) { f.y -= 30 * dt; f.life -= dt; }
      floats = floats.filter(f => f.life > 0);
    }
    const cm = comboMult(R.streak);
    if (ui && ui.hud) {
      ui.hud.textContent =
        `ĐỢT ${R.wave}${isBossWave(R.wave) ? " [BOSS]" : ""} · ĐIỂM ${R.score} · XU ${R.coins} · ${"♥".repeat(Math.max(R.lives, 0)) || "-"}` +
        (R.streak >= 3 ? ` · CHUỖI x${cm} (${R.streak})` : "") + (R.curse ? ` · [${CURSES[R.curse].name}]` : "");
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCannon() {
    const cx = cannon.x, cy = cannonY();
    ctx.save();
    ctx.shadowColor = "rgba(167, 139, 250, 0.45)";
    ctx.shadowBlur = 14;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cannon.angle);
    ctx.fillStyle = "#1e1a3d";
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    roundRect(-cannon.recoil, -9, 70, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#a78bfa";
    roundRect(58 - cannon.recoil, -12, 14, 24, 3);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#15122b";
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    roundRect(cx - 30, cy + 4, 60, 12, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0e0c1d";
    ctx.beginPath();
    ctx.arc(cx, cy + 18, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#6d5cae";
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 18);
      ctx.lineTo(cx + Math.cos(a) * 20, cy + 18 + Math.sin(a) * 20);
      ctx.stroke();
    }
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(cx, cy + 18, 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (R.upg.turret > 0) {
      ctx.save();
      ctx.translate(cx, cy - 22);
      ctx.rotate(cannon.tAngle);
      ctx.fillStyle = "#38bdf8";
      roundRect(0, -3, 30, 6, 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#15122b";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoss() {
    if (!boss || boss.hp <= 0) return;
    const { x, y, w, h } = boss;
    ctx.save();
    ctx.shadowColor = boss.hurtT > 0 ? "rgba(251, 191, 36, 0.7)" : "rgba(251, 113, 133, 0.45)";
    ctx.shadowBlur = 22;

    ctx.fillStyle = boss.hurtT > 0 ? "rgba(55, 22, 46, 0.95)" : "rgba(22, 14, 38, 0.95)";
    ctx.strokeStyle = boss.hurtT > 0 ? "#fbbf24" : "#fb7185";
    ctx.lineWidth = 2.5;
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    const barPad = 14;
    const barW = w - barPad * 2;
    const segGap = 3;
    const segW = Math.max(4, (barW - segGap * (boss.maxHp - 1)) / boss.maxHp);
    for (let i = 0; i < boss.maxHp; i++) {
      ctx.fillStyle = i < boss.hp ? "#fb7185" : "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(x + barPad + i * (segW + segGap), y + 12, segW, 7);
    }

    ctx.fillStyle = "rgba(251, 113, 133, 0.78)";
    ctx.font = "10.5px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const asciiTop = y + 26;
    BOSS_ASCII.forEach((line, idx) => {
      ctx.fillText(line, x + w / 2, asciiTop + idx * 11.5);
    });

    const coreY = y + h - 82;
    const coreH = 66;
    ctx.fillStyle = boss.inZone ? "rgba(30, 27, 62, 0.98)" : "rgba(13, 11, 28, 0.95)";
    ctx.strokeStyle = boss.weak ? "#fbbf24" : (boss.inZone ? "#38bdf8" : "#a78bfa");
    ctx.lineWidth = 2;
    roundRect(x + 12, coreY, w - 24, coreH, 9);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.fillStyle = boss.inZone ? "#e0f2fe" : "#f8fafc";
    ctx.font = "bold 17px monospace";
    ctx.fillText(boss.shown, x + w / 2, coreY + 24);

    ctx.fillStyle = "#c4b5fd";
    ctx.font = "12.5px monospace";
    ctx.fillText(boss.vi, x + w / 2, coreY + 47);

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeT > 0) ctx.translate(Arcade.rand(-5, 5), Arcade.rand(-5, 5));

    for (const st of stars) {
      ctx.fillStyle = `rgba(226, 232, 240, ${st.a})`;
      ctx.beginPath();
      ctx.arc(st.x % W, st.y % H, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(167, 139, 250, 0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < laneCount; i++) {
      const ly = laneY(i);
      ctx.beginPath();
      ctx.moveTo(cannon.x + 60, ly);
      ctx.lineTo(W - 16, ly);
      ctx.stroke();
    }

    const dangerX = cannon.x + 44;
    const hintX = dangerX + hintZoneWidth(false);

    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(hintX, TOP);
    ctx.lineTo(hintX, H - BOTTOM + 16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("vùng gợi ý", (dangerX + hintX) / 2, H - BOTTOM + 14);

    ctx.strokeStyle = "rgba(251, 113, 133, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(dangerX, TOP);
    ctx.lineTo(dangerX, H - BOTTOM + 16);
    ctx.stroke();
    ctx.setLineDash([]);

    drawCannon();
    drawBoss();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const e of enemies) {
      const y = laneY(e.lane) - BLOCK_H / 2;
      const activeGlow = e.targeted || e.flash > 0 || e.inZone || e.weak;

      ctx.save();
      if (activeGlow) {
        ctx.shadowColor = e.weak
          ? "rgba(251, 191, 36, 0.45)"
          : (e.targeted ? "rgba(167, 139, 250, 0.55)" : "rgba(56, 189, 248, 0.35)");
        ctx.shadowBlur = 14;
      }
      ctx.fillStyle = e.isMissile
        ? "rgba(38, 16, 36, 0.95)"
        : (e.inZone ? "rgba(24, 24, 52, 0.96)" : "rgba(19, 16, 40, 0.94)");
      ctx.strokeStyle = e.weak
        ? "#fbbf24"
        : (e.isMissile ? "#fb7185" : (e.targeted ? "#a78bfa" : (e.inZone ? "#38bdf8" : "#3b3566")));
      ctx.lineWidth = (e.targeted || e.flash > 0 || e.weak) ? 2.5 : 1.5;
      roundRect(e.x, y, e.w, BLOCK_H, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (e.weak) {
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 9px monospace";
        ctx.fillText("★ TỪ YẾU (x2)", e.x + e.w / 2, y - 7);
      } else if (e.isMissile) {
        ctx.fillStyle = "#fb7185";
        ctx.font = "bold 9px monospace";
        ctx.fillText("▼ TÊN LỬA", e.x + e.w / 2, y - 7);
      }

      ctx.fillStyle = e.inZone ? "#e0f2fe" : "#f8fafc";
      ctx.font = "bold 18px monospace";
      ctx.fillText(e.shown, e.x + e.w / 2, y + 22);

      ctx.fillStyle = "#a5b4fc";
      ctx.font = "13px monospace";
      ctx.fillText(e.vi, e.x + e.w / 2, y + 44);

      if (e.hits) {
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(e.x + 4, y + BLOCK_H - 5, (e.w - 8) * e.hits / TURRET_HITS, 3);
      }
    }

    for (const s of shots) {
      ctx.save();
      ctx.shadowColor = s.kind === "main" ? "#a78bfa" : "#38bdf8";
      ctx.shadowBlur = 12;
      ctx.fillStyle = s.kind === "main" ? "#f1effc" : "#38bdf8";
      ctx.strokeStyle = s.kind === "main" ? "#a78bfa" : "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.kind === "main" ? 6 : 4, 0, Math.PI * 2);
      s.kind === "main" ? ctx.fill() : ctx.stroke();
      ctx.restore();
    }

    ctx.font = "bold 15px monospace";
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col || "#a78bfa";
      ctx.fillText(p.ch, p.x, p.y);
    }

    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.col || "#f1effc";
      ctx.font = f.small ? "bold 12px monospace" : "bold 18px monospace";
      ctx.fillText(f.text, f.x, f.y - 30);
    }
    ctx.globalAlpha = 1;

    if (state === "play" && R.banner > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, R.banner / 0.6);
      ctx.shadowColor = isBossWave(R.wave) ? "rgba(251, 113, 133, 0.65)" : "rgba(167, 139, 250, 0.5)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = isBossWave(R.wave) ? "#fb7185" : "#f1effc";
      ctx.font = "bold 40px monospace";
      ctx.fillText(isBossWave(R.wave) ? `ĐỢT ${R.wave} — BOSS!` : `ĐỢT ${R.wave}`, W / 2, H / 2 - 12);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#c4b5fd";
      ctx.font = "13px monospace";
      ctx.fillText(
        isBossWave(R.wave)
          ? "bắn hạ lõi từ vựng của Boss & đánh chặn tên lửa!"
          : (R.curse
              ? `lời nguyền: ${CURSES[R.curse].name} — ${CURSES[R.curse].desc} (xu x${CURSE_COIN_MULT})`
              : `${R.toSpawn} từ vựng đang tiến tới`),
        W / 2, H / 2 + 28
      );
      ctx.restore();
    }
    ctx.restore();
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    if (state !== "paused") update(dt);
    draw();
  }

  function startGame() {
    cancelAnimationFrame(raf);
    sizeCanvas(); newRun(); hideOv();
    state = "intro"; last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function mount(ctxUi) {
    ui = ctxUi;

    // 1. Mount Canvas + Typing Input into modeHost
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    ui.host.appendChild(canvas);

    input = document.createElement("input");
    input.type = "text";
    input.className = "cannon-input";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.placeholder = "gõ từ tiếng anh... (bấm [Tab] để nghe phát âm)";
    ui.host.appendChild(input);

    // 2. Mount Mode-specific Top Bar Tools
    const wsBtn = document.createElement("button");
    wsBtn.className = "btn";
    wsBtn.textContent = "Xưởng Nâng Cấp";
    wsBtn.onclick = () => {
      if (state !== "play") return;
      prevState = state; state = "paused"; input.blur(); showOv("workshop");
    };

    vocabInfo = document.createElement("span");
    vocabInfo.id = "vocabInfo";

    diffSelect = document.createElement("select");
    diffSelect.className = "btn";
    diffSelect.title = "Độ khó khởi đầu (tăng nhẹ sau mỗi đợt)";
    diffSelect.innerHTML = `
      <option value="han" selected>Độ khó: Hân</option>
      <option value="easy">Độ khó: Dễ</option>
      <option value="medium">Độ khó: Vừa</option>
      <option value="hard">Độ khó: Khó</option>
    `;
    diffSelect.onchange = () => { diffSelect.blur(); if (state === "play") input.focus(); };

    ui.tools.appendChild(wsBtn);
    ui.tools.appendChild(vocabInfo);
    ui.tools.appendChild(diffSelect);

    // 3. Event Listeners
    input.addEventListener("input", () => {
      if (state !== "play") return;
      const v = Arcade.norm(input.value);
      if (!v) return;
      const hit = enemies.filter(e => !e.dead && !e.targeted && Arcade.norm(e.word) === v).sort((a, b) => a.x - b.x)[0];
      if (hit) { fire(hit); input.value = ""; return; }
      if (boss && boss.hp > 0 && !boss.targeted && Arcade.norm(boss.word) === v) {
        fire(boss); input.value = "";
      }
    });

    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && input.value && state === "play") {
        R.streak = 0;
        const frontEnemy = enemies.filter(en => !en.dead && !en.targeted).sort((a, b) => a.x - b.x)[0];
        if (frontEnemy) {
          frontEnemy.weak = true;
          recordWeakWord(frontEnemy.word, frontEnemy.vi);
        } else if (boss && boss.hp > 0) {
          boss.weak = true;
          recordWeakWord(boss.word, boss.vi);
        }
        input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
        input.value = "";
      }
    });

    ui.frame.addEventListener("click", onFrameClick);
    Arcade.ov.addEventListener("click", onOvClick);
    document.addEventListener("keydown", onKeyDown);

    startGame();
  }

  function onFrameClick(e) {
    if (e.target.closest("#bar") || e.target.closest("#ov")) return;
    if (state === "play" && input) input.focus();
  }

  function unmount() {
    if (running()) awardShards();
    cancelAnimationFrame(raf);
    state = "idle";
    ovKind = null;
    if (ui && ui.frame) ui.frame.removeEventListener("click", onFrameClick);
    Arcade.ov.removeEventListener("click", onOvClick);
    document.removeEventListener("keydown", onKeyDown);
    ui = null;
    canvas = null;
    input = null;
  }

  Arcade.registerMode({
    id: "cannon",
    name: "Pháo Đài Từ Vựng",
    useMusic: true,
    mount,
    unmount,
    onResize: sizeCanvas,
    onVocabChange: () => {
      if (running()) awardShards();
      startGame();
    },
  });
})();
