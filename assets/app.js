// index.html — 회사 목록 렌더링
(async function () {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const counter = document.getElementById("counter");
  const updatedEl = document.getElementById("updated");
  const q = document.getElementById("q");
  const repolink = document.getElementById("repolink");

  let data;
  try {
    const res = await fetch("data/companies.json?ts=" + Date.now());
    data = await res.json();
  } catch (e) {
    grid.innerHTML = '<p style="color:#c33">데이터를 불러올 수 없습니다 (' + e + ')</p>';
    return;
  }

  const companies = data.companies || [];
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
  const STATE_KEY = "inv_list_state";

  function isBackForward() {
    try {
      const nav = performance.getEntriesByType("navigation");
      if (nav.length) return nav[0].type === "back_forward";
    } catch (_) {}
    try { return performance.navigation.type === 2; } catch (_) {}
    return false;
  }

  function saveState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        sort: sortMode,
        sector: sectorFilter,
        q: q.value || "",
        scrollY: window.scrollY
      }));
    } catch (_) {}
  }

  function loadSavedState() {
    try {
      return JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
    } catch (_) { return null; }
  }

  // ── 뒤로가기 시 복원할 초기값 결정 ─────────────────
  const saved = isBackForward() ? loadSavedState() : null;

  // ── 정렬 & 섹터 필터 ────────────────────────────────
  let sortMode     = (saved && saved.sort)   || "default";
  let sectorFilter = (saved && saved.sector) || "";
  if (saved && saved.q) q.value = saved.q;

  // ── 유틸 ─────────────────────────────────────────────
  function isRecentlyUpdated(c) {
    var cutoff = new Date(Date.now() - 86400000);
    var dates = (c.cards || []).map(function(k) { return k.date; }).filter(Boolean).map(function(d) { return new Date(d); });
    var maxCard = dates.length ? new Date(Math.max.apply(null, dates)) : null;
    return !!(maxCard && maxCard >= cutoff);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[ch]));
  }

  function latestDate(c) {
    const dates = (c.cards || []).map(k => k.date).filter(Boolean);
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
      a.className = "company";
      a.href = "company.html?id=" + encodeURIComponent(c.id);
      const cardCount = (c.cards || []).length;
      const dot = isRecentlyUpdated(c) ? '<span class="updated-dot" title="최근 7일 내 업데이트"></span>' : '';
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
    return list;
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
      const dot = isRecentlyUpdated(c) ? '<span class="updated-dot" title="최근 7일 내 업데이트"></span>' : '';
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
    saveState(); // 상태 변경마다 저장
  }

  // ── 정렬 버튼 ────────────────────────────────────────
  const btnDefault = document.getElementById("sort-default");
  const btnRecent  = document.getElementById("sort-recent");
  const btnSector  = document.getElementById("sort-sector");
  const allSortBtns = [btnDefault, btnRecent, btnSector];

  function setSort(mode, btn) {
    sortMode = mode;
    allSortBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filter();
  }
  btnDefault.addEventListener("click", () => setSort("default", btnDefault));
  btnRecent.addEventListener("click",  () => setSort("recent",  btnRecent));
  btnSector.addEventListener("click",  () => setSort("sector",  btnSector));

  // 복원된 정렬 버튼 활성화
  const sortBtnMap = { default: btnDefault, recent: btnRecent, sector: btnSector };
  allSortBtns.forEach(b => b.classList.remove("active"));
  (sortBtnMap[sortMode] || btnDefault).classList.add("active");

  // ── 섹터 칩 ──────────────────────────────────────────
  const CHIP_COLORS = [
    "#378ADD", "#0F6E56", "#534AB7", "#D85A30",
    "#B5860D", "#1A7F64", "#8B3A8B", "#1E6FA3",
    "#C0392B", "#2471A3", "#76448A", "#17A589",
    "#CA6F1E", "#1E8449", "#6E2FBF", "#B03A2E",
    "#0E6655", "#2E4057"
  ];

  const sectorBar = document.getElementById("sector-bar");
  const sectors = [...new Set(companies.map(c => c.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const sectorColorMap = {};
  sectors.forEach((sec, i) => { sectorColorMap[sec] = CHIP_COLORS[i % CHIP_COLORS.length]; });

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
  }
  buildSectorChips();

  q.addEventListener("input", filter);

  // ── 스크롤 위치 실시간 저장 ──────────────────────────
  let _scrollTimer;
  window.addEventListener("scroll", () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(saveState, 80);
  }, { passive: true });

  // ── 카드 클릭 직전 최종 저장 ─────────────────────────
  grid.addEventListener("click", e => {
    if (e.target.closest("a.company")) saveState();
  }, true);

  // ── 초기 렌더 & 스크롤 복원 ─────────────────────────
  filter();
  if (saved && saved.scrollY) {
    const target = saved.scrollY;
    // rAF × 2 → 50 ms → 200 ms 순으로 재시도 (레이아웃 완료 시점 불확실)
    const tryScroll = () => window.scrollTo(0, target);
    requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    setTimeout(tryScroll, 50);
    setTimeout(tryScroll, 200);
  }
})();
