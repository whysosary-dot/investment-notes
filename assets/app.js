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
    const res = await (function(){
    var pat = (localStorage.getItem("sv_github_pat") || "").trim();
    if (!pat) return Promise.reject(new Error("NO_PAT — 대시보드 ⚙️에서 GitHub 토큰을 저장하세요"));
    return fetch("https://api.github.com/repos/whysosary-dot/invest-private/contents/research/companies.json?ref=main&ts=" + Date.now(), {
      cache: "no-store",
      headers: { Authorization: "token " + pat, Accept: "application/vnd.github.raw" }
    });
  })();
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (e) {
    grid.innerHTML = '<p style="color:#c33">데이터를 불러올 수 없습니다 (' + e + ')</p>';
    return;
  }

  // 로컬 미푸시 추가분(localStorage) 병합 — 다른 기기 반영은 "커밋 & 푸시"
  try { if (window.InvAdmin) window.InvAdmin.applyPending(data); } catch (_) {}
  window.__INV_DATA = data;

  const allEntries  = data.companies || [];
  const companyList = allEntries.filter(c => !c.type || c.type === "company");
  const industryList = allEntries.filter(c => c.type === "industry");

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
    const key = activeTab === "industry" ? KEY_IND : KEY_CO;
    try {
      sessionStorage.setItem(key, JSON.stringify({
        sort: sortMode, sector: sectorFilter,
        q: q.value || "", scrollY: window.scrollY
      }));
    } catch (_) {}
  }

  // ── 탭 초기값 ──────────────────────────────────────
  let activeTab = (isBF && sessionStorage.getItem(KEY_TAB)) || "company";

  const savedCo  = isBF ? loadTabState(KEY_CO)  : null;
  const savedInd = isBF ? loadTabState(KEY_IND) : null;
  const savedNow = activeTab === "industry" ? savedInd : savedCo;

  let sortMode     = (savedNow && savedNow.sort)   || "recent";
  let sectorFilter = (savedNow && savedNow.sector) || "";
  let colorFilter  = "";
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

  function hasPending(c) {
    return !!(c._pending || (c.cards || []).some(k => k._pending));
  }
  function pendingTag(c) {
    return hasPending(c) ? '<span class="inv-pending-tag">미푸시</span>' : '';
  }

  // ── 초성(자음) 검색 유틸 ─────────────────────────────
  // 한글 음절(가~힣)을 첫 자음으로 변환. 예: "삼성전자" → "ㅅㅅㅈㅈ"
  const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ",
                   "ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  function toChosung(str) {
    let out = "";
    for (const ch of String(str)) {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        out += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
      } else {
        out += ch;
      }
    }
    return out;
  }
  // 질의가 자음(호환 자모)으로만 이루어졌는지 (초성 검색 모드 판별)
  function isChosungQuery(t) {
    const c = t.replace(/\s+/g, "");
    return c.length > 0 && /^[ㄱ-ㅎ]+$/.test(c);
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
      empty.hidden = false;
      counter.textContent = "0 / " + companies.length;
      return;
    }
    empty.hidden = true;
    for (const c of list) {
      const a = document.createElement("a");
      a.className = "company" + (hasPending(c) ? " is-pending" : "");
      a.href = "company.html?id=" + encodeURIComponent(c.id);
      if (c.color) a.dataset.color = c.color;
      const cardCount = (c.cards || []).length;
      const dot = isRecentlyUpdated(c) ? '<span class="updated-dot" title="최근 1일 내 업데이트"></span>' : '';
      a.innerHTML =
        '<h2 class="name">' + dot + escapeHtml(c.name) + pendingTag(c) + '</h2>' +
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
      a.className = "company" + (hasPending(c) ? " is-pending" : "");
      a.href = "company.html?id=" + encodeURIComponent(c.id);
      if (c.color) a.dataset.color = c.color;
      const dot = isRecentlyUpdated(c) ? '<span class="updated-dot" title="최근 1일 내 업데이트"></span>' : '';
      a.innerHTML =
        '<h2 class="name">' + dot + escapeHtml(c.name) + pendingTag(c) + '</h2>' +
        '<p class="meta">' + [c.ticker, c.sector].filter(Boolean).map(escapeHtml).join(" · ") + '</p>' +
        '<span class="count">' + (c.cards || []).length + ' 카드</span>';
      grid.appendChild(a);
    }
    counter.textContent = list.length + " / " + companies.length;
  }

  function filter() {
    const t = (q.value || "").trim().toLowerCase();
    const choMode = isChosungQuery(t);
    const tCho = choMode ? t.replace(/\s+/g, "") : "";
    let base = t ? companies.filter(c => {
      const hay = [
        c.name, c.ticker, c.sector,
        ...(c.tags || []),
        ...(c.cards || []).flatMap(k => [k.title, ...(k.tags || []), ...(k.summary || [])])
      ].filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(t)) return true;
      // 초성 검색: 질의가 자음만일 때 본문 초성열에서 매칭 (예: ㅅㅅㅈㅈ → 삼성전자)
      if (choMode) return toChosung(hay).replace(/\s+/g, "").includes(tCho);
      return false;
    }) : companies;
    if (sectorFilter) base = base.filter(c => (c.sector || "") === sectorFilter);
    if (colorFilter) base = base.filter(c => (c.color || "") === colorFilter);
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

  // ── 색상 필터 바 ─────────────────────────────────────
  const COLOR_DEFS = [["red","빨강"],["amber","노랑"],["green","초록"],["blue","파랑"],["purple","보라"],["pink","분홍"]];
  let colorBar = null;
  function buildColorChips() {
    if (!colorBar) {
      colorBar = document.createElement("section");
      colorBar.className = "color-filter";
      sectorWrap.insertAdjacentElement("afterend", colorBar);
    }
    const used = new Set(companies.map(c => c.color).filter(Boolean));
    if (!used.size) { colorBar.hidden = true; colorBar.innerHTML = ""; return; }
    colorBar.hidden = false;
    let html = '<button class="cf-chip' + (colorFilter ? "" : " active") + '" data-color="">전체</button>';
    COLOR_DEFS.forEach(c => {
      if (used.has(c[0])) html += '<button class="cf-chip sw-' + c[0] + (colorFilter === c[0] ? " active" : "") +
        '" data-color="' + c[0] + '" title="' + c[1] + '"><span class="cf-dot"></span>' + c[1] + '</button>';
    });
    colorBar.innerHTML = html;
    colorBar.querySelectorAll(".cf-chip").forEach(ch => ch.addEventListener("click", () => {
      colorFilter = ch.getAttribute("data-color") || "";
      colorBar.querySelectorAll(".cf-chip").forEach(x => x.classList.remove("active"));
      ch.classList.add("active");
      filter();
    }));
  }

  // ── 탭 전환 ──────────────────────────────────────────
  const tabBtns = document.querySelectorAll(".tab-btn");

  function switchTab(tab) {
    activeTab = tab;
    try { sessionStorage.setItem(KEY_TAB, tab); } catch (_) {}
    companies = tab === "industry" ? industryList : companyList;

    // 해당 탭 저장 상태 복원
    const saved = loadTabState(tab === "industry" ? KEY_IND : KEY_CO);
    sortMode     = (saved && saved.sort)   || "recent";
    sectorFilter = (saved && saved.sector) || "";
    colorFilter  = "";
    q.value      = (saved && saved.q)      || "";

    // 정렬 버튼 UI
    allSortBtns.forEach(b => b.classList.remove("active"));
    (sortBtnMap[sortMode] || btnDefault).classList.add("active");

    // 탭 버튼 UI
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

    buildSectors();
    buildSectorChips();
    buildColorChips();
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

  // ── 초기 섹터 빌드 & 렌더 ────────────────────────────
  buildSectors();
  buildSectorChips();
  buildColorChips();
  filter();

  if (savedNow && savedNow.scrollY) {
    const target = savedNow.scrollY;
    const tryScroll = () => window.scrollTo(0, target);
    requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    setTimeout(tryScroll, 50);
    setTimeout(tryScroll, 200);
  }
})();
