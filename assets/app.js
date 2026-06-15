// index.html — 기업/산업 탭 렌더링
(async function () {
  const grid      = document.getElementById("grid");
  const empty     = document.getElementById("empty");
  const counter   = document.getElementById("counter");
  const updatedEl = document.getElementById("updated");
  const q         = document.getElementById("q");
  const repolink  = document.getElementById("repolink");

  let data;
  try {
    const res = await fetch("data/companies.json?ts=" + Date.now());
    data = await res.json();
  } catch (e) {
    grid.innerHTML = '<p style="color:#c33">데이터를 불러올 수 없습니다 (' + e + ')</p>';
    return;
  }

  const allEntries  = data.companies || [];
  const companyList = allEntries.filter(c => !c.type || c.type === "company");
  const industryList = allEntries.filter(c => c.type === "industry");

  // ── 즐겨찾기 모듈 ───────────────────────────────────
  const FAV_KEY   = "inv_favorites";       // 현재 작업 집합
  const FAV_BASE  = "inv_favorites_base";  // 마지막 동기화 스냅샷
  const TOKEN_KEY = "inv_gh_token";        // GitHub PAT (이 브라우저에만)

  const favToolbar    = document.getElementById("fav-toolbar");
  const favPushBtn    = document.getElementById("fav-push");
  const favStatus     = document.getElementById("fav-status");
  const favTokenTog   = document.getElementById("fav-token-toggle");
  const favTokenRow   = document.getElementById("fav-token-row");
  const favTokenInput = document.getElementById("fav-token-input");
  const favTokenSave  = document.getElementById("fav-token-save");
  const favTokenClear = document.getElementById("fav-token-clear");
  const favTabBtn     = document.querySelector('.tab-btn[data-tab="favorites"]');

  let favSet  = new Set();
  let favBase = new Set();

  function readSet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : null;
    } catch (_) { return null; }
  }
  function writeSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set].sort())); } catch (_) {}
  }
  function setEq(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  function persistFav() { writeSet(FAV_KEY, favSet); writeSet(FAV_BASE, favBase); }
  function favDirty() { return !setEq(favSet, favBase); }

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; } }

  function ghRepo() {
    try {
      const host = location.host;
      const parts = location.pathname.split("/").filter(Boolean);
      if (host.endsWith("github.io") && parts.length > 0) {
        return { owner: host.split(".")[0], repo: parts[0] };
      }
    } catch (_) {}
    return { owner: "whysosary-dot", repo: "investment-notes" }; // 로컬/폴백
  }

  function b64utf8(str) { return btoa(unescape(encodeURIComponent(str))); }

  async function loadFavorites() {
    let remote = [];
    try {
      const r = await fetch("data/favorites.json?ts=" + Date.now());
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.favorites)) remote = j.favorites; }
    } catch (_) {}
    const R = new Set(remote);
    let W = readSet(FAV_KEY);
    let B = readSet(FAV_BASE);
    if (!W) {                       // 이 기기 첫 방문 → 원격 채택
      W = new Set(R); B = new Set(R);
    } else if (B && setEq(W, B)) {  // 로컬 미푸시 변경 없음 → 원격 업데이트 채택
      W = new Set(R); B = new Set(R);
    } else {                        // 로컬 변경 보존 + 원격 변경 병합
      B = B || new Set();
      for (const id of R) if (!B.has(id)) W.add(id);   // 원격 추가분 반영
      for (const id of B) if (!R.has(id)) W.delete(id); // 원격 삭제분 반영
      B = new Set(R);
    }
    favSet = W; favBase = B;
    persistFav();
  }

  function setFavStatus(msg, cls) {
    favStatus.textContent = msg || "";
    favStatus.className = "fav-status" + (cls ? " " + cls : "");
  }

  function updateFavUI() {
    document.querySelectorAll(".fav-star").forEach(btn => {
      const on = favSet.has(btn.dataset.id);
      btn.classList.toggle("is-fav", on);
      btn.textContent = on ? "★" : "☆";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.title = on ? "즐겨찾기 해제" : "즐겨찾기 추가";
    });
    const dirty = favDirty();
    favPushBtn.disabled = !dirty;
    if (favTabBtn) favTabBtn.classList.toggle("dirty", dirty);
    if (activeTab === "favorites" && !favStatus.classList.contains("ok")
        && !favStatus.classList.contains("err")) {
      if (dirty) {
        const n = symDiffCount(favSet, favBase);
        setFavStatus("변경사항 " + n + "건 — 커밋 & 푸시 필요", "dirty");
      } else {
        setFavStatus("동기화됨", "");
      }
    }
  }

  function symDiffCount(a, b) {
    let n = 0;
    for (const v of a) if (!b.has(v)) n++;
    for (const v of b) if (!a.has(v)) n++;
    return n;
  }

  function toggleFav(id) {
    if (favSet.has(id)) favSet.delete(id); else favSet.add(id);
    persistFav();
    favStatus.className = "fav-status"; // 상태 메시지 초기화(다음 updateFavUI가 갱신)
    if (activeTab === "favorites") { companies = computeCompanies(); filter(); }
    updateFavUI();
  }

  function starHTML(id) {
    const on = favSet.has(id);
    return '<button class="fav-star' + (on ? " is-fav" : "") + '" data-id="' +
      escapeHtml(id) + '" type="button" aria-pressed="' + (on ? "true" : "false") +
      '" title="' + (on ? "즐겨찾기 해제" : "즐겨찾기 추가") + '">' +
      (on ? "★" : "☆") + "</button>";
  }

  async function commitPush() {
    const token = getToken();
    if (!token) {
      favTokenRow.hidden = false;
      setFavStatus("먼저 GitHub 토큰을 저장하세요", "err");
      favTokenInput.focus();
      return;
    }
    const { owner, repo } = ghRepo();
    const path = "data/favorites.json";
    const apiBase = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path;
    const headers = {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    setFavStatus("푸시 중…", "");
    favPushBtn.disabled = true;
    try {
      let sha = null;
      const getRes = await fetch(apiBase + "?ref=main", { headers });
      if (getRes.ok) { sha = (await getRes.json()).sha; }
      else if (getRes.status !== 404) {
        throw new Error("조회 실패 " + getRes.status + (getRes.status === 401 ? " (토큰 무효)" : ""));
      }
      const payload = {
        favorites: [...favSet].sort(),
        updated_at: new Date().toISOString()
      };
      const body = {
        message: "Update favorites (" + payload.favorites.length + "건)",
        content: b64utf8(JSON.stringify(payload, null, 2) + "\n"),
        branch: "main"
      };
      if (sha) body.sha = sha;
      const putRes = await fetch(apiBase, { method: "PUT", headers, body: JSON.stringify(body) });
      if (!putRes.ok) {
        let detail = putRes.status;
        try { const e = await putRes.json(); if (e.message) detail += " — " + e.message; } catch (_) {}
        if (putRes.status === 401) detail += " (토큰이 유효하지 않습니다)";
        if (putRes.status === 403 || putRes.status === 404) detail += " (repo 쓰기 권한 확인)";
        throw new Error(String(detail));
      }
      favBase = new Set(favSet);
      persistFav();
      setFavStatus("푸시 완료 ✓ 다른 기기에서도 반영됩니다", "ok");
      if (favTabBtn) favTabBtn.classList.remove("dirty");
    } catch (err) {
      setFavStatus("오류: " + (err && err.message ? err.message : err), "err");
    } finally {
      favPushBtn.disabled = !favDirty();
    }
  }

  // 토큰 UI 이벤트
  favTokenTog.addEventListener("click", () => {
    favTokenRow.hidden = !favTokenRow.hidden;
    if (!favTokenRow.hidden) { favTokenInput.value = ""; favTokenInput.placeholder = getToken() ? "저장된 토큰 있음 — 변경하려면 새로 입력" : "GitHub PAT (Contents: Read and write)"; }
  });
  favTokenSave.addEventListener("click", () => {
    const v = favTokenInput.value.trim();
    if (!v) { setFavStatus("토큰을 입력하세요", "err"); return; }
    try { localStorage.setItem(TOKEN_KEY, v); } catch (_) {}
    favTokenInput.value = "";
    favTokenRow.hidden = true;
    setFavStatus("토큰 저장됨 — 이제 커밋 & 푸시 가능", "ok");
  });
  favTokenClear.addEventListener("click", () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    favTokenInput.value = "";
    setFavStatus("토큰 삭제됨 (이 브라우저)", "");
  });
  favPushBtn.addEventListener("click", commitPush);

  if (updatedEl && data.last_updated) {
    updatedEl.textContent = "마지막 업데이트: " + data.last_updated;
  }
  try {
    const host = location.host;
    const path = location.pathname.split("/").filter(Boolean);
    if (host.endsWith("github.io") && path.length > 0 && repolink) {
      const user = host.split(".")[0];
      const repo = path[0];
      repolink.href = "https://github.com/" + user + "/" + repo;
    } else if (repolink) {
      repolink.removeAttribute("href");
    }
  } catch (_) {}

  // ── sessionStorage 상태 저장/복원 ───────────────────
  const KEY_TAB = "inv_tab";
  const KEY_CO  = "inv_state_co";
  const KEY_IND = "inv_state_ind";
  const KEY_FAV = "inv_state_fav";

  function tabStateKey(tab) {
    return tab === "industry" ? KEY_IND : tab === "favorites" ? KEY_FAV : KEY_CO;
  }

  function isBackForward() {
    try {
      const nav = performance.getEntriesByType("navigation");
      if (nav.length) return nav[0].type === "back_forward";
    } catch (_) {}
    try { return performance.navigation.type === 2; } catch (_) {}
    return false;
  }

  const isBF = isBackForward();

  function loadTabState(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (_) { return null; }
  }

  function saveTabState() {
    const key = tabStateKey(activeTab);
    try {
      sessionStorage.setItem(key, JSON.stringify({
        sort: sortMode, sector: sectorFilter,
        q: q.value || "", scrollY: window.scrollY
      }));
    } catch (_) {}
  }

  // ── 탭 초기값 ──────────────────────────────────────
  let activeTab = (isBF && sessionStorage.getItem(KEY_TAB)) || "company";

  const savedNow = isBF ? loadTabState(tabStateKey(activeTab)) : null;

  let sortMode     = (savedNow && savedNow.sort)   || "recent";
  let sectorFilter = (savedNow && savedNow.sector) || "";
  if (savedNow && savedNow.q) q.value = savedNow.q;

  let companies = activeTab === "industry" ? industryList : companyList;

  // ── 유틸 ─────────────────────────────────────────────
  function isRecentlyUpdated(c) {
    // added_at(카드 추가 시점) 기준으로 초록불 표시 — date(원본 자료 날짜)와 분리
    // UTC/KST 시차(+9h) 보정: 배시 샌드박스는 UTC 기준 날짜를 찍으므로
    // 브라우저(KST) 기준 2일 전까지를 커트오프로 잡아 다음 태스크 실행 전까지 유지
    var d = new Date();
    d.setDate(d.getDate() - 2);
    var cutoff = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
    var dates = (c.cards || []).map(function(k) { return k.added_at || k.date; }).filter(Boolean);
    var maxDate = dates.length ? dates.slice().sort().pop() : null;
    return !!(maxDate && maxDate >= cutoff);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[ch]));
  }

  function latestDate(c) {
    const dates = (c.cards || []).map(k => k.added_at || k.date).filter(Boolean);
    if (c.created_at) dates.push(c.created_at);
    return dates.length ? dates.slice().sort().pop() : "0000-00-00";
  }

  // ── 렌더 ─────────────────────────────────────────────
  function render(list) {
    grid.innerHTML = "";
    if (!list.length) {
      empty.hidden = false; applyEmptyMsg();
      counter.textContent = "0 / " + companies.length;
      return;
    }
    empty.hidden = true;
    for (const c of list) {
      const a = document.createElement("a");
      a.className = "company";
      a.href = "company.html?id=" + encodeURIComponent(c.id);
      const cardCount = (c.cards || []).length;
      const dot = isRecentlyUpdated(c) ? '<span class="updated-dot" title="최근 1일 내 업데이트"></span>' : '';
      a.innerHTML =
        '<h2 class="name">' + dot + escapeHtml(c.name) + '</h2>' +
        '<p class="meta">' +
          [c.ticker, c.sector].filter(Boolean).map(escapeHtml).join(" · ") +
        '</p>' +
        '<span class="count">' + cardCount + ' 카드</span>';
      grid.appendChild(a);
    }
    counter.textContent = list.length + " / " + companies.length;
  }

  function sorted(list) {
    if (sortMode === "recent") {
      return list.slice().sort((a, b) => latestDate(b).localeCompare(latestDate(a)));
    }
    if (sortMode === "sector") {
      return list.slice().sort((a, b) => {
        const sa = a.sector || "";
        const sb = b.sector || "";
        return sa.localeCompare(sb, "ko") || a.name.localeCompare(b.name, "ko");
      });
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, "ko", { sensitivity: "base" }));
  }

  function renderWithSectors(list) {
    if (sortMode !== "sector" || sectorFilter) { render(sorted(list)); return; }
    grid.innerHTML = "";
    if (!list.length) { empty.hidden = false; counter.textContent = "0 / " + companies.length; return; }
    empty.hidden = true;
    let prevSector = null;
    for (const c of sorted(list)) {
      const sec = c.sector || "기타";
      if (sec !== prevSector) {
        const color = sectorColorMap[sec] || "var(--accent)";
        const div = document.createElement("div");
        div.className = "sector-divider";
        div.textContent = sec;
        div.style.color = color;
        div.style.setProperty("--divider-line", color);
        grid.appendChild(div);
        prevSector = sec;
      }
      const a = document.createElement("a");
      a.className = "company";
      a.href = "company.html?id=" + encodeURIComponent(c.id);
      const dot = isRecentlyUpdated(c) ? '<span class="updated-dot" title="최근 1일 내 업데이트"></span>' : '';
      a.innerHTML =
        '<h2 class="name">' + dot + escapeHtml(c.name) + '</h2>' +
        '<p class="meta">' + [c.ticker, c.sector].filter(Boolean).map(escapeHtml).join(" · ") + '</p>' +
        '<span class="count">' + (c.cards || []).length + ' 카드</span>';
      grid.appendChild(a);
    }
    counter.textContent = list.length + " / " + companies.length;
  }

  function filter() {
    const t = (q.value || "").trim().toLowerCase();
    let base = t ? companies.filter(c => {
      const hay = [
        c.name, c.ticker, c.sector,
        ...(c.tags || []),
        ...(c.cards || []).flatMap(k => [k.title, ...(k.tags || []), ...(k.summary || [])])
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    }) : companies;
    if (sectorFilter) base = base.filter(c => (c.sector || "") === sectorFilter);
    renderWithSectors(base);
    saveTabState();
  }

  // ── 정렬 버튼 ────────────────────────────────────────
  const btnDefault  = document.getElementById("sort-default");
  const btnRecent   = document.getElementById("sort-recent");
  const btnSector   = document.getElementById("sort-sector");
  const allSortBtns = [btnDefault, btnRecent, btnSector];
  const sortBtnMap  = { default: btnDefault, recent: btnRecent, sector: btnSector };

  function setSort(mode, btn) {
    sortMode = mode;
    allSortBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filter();
  }
  btnDefault.addEventListener("click", () => setSort("default", btnDefault));
  btnRecent.addEventListener("click",  () => setSort("recent",  btnRecent));
  btnSector.addEventListener("click",  () => setSort("sector",  btnSector));

  // ── 섹터 칩 ──────────────────────────────────────────
  const CHIP_COLORS = [
    "#378ADD", "#0F6E56", "#534AB7", "#D85A30",
    "#B5860D", "#1A7F64", "#8B3A8B", "#1E6FA3",
    "#C0392B", "#2471A3", "#76448A", "#17A589",
    "#CA6F1E", "#1E8449", "#6E2FBF", "#B03A2E",
    "#0E6655", "#2E4057"
  ];

  const sectorBar    = document.getElementById("sector-bar");
  const sectorWrap   = document.getElementById("sector-wrap");
  const sectorToggle = document.getElementById("sector-toggle");
  let sectors = [];
  let sectorColorMap = {};

  // ── 섹터 칩 접기/펼치기 ──────────────────────────────
  const KEY_CHIPS = "inv_chips_open";
  let chipsOpen = false;
  try { chipsOpen = localStorage.getItem(KEY_CHIPS) === "1"; } catch (_) {}

  function updateChipsUI() {
    sectorWrap.classList.toggle("empty", sectorBar.childElementCount === 0);
    // 접힌 상태 기준으로 넘침 여부 측정
    sectorBar.classList.add("collapsed");
    const needsToggle = sectorBar.scrollHeight > sectorBar.clientHeight + 1;
    sectorBar.classList.toggle("collapsed", !chipsOpen);
    sectorToggle.hidden = !needsToggle;
    sectorToggle.textContent = chipsOpen ? "접기 ▴" : "펼치기 ▾";
    sectorToggle.setAttribute("aria-expanded", chipsOpen ? "true" : "false");
  }

  sectorToggle.addEventListener("click", () => {
    chipsOpen = !chipsOpen;
    try { localStorage.setItem(KEY_CHIPS, chipsOpen ? "1" : "0"); } catch (_) {}
    updateChipsUI();
  });

  let _chipResizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(_chipResizeTimer);
    _chipResizeTimer = setTimeout(updateChipsUI, 120);
  });

  function buildSectors() {
    sectors = [...new Set(companies.map(c => c.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    sectorColorMap = {};
    sectors.forEach((sec, i) => { sectorColorMap[sec] = CHIP_COLORS[i % CHIP_COLORS.length]; });
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return r + "," + g + "," + b;
  }

  function applyChipColor(btn, color) {
    const rgb = hexToRgb(color);
    btn.style.setProperty("--chip-color", color);
    btn.style.setProperty("--chip-bg", "rgba(" + rgb + ",.13)");
    btn.style.setProperty("--chip-border", "rgba(" + rgb + ",.4)");
  }

  function buildSectorChips() {
    sectorBar.innerHTML = "";
    const all = document.createElement("button");
    all.className = "sector-chip" + (sectorFilter ? "" : " active");
    all.textContent = "전체";
    all.addEventListener("click", () => {
      sectorFilter = "";
      sectorBar.querySelectorAll(".sector-chip").forEach(ch => ch.classList.remove("active"));
      all.classList.add("active");
      filter();
    });
    sectorBar.appendChild(all);

    sectors.forEach(sec => {
      const btn = document.createElement("button");
      btn.className = "sector-chip" + (sec === sectorFilter ? " active" : "");
      btn.textContent = sec;
      applyChipColor(btn, sectorColorMap[sec]);
      btn.addEventListener("click", () => {
        sectorFilter = sec;
        sectorBar.querySelectorAll(".sector-chip").forEach(ch => ch.classList.remove("active"));
        btn.classList.add("active");
        filter();
      });
      sectorBar.appendChild(btn);
    });

    updateChipsUI();
  }

  // ── 탭 전환 ──────────────────────────────────────────
  const tabBtns = document.querySelectorAll(".tab-btn");

  function switchTab(tab) {
    activeTab = tab;
    try { sessionStorage.setItem(KEY_TAB, tab); } catch (_) {}
    companies = tab === "industry" ? industryList : companyList;

    // 해당 탭 저장 상태 복원
    const saved = loadTabState(tabStateKey(tab));
    sortMode     = (saved && saved.sort)   || "recent";
    sectorFilter = (saved && saved.sector) || "";
    q.value      = (saved && saved.q)      || "";

    // 정렬 버튼 UI
    allSortBtns.forEach(b => b.classList.remove("active"));
    (sortBtnMap[sortMode] || btnDefault).classList.add("active");

    // 탭 버튼 UI
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

    buildSectors();
    buildSectorChips();
    filter();
    window.scrollTo(0, 0);
  }

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // ── 스크롤 위치 실시간 저장 ──────────────────────────
  let _scrollTimer;
  window.addEventListener("scroll", () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(saveTabState, 80);
  }, { passive: true });

  // ── 카드 클릭 직전 최종 저장 ─────────────────────────
  grid.addEventListener("click", e => {
    if (e.target.closest("a.company")) saveTabState();
  }, true);

  q.addEventListener("input", filter);

  // ── 초기 탭 UI ───────────────────────────────────────
  tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));

  // ── 초기 정렬 버튼 UI ────────────────────────────────
  allSortBtns.forEach(b => b.classList.remove("active"));
  (sortBtnMap[sortMode] || btnDefault).classList.add("active");

  // ── 즐겨찾기 로드(원격 동기화) 후 초기 상태 확정 ─────
  await loadFavorites();
  companies = computeCompanies();
  favToolbar.hidden = activeTab !== "favorites";

  // ── 초기 섹터 빌드 & 렌더 ────────────────────────────
  buildSectors();
  buildSectorChips();
  filter();
  updateFavUI();

  if (savedNow && savedNow.scrollY) {
    const target = savedNow.scrollY;
    const tryScroll = () => window.scrollTo(0, target);
    requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    setTimeout(tryScroll, 50);
    setTimeout(tryScroll, 200);
  }
})();
