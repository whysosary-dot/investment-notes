// admin.js — 브라우저에서 카드/기업 추가·수정·삭제 + 이미지 첨부 + GitHub Contents API 커밋&푸시
// 토큰은 이 기기 브라우저 localStorage 에만 저장하며 repo 에는 절대 커밋하지 않는다.
// 이미지는 업로드 전 클라이언트에서 리사이즈·JPEG 압축하여 용량을 최소화한다.
(function () {
  "use strict";

  var K_TOKEN = "inv_gh_token", K_CFG = "inv_gh_cfg", K_PENDING = "inv_pending_ops_v1";
  var K_RECENT = "inv_recent_pushed_v1";
  var IMG_MAXDIM = 1400, IMG_QUALITY = 0.82;
  var RECENT_TTL_MS = 30 * 60 * 1000; // 푸시 후 Pages 반영 대기 동안 카드 유지(최대 30분)
  var CARD_COLORS = [["red", "빨강"], ["amber", "노랑"], ["green", "초록"], ["blue", "파랑"], ["purple", "보라"], ["pink", "분홍"]];
  function colorSwatchHtml(cur) {
    var html = '<button type="button" class="inv-color none' + (cur ? "" : " active") + '" data-color="" title="없음">✕</button>';
    return html + CARD_COLORS.map(function (c) {
      return '<button type="button" class="inv-color sw-' + c[0] + (cur === c[0] ? " active" : "") + '" data-color="' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '"></button>';
    }).join("");
  }
  function wireColorSwatches(box) {
    box.querySelectorAll(".inv-color").forEach(function (b) {
      b.addEventListener("click", function () {
        box.querySelectorAll(".inv-color").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
    });
  }

  // ── 유틸 ─────────────────────────────────────────────
  function todayKST() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function lsGet(k, dflt) { try { var v = localStorage.getItem(k); return v == null ? dflt : v; } catch (_) { return dflt; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function jget(k, dflt) { try { return JSON.parse(localStorage.getItem(k) || "null") || dflt; } catch (_) { return dflt; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function b64encUtf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64decUtf8(s) { return decodeURIComponent(escape(atob(s.replace(/\s+/g, "")))); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function uid() { return Date.now() + "" + Math.floor(Math.random() * 1e6); }
  // 변경 반영: 페이지가 제자리 갱신을 지원하면 그걸 쓰고(스크롤 유지), 아니면 전체 새로고침
  function softRefresh() {
    if (typeof window.__INV_PAGE_REFRESH === "function") {
      try { window.__INV_PAGE_REFRESH(); return; } catch (_) {}
    }
    location.reload();
  }

  // ── 설정 ─────────────────────────────────────────────
  function detectRepo() {
    var owner = "", repo = "";
    try {
      var host = location.host;
      var parts = location.pathname.split("/").filter(Boolean);
      if (host.endsWith("github.io")) {
        owner = host.split(".")[0];
        if (parts.length > 0 && !/\.html?$/.test(parts[0])) repo = parts[0];
      }
    } catch (_) {}
    return { owner: "whysosary-dot", repo: "invest-private", branch: "main", path: "research/companies.json" };
  }
  function getCfg() {
    var d = detectRepo(), s = jget(K_CFG, {});
    return {
      owner: d.owner || "", repo: d.repo || "",
      branch: d.branch || "main", path: d.path || "research/companies.json"
    };
  }
  function getToken() { return lsGet(K_TOKEN, "") || (window.localStorage && localStorage.getItem("sv_github_pat")) || ""; }

  // ── pending ──────────────────────────────────────────
  function getPending() { return jget(K_PENDING, []); }
  function setPending(a) { jset(K_PENDING, a); updateBar(); }
  function pendingCount() { return getPending().length; }

  // pending 안에서 특정 카드를 만들거나 수정하는 op 를 찾음
  function findPendingCard(ops, companyId, cardId) {
    for (var i = ops.length - 1; i >= 0; i--) {
      var op = ops[i];
      if ((op.type === "add_card" || op.type === "edit_card") && op.companyId === companyId && op.card.id === cardId)
        return { op: op, ref: op.card };
      if (op.type === "add_company" && op.company.id === companyId) {
        var c = (op.company.cards || []).find(function (k) { return k.id === cardId; });
        if (c) return { op: op, ref: c };
      }
    }
    return null;
  }

  // 데이터에 ops 를 순서대로 적용(코어).
  //   mark: true = 미푸시(_pending), "recent" = 푸시됨·반영대기(_recent), false = 실제 커밋(표식없음)
  function mergeOps(data, ops, mark) {
    if (!data || !data.companies) return 0;
    var preview = (mark === true || mark === "recent");
    var applied = 0;
    function co(id) { return data.companies.find(function (c) { return c.id === id; }); }
    function prepCard(card) {
      var cc = clone(card);
      if (mark === true) cc._pending = true;
      else if (mark === "recent") cc._recent = true;
      if (preview && cc._uploads && cc.images) {
        var map = {}; cc._uploads.forEach(function (u) { map[u.path] = u.dataURL; });
        cc.images = cc.images.map(function (p) { return map[p] || p; }); // 미리보기: 새 이미지=dataURL
      }
      return cc;
    }
    ops.forEach(function (op) {
      if (op.type === "add_company") {
        var ex = co(op.company.id);
        if (!ex) {
          var nc = clone(op.company);
          if (mark === true) nc._pending = true; else if (mark === "recent") nc._recent = true;
          nc.cards = (op.company.cards || []).map(prepCard);
          data.companies.push(nc); applied++;
        } else {
          (op.company.cards || []).forEach(function (card) {
            if (!(ex.cards || []).some(function (k) { return k.id === card.id; })) {
              ex.cards = ex.cards || []; ex.cards.push(prepCard(card)); applied++;
            }
          });
        }
      } else if (op.type === "add_card") {
        var c1 = co(op.companyId);
        if (c1 && !(c1.cards || []).some(function (k) { return k.id === op.card.id; })) {
          c1.cards = c1.cards || []; c1.cards.push(prepCard(op.card)); applied++;
        }
      } else if (op.type === "edit_card") {
        var c2 = co(op.companyId);
        if (c2) {
          var idx = (c2.cards || []).findIndex(function (k) { return k.id === op.card.id; });
          if (idx >= 0) { var e = prepCard(op.card); if (mark === true) e._edited = true; c2.cards[idx] = e; applied++; }
        }
      } else if (op.type === "delete_card") {
        var c3 = co(op.companyId);
        if (c3) c3.cards = (c3.cards || []).filter(function (k) { return k.id !== op.cardId; });
        applied++;
      } else if (op.type === "edit_company") {
        var c4 = co(op.companyId);
        if (c4) { Object.assign(c4, op.meta); if (mark === true) c4._pending = true; applied++; }
      } else if (op.type === "delete_company") {
        data.companies = data.companies.filter(function (c) { return c.id !== op.companyId; });
        applied++;
      }
    });
    return applied;
  }

  // ── 최근 푸시 오버레이(Pages 반영 지연 대비) ─────────
  function getRecent() { return jget(K_RECENT, []); }
  function setRecent(a) { jset(K_RECENT, a); }
  function companyOf(base, id) { return (base.companies || []).find(function (c) { return c.id === id; }); }
  // base(갓 fetch 한 커밋본)에 이 op 가 이미 반영됐는지
  function confirmedLive(base, op) {
    var c;
    if (op.type === "add_card") { c = companyOf(base, op.companyId); return !!(c && (c.cards || []).some(function (k) { return k.id === op.card.id; })); }
    if (op.type === "add_company") { c = companyOf(base, op.company.id); if (!c) return false; return (op.company.cards || []).every(function (card) { return (c.cards || []).some(function (k) { return k.id === card.id; }); }); }
    if (op.type === "delete_card") { c = companyOf(base, op.companyId); return !c || !(c.cards || []).some(function (k) { return k.id === op.cardId; }); }
    if (op.type === "delete_company") { return !companyOf(base, op.companyId); }
    if (op.type === "edit_card") { c = companyOf(base, op.companyId); if (!c) return false; var k = (c.cards || []).find(function (x) { return x.id === op.card.id; }); return !!(k && k.title === op.card.title && (k.date || "") === (op.card.date || "")); }
    if (op.type === "edit_company") { c = companyOf(base, op.companyId); return !!(c && c.name === op.meta.name && (c.sector || "") === (op.meta.sector || "")); }
    return false;
  }
  // 반영 확인됐거나 TTL 지난 항목 제거
  function pruneRecent(base) {
    var now = Date.now();
    var kept = getRecent().filter(function (r) {
      if ((now - (r.at || 0)) > RECENT_TTL_MS) return false;
      try { if (confirmedLive(base, r.op)) return false; } catch (_) {}
      return true;
    });
    setRecent(kept);
    return kept;
  }

  // 화면표시용: base(fetch본) 위에 [최근푸시] → [미푸시] 순으로 오버레이
  function applyForDisplay(data) {
    if (!data || !data.companies) return 0;
    var recent = pruneRecent(data).map(function (r) { return r.op; });
    var n = 0;
    n += mergeOps(data, recent, "recent");
    n += mergeOps(data, getPending(), true);
    return n;
  }

  function stripPending(data) {
    (data.companies || []).forEach(function (c) {
      delete c._pending; delete c._edited; delete c._recent;
      (c.cards || []).forEach(function (k) { delete k._pending; delete k._edited; delete k._recent; delete k._uploads; });
    });
  }

  function currentData() { return window.__INV_DATA || { companies: [] }; }
  // 편집용 정규 카드(이미지=경로, 표식 제거) 복원: pending op 우선, 없으면 원본
  function resolveCanonicalCard(companyId, cardId) {
    var fp = findPendingCard(getPending(), companyId, cardId);
    if (!fp) fp = findPendingCard(getRecent().map(function (r) { return r.op; }), companyId, cardId);
    if (fp) return clone(fp.ref);
    var c = (currentData().companies || []).find(function (x) { return x.id === companyId; });
    if (c) {
      var k = (c.cards || []).find(function (x) { return x.id === cardId; });
      if (k) { var kk = clone(k); delete kk._pending; delete kk._edited; delete kk._recent; return kk; }
    }
    return null;
  }
  // 웹에서 추가하는 카드는 충돌 불가능한 고유 ID 사용(스케줄러 card-NNN 과 분리)
  function uniqueCardId() {
    return "web-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
  }

  // ── 이미지 리사이즈 ──────────────────────────────────
  function fileToResizedDataURL(file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) { rej(new Error("이미지 파일이 아닙니다: " + file.name)); return; }
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height, scale = Math.min(1, IMG_MAXDIM / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        try { res(cv.toDataURL("image/jpeg", IMG_QUALITY)); } catch (e) { rej(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("이미지 로드 실패")); };
      img.src = url;
    });
  }
  function dataURLBytes(d) { var i = d.indexOf(","); return Math.round((d.length - i - 1) * 0.75); }
  function kb(n) { return n < 1024 * 1024 ? Math.round(n / 1024) + "KB" : (n / 1024 / 1024).toFixed(1) + "MB"; }

  // ── 토스트 ───────────────────────────────────────────
  function toast(msg, kind) {
    var t = document.createElement("div");
    t.className = "inv-toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, kind === "err" ? 4500 : 2600);
  }
  function openModal(node) {
    var ov = document.createElement("div");
    ov.className = "inv-modal-overlay";
    ov.appendChild(node);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    return ov;
  }
  function confirmDlg(msg, onYes, yesLabel) {
    var m = document.createElement("div");
    m.className = "inv-modal inv-confirm";
    m.innerHTML =
      '<div class="inv-modal-bd"><p class="inv-confirm-msg">' + esc(msg) + '</p></div>' +
      '<div class="inv-modal-ft"><button class="inv-btn" data-no>취소</button>' +
      '<button class="inv-btn danger" data-yes>' + esc(yesLabel || "삭제") + '</button></div>';
    var ov = openModal(m);
    m.querySelector("[data-no]").addEventListener("click", function () { ov.remove(); });
    m.querySelector("[data-yes]").addEventListener("click", function () { ov.remove(); onYes(); });
  }

  // ── 카드 모달 (추가/수정 공용) ───────────────────────
  // opts: { mode:"add"|"edit", companyId, card }
  function openCardModal(opts) {
    opts = opts || { mode: "add" };
    var isEdit = opts.mode === "edit";
    var data = currentData();
    var companies = (data.companies || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "ko"); });

    var coOptions = isEdit ? "" : ['<option value="">+ 신규 기업/산업 만들기…</option>'].concat(
      companies.map(function (c) {
        var label = c.name + (c.ticker ? " (" + c.ticker + ")" : "") + (c.type === "industry" ? " · 산업" : "");
        return '<option value="' + esc(c.id) + '"' + (c.id === opts.companyId ? " selected" : "") + ">" + esc(label) + "</option>";
      })).join("");

    var card = isEdit ? (opts.card || {}) : {};

    var m = document.createElement("div");
    m.className = "inv-modal";
    m.innerHTML =
      '<div class="inv-modal-hd"><h2>' + (isEdit ? "카드 수정" : "카드 추가") + '</h2><button class="inv-x" data-x>✕</button></div>' +
      '<div class="inv-modal-bd">' +
        (isEdit
          ? '<div class="inv-editing-co">기업: <b>' + esc((companies.find(function (c) { return c.id === opts.companyId; }) || {}).name || opts.companyId) + '</b></div>'
          : '<label class="inv-f"><span>기업 / 산업</span><select id="iv-co">' + coOptions + '</select></label>' +
            '<div id="iv-newco" class="inv-newco" hidden>' +
              '<div class="inv-row">' +
                '<label class="inv-f"><span>종목/산업명 *</span><input id="iv-name" placeholder="예: 삼성전자" /></label>' +
                '<label class="inv-f"><span>ID(영문 slug) *</span><input id="iv-id" placeholder="예: samsung-electronics" /></label>' +
              '</div>' +
              '<div class="inv-row">' +
                '<label class="inv-f"><span>티커</span><input id="iv-ticker" placeholder="예: 005930" /></label>' +
                '<label class="inv-f"><span>섹터</span><input id="iv-sector" placeholder="예: 반도체" /></label>' +
                '<label class="inv-f inv-narrow"><span>구분</span><select id="iv-type"><option value="company">기업</option><option value="industry">산업</option></select></label>' +
              '</div>' +
            '</div>') +

        '<label class="inv-f"><span>자료 날짜</span><input id="iv-date" type="date" value="' + esc(card.date || todayKST()) + '" /></label>' +
        '<label class="inv-f"><span>제목 *</span><input id="iv-title" value="' + esc(card.title || "") + '" placeholder="카드 한 줄 요약" /></label>' +
        '<label class="inv-f"><span>요약 (한 줄당 1불릿)</span><textarea id="iv-summary" rows="4" placeholder="핵심 포인트 1&#10;핵심 포인트 2">' + esc((card.summary || []).join("\n")) + '</textarea></label>' +
        '<label class="inv-f"><span>태그 (쉼표로 구분)</span><input id="iv-tags" value="' + esc((card.tags || []).join(", ")) + '" placeholder="실적, 1Q26, 매수" /></label>' +

        '<label class="inv-f"><span>카드 색상 (중요 표시·색상 필터용)</span><div class="inv-colors" id="iv-colors"></div></label>' +

        '<label class="inv-f"><span>이미지 첨부 (파일 선택 · Ctrl+V 붙여넣기 · 드래그&드롭, 자동 압축)</span><input id="iv-imgs" type="file" accept="image/*" multiple /></label>' +
        '<div id="iv-paste" class="inv-paste" tabindex="0">📋 여기를 클릭한 뒤 <b>Ctrl+V</b>로 스크린샷·복사한 이미지를 붙여넣거나, 이미지를 끌어다 놓으세요</div>' +
        '<div id="iv-img-prev" class="inv-img-prev"></div>' +
      '</div>' +
      '<div class="inv-modal-ft">' +
        '<span class="inv-hint">로컬 저장 → “커밋 & 푸시”로 동기화</span>' +
        '<button class="inv-btn primary" id="iv-save">' + (isEdit ? "수정 저장" : "로컬에 추가") + '</button>' +
      '</div>';

    var ov = openModal(m);

    // 이미지 상태: { kind:"keep", path } | { kind:"new", dataURL, path:null }
    var imgItems = [];
    (card.images || []).forEach(function (p) {
      if (typeof p === "string" && p.indexOf("data:") === 0) imgItems.push({ kind: "new", dataURL: p, path: null });
      else imgItems.push({ kind: "keep", path: p });
    });
    // 수정 시 기존 pending 업로드 dataURL 매핑
    if (isEdit && card._uploads) {
      var um = {}; card._uploads.forEach(function (u) { um[u.path] = u.dataURL; });
      imgItems = imgItems.map(function (it) {
        if (it.kind === "keep" && um[it.path]) return { kind: "new", dataURL: um[it.path], path: it.path };
        return it;
      });
    }

    function renderThumbs() {
      var box = m.querySelector("#iv-img-prev");
      box.innerHTML = imgItems.map(function (it, i) {
        var src = it.kind === "new" ? it.dataURL : it.path;
        var safe = (src && src.indexOf("data:") === 0) ? src : encodeURI(src || "");
        var sz = it.kind === "new" ? ' <span class="inv-img-sz">' + kb(dataURLBytes(it.dataURL)) + '</span>' : '';
        return '<div class="inv-thumb"><img src="' + safe + '" alt="" /><button type="button" class="inv-thumb-x" data-i="' + i + '">✕</button>' + sz + '</div>';
      }).join("");
      box.querySelectorAll(".inv-thumb-x").forEach(function (b) {
        b.addEventListener("click", function () { imgItems.splice(parseInt(b.dataset.i, 10), 1); renderThumbs(); });
      });
    }
    renderThumbs();

    // 색상 선택 스와치 (추가 시 기본 보라, 수정 시 기존 색 유지)
    (function () {
      var box = m.querySelector("#iv-colors");
      var def = isEdit ? (card.color || "") : (card.color || "red");
      box.innerHTML = colorSwatchHtml(def);
      wireColorSwatches(box);
    })();

    // 파일/붙여넣기/드롭 공용 처리
    function addFiles(files) {
      var list = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
      if (!list.length) return;
      list.reduce(function (p, f) {
        return p.then(function () {
          return fileToResizedDataURL(f).then(function (d) { imgItems.push({ kind: "new", dataURL: d, path: null }); renderThumbs(); })
            .catch(function (err) { toast(err.message || String(err), "err"); });
        });
      }, Promise.resolve());
    }

    m.querySelector("#iv-imgs").addEventListener("change", function (e) {
      addFiles(e.target.files); e.target.value = "";
    });

    // Ctrl+V 붙여넣기 (스크린샷 등 클립보드 이미지). 모달 열린 동안 document 에서 수신.
    function onPaste(e) {
      if (!document.body.contains(m)) { document.removeEventListener("paste", onPaste); return; }
      var items = (e.clipboardData && e.clipboardData.items) || [];
      var imgs = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "file" && /^image\//.test(items[i].type)) {
          var f = items[i].getAsFile(); if (f) imgs.push(f);
        }
      }
      if (imgs.length) { e.preventDefault(); addFiles(imgs); toast(imgs.length + "개 이미지 붙여넣음"); }
    }
    document.addEventListener("paste", onPaste);
    var mo = new MutationObserver(function () {
      if (!document.body.contains(ov)) { document.removeEventListener("paste", onPaste); mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true });

    // 드래그 & 드롭
    var pasteZone = m.querySelector("#iv-paste");
    ["dragenter", "dragover"].forEach(function (ev) {
      m.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); pasteZone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      m.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); pasteZone.classList.remove("drag"); });
    });
    m.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });

    if (!isEdit) {
      var coSel = m.querySelector("#iv-co"), newco = m.querySelector("#iv-newco");
      function syncNewco() { newco.hidden = !!coSel.value; }
      coSel.addEventListener("change", syncNewco); syncNewco();
    }

    m.querySelector("[data-x]").addEventListener("click", function () { ov.remove(); });

    m.querySelector("#iv-save").addEventListener("click", function () {
      try {
        var base = buildCardFields(m);
        var companyId = isEdit ? opts.companyId : (m.querySelector("#iv-co").value || null);

        // 카드 id: 수정은 기존 id 유지, 신규는 충돌 불가능한 고유 id
        var cardId = isEdit ? opts.card.id : uniqueCardId();

        // 이미지 처리: keep + new(경로 부여) → images[], _uploads[]
        var images = [], uploads = [];
        imgItems.forEach(function (it, i) {
          if (it.kind === "keep") { images.push(it.path); }
          else {
            var path = it.path || ("research/images/" + (companyId || base._newCoId || "misc") + "/" + cardId + "-" + Date.now() + "-" + i + ".jpg");
            images.push(path); uploads.push({ path: path, dataURL: it.dataURL });
          }
        });

        var cardObj = {
          id: cardId, title: base.title, date: base.date, added_at: isEdit ? (opts.card.added_at || todayKST()) : todayKST(),
          source_image: "", summary: base.summary, tags: base.tags
        };
        if (images.length) cardObj.images = images;
        if (uploads.length) cardObj._uploads = uploads;
        if (base.color) cardObj.color = base.color;
        // 차트는 웹 폼에서 입력하지 않음 — 수정 시 기존(자동 생성) 차트는 그대로 보존
        if (isEdit) {
          if (opts.card.charts) cardObj.charts = opts.card.charts;
          else if (opts.card.chart) cardObj.chart = opts.card.chart;
        }

        var ops = getPending();
        if (isEdit) {
          upsertEdit(ops, companyId, cardObj);
        } else if (companyId) {
          ops.push({ id: uid(), type: "add_card", companyId: companyId, card: cardObj });
        } else {
          var nc = buildCompanyFields(m);
          // 신규기업의 카드 이미지 경로에 회사 id 반영
          (cardObj._uploads || []).forEach(function (u) { /* path 이미 기업 id 미지정시 misc → 교정 */ });
          cardObj = fixNewCoImagePaths(cardObj, nc.id);
          nc.cards = [cardObj];
          ops.push({ id: uid(), type: "add_company", company: nc });
        }
        setPending(ops);
        ov.remove();
        toast((isEdit ? "수정됨" : "추가됨") + " — 미푸시 " + pendingCount() + "건");
        setTimeout(softRefresh, 280);
      } catch (e) { toast(e.message || String(e), "err"); }
    });
  }

  function fixNewCoImagePaths(cardObj, coId) {
    if (cardObj.images) cardObj.images = cardObj.images.map(function (p) { return p.replace("/misc/", "/" + coId + "/"); });
    if (cardObj._uploads) cardObj._uploads.forEach(function (u) { u.path = u.path.replace("/misc/", "/" + coId + "/"); });
    return cardObj;
  }

  // 수정 op 병합: 미푸시 add 카드면 그 op 를 갱신, 아니면 edit_card upsert
  function upsertEdit(ops, companyId, cardObj) {
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === "add_card" && op.companyId === companyId && op.card.id === cardObj.id) { op.card = cardObj; return; }
      if (op.type === "add_company" && op.company.id === companyId) {
        var idx = (op.company.cards || []).findIndex(function (k) { return k.id === cardObj.id; });
        if (idx >= 0) { op.company.cards[idx] = cardObj; return; }
      }
      if (op.type === "edit_card" && op.companyId === companyId && op.card.id === cardObj.id) { op.card = cardObj; return; }
    }
    ops.push({ id: uid(), type: "edit_card", companyId: companyId, card: cardObj });
  }

  function buildCardFields(m) {
    var title = m.querySelector("#iv-title").value.trim();
    if (!title) throw new Error("제목을 입력하세요.");
    var date = m.querySelector("#iv-date").value || todayKST();
    var summary = m.querySelector("#iv-summary").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var tags = m.querySelector("#iv-tags").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var colorEl = m.querySelector(".inv-color.active");
    var color = colorEl ? (colorEl.getAttribute("data-color") || "") : "";
    return { title: title, date: date, summary: summary, tags: tags, color: color };
  }
  function buildCompanyFields(m) {
    var name = m.querySelector("#iv-name").value.trim();
    var id = m.querySelector("#iv-id").value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) throw new Error("신규 기업/산업명을 입력하세요.");
    if (!id) throw new Error("영문 ID(slug)를 입력하세요.");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("ID는 영문 소문자·숫자·하이픈만 사용하세요.");
    if ((currentData().companies || []).some(function (c) { return c.id === id; })) throw new Error("이미 존재하는 ID: " + id);
    var co = { id: id, name: name, ticker: m.querySelector("#iv-ticker").value.trim(), sector: m.querySelector("#iv-sector").value.trim(),
      tags: [], created_at: todayKST(), last_updated: todayKST(), cards: [] };
    co.type = (m.querySelector("#iv-type").value === "industry") ? "industry" : "company";
    return co;
  }

  // ── 기업 수정 모달 ───────────────────────────────────
  function openCompanyEdit(company) {
    var m = document.createElement("div");
    m.className = "inv-modal";
    m.innerHTML =
      '<div class="inv-modal-hd"><h2>기업 정보 수정</h2><button class="inv-x" data-x>✕</button></div>' +
      '<div class="inv-modal-bd">' +
        '<label class="inv-f"><span>종목/산업명 *</span><input id="iv-cname" value="' + esc(company.name || "") + '" /></label>' +
        '<div class="inv-row">' +
          '<label class="inv-f"><span>티커</span><input id="iv-cticker" value="' + esc(company.ticker || "") + '" /></label>' +
          '<label class="inv-f"><span>섹터</span><input id="iv-csector" value="' + esc(company.sector || "") + '" /></label>' +
        '</div>' +
        '<label class="inv-f"><span>색상 (중요 표시·색상 필터용)</span><div class="inv-colors" id="iv-ccolors"></div></label>' +
      '</div>' +
      '<div class="inv-modal-ft"><span class="inv-hint">ID(' + esc(company.id) + ')는 변경 불가</span>' +
      '<button class="inv-btn primary" id="iv-csave">수정 저장</button></div>';
    var ov = openModal(m);
    (function () {
      var box = m.querySelector("#iv-ccolors");
      box.innerHTML = colorSwatchHtml(company.color || "");
      wireColorSwatches(box);
    })();
    m.querySelector("[data-x]").addEventListener("click", function () { ov.remove(); });
    m.querySelector("#iv-csave").addEventListener("click", function () {
      var name = m.querySelector("#iv-cname").value.trim();
      if (!name) { toast("이름을 입력하세요.", "err"); return; }
      var colorEl = m.querySelector("#iv-ccolors .inv-color.active");
      var meta = { name: name, ticker: m.querySelector("#iv-cticker").value.trim(), sector: m.querySelector("#iv-csector").value.trim(), color: (colorEl ? (colorEl.getAttribute("data-color") || "") : "") };
      var ops = getPending();
      // 미푸시 신규기업이면 그 op 갱신
      var done = false;
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].type === "add_company" && ops[i].company.id === company.id) { Object.assign(ops[i].company, meta); done = true; break; }
        if (ops[i].type === "edit_company" && ops[i].companyId === company.id) { Object.assign(ops[i].meta, meta); done = true; break; }
      }
      if (!done) ops.push({ id: uid(), type: "edit_company", companyId: company.id, meta: meta });
      setPending(ops);
      ov.remove(); toast("기업 정보 수정됨 — 미푸시 " + pendingCount() + "건");
      setTimeout(softRefresh, 280);
    });
  }

  // ── 삭제 ─────────────────────────────────────────────
  function deleteCard(companyId, cardId, title) {
    confirmDlg("이 카드를 삭제할까요?\n\n" + (title || cardId), function () {
      var ops = getPending();
      // 미푸시 추가 카드면 그 op 제거
      var kept = [], removedPendingAdd = false;
      ops.forEach(function (op) {
        if (op.type === "add_card" && op.companyId === companyId && op.card.id === cardId) { removedPendingAdd = true; return; }
        if (op.type === "edit_card" && op.companyId === companyId && op.card.id === cardId) { return; } // 기존 edit 제거
        if (op.type === "add_company" && op.company.id === companyId) {
          var before = (op.company.cards || []).length;
          op.company.cards = (op.company.cards || []).filter(function (k) { return k.id !== cardId; });
          if (op.company.cards.length !== before) removedPendingAdd = true;
        }
        kept.push(op);
      });
      if (!removedPendingAdd) kept.push({ id: uid(), type: "delete_card", companyId: companyId, cardId: cardId });
      setPending(kept);
      toast("카드 삭제 예약됨 — 미푸시 " + pendingCount() + "건");
      setTimeout(softRefresh, 280);
    });
  }
  function deleteCompany(company) {
    confirmDlg("‘" + (company.name || company.id) + "’ 기업과 그 카드 전체를 삭제할까요?", function () {
      var ops = getPending().filter(function (op) {
        // 이 기업 관련 미푸시 op 모두 제거
        if (op.type === "add_company" && op.company.id === company.id) return false;
        if ((op.type === "add_card" || op.type === "edit_card") && op.companyId === company.id) return false;
        if ((op.type === "delete_card" || op.type === "edit_company") && op.companyId === company.id) return false;
        return true;
      });
      var wasPendingNew = getPending().some(function (op) { return op.type === "add_company" && op.company.id === company.id; });
      if (!wasPendingNew) ops.push({ id: uid(), type: "delete_company", companyId: company.id });
      setPending(ops);
      toast("기업 삭제 예약됨 — 미푸시 " + pendingCount() + "건");
      setTimeout(function () { location.href = "index.html"; }, 600);
    }, "기업 삭제");
  }

  // ── 설정(토큰) 모달 ──────────────────────────────────
  function openSettings(afterSave) {
    var cfg = getCfg(), tok = getToken();
    var m = document.createElement("div");
    m.className = "inv-modal";
    m.innerHTML =
      '<div class="inv-modal-hd"><h2>GitHub 연결 설정</h2><button class="inv-x" data-x>✕</button></div>' +
      '<div class="inv-modal-bd">' +
        '<p class="inv-note">토큰은 이 기기 브라우저에만 저장되며 repo 에 절대 커밋되지 않습니다. ' +
        'Fine-grained PAT 에 이 저장소의 <b>Contents: Read and write</b> 권한을 주세요.</p>' +
        '<label class="inv-f"><span>GitHub 토큰 (PAT)</span><input id="iv-tok" type="password" placeholder="github_pat_… 또는 ghp_…" value="' + esc(tok) + '" /></label>' +
        '<div class="inv-row">' +
          '<label class="inv-f"><span>Owner</span><input id="iv-owner" value="' + esc(cfg.owner) + '" /></label>' +
          '<label class="inv-f"><span>Repo</span><input id="iv-repo" value="' + esc(cfg.repo) + '" /></label>' +
        '</div>' +
        '<div class="inv-row">' +
          '<label class="inv-f inv-narrow"><span>Branch</span><input id="iv-branch" value="' + esc(cfg.branch) + '" /></label>' +
          '<label class="inv-f"><span>파일 경로</span><input id="iv-path" value="' + esc(cfg.path) + '" /></label>' +
        '</div>' +
        '<div id="iv-test-out" class="inv-test-out"></div>' +
      '</div>' +
      '<div class="inv-modal-ft"><button class="inv-btn" id="iv-test">연결 테스트</button>' +
      '<button class="inv-btn primary" id="iv-savecfg">저장</button></div>';
    var ov = openModal(m);
    m.querySelector("[data-x]").addEventListener("click", function () { ov.remove(); });
    function readForm() {
      return { token: m.querySelector("#iv-tok").value.trim(), cfg: {
        owner: m.querySelector("#iv-owner").value.trim(), repo: m.querySelector("#iv-repo").value.trim(),
        branch: m.querySelector("#iv-branch").value.trim() || "main", path: m.querySelector("#iv-path").value.trim() || "data/companies.json" } };
    }
    m.querySelector("#iv-test").addEventListener("click", function () {
      var f = readForm(), out = m.querySelector("#iv-test-out");
      out.textContent = "테스트 중…"; out.className = "inv-test-out";
      ghGetFile(f.token, f.cfg).then(function () { out.textContent = "✓ 연결 성공 — 파일 접근 가능"; out.className = "inv-test-out ok"; })
        .catch(function (e) { out.textContent = "✕ " + (e.message || e); out.className = "inv-test-out err"; });
    });
    m.querySelector("#iv-savecfg").addEventListener("click", function () {
      var f = readForm(); lsSet(K_TOKEN, f.token); jset(K_CFG, f.cfg);
      ov.remove(); toast("설정 저장됨"); updateBar(); if (afterSave) afterSave();
    });
  }

  // ── GitHub Contents API ──────────────────────────────
  function ghHeaders(t) { return { "Authorization": "Bearer " + t, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; }
  function ghContentsUrl(cfg, path) { return "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path; }
  function ghGetFile(token, cfg) {
    if (!token) return Promise.reject(new Error("토큰이 없습니다. 설정에서 입력하세요."));
    if (!cfg.owner || !cfg.repo) return Promise.reject(new Error("Owner/Repo 가 비어 있습니다."));
    return fetch(ghContentsUrl(cfg, cfg.path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: ghHeaders(token) }).then(function (r) {
      if (r.status === 401) throw new Error("인증 실패(401) — 토큰 확인.");
      if (r.status === 404) throw new Error("파일/저장소 없음(404) — Owner/Repo/경로 확인.");
      if (!r.ok) throw new Error("GitHub GET 실패: " + r.status);
      return r.json();
    });
  }
  function ghPutFile(token, cfg, path, base64Content, message, sha) {
    var body = { message: message, content: base64Content, branch: cfg.branch };
    if (sha) body.sha = sha;
    return fetch(ghContentsUrl(cfg, path), { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) }).then(function (r) {
      if (r.ok) return r.json();
      return r.text().then(function (t) { throw new Error("PUT " + path + " 실패 " + r.status + ": " + t.slice(0, 140)); });
    });
  }
  // 임의 경로 파일의 sha 조회(없으면 null). 기존 파일 덮어쓰기에 필요.
  function ghGetSha(token, cfg, path) {
    return fetch(ghContentsUrl(cfg, path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: ghHeaders(token) })
      .then(function (r) {
        if (r.status === 200) return r.json().then(function (j) { return j.sha || null; });
        return null; // 404 등 → 신규 파일
      }).catch(function () { return null; });
  }
  // 이미지 업로드: 같은 경로가 이미 있으면 sha 를 받아 덮어쓰기(422 'sha' 누락 방지)
  function ghPutImage(token, cfg, path, base64Content, message) {
    return ghGetSha(token, cfg, path).then(function (sha) {
      return ghPutFile(token, cfg, path, base64Content, message, sha).catch(function (e) {
        // 기존 파일인데 sha 없이 보내 422 가 나면, sha 재조회 후 1회 재시도(덮어쓰기)
        if (!/\b422\b/.test(String(e && e.message))) throw e;
        return ghGetSha(token, cfg, path).then(function (sha2) {
          if (!sha2) throw e;
          return ghPutFile(token, cfg, path, base64Content, message, sha2);
        });
      });
    });
  }

  // ── 커밋 & 푸시 ──────────────────────────────────────
  // Promise 반환 코어 — 성공 시 결과 메시지 resolve, 변경 없으면 "변경 없음"
  function pushPendingCore() {
    var ops = getPending();
    if (!ops.length) return Promise.resolve("변경 없음");
    var token = getToken(), cfg = getCfg();
    if (!token) return Promise.reject(new Error("GitHub 토큰 미설정"));

    // 업로드할 이미지 모으기
    var uploads = [];
    ops.forEach(function (op) {
      var cards = op.type === "add_company" ? (op.company.cards || []) : (op.card ? [op.card] : []);
      cards.forEach(function (k) { (k._uploads || []).forEach(function (u) { uploads.push(u); }); });
    });

    setBarBusy(true);
    var totalSteps = uploads.length + 1, step = 0;
    function prog(msg) { step++; setBarBusy(true, "푸시 " + step + "/" + totalSteps + "…"); }

    // 1) 이미지들 순차 업로드 → 2) companies.json 커밋
    return uploads.reduce(function (p, u) {
      return p.then(function () {
        prog();
        var content = u.dataURL.slice(u.dataURL.indexOf(",") + 1);
        return ghPutImage(token, cfg, u.path, content, "Add image: " + u.path);
      });
    }, Promise.resolve()).then(function () {
      return ghGetFile(token, cfg);
    }).then(function (j) {
      prog();
      var remote = JSON.parse(b64decUtf8(j.content));
      mergeOps(remote, ops, false);
      stripPending(remote);
      remote.last_updated = todayKST();
      return ghPutFile(token, cfg, cfg.path, b64encUtf8(JSON.stringify(remote, null, 1)),
        "Edit via web: " + ops.length + " change(s) " + todayKST(), j.sha);
    }).then(function () {
      // 푸시 성공: pending 을 비우되, Pages 반영 전까지 카드가 사라져 보이지 않도록 '최근푸시'로 이동
      var now = Date.now();
      var rec = getRecent();
      ops.forEach(function (op) { rec.push({ at: now, op: op }); });
      setRecent(rec);
      setPending([]);
      setBarBusy(false);
      return ops.length + "건 푸시 완료";
    }).catch(function (e) {
      setBarBusy(false); updateBar();
      throw e;
    });
  }

  function pushPending() {
    var ops = getPending();
    if (!ops.length) { toast("푸시할 변경이 없습니다."); return; }
    if (!getToken()) { toast("먼저 GitHub 토큰을 설정하세요.", "err"); openSettings(function () { pushPending(); }); return; }
    pushPendingCore().then(function (msg) {
      if (msg === "변경 없음") { toast("푸시할 변경이 없습니다."); return; }
      toast("✓ 푸시 완료! 사이트 반영까지 1~2분 걸릴 수 있어요 (카드는 계속 보입니다).");
      setTimeout(function () { location.reload(); }, 1600);
    }).catch(function (e) {
      toast(e.message || String(e), "err");
    });
  }

  // ── Stock Valuation 대시보드 통합 커밋 (iframe 내장 시) ──
  if (window.self !== window.top) {
    // 대시보드 탭 안에서는 자체 푸시 버튼 숨김 (통합 버튼으로 일원화)
    var _svStyle = document.createElement("style");
    _svStyle.textContent = ".inv-fab-btn.push{display:none!important}";
    document.head.appendChild(_svStyle);
    window.addEventListener("message", function (e) {
      if (e.origin !== "https://whysosary-dot.github.io" || !e.data || !e.data.type) return;
      if (e.data.type === "sv-ping") { e.source.postMessage({ type: "sv-pong", repo: "investment-notes" }, e.origin); return; }
      if (e.data.type !== "sv-commit") return;
      pushPendingCore().then(function (msg) {
        e.source.postMessage({ type: "sv-commit-result", repo: "investment-notes", ok: true, msg: msg }, e.origin);
        if (msg !== "변경 없음") setTimeout(function () { location.reload(); }, 1200);
      }).catch(function (err) {
        e.source.postMessage({ type: "sv-commit-result", repo: "investment-notes", ok: false, msg: err.message || String(err) }, e.origin);
      });
    });
  }

  // ── 하단 액션 바 ─────────────────────────────────────
  var bar, pushBtn;
  function buildBar() {
    bar = document.createElement("div");
    bar.className = "inv-fab";
    bar.innerHTML =
      '<button class="inv-fab-btn gear" id="iv-gear" title="GitHub 설정" aria-label="GitHub 설정">⚙</button>' +
      '<button class="inv-fab-btn push" id="iv-push" title="커밋 & 푸시">↑ 푸시 <span class="inv-badge" id="iv-badge" hidden>0</span></button>' +
      '<button class="inv-fab-btn add" id="iv-add" title="카드 추가">＋ 카드</button>';
    document.body.appendChild(bar);
    pushBtn = bar.querySelector("#iv-push");
    bar.querySelector("#iv-gear").addEventListener("click", function () { openSettings(); });
    pushBtn.addEventListener("click", pushPending);
    bar.querySelector("#iv-add").addEventListener("click", function () { openCardModal({ mode: "add", companyId: window.__INV_COMPANY_ID || null }); });
    updateBar();
  }
  function updateBar() {
    if (!bar) return;
    var badge = bar.querySelector("#iv-badge");
    if (!badge) return;
    var n = pendingCount();
    if (n > 0) { badge.hidden = false; badge.textContent = n; pushBtn.classList.add("has"); }
    else { badge.hidden = true; pushBtn.classList.remove("has"); }
  }
  function setBarBusy(busy, label) {
    if (!bar) return;
    pushBtn.disabled = busy;
    pushBtn.innerHTML = busy ? esc(label || "푸시 중…") : '↑ 푸시 <span class="inv-badge" id="iv-badge" hidden>0</span>';
    updateBar();
  }

  // ── 공개 API ─────────────────────────────────────────
  window.InvAdmin = {
    applyPending: function (data) { return applyForDisplay(data); },
    refreshBar: updateBar,
    openAddCard: function (id) { openCardModal({ mode: "add", companyId: id }); },
    editCard: function (companyId, cardId) {
      var card = resolveCanonicalCard(companyId, cardId);
      if (!card) { toast("카드를 찾을 수 없습니다.", "err"); return; }
      openCardModal({ mode: "edit", companyId: companyId, card: card });
    },
    deleteCard: deleteCard,
    editCompany: openCompanyEdit,
    deleteCompany: deleteCompany
  };

  function boot() { if (document.querySelector(".inv-fab")) return; buildBar(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
