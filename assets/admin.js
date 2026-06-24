// admin.js — 브라우저에서 카드/기업/차트 직접 추가 + GitHub Contents API 커밋&푸시
// 토큰은 이 기기 브라우저 localStorage 에만 저장하며 repo 에는 절대 커밋하지 않는다.
(function () {
  "use strict";

  // ── localStorage 키 ──────────────────────────────────
  var K_TOKEN   = "inv_gh_token";
  var K_CFG     = "inv_gh_cfg";
  var K_PENDING = "inv_pending_ops_v1";

  // ── 유틸 ─────────────────────────────────────────────
  function todayKST() {
    // 브라우저 로컬(보통 KST) 기준 오늘 날짜 YYYY-MM-DD
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function lsGet(k, dflt) {
    try { var v = localStorage.getItem(k); return v == null ? dflt : v; } catch (_) { return dflt; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function jget(k, dflt) {
    try { return JSON.parse(localStorage.getItem(k) || "null") || dflt; } catch (_) { return dflt; }
  }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

  function b64encUtf8(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decUtf8(str) { return decodeURIComponent(escape(atob(str.replace(/\s+/g, "")))); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ── 설정 (repo 좌표) ─────────────────────────────────
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
    return { owner: owner, repo: repo, branch: "main", path: "data/companies.json" };
  }
  function getCfg() {
    var d = detectRepo();
    var saved = jget(K_CFG, {});
    return {
      owner:  saved.owner  || d.owner  || "",
      repo:   saved.repo   || d.repo   || "",
      branch: saved.branch || d.branch || "main",
      path:   saved.path   || d.path   || "data/companies.json"
    };
  }
  function getToken() { return lsGet(K_TOKEN, "") || ""; }

  // ── pending 오버레이 ─────────────────────────────────
  function getPending() { return jget(K_PENDING, []); }
  function setPending(arr) { jset(K_PENDING, arr); }
  function pendingCount() { return getPending().length; }

  // data 객체에 pending ops 를 병합. flag=true 면 _pending 표식 부착(화면 표시용)
  function applyPending(data, ops, flag) {
    if (!data || !data.companies) return 0;
    ops = ops || getPending();
    if (flag === undefined) flag = true;
    var byId = {};
    data.companies.forEach(function (c) { byId[c.id] = c; });
    var applied = 0;
    ops.forEach(function (op) {
      if (op.type === "add_company") {
        var existing = byId[op.company.id];
        if (!existing) {
          var co = JSON.parse(JSON.stringify(op.company));
          if (flag) {
            co._pending = true;
            (co.cards || []).forEach(function (k) { k._pending = true; });
          }
          data.companies.push(co);
          byId[co.id] = co;
          applied++;
        } else {
          (op.company.cards || []).forEach(function (card) {
            if (!(existing.cards || []).some(function (k) { return k.id === card.id; })) {
              var cc = JSON.parse(JSON.stringify(card));
              if (flag) cc._pending = true;
              existing.cards = existing.cards || [];
              existing.cards.push(cc);
              applied++;
            }
          });
        }
      } else if (op.type === "add_card") {
        var c = byId[op.companyId];
        if (c) {
          if (!(c.cards || []).some(function (k) { return k.id === op.card.id; })) {
            var card2 = JSON.parse(JSON.stringify(op.card));
            if (flag) card2._pending = true;
            c.cards = c.cards || [];
            c.cards.push(card2);
            applied++;
          }
        }
      }
    });
    return applied;
  }

  function stripPending(data) {
    (data.companies || []).forEach(function (c) {
      delete c._pending;
      (c.cards || []).forEach(function (k) { delete k._pending; });
    });
  }

  // 현재 화면 데이터(병합본). 페이지 스크립트가 window.__INV_DATA 로 노출
  function currentData() {
    if (window.__INV_DATA) return window.__INV_DATA;
    return { companies: [] };
  }
  function nextCardId(company) {
    var max = 0;
    (company.cards || []).forEach(function (k) {
      var m = /card-(\d+)/.exec(k.id || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "card-" + String(max + 1).padStart(3, "0");
  }

  // ── 토스트 ───────────────────────────────────────────
  function toast(msg, kind) {
    var t = document.createElement("div");
    t.className = "inv-toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, kind === "err" ? 4200 : 2600);
  }

  // ── 모달 헬퍼 ────────────────────────────────────────
  function openModal(node) {
    var ov = document.createElement("div");
    ov.className = "inv-modal-overlay";
    ov.appendChild(node);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    return ov;
  }

  // ── 카드 추가 모달 ───────────────────────────────────
  function openAddCard(presetCompanyId) {
    var data = currentData();
    var companies = (data.companies || []).slice().sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), "ko");
    });

    var opts = ['<option value="">+ 신규 기업/산업 만들기…</option>'];
    companies.forEach(function (c) {
      var label = c.name + (c.ticker ? " (" + c.ticker + ")" : "") + (c.type === "industry" ? " · 산업" : "");
      opts.push('<option value="' + esc(c.id) + '"' +
        (c.id === presetCompanyId ? " selected" : "") + ">" + esc(label) + "</option>");
    });

    var m = document.createElement("div");
    m.className = "inv-modal";
    m.innerHTML =
      '<div class="inv-modal-hd"><h2>카드 추가</h2><button class="inv-x" data-x>✕</button></div>' +
      '<div class="inv-modal-bd">' +
        '<label class="inv-f"><span>기업 / 산업</span>' +
          '<select id="iv-co">' + opts.join("") + '</select></label>' +

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
        '</div>' +

        '<label class="inv-f"><span>제목 *</span><input id="iv-title" placeholder="카드 한 줄 요약" /></label>' +
        '<div class="inv-row">' +
          '<label class="inv-f"><span>자료 날짜</span><input id="iv-date" type="date" /></label>' +
        '</div>' +
        '<label class="inv-f"><span>요약 (한 줄당 1불릿)</span><textarea id="iv-summary" rows="4" placeholder="핵심 포인트 1&#10;핵심 포인트 2"></textarea></label>' +
        '<label class="inv-f"><span>태그 (쉼표로 구분)</span><input id="iv-tags" placeholder="실적, 1Q26, 매수" /></label>' +

        '<div class="inv-chart-tog"><label><input type="checkbox" id="iv-chart-on" /> 차트 추가</label></div>' +
        '<div id="iv-chart" class="inv-chart" hidden>' +
          '<div class="inv-row">' +
            '<label class="inv-f inv-narrow"><span>유형</span><select id="iv-ch-type">' +
              '<option value="bar">세로막대</option><option value="bar-h">가로막대</option>' +
              '<option value="donut">도넛</option><option value="line">라인</option></select></label>' +
            '<label class="inv-f"><span>차트 제목</span><input id="iv-ch-title" placeholder="예: 영업이익" /></label>' +
            '<label class="inv-f inv-narrow"><span>단위</span><input id="iv-ch-unit" placeholder="억원" /></label>' +
          '</div>' +
          '<label class="inv-f"><span>라벨 (쉼표)</span><input id="iv-ch-labels" placeholder="25.1Q, 25.2Q, 25.3Q, 25.4Q, 26.1Q" /></label>' +
          '<label class="inv-f"><span>값 (쉼표, 숫자)</span><input id="iv-ch-data" placeholder="100, 120, 140, 90, 160" /></label>' +
          '<div class="inv-row" id="iv-ch-barextra">' +
            '<label class="inv-f"><span>컨센서스(선택)</span><input id="iv-ch-cons" placeholder="비우면 없음" /></label>' +
            '<label class="inv-f"><span>최신값 강조</span><select id="iv-ch-surp">' +
              '<option value="">기본(보라)</option><option value="true">서프라이즈(초록)</option>' +
              '<option value="false">쇼크(주황)</option></select></label>' +
            '<label class="inv-f"><span>서프라이즈 %</span><input id="iv-ch-spct" placeholder="선택" /></label>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="inv-modal-ft">' +
        '<span class="inv-hint">로컬에 저장됩니다. 다른 기기 반영은 “커밋 & 푸시”.</span>' +
        '<button class="inv-btn primary" id="iv-save">로컬에 추가</button>' +
      '</div>';

    var ov = openModal(m);
    var coSel = m.querySelector("#iv-co");
    var newco = m.querySelector("#iv-newco");
    var chOn  = m.querySelector("#iv-chart-on");
    var chBox = m.querySelector("#iv-chart");
    var chType = m.querySelector("#iv-ch-type");
    var barExtra = m.querySelector("#iv-ch-barextra");
    m.querySelector("#iv-date").value = todayKST();

    function syncNewco() { newco.hidden = !!coSel.value; }
    function syncChart() { chBox.hidden = !chOn.checked; }
    function syncBarExtra() { barExtra.style.display = (chType.value === "bar") ? "" : "none"; }
    coSel.addEventListener("change", syncNewco);
    chOn.addEventListener("change", syncChart);
    chType.addEventListener("change", syncBarExtra);
    syncNewco(); syncChart(); syncBarExtra();

    m.querySelector("[data-x]").addEventListener("click", function () { ov.remove(); });

    m.querySelector("#iv-save").addEventListener("click", function () {
      try {
        var card = buildCardFromForm(m);
        var ops = getPending();

        if (coSel.value) {
          var company = (currentData().companies || []).find(function (c) { return c.id === coSel.value; });
          card.id = nextCardIdConsidering(company, ops, coSel.value);
          ops.push({ id: Date.now() + "" + Math.random(), type: "add_card", companyId: coSel.value, card: card });
        } else {
          var nc = buildCompanyFromForm(m);
          card.id = "card-001";
          nc.cards = [card];
          ops.push({ id: Date.now() + "" + Math.random(), type: "add_company", company: nc });
        }
        setPending(ops);
        ov.remove();
        toast("로컬에 추가됨 — 미푸시 " + pendingCount() + "건");
        setTimeout(function () { location.reload(); }, 650);
      } catch (e) {
        toast(e.message || String(e), "err");
      }
    });
  }

  // 같은 기업에 대해 이미 쌓인 pending add_card 까지 고려해 다음 카드 id 산출
  function nextCardIdConsidering(company, ops, companyId) {
    var temp = JSON.parse(JSON.stringify(company || { cards: [] }));
    ops.forEach(function (op) {
      if (op.type === "add_card" && op.companyId === companyId) temp.cards.push(op.card);
    });
    return nextCardId(temp);
  }

  function buildCardFromForm(m) {
    var title = m.querySelector("#iv-title").value.trim();
    if (!title) throw new Error("제목을 입력하세요.");
    var date = m.querySelector("#iv-date").value || todayKST();
    var summary = m.querySelector("#iv-summary").value
      .split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var tags = m.querySelector("#iv-tags").value
      .split(",").map(function (s) { return s.trim(); }).filter(Boolean);

    var card = {
      id: "card-001",
      title: title,
      date: date,
      added_at: todayKST(),
      source_image: "",
      summary: summary,
      tags: tags
    };

    if (m.querySelector("#iv-chart-on").checked) {
      card.chart = buildChartFromForm(m);
    }
    return card;
  }

  function buildChartFromForm(m) {
    var type = m.querySelector("#iv-ch-type").value;
    var labels = m.querySelector("#iv-ch-labels").value
      .split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var data = m.querySelector("#iv-ch-data").value
      .split(",").map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (s) {
        var n = Number(s.replace(/,/g, ""));
        if (isNaN(n)) throw new Error("차트 값에 숫자가 아닌 항목이 있습니다: " + s);
        return n;
      });
    if (!labels.length || !data.length) throw new Error("차트 라벨과 값을 입력하세요.");
    if (labels.length !== data.length) throw new Error("라벨(" + labels.length + ")과 값(" + data.length + ") 개수가 다릅니다.");

    var ch = { type: type, title: m.querySelector("#iv-ch-title").value.trim() || "차트", labels: labels, data: data };
    var unit = m.querySelector("#iv-ch-unit").value.trim();
    if (unit) ch.unit = unit;

    if (type === "bar") {
      var cons = m.querySelector("#iv-ch-cons").value.trim();
      if (cons !== "") { var cn = Number(cons.replace(/,/g, "")); if (!isNaN(cn)) ch.consensus = cn; }
      var surp = m.querySelector("#iv-ch-surp").value;
      if (surp === "true") ch.surprise = true;
      else if (surp === "false") ch.surprise = false;
      var spct = m.querySelector("#iv-ch-spct").value.trim();
      if (spct !== "") { var sp = Number(spct.replace(/,/g, "")); if (!isNaN(sp)) ch.surprise_pct = sp; }
    }
    return ch;
  }

  function buildCompanyFromForm(m) {
    var name = m.querySelector("#iv-name").value.trim();
    var id = m.querySelector("#iv-id").value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) throw new Error("신규 기업/산업명을 입력하세요.");
    if (!id) throw new Error("영문 ID(slug)를 입력하세요.");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("ID는 영문 소문자·숫자·하이픈만 사용하세요.");
    if ((currentData().companies || []).some(function (c) { return c.id === id; }))
      throw new Error("이미 존재하는 ID 입니다: " + id);

    var ticker = m.querySelector("#iv-ticker").value.trim();
    var sector = m.querySelector("#iv-sector").value.trim();
    var type = m.querySelector("#iv-type").value;
    var co = {
      id: id, name: name, ticker: ticker, sector: sector,
      tags: [], created_at: todayKST(), last_updated: todayKST(), cards: []
    };
    if (type === "industry") co.type = "industry";
    else co.type = "company";
    return co;
  }

  // ── 설정(토큰) 모달 ──────────────────────────────────
  function openSettings(afterSave) {
    var cfg = getCfg();
    var tok = getToken();
    var m = document.createElement("div");
    m.className = "inv-modal";
    m.innerHTML =
      '<div class="inv-modal-hd"><h2>GitHub 연결 설정</h2><button class="inv-x" data-x>✕</button></div>' +
      '<div class="inv-modal-bd">' +
        '<p class="inv-note">토큰은 이 기기 브라우저에만 저장되며 repo 에 절대 커밋되지 않습니다. ' +
        'Fine-grained PAT 에 이 저장소의 <b>Contents: Read and write</b> 권한을 주세요.</p>' +
        '<label class="inv-f"><span>GitHub 토큰 (PAT)</span><input id="iv-tok" type="password" placeholder="github_pat_… 또는 ghp_…" value="' + esc(tok) + '" /></label>' +
        '<div class="inv-row">' +
          '<label class="inv-f"><span>Owner</span><input id="iv-owner" value="' + esc(cfg.owner) + '" placeholder="whysosary-dot" /></label>' +
          '<label class="inv-f"><span>Repo</span><input id="iv-repo" value="' + esc(cfg.repo) + '" placeholder="investment-notes" /></label>' +
        '</div>' +
        '<div class="inv-row">' +
          '<label class="inv-f inv-narrow"><span>Branch</span><input id="iv-branch" value="' + esc(cfg.branch) + '" /></label>' +
          '<label class="inv-f"><span>파일 경로</span><input id="iv-path" value="' + esc(cfg.path) + '" /></label>' +
        '</div>' +
        '<div id="iv-test-out" class="inv-test-out"></div>' +
      '</div>' +
      '<div class="inv-modal-ft">' +
        '<button class="inv-btn" id="iv-test">연결 테스트</button>' +
        '<button class="inv-btn primary" id="iv-savecfg">저장</button>' +
      '</div>';

    var ov = openModal(m);
    m.querySelector("[data-x]").addEventListener("click", function () { ov.remove(); });

    function readForm() {
      return {
        token: m.querySelector("#iv-tok").value.trim(),
        cfg: {
          owner: m.querySelector("#iv-owner").value.trim(),
          repo: m.querySelector("#iv-repo").value.trim(),
          branch: m.querySelector("#iv-branch").value.trim() || "main",
          path: m.querySelector("#iv-path").value.trim() || "data/companies.json"
        }
      };
    }
    function saveForm() {
      var f = readForm();
      lsSet(K_TOKEN, f.token);
      jset(K_CFG, f.cfg);
      return f;
    }

    m.querySelector("#iv-test").addEventListener("click", function () {
      var f = readForm();
      var out = m.querySelector("#iv-test-out");
      out.textContent = "테스트 중…"; out.className = "inv-test-out";
      ghGetFile(f.token, f.cfg).then(function () {
        out.textContent = "✓ 연결 성공 — 파일 접근 가능";
        out.className = "inv-test-out ok";
      }).catch(function (e) {
        out.textContent = "✕ " + (e.message || e);
        out.className = "inv-test-out err";
      });
    });

    m.querySelector("#iv-savecfg").addEventListener("click", function () {
      saveForm();
      ov.remove();
      toast("설정 저장됨");
      updateBar();
      if (afterSave) afterSave();
    });
  }

  // ── GitHub Contents API ──────────────────────────────
  function ghHeaders(token) {
    return {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  function ghApiBase(cfg) {
    return "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + cfg.path;
  }
  function ghGetFile(token, cfg) {
    if (!token) return Promise.reject(new Error("토큰이 없습니다. 설정에서 입력하세요."));
    if (!cfg.owner || !cfg.repo) return Promise.reject(new Error("Owner/Repo 가 비어 있습니다."));
    var url = ghApiBase(cfg) + "?ref=" + encodeURIComponent(cfg.branch);
    return fetch(url, { headers: ghHeaders(token) }).then(function (r) {
      if (r.status === 401) throw new Error("인증 실패(401) — 토큰을 확인하세요.");
      if (r.status === 404) throw new Error("파일/저장소를 찾을 수 없음(404) — Owner/Repo/경로 확인.");
      if (!r.ok) throw new Error("GitHub GET 실패: " + r.status);
      return r.json();
    });
  }

  function pushPending() {
    var ops = getPending();
    if (!ops.length) { toast("푸시할 변경이 없습니다."); return; }
    var token = getToken();
    var cfg = getCfg();
    if (!token) { toast("먼저 GitHub 토큰을 설정하세요.", "err"); openSettings(function () { pushPending(); }); return; }

    setBarBusy(true);
    ghGetFile(token, cfg).then(function (j) {
      var remote = JSON.parse(b64decUtf8(j.content));
      applyPending(remote, ops, false);   // 표식 없이 병합
      stripPending(remote);
      remote.last_updated = todayKST();
      var body = {
        message: "Add via web: " + ops.length + " change(s) " + todayKST(),
        content: b64encUtf8(JSON.stringify(remote, null, 1)),
        sha: j.sha,
        branch: cfg.branch
      };
      return fetch(ghApiBase(cfg), {
        method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body)
      });
    }).then(function (r) {
      if (!r) return;
      if (r.status === 409) throw new Error("충돌(409) — 다른 변경과 겹침. 새로고침 후 다시 시도.");
      if (r.status === 401) throw new Error("인증 실패(401) — 토큰 권한(Contents write) 확인.");
      if (!r.ok) return r.text().then(function (t) { throw new Error("푸시 실패 " + r.status + ": " + t.slice(0, 160)); });
      setPending([]);
      setBarBusy(false);
      toast("✓ 푸시 완료! GitHub Pages 재배포 후 다른 기기에도 반영됩니다.");
      setTimeout(function () { location.reload(); }, 1600);
    }).catch(function (e) {
      setBarBusy(false);
      updateBar();
      toast(e.message || String(e), "err");
    });
  }

  // ── 하단 액션 바 ─────────────────────────────────────
  var bar, pushBtn, addBtn;
  function buildBar() {
    bar = document.createElement("div");
    bar.className = "inv-fab";
    bar.innerHTML =
      '<button class="inv-fab-btn gear" id="iv-gear" title="GitHub 설정" aria-label="GitHub 설정">⚙</button>' +
      '<button class="inv-fab-btn push" id="iv-push" title="커밋 & 푸시">' +
        '↑ 푸시 <span class="inv-badge" id="iv-badge" hidden>0</span></button>' +
      '<button class="inv-fab-btn add" id="iv-add" title="카드 추가">＋ 카드</button>';
    document.body.appendChild(bar);
    pushBtn = bar.querySelector("#iv-push");
    addBtn = bar.querySelector("#iv-add");
    bar.querySelector("#iv-gear").addEventListener("click", function () { openSettings(); });
    pushBtn.addEventListener("click", pushPending);
    addBtn.addEventListener("click", function () {
      openAddCard(window.__INV_COMPANY_ID || null);
    });
    updateBar();
  }
  function updateBar() {
    if (!bar) return;
    var badge = bar.querySelector("#iv-badge");
    if (!badge) return; // 푸시 중(badge 일시 제거 상태)에는 건너뜀
    var n = pendingCount();
    if (n > 0) { badge.hidden = false; badge.textContent = n; pushBtn.classList.add("has"); }
    else { badge.hidden = true; pushBtn.classList.remove("has"); }
  }
  function setBarBusy(busy) {
    if (!bar) return;
    pushBtn.disabled = busy;
    pushBtn.innerHTML = busy
      ? "푸시 중…"
      : '↑ 푸시 <span class="inv-badge" id="iv-badge" hidden>0</span>';
    updateBar();
  }

  // ── 공개 API ─────────────────────────────────────────
  window.InvAdmin = {
    applyPending: function (data) { return applyPending(data, getPending(), true); },
    refreshBar: updateBar,
    openAddCard: openAddCard
  };

  // ── 부트스트랩 ───────────────────────────────────────
  function boot() {
    if (document.querySelector(".inv-fab")) return; // 중복 실행 방지
    buildBar();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
