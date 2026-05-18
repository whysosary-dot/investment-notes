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
  // try to set a sensible repo link if served from github pages
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

  function isRecentlyUpdated(c, days) {
    days = days || 7;
    var now = new Date();
    var cutoff = new Date(now - days * 86400000);
    var dates = (c.cards || []).map(function(k) { return k.date; }).filter(Boolean).map(function(d) { return new Date(d); });
    var maxCard = dates.length ? new Date(Math.max.apply(null, dates)) : null;
    if (maxCard && maxCard >= cutoff) return true;
    if (c.created_at && new Date(c.created_at) >= cutoff) return true;
    return false;
  }

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

  // ── 정렬 & 섹터 필터 ────────────────────────────────
  let sortMode    = "default"; // "default" | "recent" | "sector"
  let sectorFilter = "";       // "" = 전체

  function latestDate(c) {
    const dates = (c.cards || []).map(k => k.date).filter(Boolean);
    if (c.created_at) dates.push(c.created_at);
    return dates.length ? dates.slice().sort().pop() : "0000-00-00";
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

  // 섹터순일 때 섹터 구분선 포함 렌더링
  function renderWithSectors(list) {
    if (sortMode !== "sector" || sectorFilter) { render(sorted(list)); return; }
    grid.innerHTML = "";
    if (!list.length) { empty.hidden = false; counter.textContent = "0 / " + companies.length; return; }
    empty.hidden = true;
    let prevSector = null;
    for (const c of sorted(list)) {
      const sec = c.sector || "기타";
      if (sec !== prevSector) {
        const div = document.createElement("div");
        div.className = "sector-divider";
        div.textContent = sec;
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
    all.className = "sector-chip active";
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
      btn.className = "sector-chip";
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
  renderWithSectors(companies);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[ch]));
  }
})();
