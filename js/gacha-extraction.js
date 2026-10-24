/* LIMBUS_BUILD_TERMINAL — gacha-extraction.js
   抽出演出: Limbus Company の抽出アニメーション録画（std 75.8s / 3★ 70.5s）の
   フレーム数値解析に基づく再現。
   皮相 of 参照: ① 鎖の扉・点火 ② 振り子スイング ③ 炎の星星雲 ④ 10鎖の放射と
   バースト ⑤ 白フラッシュとカード ⑥ 3★: 金鎖カード→赤の引用→青のスプラッシュ
   ⑦ 結果グリッド。
   乱数・署名・証明（gacha.js の commit-reveal / drand）には一切触れない。
   特異を hits に含まない限り金の演出には決してしない（偽の煽り禁止）。
   追加依存なし・ビルド不要。尺は CSS の --gx-* を正本とする。 */
(function () {
  "use strict";

  var RM_QUERY = "(prefers-reduced-motion: reduce)";

  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia(RM_QUERY).matches); }
    catch (e) { return false; }
  }

  /* 特異人格は branch="special" か persona の mode="t"。 */
  function isSpecial(hit) {
    return !!hit && (hit.branch === "special" || (hit.type === "persona" && hit.mode === "t"));
  }

  /* 主題色はプール（種別）で決まる。特異 > E.G.O > パック > 標準。 */
  function themeOf(list) {
    var hasSpecial = false, hasEgo = false, hasPack = false;
    for (var i = 0; i < list.length; i++) {
      var hit = list[i];
      if (isSpecial(hit)) { hasSpecial = true; }
      else if (hit && hit.type === "ego") { hasEgo = true; }
      else if (hit && hit.type === "themePack") { hasPack = true; }
    }
    return hasSpecial ? "special" : hasEgo ? "ego" : hasPack ? "pack" : "normal";
  }

  /* hits から演出の状態を決定論的に導出する。 */
  function plan(hits) {
    var list = Array.isArray(hits) ? hits : [];
    var specialAt = -1;
    for (var i = 0; i < list.length; i++) {
      if (isSpecial(list[i])) { specialAt = i; break; }
    }
    var theme = themeOf(list);
    return {
      count: list.length,
      theme: theme,
      gold: theme === "special",
      specialAt: specialAt,
      startsGold: specialAt === 0,
      turnsGold: specialAt > 0
    };
  }

  var TYPE_LABEL = { ego: "E.G.O", themePack: "特定抽出パック", persona: "人格" };

  function label(hit) {
    if (isSpecial(hit)) return "特異人格";
    return TYPE_LABEL[hit && hit.type] || "人格";
  }

  function num(style, prop, fallback) {
    var v = parseFloat(style.getPropertyValue(prop));
    return isFinite(v) && v >= 0 ? v : fallback;
  }

  /* 節約: 単純な LCG。描画の揺らぎ（鎖の首振り位相・火の粉）にだけ使う。
     乱数・署名・証明（gacha.js の commit-reveal / drand）には一切関与しない。 */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ヒット毎の枠の色（グリッドとバースト末端の両方で使う）。 */
  function frameColor(hit) {
    if (isSpecial(hit)) return "#e9c46a";
    if (hit && hit.type === "ego") return "#b872d9";
    if (hit && hit.type === "themePack") return "#8fbf6a";
    return "#d8c8b2";
  }

  /* バースト末端の色（参照 stdz_15: 通常は黒茶の棘、特異は赤）。 */
  function burstColor(hit) {
    if (isSpecial(hit)) return "#c01818";
    if (hit && hit.type === "ego") return "#3f6f9a";
    if (hit && hit.type === "themePack") return "#8a6420";
    return "#3a3026";
  }

  function hexA(hex, a) {
    var v = parseInt(hex.slice(1), 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function easeOutCubic(u) { var v = 1 - u; return 1 - v * v * v; }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }

  /* ------------------------------------------------------------------ */

  /* Mirror intro: an original clock-headed, red-coated figure reflected in the extraction door. */
  function danteMirrorSVG() {
    return '<svg class="lbt-gx__silhouette" viewBox="0 0 420 700" role="presentation" focusable="false">' +
      '<defs><linearGradient id="gx-dante-coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#542322"/><stop offset=".48" stop-color="#281718"/><stop offset="1" stop-color="#100f10"/></linearGradient><radialGradient id="gx-dante-clock" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="#261b18"/><stop offset=".72" stop-color="#100f10"/><stop offset="1" stop-color="#090a0b"/></radialGradient></defs>' +
      '<path class="lbt-gx__mirror-pane" d="M210 22 342 77 330 570 210 675 90 570 78 77Z"/>' +
      '<path class="lbt-gx__mirror-crack" d="M302 88 276 170 294 214 270 284M113 390 146 414 125 473M276 500 251 527 264 565M210 22 200 90 210 112 190 154 205 188M78 77 134 94 158 124 210 112M342 77 287 95 261 127 210 112M88 278 142 294 169 326 148 365M332 278 278 294 252 326 272 367M90 570 145 531 177 514 210 481 243 514 276 531 330 570"/><path class="lbt-gx__mirror-crack lbt-gx__mirror-crack-flash" d="M210 22 200 90 210 112 190 154 205 188M78 77 134 94 158 124 210 112M342 77 287 95 261 127 210 112M88 278 142 294 169 326 148 365M332 278 278 294 252 326 272 367M90 570 145 531 177 514 210 481 243 514 276 531 330 570"/>' +
      '<g class="lbt-gx__dante-figure">' +
        '<path class="lbt-gx__flame" d="M157 83 142 47 166 68 177 25 194 71 210 15 224 68 251 31 246 77 281 52 259 96M147 108 124 90 145 126M273 113 296 92 274 132"/>' +
        '<path class="lbt-gx__figure lbt-gx__coat" fill="url(#gx-dante-coat)" d="M178 184 147 194 112 214 88 278 59 535Q62 568 127 603L154 584 171 465 210 481 249 465 266 584 293 603Q358 568 361 535L332 278 308 214 273 194 242 184 228 211 192 211Z"/>' +
        '<path class="lbt-gx__figure-inner" d="M178 200 162 243 168 454 210 477 252 454 258 243 242 200 224 222 196 222Z"/>' +
        '<path class="lbt-gx__figure-inner" d="M174 448 210 470 246 448 239 623 222 651 210 632 198 651 181 623Z"/>' +
        '<path class="lbt-gx__figure" d="M181 620 198 646 198 673 151 676Q145 660 157 640L170 622ZM222 620 239 642 258 661 258 680 208 680Q204 663 210 641Z"/>' +
        '<path class="lbt-gx__figure" d="M178 188 139 203 119 229 104 292 157 350 180 270 194 212ZM242 188 281 203 301 229 316 292 263 350 240 270 226 212Z"/>' +
        '<path class="lbt-gx__coat-edge" d="M177 195 145 230 128 286 158 337 177 270M243 195 275 230 292 286 262 337 243 270M133 286 111 522M287 286 309 522M91 524 120 542M329 524 300 542"/>' +
        '<path class="lbt-gx__figure-inner" d="M196 216 210 229 224 216 219 269 210 284 201 269Z"/>' +
        '<path class="lbt-gx__belt" d="M172 448H248V467H172Z"/><rect class="lbt-gx__buckle" x="202" y="449" width="16" height="17" rx="2"/>' +
        '<path class="lbt-gx__cuff" d="M70 507 108 519 104 540 65 529ZM350 507 312 519 316 540 355 529Z"/>' +
        '<text class="lbt-gx__mark" x="275" y="244">NO.10</text><text class="lbt-gx__mark" x="294" y="388" transform="rotate(78 294 388)" opacity=".74">DANTE</text>' +
        '<circle class="lbt-gx__clock-rim" cx="210" cy="112" r="67"/><circle class="lbt-gx__clock-face" cx="210" cy="112" r="54" fill="url(#gx-dante-clock)"/>' +
        '<circle class="lbt-gx__clock-inner" cx="210" cy="112" r="44"/>' +
        '<path class="lbt-gx__clock-hand" d="M210 112V76M210 112 235 124"/><circle class="lbt-gx__clock-pin" cx="210" cy="112" r="4"/>' +
        '<path class="lbt-gx__clock-tick" d="M210 67V75M255 112H247M210 157V149M165 112H173M178 80 184 86M242 80 236 86"/>' +
      '</g></svg>';
  }

  function play(hits, opts) {
    opts = opts || {};
    var host = opts.container || document.body;
    var list = Array.isArray(hits) ? hits : [];
    var state = plan(list);

    var root = document.createElement("div");
    root.className = "lbt-gx" + (state.theme !== "normal" ? " is-" + state.theme : "");
    root.innerHTML =
        '<div class="lbt-gx__stage" aria-hidden="true"><canvas class="lbt-gx__canvas"></canvas><div class="lbt-gx__mirror">' + danteMirrorSVG() + '<div class="lbt-gx__mirror-name" aria-hidden="true"></div></div><div class="lbt-gx__grade"></div></div>' +
      '<div class="lbt-gx__quote" aria-hidden="true"></div>' +
      '<div class="lbt-gx__splash" aria-hidden="true"></div>' +
      '<div class="lbt-gx__card" aria-hidden="true"></div>' +
      '<div class="lbt-gx__flash" aria-hidden="true"></div>' +
      '<div class="lbt-gx__cards" aria-hidden="true"></div>' +
      '<div class="lbt-gx__grain" aria-hidden="true"></div>' +
      '<button type="button" class="lbt-gx__skip" aria-label="演出をスキップ">スキップ</button>';

    var reflectedHit = list[state.specialAt >= 0 ? state.specialAt : 0];
    var reflectedName = reflectedHit && reflectedHit.name ? String(reflectedHit.name) : "";
    var mirrorName = root.querySelector(".lbt-gx__mirror-name");
    if (mirrorName) {
      for (var shardIndex = 0; shardIndex < 3; shardIndex++) {
        var shard = document.createElement("span");
        shard.className = "lbt-gx__name-shard";
        shard.textContent = reflectedName;
        mirrorName.appendChild(shard);
      }
    }

    return new Promise(function (resolve) {
      var timers = [];
      var finished = false;
      var skipBtn = root.querySelector(".lbt-gx__skip");
      var canvas = root.querySelector(".lbt-gx__canvas");
      var quoteEl = root.querySelector(".lbt-gx__quote");
      var splashEl = root.querySelector(".lbt-gx__splash");
      var cardEl = root.querySelector(".lbt-gx__card");
      var flashEl = root.querySelector(".lbt-gx__flash");
      var gridEl = root.querySelector(".lbt-gx__cards");

      var style = null;
      function cs() { if (!style) style = getComputedStyle(root); return style; }
      function after(ms, fn) { timers.push(setTimeout(fn, ms)); }
      function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

      /* 結果グリッド。枠色=等級、六角バッジ（参照 stdx_61）。 */
      function reveal() {
        root.classList.add("is-grid");
        cardEl.className = "lbt-gx__card";
        cardEl.textContent = "";
        quoteEl.className = "lbt-gx__quote";
        splashEl.className = "lbt-gx__splash";
        gridEl.textContent = "";
        var stagger = reduceMotion() ? 0 : num(cs(), "--gx-grid-stagger", 70);
        for (var i = 0; i < list.length; i++) {
          var hit = list[i];
          var card = document.createElement("div");
          card.className = "lbt-gx__tile";
          card.style.animationDelay = (i * stagger) + "ms";
          tierClass(hit, card, "lbt-gx__tile");
          var badge = document.createElement("span");
          badge.className = "lbt-gx__tile-badge";
          badge.textContent = (hit && hit.no != null) ? String(hit.no) : "0";
          var name = document.createElement("b");
          name.textContent = (hit && hit.name) || "";
          var type = document.createElement("span");
          type.className = "lbt-gx__tile-type";
          type.textContent = label(hit);
          card.appendChild(badge);
          card.appendChild(name);
          card.appendChild(type);
          gridEl.appendChild(card);
        }
      }
      function tierClass(hit, el, prefix) {
        var cls = isSpecial(hit) ? "is-special" : hit && hit.type === "ego" ? "is-ego" : hit && hit.type === "themePack" ? "is-pack" : "";
        if (cls) { el.className += " " + prefix + "--" + cls; }
      }
      /* 固有イラストが無い排出物の正体として「時計環の遺物」を描く（Dante の時計＝Limbus の象徴）。 */
      function emblemSVG() {
        var ticks = "";
        for (var i = 0; i < 12; i++) {
          var a = (i / 12) * 6.2832;
          var r1 = 47, r2 = i % 3 === 0 ? 37 : 41.5;
          ticks += '<line x1="' + (60 + Math.cos(a) * r1).toFixed(1) + '" y1="' + (60 + Math.sin(a) * r1).toFixed(1) +
            '" x2="' + (60 + Math.cos(a) * r2).toFixed(1) + '" y2="' + (60 + Math.sin(a) * r2).toFixed(1) + '"/>';
        }
        return '<svg class="lbt-gx__card-emblem" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
          '<circle class="em-ring" cx="60" cy="60" r="52"/>' +
          '<g class="em-ticks">' + ticks + '</g>' +
          '<circle class="em-ring em-ring--thin" cx="60" cy="60" r="33"/>' +
          '<circle class="em-core" cx="60" cy="60" r="27"/>' +
          '<path class="em-hand" d="M60 60 L60 27"/>' +
          '<path class="em-hand em-hand--sub" d="M60 60 L79 71"/>' +
          '<circle class="em-pin" cx="60" cy="60" r="4"/>' +
          '</svg>';
      }
      function staggerLine(el, text, baseDelay) {
        el.textContent = "";
        for (var ci = 0; ci < text.length; ci++) {
          var sp = document.createElement("span");
          sp.className = "lbt-gx__ch";
          sp.style.animationDelay = Math.round(baseDelay + ci * 55) + "ms";
          sp.textContent = text.charAt(ci) === " " ? "\u00a0" : text.charAt(ci);
          el.appendChild(sp);
        }
      }
      function paintCard(hit, idx) {
        var total = list.length;
        var i = (typeof idx === "number" && idx >= 0) ? idx : 0;
        cardEl.textContent = "";
        cardEl.className = "lbt-gx__card is-in";
        tierClass(hit, cardEl, "lbt-gx__card");
        var frame = document.createElement("div");
        frame.className = "lbt-gx__card-frame";
        tierClass(hit, frame, "lbt-gx__frame");
        frame.style.setProperty("--em-from", String(i / total));
        frame.style.setProperty("--em-turn", String((i + 1) / total));
        if (isSpecial(hit)) {
          var prism = document.createElement("i");
          prism.className = "lbt-gx__card-prism";
          frame.appendChild(prism);
        }
        var art = document.createElement("div");
        art.className = "lbt-gx__card-art";
        art.innerHTML = emblemSVG();
        var no = document.createElement("span");
        no.className = "lbt-gx__card-no";
        no.textContent = "NO." + String((hit && hit.no != null) ? hit.no : 0);
        var nameText = (hit && hit.name) || "";
        if (nameText.indexOf(String((hit && hit.no != null) ? hit.no : "")) === -1) {
          art.appendChild(no);
        }
        var name = document.createElement("b");
        name.className = "lbt-gx__card-name";
        name.textContent = nameText;
        var type = document.createElement("span");
        type.className = "lbt-gx__card-type";
        type.textContent = label(hit);
        var shine = document.createElement("i");
        shine.className = "lbt-gx__card-shine";
        frame.appendChild(art);
        frame.appendChild(name);
        frame.appendChild(type);
        if (total > 1) {
          var count = document.createElement("span");
          count.className = "lbt-gx__card-count";
          count.textContent = (i + 1) + " / " + total;
          frame.appendChild(count);
        }
        frame.appendChild(shine);
        cardEl.appendChild(frame);
        spawnRing(W / 2, H / 2, Math.min(W, H) * 0.52, 980, "255,214,150");
      }

      function teardown() { if (root.parentNode) root.parentNode.removeChild(root); }

      function finish(skipped) {
        if (finished) return;
        finished = true;
        clearTimers();
        stop = true;
        window.removeEventListener("keydown", onKey);
        reveal();
        if (skipped && typeof opts.onSkip === "function") { try { opts.onSkip(state); } catch (e) {} }
        var settle = reduceMotion()
          ? 0
          : num(cs(), "--gx-grid-stagger", 70) * Math.min(list.length, 10) + num(cs(), "--gx-settle", 500);
        setTimeout(function () { teardown(); resolve(state); }, settle);
      }

      function onKey(e) {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { finish(true); }
      }
      root.addEventListener("click", function () { finish(true); });
      skipBtn.addEventListener("click", function (e) { e.stopPropagation(); finish(true); });
      window.addEventListener("keydown", onKey);

      host.appendChild(root);

      if (reduceMotion()) { finish(false); return; }

      /* ---------------- 尺は CSS 変数から ---------------- */
      var D = {
        ignite: num(cs(), "--gx-ignite", 900),
        swing: num(cs(), "--gx-swing", 2400),
        spider: num(cs(), "--gx-spider", 1200),
        condense: num(cs(), "--gx-condense", 420),
        flashIn: num(cs(), "--gx-flash-in", 260),
        cardHold: num(cs(), "--gx-card-hold", 1400),
        flashOut: num(cs(), "--gx-flash-out", 300),
        goldTurn: num(cs(), "--gx-gold-turn", 900),
        quoteHold: num(cs(), "--gx-quote-hold", 1800),
        splash: num(cs(), "--gx-splash", 2400),
        skipAt: num(cs(), "--gx-skip-at", 1200)
      };

      after(D.skipAt, function () { skipBtn.classList.add("is-visible"); });

      /* ================= canvas 描画 ================= */
      var ctx2d = canvas.getContext("2d");
      var scene = document.createElement("canvas");
      var sctx = scene.getContext("2d");
      var W = 0, H = 0, dpr = 1;
      var stop = false;
      var phase = "door";
      var phaseT0 = 0;
      var fire = 0, fireTarget = 0;
      var rings = [], conf = [], zoom = 0;
      function setPhase(name) {
        if (phase) { root.classList.remove("is-" + phase); }
        phase = name;
        phaseT0 = t2Sec();
        root.classList.add("is-" + name);
        root.classList.toggle("is-mirror-fractured", name === "swing");
        if (name === "spider") { spawnRing(W / 2, H / 2, Math.min(W, H) * 0.34, 620, "170,215,255"); }
        if (name === "card" || name === "gold") { seedConfetti("reveal"); }
        if (name === "grid") { seedConfetti("grid"); }
      }

      var boot = 0, nowMs = 0, lastMs = 0;
      function t2Sec() { return (nowMs - boot) / 1000; }

      var seedFn = rng(1000 + state.count * 7 + Math.max(0, state.specialAt));

      /* 10 本の鎖。角度は参照フレームのようにほぼ等間隔、上方向がやや密。 */
      var arms = [];
      for (var a = 0; a < 10; a++) {
        arms.push({
          ang: -Math.PI / 2 + (a - 4.5) / 4.5 * Math.PI * 0.94 + (seedFn() - 0.5) * 0.16,
          wob: seedFn() * Math.PI * 2,
          lagX: 0.5, lagY: 0.44
        });
      }
      /* 球の「編み込み」を不規則に見せるための外れ弧 */
      var ballJit = [];
      for (var bj = 0; bj < 4; bj++) {
        ballJit.push({ off: (seedFn() - 0.5) * 0.5, rot: seedFn() * Math.PI, a0: seedFn() * 3.1, a1: 0.7 + seedFn() * 1.3 });
      }

      function size() {
        var r = root.getBoundingClientRect();
        dpr = Math.min(2, (window.devicePixelRatio || 1));
        W = Math.max(320, Math.round(r.width));
        H = Math.max(240, Math.round(r.height));
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        scene.width = canvas.width; scene.height = canvas.height;
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        vign = null;
      }
      var vign = null;
      size();

      /* ---- 炎の星星雲: アルファ付き値ノイズ（火の隙間を残す） ---- */
      var NW = 144, NH = 81;
      var nBuf = [document.createElement("canvas"), document.createElement("canvas")];
      var nImg = [nBuf[0].getContext("2d").createImageData(NW, NH), nBuf[1].getContext("2d").createImageData(NW, NH)];
      for (var q0 = 0; q0 < 2; q0++) { nBuf[q0].width = NW; nBuf[q0].height = NH; }
      var nPrev = new Float32Array(NW * NH);
      for (var qi = 0; qi < nPrev.length; qi++) nPrev[qi] = 0.35 + seedFn() * 0.3;
      function nIdx(x, y) { return ((y % NH + NH) % NH) * NW + ((x % NW + NW) % NW); }
      function noiseTick(k, strength) {
        var img = nImg[k], px = img.data, n;
        for (var y = 0; y < NH; y++) {
          for (var x = 0; x < NW; x++) {
            var v = (nPrev[nIdx(x - 1, y - 1)] + nPrev[nIdx(x, y - 1)] + nPrev[nIdx(x + 1, y - 1)]
                   + nPrev[nIdx(x - 1, y)] * 2 + nPrev[nIdx(x, y)] * 2 + nPrev[nIdx(x + 1, y)] * 2
                   + nPrev[nIdx(x - 1, y + 1)] + nPrev[nIdx(x, y + 1)] + nPrev[nIdx(x + 1, y + 1)]) / 12;
            v = v + (seedFn() - 0.5) * 0.10;
            n = nIdx(x, y);
            nPrev[n] = v;
            var f = clamp01((v - 0.47) * 2.6) * strength;
            var hot = f * f * f;
            px[n * 4] = 255;
            px[n * 4 + 1] = Math.round(88 + 118 * f + 52 * hot);
            px[n * 4 + 2] = Math.round(6 + 64 * hot);
            px[n * 4 + 3] = Math.round(f * 236);
          }
        }
        nBuf[k].getContext("2d").putImageData(img, 0, 0);
      }
      var nSw = -1;
      function drawNoise(tSec, strength) {
        if (strength <= 0.02) return;
        var step = Math.floor(tSec * 20);
        if (step !== nSw) {
          nSw = step;
          noiseTick(step % 2, strength);
          var mb = nBuf[step % 2];
          var mctx = mb.getContext("2d");
          mctx.globalCompositeOperation = "destination-in";
          var mg = mctx.createRadialGradient(NW * 0.5, NH * 0.48, 0, NW * 0.5, NH * 0.48, Math.max(NW, NH) * 0.60);
          mg.addColorStop(0, "rgba(0,0,0,1)");
          mg.addColorStop(0.55, "rgba(0,0,0,0.85)");
          mg.addColorStop(1, "rgba(0,0,0,0)");
          mctx.fillStyle = mg;
          mctx.fillRect(0, 0, NW, NH);
          mctx.globalCompositeOperation = "source-over";
        }
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        sctx.imageSmoothingEnabled = true;
        var drift = Math.sin(tSec * 0.13) * W * 0.018;
        if (supportsFilter) sctx.filter = "blur(16px)";
        sctx.globalAlpha = 0.22;
        sctx.drawImage(nBuf[(step + 1) % 2], -W * 0.05 + drift, -H * 0.18, W * 1.1, H * 1.3);
        if (supportsFilter) sctx.filter = "none";
        sctx.globalAlpha = 1;
        sctx.drawImage(nBuf[step % 2], 0, 0, W, H);
        sctx.restore();
      }

      /* ---- 深層の火塊（ゆっくり漂う大きなブロブ） ---- */
      var blobs = [];
      for (var b0 = 0; b0 < 7; b0++) {
        blobs.push({ x: seedFn(), y: 0.4 + seedFn() * 0.55, r: 0.24 + seedFn() * 0.28, sp: 0.006 + seedFn() * 0.010, ph: seedFn() * 6.28, a: 0.35 + seedFn() * 0.3 });
      }
      function drawBlobs(tSec, strength) {
        if (strength <= 0.02) return;
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < blobs.length; i++) {
          var b = blobs[i];
          var x = ((b.x + tSec * b.sp) % 1.3) - 0.15;
          var y = b.y + Math.sin(tSec * 0.4 + b.ph) * 0.04;
          var rr = b.r * Math.min(W, H);
          var pulse = 0.85 + 0.15 * Math.sin(tSec * 1.3 + b.ph);
          var g = sctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, rr * pulse);
          g.addColorStop(0, "rgba(255,150,40," + (0.10 * b.a * strength) + ")");
          g.addColorStop(0.5, "rgba(190,80,16," + (0.055 * b.a * strength) + ")");
          g.addColorStop(1, "rgba(120,40,8,0)");
          sctx.fillStyle = g;
          sctx.beginPath(); sctx.arc(x * W, y * H, rr * pulse, 0, Math.PI * 2); sctx.fill();
        }
        sctx.restore();
      }

      /* ---- 背景の4点星スパークル（参照: 金炎の中の星屑） ---- */
      var stars = [];
      for (var s0 = 0; s0 < 30; s0++) {
        stars.push({ x: seedFn(), y: seedFn(), ph: seedFn() * 6.28, f: 0.6 + seedFn() * 0.9, L: 5 + seedFn() * 11 });
      }
      function drawStars(tSec, strength) {
        if (strength <= 0.05) return;
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i];
          var tw = Math.pow(Math.max(0, Math.sin(tSec * s.f + s.ph)), 3) * strength;
          if (tw < 0.05) continue;
          var x = s.x * W, y = s.y * H, L = s.L * (0.6 + 0.6 * tw);
          var g = sctx.createRadialGradient(x, y, 0, x, y, L * 1.6);
          g.addColorStop(0, "rgba(255,246,220," + 0.85 * tw + ")");
          g.addColorStop(0.4, "rgba(255,190,90," + 0.35 * tw + ")");
          g.addColorStop(1, "rgba(255,150,40,0)");
          sctx.fillStyle = g;
          sctx.beginPath(); sctx.arc(x, y, L * 1.6, 0, Math.PI * 2); sctx.fill();
          sctx.strokeStyle = "rgba(255,240,200," + 0.55 * tw + ")";
          sctx.lineWidth = 1.1;
          sctx.beginPath();
          sctx.moveTo(x - L, y); sctx.lineTo(x + L, y);
          sctx.moveTo(x, y - L); sctx.lineTo(x, y + L);
          sctx.stroke();
        }
        sctx.restore();
      }

      /* ---- 上へ流れる火の粉 ---- */
      var sparks = [];
      for (var p0 = 0; p0 < 300; p0++) {
        sparks.push({
          x: seedFn(), y: seedFn(),
          v: 0.02 + seedFn() * 0.055, sw: 0.2 + seedFn() * 0.8, ph: seedFn() * 6.28,
          sz: 0.5 + seedFn() * 1.7, hue: seedFn(), dep: 0.35 + seedFn() * 0.65
        });
      }
      function drawSparks(tSec, dtSec, strength, bp) {
        if (strength <= 0.02) return;
        var suck = condenseU > 0.02 ? condenseU : 0;
        var pull = suck ? 1 - Math.exp(-dtSec * (4 + 26 * suck)) : 0;
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < sparks.length; i++) {
          var p = sparks[i];
          p.y -= p.v * dtSec;
          if (p.y < -0.02) { p.y = 1.02; p.x = seedFn(); }
          if (pull && bp) {
            p.x += (bp.x - p.x) * pull;
            p.y += (bp.y - p.y) * pull;
          }
          var x = (p.x + Math.sin(tSec * p.sw + p.ph) * 0.012) * W;
          var y = p.y * H;
          var al = strength * (0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(tSec * 2.2 + p.ph)), 2));
          var sz = p.sz * (0.55 + 0.75 * p.dep);
          if (p.dep > 0.72) {
            sctx.strokeStyle = "rgba(255," + Math.round(160 + 60 * p.hue) + ",90," + 0.32 * al + ")";
            sctx.lineWidth = sz * 0.75;
            sctx.beginPath();
            sctx.moveTo(x + Math.sin(tSec * p.sw * 1.7 + p.ph) * 2.4, y + sz * 5.5);
            sctx.lineTo(x, y);
            sctx.stroke();
          }
          sctx.fillStyle = p.hue > 0.75
            ? "rgba(255,242,206," + 0.72 * al + ")"
            : "rgba(255," + Math.round(150 + 70 * p.hue) + ",70," + 0.6 * al + ")";
          sctx.beginPath(); sctx.arc(x, y, sz, 0, Math.PI * 2); sctx.fill();
        }
        sctx.restore();
      }

      /* ---- 鎖: 立体陰影を焼いた環スプライトを交互に90°回す ---- */
      var linkSprWarm = null, linkSprCold = null;
      function makeLinkSprite(light, mid, dark, glint) {
        var c = document.createElement("canvas");
        c.width = 64; c.height = 64;
        var g = c.getContext("2d");
        g.translate(32, 32);
        g.lineCap = "round";
        var lg = g.createLinearGradient(-26, -20, 26, 20);
        lg.addColorStop(0, light); lg.addColorStop(0.45, mid); lg.addColorStop(1, dark);
        g.strokeStyle = dark;
        g.lineWidth = 12.5;
        g.beginPath(); g.ellipse(0, 0, 25, 15, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = lg;
        g.lineWidth = 8.5;
        g.beginPath(); g.ellipse(0, 0, 25, 15, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = mid;
        g.lineWidth = 4;
        g.beginPath(); g.ellipse(0, 0, 25, 15, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = glint;
        g.lineWidth = 2.2;
        g.beginPath(); g.ellipse(0, -1.5, 25, 15, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        return c;
      }
      function ensureLinkSprites() {
        if (!linkSprWarm) {
          linkSprWarm = makeLinkSprite("rgba(176,144,100,0.95)", "rgba(66,45,26,0.95)", "rgba(16,10,6,0.95)", "rgba(255,232,190,0.30)");
          linkSprCold = makeLinkSprite("rgba(122,142,160,0.95)", "rgba(36,46,58,0.95)", "rgba(6,9,13,0.95)", "rgba(206,230,255,0.24)");
        }
      }
      function drawChainLinks(x0, y0, x1, y1, wob, tSec, width, cold) {
        ensureLinkSprites();
        var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        var dx = x1 - x0, dy = y1 - y0;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var px = -dy / len, py = dx / len;
        var sag = Math.sin(tSec * 1.6 + wob) * 12 + Math.min(46, len * 0.10);
        var cx = mx + px * sag, cy = my + py * sag;
        var link = Math.max(3.4, width * 1.15);
        var steps = Math.max(6, Math.floor(len / (link * 1.3)));
        var spr = cold ? linkSprCold : linkSprWarm;
        var lw = link * 2.5, lh = link * 1.5;
        sctx.save();
        for (var i = 1; i < steps; i++) {
          var u = i / steps;
          var iu = 1 - u;
          var x = iu * iu * x0 + 2 * iu * u * cx + u * u * x1;
          var y = iu * iu * y0 + 2 * iu * u * cy + u * u * y1;
          var tx = 2 * iu * (cx - x0) + 2 * u * (x1 - cx);
          var ty = 2 * iu * (cy - y0) + 2 * u * (y1 - cy);
          var ta = Math.atan2(ty, tx);
          sctx.save();
          sctx.translate(x, y);
          sctx.fillStyle = "rgba(0,0,0,0.4)";
          sctx.beginPath(); sctx.ellipse(1, 1.8, lw * 0.42, lh * 0.38, ta, 0, Math.PI * 2); sctx.fill();
          sctx.rotate(i % 2 === 0 ? ta : ta + Math.PI / 2);
          sctx.drawImage(spr, -lw / 2, -lh / 2, lw, lh);
          sctx.restore();
        }
        sctx.restore();
      }

      /* ---- 棘球バースト: 暗いウニ＋光源側のリム（参照 stdz_15） ---- */
      function drawBurst(x, y, u, color, tSec, wob, lx, ly) {
        if (u <= 0.02) return;
        var base = Math.min(W, H) * 0.042 * (0.25 + 0.75 * u);
        var flick = 0.86 + 0.14 * Math.sin(tSec * 9 + x);
        var rot = tSec * 0.12;
        var lightA = Math.atan2(ly - y, lx - x) - rot;
        sctx.save();
        sctx.translate(x, y);
        /* 暗いハロー: 硬い丸に見えないよう放射フェードで沈める */
        var hg = sctx.createRadialGradient(0, 0, base * 0.4, 0, 0, base * 2.2 * flick);
        hg.addColorStop(0, "rgba(0,0,0," + 0.55 * u + ")");
        hg.addColorStop(1, "rgba(0,0,0,0)");
        sctx.fillStyle = hg;
        sctx.beginPath(); sctx.arc(0, 0, base * 2.2 * flick, 0, Math.PI * 2); sctx.fill();
        sctx.globalCompositeOperation = "lighter";
        var g = sctx.createRadialGradient(0, 0, 0, 0, 0, base * 1.9 * flick);
        g.addColorStop(0, hexA(color, 0.30 * u));
        g.addColorStop(1, hexA(color, 0));
        sctx.fillStyle = g;
        sctx.beginPath(); sctx.arc(0, 0, base * 1.9 * flick, 0, Math.PI * 2); sctx.fill();
        sctx.globalCompositeOperation = "source-over";
        sctx.rotate(rot);
        /* 本体: 光源側から照らす */
        var bg = sctx.createRadialGradient(
          Math.cos(lightA) * base * 0.3, Math.sin(lightA) * base * 0.3, base * 0.05,
          0, 0, base * 0.66
        );
        bg.addColorStop(0, color === "#c01818" ? "rgba(84,18,16,0.98)" : "rgba(58,42,26,0.98)");
        bg.addColorStop(0.55, "rgba(20,14,10,0.98)");
        bg.addColorStop(1, "rgba(5,4,3,0.98)");
        sctx.fillStyle = bg;
        sctx.beginPath(); sctx.arc(0, 0, base * 0.62, 0, Math.PI * 2); sctx.fill();
        /* 棘: 二節の有機形状、光源側は暖色 */
        var spikes = 40;
        for (var i = 0; i < spikes; i++) {
          var ang = (i / spikes) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.22;
          var jl = 0.5 + 0.8 * Math.abs(Math.sin(i * 2.7 + (wob || 0)));
          var rl = base * (0.72 + 0.95 * jl) * flick;
          var bend = Math.sin(i * 7.3) * base * 0.10;
          var bx2 = Math.cos(ang) * rl * 0.55 - Math.sin(ang) * bend;
          var by2 = Math.sin(ang) * rl * 0.55 + Math.cos(ang) * bend;
          var lit = Math.cos(ang - lightA) > 0.45;
          var tier = i % 5 === 0;
          if (tier) {
            sctx.strokeStyle = hexA(color, (lit ? 0.9 : 0.7) * u);
            sctx.lineWidth = Math.max(1.4, base * 0.05);
          } else if (lit) {
            sctx.strokeStyle = "rgba(180,128,74," + 0.40 * u + ")";
            sctx.lineWidth = Math.max(1, base * 0.034);
          } else {
            sctx.strokeStyle = "rgba(15,11,8," + 0.94 * u + ")";
            sctx.lineWidth = Math.max(1, base * 0.04);
          }
          sctx.beginPath();
          sctx.moveTo(Math.cos(ang) * base * 0.24, Math.sin(ang) * base * 0.24);
          sctx.lineTo(bx2, by2);
          sctx.lineTo(Math.cos(ang) * rl, Math.sin(ang) * rl);
          sctx.stroke();
        }
        /* 棘先の微光 */
        sctx.globalCompositeOperation = "lighter";
        for (var s2 = 0; s2 < 7; s2++) {
          var ga = (s2 / 7) * Math.PI * 2 + 0.4;
          var gr = base * (1.1 + 0.5 * Math.abs(Math.sin(s2 * 3.1 + tSec * 1.4)));
          var tw2 = Math.max(0, Math.sin(tSec * 3.1 + s2 * 1.7));
          sctx.fillStyle = "rgba(255,220,170," + 0.55 * tw2 * u + ")";
          sctx.fillRect(Math.cos(ga) * gr, Math.sin(ga) * gr, 1.4, 1.4);
        }
        /* 光源リム */
        sctx.strokeStyle = "rgba(255,196,120," + 0.30 * u + ")";
        sctx.lineWidth = Math.max(1, base * 0.05);
        sctx.beginPath(); sctx.arc(0, 0, base * 0.64, lightA - 1.15, lightA + 0.55); sctx.stroke();
        sctx.restore();
      }

      /* ---- 凝縮オーブ（末端→白球→カードへ） ---- */
      function drawOrb(x, y, u, color) {
        var rad = Math.min(W, H) * (0.025 + 0.075 * u);
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        var g = sctx.createRadialGradient(x, y, 0, x, y, rad * 1.5);
        g.addColorStop(0, "rgba(255,253,246," + (0.9 * Math.max(0.3, u)) + ")");
        g.addColorStop(0.55, hexA(color, 0.5 * u));
        g.addColorStop(1, hexA(color, 0));
        sctx.fillStyle = g;
        sctx.beginPath(); sctx.arc(x, y, rad * 1.5, 0, Math.PI * 2); sctx.fill();
        sctx.restore();
      }

      /* ---- 光点の球（参照 stdz_15: 半透明の球に細かい光点が詰まる） ---- */
      var ballSpk = [];
      for (var bs0 = 0; bs0 < 130; bs0++) {
        ballSpk.push({ a: seedFn() * 6.283, rr: Math.sqrt(seedFn()) * 0.92, f: 0.7 + seedFn() * 1.6, ph: seedFn() * 6.283, sz: 0.7 + seedFn() * 1.3 });
      }
      function drawWovenBall(x, y, r, glow, tSec) {
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        var halo = sctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4.0);
        halo.addColorStop(0, "rgba(255,190,95," + 0.50 * glow + ")");
        halo.addColorStop(0.45, "rgba(230,120,30," + 0.16 * glow + ")");
        halo.addColorStop(1, "rgba(140,60,10,0)");
        sctx.fillStyle = halo;
        sctx.beginPath(); sctx.arc(x, y, r * 4.0, 0, Math.PI * 2); sctx.fill();
        sctx.restore();

        sctx.save();
        sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fillStyle = "rgba(24,12,5,0.52)"; sctx.fill();
        /* 経線（回転）と緯線は弱く残す */
        for (var k = 0; k < 12; k++) {
          var ph = (k / 12) * Math.PI + tSec * 0.42;
          sctx.strokeStyle = "rgba(240,180,95," + (0.07 + 0.07 * glow) + ")";
          sctx.lineWidth = Math.max(1, r * 0.035);
          sctx.beginPath();
          sctx.ellipse(x, y, r * Math.abs(Math.cos(ph)) * 0.96, r * 0.96, 0, 0, Math.PI * 2);
          sctx.stroke();
        }
        for (var m = -2; m <= 2; m++) {
          sctx.strokeStyle = "rgba(200,140,70," + (0.07 + 0.07 * glow) + ")";
          sctx.lineWidth = Math.max(1, r * 0.034);
          sctx.beginPath();
          sctx.ellipse(x, y + m * r * 0.34, r * 0.94 * Math.sqrt(Math.max(0.12, 1 - (m * 0.34) * (m * 0.34))), r * 0.20, 0, 0, Math.PI * 2);
          sctx.stroke();
        }
        for (var jj = 0; jj < ballJit.length; jj++) {
          var bj2 = ballJit[jj];
          sctx.save();
          sctx.translate(x, y);
          sctx.rotate(bj2.rot + tSec * 0.12);
          sctx.strokeStyle = "rgba(255,215,140," + (0.12 + 0.12 * glow) + ")";
          sctx.lineWidth = Math.max(1, r * 0.04);
          sctx.beginPath();
          sctx.ellipse(bj2.off * r, 0, r * 0.70, r * 0.30, 0, bj2.a0, bj2.a0 + bj2.a1);
          sctx.stroke();
          sctx.restore();
        }
        /* 細かい光点（瞬く） */
        sctx.globalCompositeOperation = "lighter";
        for (var ds = 0; ds < ballSpk.length; ds++) {
          var sp2 = ballSpk[ds];
          var tw = Math.pow(Math.max(0, Math.sin(tSec * sp2.f + sp2.ph)), 2);
          if (tw < 0.08) { continue; }
          var sx = x + Math.cos(sp2.a) * sp2.rr * r * 0.95;
          var sy = y + Math.sin(sp2.a) * sp2.rr * r * 0.95;
          sctx.fillStyle = "rgba(255,238,205," + ((0.30 + 0.75 * glow) * tw) + ")";
          sctx.fillRect(sx - sp2.sz / 2, sy - sp2.sz / 2, sp2.sz, sp2.sz);
        }
        /* 大粒の瞬き: 十字のフレア */
        for (var hs = 0; hs < 16; hs++) {
          var hf = Math.max(0, Math.sin(tSec * (1.1 + (hs % 5) * 0.3) + hs * 2.1));
          if (hf < 0.55) { continue; }
          var ha = hs * 2.399;
          var hr2 = r * (0.30 + 0.62 * ((hs * 0.173) % 1));
          var hx = x + Math.cos(ha + tSec * 0.07) * hr2;
          var hy = y + Math.sin(ha + tSec * 0.07) * hr2;
          var hlen = Math.max(1.6, r * 0.10) * (0.6 + 0.6 * hf);
          sctx.strokeStyle = "rgba(255,236,190," + (0.5 * hf * (0.55 + 0.45 * glow)) + ")";
          sctx.lineWidth = Math.max(0.8, r * 0.022);
          sctx.beginPath();
          sctx.moveTo(hx - hlen, hy);
          sctx.lineTo(hx + hlen, hy);
          sctx.moveTo(hx, hy - hlen);
          sctx.lineTo(hx, hy + hlen);
          sctx.stroke();
        }
        var rim = sctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05);
        rim.addColorStop(0, "rgba(255,226,160," + (0.30 + 0.4 * glow) + ")");
        rim.addColorStop(0.35, "rgba(220,140,60,0)");
        sctx.fillStyle = rim;
        sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill();
        sctx.strokeStyle = "rgba(255,205,120," + (0.30 + 0.35 * glow) + ")";
        sctx.lineWidth = Math.max(1.2, r * 0.07);
        sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.stroke();

        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        var core = sctx.createRadialGradient(x, y, 0, x, y, r * 0.5);
        core.addColorStop(0, "rgba(255,250,232," + (0.30 + 0.35 * glow) + ")");
        core.addColorStop(0.5, "rgba(255,190,90," + 0.22 * glow + ")");
        core.addColorStop(1, "rgba(255,170,70,0)");
        sctx.fillStyle = core;
        sctx.beginPath(); sctx.arc(x, y, r * 0.5, 0, Math.PI * 2); sctx.fill();
        sctx.restore();
        sctx.restore();
      }

      /* ---- 振り子の球位置 ---- */
      var emberX = 0.5, emberY = 0.44;
      function ballAt(tSec, swing) {
        if (!swing) {
          var amp0 = 0.010;
          return { x: emberX + Math.sin(tSec * 1.1) * amp0, y: emberY + Math.cos(tSec * 0.9) * 0.006 };
        }
        var since = Math.max(0, tSec - phaseT0);
        var amp = 0.085 - 0.062 * easeOutCubic(clamp01(since / 2.6));
        var th = Math.sin(since * 2.65) * amp + Math.sin(since * 5.3) * amp * 0.22;
        return { x: emberX + th, y: emberY + Math.cos(since * 1.9) * 0.02 * Math.max(0, 1 - since / 3) };
      }

      /* ---- 残像（スイングの残光） ---- */
      var ghosts = [];
      function pushGhost(bx, by) {
        ghosts.push({ x: bx, y: by, t: 0 });
        if (ghosts.length > 8) ghosts.shift();
      }
      function drawGhosts(dtSec, r, glow) {
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        for (var i = ghosts.length - 1; i >= 0; i--) {
          var ghh = ghosts[i];
          ghh.t += dtSec;
          if (ghh.t > 0.34) { ghosts.splice(i, 1); continue; }
          var al = (1 - ghh.t / 0.34) * 0.16 * glow;
          var g = sctx.createRadialGradient(ghh.x * W, ghh.y * H, 0, ghh.x * W, ghh.y * H, r * 1.9);
          g.addColorStop(0, "rgba(255,205,120," + al + ")");
          g.addColorStop(1, "rgba(220,110,30,0)");
          sctx.fillStyle = g;
          sctx.beginPath(); sctx.arc(ghh.x * W, ghh.y * H, r * 1.9, 0, Math.PI * 2); sctx.fill();
        }
        sctx.restore();
      }

      function drawDoorBackdrop(tSec) {
        sctx.save();
        /* 黒地に淡い赤錆（参照 stdz_12: 青鋼の門、周囲はほぼ黒） */
        sctx.fillStyle = "#04060a";
        sctx.fillRect(0, 0, W, H);
        var y1 = H * 0.305, y2 = H * 0.665;
        var band = sctx.createLinearGradient(0, y1, 0, y2);
        band.addColorStop(0, "rgba(17,22,30,1)");
        band.addColorStop(0.5, "rgba(9,12,17,1)");
        band.addColorStop(1, "rgba(13,17,24,1)");
        sctx.fillStyle = band;
        sctx.fillRect(0, y1, W, y2 - y1);
        sctx.fillStyle = "rgba(30,40,52,0.95)";
        var posts = 6;
        for (var p2 = 0; p2 <= posts; p2++) {
          var qx = (p2 / posts) * W;
          sctx.fillRect(qx - 4.5, y1 + 10, 9, y2 - y1 - 20);
        }
        var beamGrad = function (yy) {
          var bg2 = sctx.createLinearGradient(0, yy - 9, 0, yy + 9);
          bg2.addColorStop(0, "rgba(70,84,100,1)");
          bg2.addColorStop(0.42, "rgba(40,50,62,1)");
          bg2.addColorStop(1, "rgba(13,18,24,1)");
          return bg2;
        };
        sctx.fillStyle = beamGrad(y1);
        sctx.fillRect(0, y1 - 9, W, 18);
        sctx.fillStyle = beamGrad(y2);
        sctx.fillRect(0, y2 - 9, W, 18);
        sctx.strokeStyle = "rgba(120,140,160,0.22)";
        sctx.lineWidth = 1.4;
        for (var rl = 1; rl <= 2; rl++) {
          var ry = y1 + (y2 - y1) * (rl / 3);
          sctx.beginPath(); sctx.moveTo(0, ry); sctx.lineTo(W, ry); sctx.stroke();
        }
        sctx.fillStyle = "rgba(74,16,20,0.36)";
        sctx.fillRect(0, y1 - 15, W * 0.62, 5);
        sctx.fillRect(W * 0.38, y2 + 10, W * 0.62, 5);
        sctx.fillStyle = "rgba(52,10,15,0.26)";
        sctx.fillRect(W * 0.12, y1 + 6, W * 0.3, 2.4);
        sctx.fillRect(W * 0.55, y2 - 9, W * 0.34, 2.4);
        sctx.restore();
      }

      var armPrev = { ok: false, x: 0.5, y: 0.44 };
      function drawArms(bx, by, r, tSec, glow, quant, dtSec) {
        var ringR = Math.min(W, H) * 0.40;
        /* 球の速度で末端が引きずられる（ウィップ） */
        var dtA = dtSec || 0.016;
        var vX = 0, vY = 0;
        if (armPrev.ok) { vX = (bx - armPrev.x) / dtA; vY = (by - armPrev.y) / dtA; }
        armPrev.ok = true; armPrev.x = bx; armPrev.y = by;
        var dragX = Math.max(-0.03, Math.min(0.03, vX * 0.07)) * W;
        var dragY = Math.max(-0.03, Math.min(0.03, vY * 0.07)) * H;
        var rXn = r / W * 0.9, rYn = r / H * 0.9;
        for (var i = 0; i < arms.length; i++) {
          var arm = arms[i];
          var k = 1 - Math.exp(-dtA * (9 + i * 0.9));
          arm.lagX = lerp(arm.lagX, bx, k);
          arm.lagY = lerp(arm.lagY, by, k);
          var prog = quant != null ? quant : 1;
          var ex = arm.lagX * W + Math.cos(arm.ang) * ringR * prog - dragX;
          var ey = arm.lagY * H + Math.sin(arm.ang) * ringR * prog - dragY;
          /* 内端は球の縁に固定し、末端だけ遅らせる（球→鎖の連動を密に） */
          drawChainLinks((bx + Math.cos(arm.ang) * rXn) * W, (by + Math.sin(arm.ang) * rYn) * H, ex, ey, arm.wob, tSec, Math.max(3.2, Math.min(W, H) * 0.006));
          var hasHit = i < list.length;
          var hit = list[i % Math.max(1, list.length)];
          var color = frameColor(hit);
          if (activeArm === i && condenseU > 0.02) {
            drawOrb(ex, ey, condenseU, color);
          } else if (hasHit) {
            var u = burstU(i, tSec);
            drawBurst(ex, ey, u, burstColor(hit), tSec, arm.wob, bx * W, by * H);
          }
        }
      }
      var activeArm = -1, condenseU = 0;
      function burstU(i, tSec) {
        if (phase === "spider") return clamp01((tSec - phaseT0) / 0.55) * (activeArm === i ? 0 : 1);
        if (phase === "card" || phase === "gold") return activeArm === i ? 0 : 0.9;
        if (phase === "swing") return clamp01((tSec - phaseT0) / (D.spider / 1000) * 1.2) * 0.5;
        return 0;
      }

      function render(ts) {
        if (stop) return;
        if (!boot) { boot = ts; lastMs = ts; }
        nowMs = ts;
        var dtSec = Math.min(0.05, (ts - lastMs) / 1000 || 0.016);
        lastMs = ts;
        var tSec = t2Sec();
        fire = lerp(fire, fireTarget, Math.min(1, dtSec * 7));
        zoom = Math.max(0, zoom - dtSec * 2.6);

        /* --- scene へ描画 --- */
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sctx.globalCompositeOperation = "source-over";
        sctx.fillStyle = "#060302";
        sctx.fillRect(0, 0, W, H);

        var fireStr = fire * (phase === "card" || phase === "gold" ? 0.6 : phase === "grid" ? 0.34 : 1);
        if (phase === "door") drawDoorBackdrop(tSec);
        if (phase === "card" || phase === "gold") {
          /* カード期: 中央に暖色の光だまりを作り、DOM カードが発光して見えるようにする */
          var cg2 = sctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.46);
          cg2.addColorStop(0, "rgba(233,180,90,0.16)");
          cg2.addColorStop(0.55, "rgba(180,110,40,0.08)");
          cg2.addColorStop(1, "rgba(0,0,0,0)");
          sctx.fillStyle = cg2;
          sctx.fillRect(0, 0, W, H);
        }
        var swinging = phase === "swing";
        var live = phase === "swing" || phase === "spider" || phase === "card" || phase === "gold";
        var bp = ballAt(tSec, swinging);
        var r = Math.min(W, H) * 0.095;
        var glow = phase === "door" ? ignitionGlow(tSec) : 0.4 + 0.6 * fire;
        var rayStr = phase === "door" ? ignitionGlow(tSec) * 0.55
          : phase === "grid" ? 0.22
            : phase === "card" || phase === "gold" ? 0.55
              : 0.30 + 0.45 * fire;

        drawBlobs(tSec, fireStr);
        drawNoise(tSec, fireStr);
        drawStars(tSec, fireStr);
        drawSparks(tSec, dtSec, fireStr, bp);

        drawRays(bp.x * W, bp.y * H, tSec, phase !== "door", rayStr);

        if (phase === "door") {
          var rrD = r * 0.72 * 0.9;
          for (var di = 0; di < 8; di++) {
            var da = (di / 8) * Math.PI * 2 + 0.2;
            drawChainLinks(bp.x * W + Math.cos(da) * rrD, bp.y * H + Math.sin(da) * rrD,
              bp.x * W + Math.cos(da) * W * 0.62, bp.y * H + Math.sin(da) * H * 0.62,
              di * 1.7, tSec, 4.2, true);
          }
        } else {
          var quant = phase === "swing" ? easeOutBack(clamp01((tSec - phaseT0) / (D.spider / 1000) * 1.05)) : 1;
          if (swinging) pushGhost(bp.x, bp.y);
          drawGhosts(dtSec, r, glow);
          drawArms(bp.x, bp.y, r, tSec, glow, quant, dtSec);
        }

        drawWovenBall(bp.x * W, bp.y * H, r * (live ? 1 : 0.72), phase === "door" ? ignitionGlow(tSec) : glow, tSec);
        if (phase === "door") {
          var gl = glintPower(tSec);
          if (gl > 0.02) {
            sctx.save();
            sctx.globalCompositeOperation = "lighter";
            var bg2 = sctx.createRadialGradient(bp.x * W, bp.y * H, 0, bp.x * W, bp.y * H, r * 0.6);
            bg2.addColorStop(0, "rgba(170,225,255," + 0.85 * gl + ")");
            bg2.addColorStop(1, "rgba(120,200,255,0)");
            sctx.fillStyle = bg2;
            sctx.beginPath(); sctx.arc(bp.x * W, bp.y * H, r * 0.6, 0, Math.PI * 2); sctx.fill();
            sctx.restore();
          }
        }

        drawRings();
        stepConfetti(dtSec, tSec);

        /* --- 本画面: シャープ + ブルーム + ビネット --- */
        var z = 1 + 0.06 * zoom * zoom;
        ctx2d.setTransform(z, 0, 0, z, (1 - z) * W * dpr / 2, (1 - z) * H * dpr / 2);
        ctx2d.globalCompositeOperation = "source-over";
        ctx2d.globalAlpha = 1;
        ctx2d.filter = "none";
        ctx2d.drawImage(scene, 0, 0);
        if (supportsFilter) {
          ctx2d.globalCompositeOperation = "lighter";
          ctx2d.globalAlpha = 0.50;
          ctx2d.filter = "blur(15px)";
          ctx2d.drawImage(scene, 0, 0);
          ctx2d.globalAlpha = 0.26;
          ctx2d.filter = "blur(3px)";
          ctx2d.drawImage(scene, 0, 0);
          ctx2d.globalAlpha = 0.16;
          ctx2d.filter = "blur(1.5px)";
          ctx2d.drawImage(scene, 0, 0);
          ctx2d.filter = "none";
          ctx2d.globalAlpha = 1;
          ctx2d.globalCompositeOperation = "source-over";
        }
        if (!vign) {
          vign = ctx2d.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
          vign.addColorStop(0, "rgba(0,0,0,0)");
          vign.addColorStop(1, "rgba(0,0,0,0.64)");
        }
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2d.fillStyle = vign;
        ctx2d.fillRect(0, 0, W, H);

        requestAnimationFrame(render);
      }
      var supportsFilter = (function () {
        try { return "filter" in ctx2d && (ctx2d.filter = "blur(1px)") === "blur(1px)"; }
        catch (e) { return false; }
      })();

      function ignitionGlow(tSec) { return clamp01(Math.max(0, tSec - phaseT0) / 0.6); }
      function glintPower(tSec) {
        if (phase !== "door") return 0;
        var t = Math.max(0, tSec - phaseT0);
        return t > 0.15 ? clamp01((t - 0.15) / 0.5) * (0.6 + 0.4 * Math.sin(t * 9)) : 0;
      }

      /* 光の扇（神光線）。球の背から放射し、card/gold では上方の光柱を添える。 */
      function drawRays(x, y, tSec, warm, strength) {
        if (strength <= 0.02) return;
        var n = 10;
        var baseA = tSec * (warm ? 0.045 : 0.02);
        var len = Math.max(W, H) * 1.05;
        var col = warm ? "255,214,140," : "150,205,255,";
        sctx.save();
        sctx.translate(x, y);
        sctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < n; i++) {
          var a = baseA + (i / n) * 6.2832;
          var l = len * (i % 2 ? 0.55 : 0.95);
          var wd = (i % 3 ? 0.030 : 0.055) * Math.min(W, H);
          var g = sctx.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
          g.addColorStop(0, "rgba(" + col + (0.15 * strength).toFixed(3) + ")");
          g.addColorStop(0.55, "rgba(" + col + (0.05 * strength).toFixed(3) + ")");
          g.addColorStop(1, "rgba(" + col + "0)");
          var px2 = -Math.sin(a) * wd, py2 = Math.cos(a) * wd;
          sctx.fillStyle = g;
          sctx.beginPath();
          sctx.moveTo(0, 0);
          sctx.lineTo(Math.cos(a) * l + px2, Math.sin(a) * l + py2);
          sctx.lineTo(Math.cos(a) * l - px2, Math.sin(a) * l - py2);
          sctx.closePath();
          sctx.fill();
        }
        if (strength > 0.3) {
          var pa = -Math.PI / 2 + Math.sin(tSec * 0.7) * 0.06;
          var pl = H * 1.25, pw = 0.05 * W;
          var pg = sctx.createLinearGradient(0, 0, Math.cos(pa) * pl, Math.sin(pa) * pl);
          pg.addColorStop(0, "rgba(" + col + (0.20 * strength).toFixed(3) + ")");
          pg.addColorStop(1, "rgba(" + col + "0)");
          var qx = -Math.sin(pa) * pw, qy = Math.cos(pa) * pw;
          sctx.fillStyle = pg;
          sctx.beginPath();
          sctx.moveTo(0, 0);
          sctx.lineTo(Math.cos(pa) * pl + qx, Math.sin(pa) * pl + qy);
          sctx.lineTo(Math.cos(pa) * pl - qx, Math.sin(pa) * pl - qy);
          sctx.closePath();
          sctx.fill();
        }
        sctx.restore();
      }

      /* 衝撃波リング（実線＋破線の二重）。 */
      function spawnRing(x, y, to, ms, rgb, from) {
        if (rings.length > 6) { rings.shift(); }
        rings.push({ x: x, y: y, t0: nowMs, ms: ms, to: to, rgb: rgb, from: from == null ? 0 : from });
      }
      function drawRings() {
        for (var i = rings.length - 1; i >= 0; i--) {
          var rg = rings[i];
          var p = (nowMs - rg.t0) / rg.ms;
          if (p >= 1) { rings.splice(i, 1); continue; }
          var rad = Math.max(1, lerp(rg.from, rg.to, easeOutCubic(clamp01(p))));
          var a = (1 - p) * (1 - p) * 0.5;
          sctx.save();
          sctx.globalCompositeOperation = "lighter";
          sctx.strokeStyle = "rgba(" + rg.rgb + "," + a.toFixed(3) + ")";
          sctx.lineWidth = 1 + 6 * (1 - p);
          sctx.beginPath();
          sctx.arc(rg.x, rg.y, rad, 0, 6.2832);
          sctx.stroke();
          sctx.strokeStyle = "rgba(" + rg.rgb + "," + (a * 0.55).toFixed(3) + ")";
          sctx.setLineDash([16, 12]);
          sctx.lineDashOffset = -p * 90;
          sctx.lineWidth = 1;
          sctx.beginPath();
          sctx.arc(rg.x, rg.y, rad * 0.82, 0, 6.2832);
          sctx.stroke();
          sctx.restore();
        }
      }

      function drawStarCross(x, y, s, a, rot) {
        var al = Math.min(1, a);
        sctx.save();
        sctx.translate(x, y);
        sctx.rotate(rot);
        var g = sctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.1);
        g.addColorStop(0, "rgba(255,248,228," + (0.85 * al).toFixed(3) + ")");
        g.addColorStop(0.4, "rgba(255,216,150," + (0.30 * al).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,190,90,0)");
        sctx.fillStyle = g;
        sctx.beginPath();
        sctx.arc(0, 0, s * 1.1, 0, 6.2832);
        sctx.fill();
        sctx.globalAlpha = al;
        sctx.strokeStyle = "rgba(255,250,235,0.9)";
        sctx.lineWidth = Math.max(1, s * 0.055);
        sctx.beginPath();
        sctx.moveTo(-s, 0); sctx.lineTo(s, 0);
        sctx.moveTo(0, -s); sctx.lineTo(0, s);
        sctx.stroke();
        sctx.restore();
      }

      /* 金の紙吹雪＋大星屑。card/gold/grid 期に漂わせる。 */
      function seedConfetti(kind) {
        conf.length = 0;
        var n = kind === "grid" ? 16 : 34;
        for (var i = 0; i < n; i++) {
          conf.push({
            x: Math.random() * W,
            y: Math.random() * H * 1.1 - H * 0.2,
            vy: 26 + Math.random() * 54, vx: -18 + Math.random() * 36,
            s: 1.6 + Math.random() * 2.6,
            rot: Math.random() * 6.283, vr: -1.2 + Math.random() * 2.4,
            tw: Math.random() * 6.283, star: false
          });
        }
        var stars = kind === "grid" ? 2 : 4;
        for (var j = 0; j < stars; j++) {
          conf.push({
            x: W * (0.18 + 0.64 * Math.random()),
            y: H * (0.12 + 0.5 * Math.random()),
            vy: 8 + Math.random() * 10, vx: -6 + Math.random() * 12,
            s: 9 + Math.random() * 13,
            rot: Math.PI * 0.25, vr: 0.15,
            tw: Math.random() * 6.283, star: true
          });
        }
      }
      function stepConfetti(dtSec, tSec) {
        if (!conf.length) return;
        if (phase !== "card" && phase !== "gold" && phase !== "grid") return;
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < conf.length; i++) {
          var c = conf[i];
          c.y += c.vy * dtSec;
          c.x += c.vx * dtSec;
          c.rot += c.vr * dtSec;
          if (c.y > H + 30) { c.y = -20 - Math.random() * 40; c.x = Math.random() * W; }
          var tw = 0.55 + 0.45 * Math.sin(tSec * 3.4 + c.tw);
          if (c.star) { drawStarCross(c.x, c.y, c.s, 1.6 * tw, c.rot); continue; }
          sctx.save();
          sctx.translate(c.x, c.y);
          sctx.rotate(c.rot);
          sctx.globalAlpha = 0.7 * tw;
          sctx.fillStyle = (i % 3) ? "rgba(255,224,150,0.95)" : "rgba(255,250,232,0.95)";
          sctx.fillRect(-c.s * 0.5, -c.s * 0.28, c.s, c.s * 0.56);
          sctx.restore();
        }
        sctx.restore();
      }

      requestAnimationFrame(render);

      /* ---------------- タイムライン ---------------- */
      function flash() {
        flashEl.classList.add("is-on");
        zoom = 1;
        spawnRing(W / 2, H / 2, Math.max(W, H) * 0.62, 780, "255,246,224");
        after(Math.round(D.flashIn), function () { flashEl.classList.remove("is-on"); });
      }

      function condenseTo(i, isGold) {
        activeArm = i;
        condenseU = 0;
        spawnRing(W / 2, H * 0.44, Math.min(W, H) * 0.07, D.condense + 120, "255,224,160", Math.min(W, H) * 0.34);
        var t0 = t2Sec();
        var stepTimer = setInterval(function () {
          condenseU = clamp01((t2Sec() - t0) / (D.condense / 1000));
          if (condenseU >= 1 || stop) { clearInterval(stepTimer); }
        }, 33);
        after(D.condense + 40, function () {
          flash();
          after(D.flashIn, function () {
            if (isGold) { goldSequence(); return; }
            paintCard(list[i], i);
            setPhase("card");
            activeArm = -1;
            after(D.cardHold, function () {
              flash();
              after(D.flashIn, function () {
                cardEl.className = "lbt-gx__card";
                cardEl.textContent = "";
                condenseU = 0;
                setPhase("spider");
                nextCard(i + 1);
              });
            });
          });
        });
      }
      function nextCard(i) {
        if (i >= list.length) { gridPhase(); return; }
        setPhase("spider");
        condenseTo(i, !!(state.gold && i === state.specialAt));
      }

      /* 3★(特異): 金カードが転換 → 遺物が暗転に顕現 → 赤の引用 → 青のスプラッシュ。 */
      function goldSequence() {
        setPhase("gold");
        var hit = list[state.specialAt];
        paintCard(hit, state.specialAt);
        cardEl.classList.add("is-golden");
        root.classList.add("is-turn");
        spawnRing(W / 2, H / 2, Math.min(W, H) * 0.46, 900, "255,232,170");
        after(D.goldTurn, function () {
          root.classList.remove("is-turn");
          quoteEl.className = "lbt-gx__quote is-in";
          quoteEl.innerHTML = "";
          var relic = document.createElement("div");
          relic.className = "lbt-gx__relic";
          relic.innerHTML = emblemSVG();
          relic.style.setProperty("--em-from", String(state.specialAt / list.length));
          relic.style.setProperty("--em-turn", String((state.specialAt + 1) / list.length));
          var q = document.createElement("p");
          q.className = "lbt-gx__quote-line";
          staggerLine(q, (hit && hit.name) ? "\u201c" + hit.name + "\u201d" : "\u2015\u2015", 420);
          var sub = document.createElement("p");
          sub.className = "lbt-gx__quote-sub";
          staggerLine(sub, "特異人格 接続完了", 980);
          quoteEl.appendChild(relic);
          quoteEl.appendChild(q);
          quoteEl.appendChild(sub);
          cardEl.className = "lbt-gx__card";
          cardEl.textContent = "";
          spawnRing(W / 2, H / 2, Math.min(W, H) * 0.5, 1100, "226,120,96");
          after(D.quoteHold, function () {
            quoteEl.className = "lbt-gx__quote";
            splashEl.className = "lbt-gx__splash is-in";
            splashEl.textContent = "";
            var ring1 = document.createElement("i");
            ring1.className = "lbt-gx__ring";
            var ring2 = document.createElement("i");
            ring2.className = "lbt-gx__ring is-gold";
            ring2.style.animationDelay = "180ms";
            var nm = document.createElement("b");
            staggerLine(nm, (hit && hit.name) || "", 360);
            var ty = document.createElement("span");
            ty.textContent = label(hit);
            splashEl.appendChild(ring1);
            splashEl.appendChild(ring2);
            splashEl.appendChild(nm);
            splashEl.appendChild(ty);
            after(D.splash, function () {
              splashEl.className = "lbt-gx__splash";
              after(320, function () {
                nextCard(state.specialAt + 1);
              });
            });
          });
        });
      }

      function gridPhase() {
        setPhase("grid");
        fireTarget = 0.5;
        finish(false);
      }

      /* 開始: 扉 → 点火 → スイング → 10鎖 → カードループ */
      setPhase("door");
      after(D.ignite, function () {
        setPhase("swing");
        fireTarget = 1;
      });
      after(D.ignite + D.swing, function () {
        setPhase("spider");
      });
      after(D.ignite + D.swing + D.spider, function () {
        nextCard(0);
      });
    });
  }

  window.LBT_gachaExtraction = {
    plan: plan,
    play: play,
    reduceMotion: reduceMotion,
    isSpecial: isSpecial,
    label: label,
    frameColor: frameColor,
    RM_QUERY: RM_QUERY
  };
})();
