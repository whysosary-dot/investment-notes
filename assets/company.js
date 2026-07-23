// company.html — 한 회사의 카드들 렌더링
(async function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const cardsEl = document.getElementById("cards");
  const empty = document.getElementById("empty");
  const counter = document.getElementById("counter");
  const nameEl = document.getElementById("company-name");
  const metaEl = document.getElementById("company-meta");
  const q = document.getElementById("q");

  let data, company, cards = [];

  function updateHeader() {
    if (company.ticker) {
      const naverUrl = "https://m.stock.naver.com/domestic/stock/" + encodeURIComponent(company.ticker) + "/total";
      nameEl.innerHTML = '<a href="' + naverUrl + '" target="_blank" rel="noopener noreferrer" class="name-link">' + escapeHtml(company.name) + ' <span class="name-link-icon">↗</span></a>';
    } else {
      nameEl.textContent = company.name;
    }
    metaEl.textContent = [company.ticker, company.sector].filter(Boolean).join(" · ");
  }

  // 정렬: 자료 날짜(date) 최신순 → 같으면 추가일(added_at) 최신순
  //       → 그래도 같으면 더 나중에 추가된 카드(배열 뒤쪽)가 앞(왼쪽)으로
  function recomputeCards() {
    cards = (company.cards || [])
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const byDate = String(b.c.date || "").localeCompare(String(a.c.date || ""));
        if (byDate !== 0) return byDate;
        const byAdded = String(b.c.added_at || "").localeCompare(String(a.c.added_at || ""));
        if (byAdded !== 0) return byAdded;
        return b.i - a.i;
      })
      .map(x => x.c);
  }

  // 데이터(미푸시 병합 포함)를 다시 불러와 company/cards 갱신 — 재호출 가능
  async function loadData() {
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
    try { if (window.InvAdmin) window.InvAdmin.applyPending(data); } catch (_) {}
    window.__INV_DATA = data;
    window.__INV_COMPANY_ID = id;
    company = (data.companies || []).find(c => c.id === id);
    return !!company;
  }

  let found;
  try {
    found = await loadData();
  } catch (e) {
    cardsEl.innerHTML = '<p style="color:#c33">데이터를 불러올 수 없습니다 (' + e + ')</p>';
    return;
  }
  if (!found) {
    nameEl.textContent = "기업을 찾을 수 없습니다";
    metaEl.textContent = "id=" + id;
    empty.hidden = false;
    return;
  }
  updateHeader();
  recomputeCards();

  // 기업 수정/삭제 컨트롤 (한 번만 — 핸들러는 최신 company 를 참조)
  try {
    if (window.InvAdmin && metaEl.parentElement) {
      const coAdmin = document.createElement("div");
      coAdmin.className = "inv-co-admin";
      coAdmin.innerHTML =
        '<button class="inv-mini" id="iv-co-edit">기업 수정</button>' +
        '<button class="inv-mini danger" id="iv-co-del">기업 삭제</button>';
      metaEl.parentElement.appendChild(coAdmin);
      coAdmin.querySelector("#iv-co-edit").addEventListener("click", () => window.InvAdmin.editCompany(company));
      coAdmin.querySelector("#iv-co-del").addEventListener("click", () => window.InvAdmin.deleteCompany(company));
    }
  } catch (_) {}

  function drawChart(canvasId, cfg) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
    const type = cfg.type || "bar";

    if (type === "donut") {
      const COLORS = ["#378ADD","#0F6E56","#534AB7","#EF9F27","#D85A30","#85B7EB","#639922","#D4537E"];
      new Chart(canvas, {
        type: "doughnut",
        data: {
          labels: cfg.labels,
          datasets: [{
            data: cfg.data,
            backgroundColor: (cfg.colors || COLORS).slice(0, cfg.data.length),
            borderWidth: 1,
            borderColor: "rgba(128,128,128,0.15)"
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: "right", labels: { font: { size: 10 }, boxWidth: 10, padding: 6 } },
            tooltip: {
              callbacks: {
                label: ctx => " " + ctx.label + ": " + ctx.parsed.toLocaleString() + (cfg.unit ? cfg.unit : "")
              }
            }
          }
        }
      });
      return;
    }

    if (type === "line") {
      new Chart(canvas, {
        type: "line",
        data: {
          labels: cfg.labels,
          datasets: [{
            data: cfg.data,
            borderColor: cfg.color || "#0F6E56",
            backgroundColor: cfg.fill ? (cfg.fill_color || "rgba(15,110,86,0.12)") : "transparent",
            fill: !!cfg.fill,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: cfg.color || "#0F6E56"
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.parsed.y.toLocaleString() + (cfg.unit ? " " + cfg.unit : "") } }
          },
          scales: {
            x: { ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 8, maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { font: { size: 10 }, callback: v => v.toLocaleString() }, grid: { color: "rgba(130,130,130,0.12)" }, beginAtZero: true }
          }
        }
      });
      return;
    }

    if (type === "bar-stack") {
      const COLORS = ["#8a6d3b", "#8fbfe0", "#a8c99a", "#cfcfcf", "#534AB7", "#EF9F27", "#D4537E", "#0F6E56"];
      const series = cfg.series || [];
      const usePlug = (typeof ChartDataLabels !== "undefined") && cfg.datalabels !== false;
      const totals = (cfg.labels || []).map((_, i) => series.reduce((t, s) => t + (Number(s.data[i]) || 0), 0));
      const dlMin = cfg.datalabels_min != null ? cfg.datalabels_min : Math.max.apply(null, totals.concat([0])) * 0.04;
      function isDarkHex(h) {
        if (!h || h[0] !== "#") return false;
        const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
      }
      new Chart(canvas, {
        type: "bar",
        plugins: usePlug ? [ChartDataLabels] : [],
        data: {
          labels: cfg.labels,
          datasets: series.map((s, i) => ({
            label: s.label,
            data: s.data,
            backgroundColor: s.color || COLORS[i % COLORS.length]
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 14 } },
          plugins: {
            legend: { display: true, position: "top", labels: { font: { size: 10 }, boxWidth: 10, padding: 6 } },
            datalabels: usePlug ? {
              color: ctx => isDarkHex(ctx.dataset.backgroundColor) ? "#fff" : "#333",
              font: { size: 10, weight: "600" },
              formatter: v => (v != null && Math.abs(v) >= dlMin) ? Number(v).toLocaleString() : ""
            } : undefined,
            tooltip: {
              callbacks: {
                label: ctx => " " + ctx.dataset.label + ": " + ctx.parsed.y.toLocaleString() + (cfg.unit ? " " + cfg.unit : ""),
                afterBody: items => {
                  const i = items[0].dataIndex;
                  return " 합계: " + (totals[i] || 0).toLocaleString() + (cfg.unit ? " " + cfg.unit : "");
                }
              }
            }
          },
          scales: {
            x: { stacked: true, ticks: { font: { size: 10 }, autoSkip: false, maxRotation: 45 }, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 }, callback: v => v.toLocaleString() }, grid: { color: "rgba(130,130,130,0.12)" } }
          }
        }
      });
      return;
    }

    if (type === "bar-h") {
      const defColors = cfg.data.map(() => "#85B7EB");
      const bg = cfg.colors || defColors;
      new Chart(canvas, {
        type: "bar",
        data: {
          labels: cfg.labels,
          datasets: [{ data: cfg.data, backgroundColor: bg, borderRadius: 3, borderSkipped: false }]
        },
        options: {
          indexAxis: "y",
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: ctx => " " + ctx.parsed.x.toLocaleString() + (cfg.unit ? " " + cfg.unit : "") }
            }
          },
          scales: {
            y: { ticks: { font: { size: 10 } }, grid: { display: false } },
            x: { ticks: { font: { size: 10 }, callback: v => v.toLocaleString() }, grid: { color: "rgba(130,130,130,0.12)" } }
          }
        }
      });
      return;
    }

    // default: vertical bar with optional consensus line
    const n = cfg.data.length;
    const PREV = "#85B7EB";
    const SURPRISE = "#0F6E56";
    const SHOCK = "#D85A30";
    const NEUTRAL = "#534AB7";
    const CONS = "#EF9F27";
    function latestColor() {
      if (cfg.surprise === true) return SURPRISE;
      if (cfg.surprise === false) return SHOCK;
      return NEUTRAL;
    }
    const bg = cfg.colors
      ? cfg.colors
      : cfg.data.map((_, i) => i < n - 1 ? PREV : latestColor());
    const datasets = [{ data: cfg.data, backgroundColor: bg, borderRadius: 3, borderSkipped: false }];
    if (cfg.consensus != null) {
      datasets.push({
        type: "line",
        data: cfg.data.map(() => cfg.consensus),
        borderColor: CONS, borderDash: [5, 3],
        borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false
      });
    }
    new Chart(canvas, {
      type: "bar",
      data: { labels: cfg.labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.parsed.y.toLocaleString() + (cfg.unit ? " " + cfg.unit : "")
            }
          }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, autoSkip: false }, grid: { display: false } },
          y: { ticks: { font: { size: 10 }, callback: v => v.toLocaleString() }, grid: { color: "rgba(130,130,130,0.12)" } }
        }
      }
    });
  }

  function chartWrapHeight(cfg) {
    const type = cfg.type || "bar";
    if (type === "donut") return 160;
    if (type === "bar-h") return Math.max(cfg.labels.length * 38 + 44, 110);
    if (type === "bar-stack") return 240;
    if (type === "line") return 150;
    return 150;
  }

  function render(list) {
    cardsEl.innerHTML = "";
    if (!list.length) {
      empty.hidden = false;
      counter.textContent = "0 / " + cards.length;
      return;
    }
    empty.hidden = true;
    const chartQueue = [];

    for (const k of list) {
      const div = document.createElement("article");
      div.className = "card" + (k._pending ? " is-pending" : "");
      const COLOR_LABEL = { red:"빨강", amber:"노랑", green:"초록", blue:"파랑", purple:"보라", pink:"분홍" };
      const colorDot = k.color
        ? '<span class="card-dot sw-' + k.color + '" title="' + (COLOR_LABEL[k.color] || k.color) + '" aria-label="' + (COLOR_LABEL[k.color] || k.color) + '"></span>'
        : "";

      let imgs = [];
      if (k.source_image) imgs.push(k.source_image);
      if (Array.isArray(k.images)) imgs = imgs.concat(k.images);
      const srcAttr = (s) => (s && s.indexOf("data:") === 0) ? s : encodeURI(s || "");
      // 비공개 리포 이미지: data-priv 로 표시해두고 렌더 후 인증 fetch 로 채움
      const imgBlock = imgs.length
        ? '<div class="card-imgs">' + imgs.map(s => {
            if (s && s.indexOf("data:") === 0)
              return '<a class="img" href="' + srcAttr(s) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + srcAttr(s) + '" alt="첨부 이미지" /></a>';
            return '<a class="img" href="#" rel="noopener"><img data-priv="' + escapeAttr(s || "") + '" alt="첨부 이미지" /></a>';
          }).join("") +
          '</div>'
        : "";

      // support both chart (single) and charts (array)
      const chartList = k.charts ? k.charts : (k.chart ? [k.chart] : []);
      let chartBlock = "";

      for (let ci = 0; ci < chartList.length; ci++) {
        const cfg = chartList[ci];
        const cid = chartList.length > 1
          ? "chart-" + escapeAttr(k.id) + "-" + ci
          : "chart-" + escapeAttr(k.id);
        let badge = "";
        if (cfg.consensus != null && cfg.surprise_pct != null) {
          const isShock = cfg.surprise === false;
          const sign = cfg.surprise_pct >= 0 ? "+" : "";
          badge = '<span class="chart-badge ' + (isShock ? "shock" : "surp") + '">' +
            sign + cfg.surprise_pct + "%</span>";
        }
        const h = chartWrapHeight(cfg);
        chartBlock +=
          '<div class="card-chart">' +
          '<div class="chart-hd">' +
          '<span class="chart-lbl">' + escapeHtml(cfg.title || "차트") +
          (cfg.unit ? " (" + escapeHtml(cfg.unit) + ")" : "") + "</span>" + badge +
          "</div>" +
          '<div class="chart-wrap" style="height:' + h + 'px">' +
          '<canvas id="' + cid + '" role="img" aria-label="' + escapeAttr(cfg.title || "차트") + '"></canvas>' +
          "</div></div>";
        chartQueue.push({ id: cid, cfg });
      }

      const bullets = (k.summary || []).map(s => "<li>" + escapeHtml(s) + "</li>").join("");
      const tags = (k.tags || []).map(t => '<span class="tag">' + escapeHtml(t) + "</span>").join("");

      const pendTag = k._edited ? '<span class="inv-pending-tag">수정·미푸시</span>'
                    : (k._pending ? '<span class="inv-pending-tag">미푸시</span>'
                    : (k._recent ? '<span class="inv-pending-tag sync">반영 중</span>' : ""));
      const adminBar = window.InvAdmin
        ? '<div class="card-admin">' +
            '<button class="inv-mini" data-edit="' + escapeAttr(k.id) + '">수정</button>' +
            '<button class="inv-mini danger" data-del="' + escapeAttr(k.id) + '">삭제</button>' +
          '</div>'
        : "";
      div.innerHTML =
        "<h3>" + colorDot + escapeHtml(k.title || "(제목 없음)") + pendTag + "</h3>" +
        '<p class="date">' + escapeHtml(k.date || "") + "</p>" +
        '<div class="card-body">' +
          imgBlock + chartBlock +
          (bullets ? "<ul>" + bullets + "</ul>" : "") +
          (tags ? '<div class="tags">' + tags + "</div>" : "") +
        '</div>' +
        adminBar;
      cardsEl.appendChild(div);
    }

    requestAnimationFrame(() => {
      chartQueue.forEach(({ id, cfg }) => drawChart(id, cfg));
      requestAnimationFrame(setupCollapsibles);
    });
    counter.textContent = list.length + " / " + cards.length;
  }

  // 본문이 길면 접기/펼치기 토글 추가 (공간 절약)
  const COLLAPSE_AT = 800;   // 본문 높이가 이보다 크면 접을 수 있게
  function setupCollapsibles() {
    cardsEl.querySelectorAll(".card").forEach(card => {
      const body = card.querySelector(".card-body");
      if (!body || card.querySelector(".card-toggle")) return;
      if (body.scrollHeight <= COLLAPSE_AT) return;
      card.classList.add("is-collapsible", "collapsed");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card-toggle";
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = '<span class="ct-ico">⌄</span> 더보기';
      btn.addEventListener("click", () => {
        const collapsed = card.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", String(!collapsed));
        btn.innerHTML = collapsed
          ? '<span class="ct-ico">⌄</span> 더보기'
          : '<span class="ct-ico">⌃</span> 접기';
        if (collapsed) card.scrollIntoView({ block: "nearest" });
      });
      body.insertAdjacentElement("afterend", btn);
    });
  }

  // 한글 음절을 첫 자음(초성)으로 변환. 예: "삼성전자" → "ㅅㅅㅈㅈ"
  const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ",
                   "ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  function toChosung(str) {
    let out = "";
    for (const ch of String(str)) {
      const code = ch.charCodeAt(0);
      out += (code >= 0xAC00 && code <= 0xD7A3)
        ? CHOSUNG[Math.floor((code - 0xAC00) / 588)] : ch;
    }
    return out;
  }
  function isChosungQuery(t) {
    const c = t.replace(/\s+/g, "");
    return c.length > 0 && /^[ㄱ-ㅎ]+$/.test(c);
  }

  let colorFilter = "";
  function filter() {
    const t = (q.value || "").trim().toLowerCase();
    let base = cards;
    if (t) {
      const choMode = isChosungQuery(t);
      const tCho = choMode ? t.replace(/\s+/g, "") : "";
      base = cards.filter(k => {
        const hay = [k.title, k.date, ...(k.summary || []), ...(k.tags || [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (hay.includes(t)) return true;
        if (choMode) return toChosung(hay).replace(/\s+/g, "").includes(tCho);
        return false;
      });
    }
    if (colorFilter) base = base.filter(k => (k.color || "") === colorFilter);
    render(base);
  }

  q.addEventListener("input", filter);

  // ── 색상 필터 바 (재호출 가능) ───────────────────────
  let colorBar = null;
  function buildColorFilter() {
    const COLORS = [["red","빨강"],["amber","노랑"],["green","초록"],["blue","파랑"],["purple","보라"],["pink","분홍"]];
    const used = new Set((company.cards || []).map(c => c.color).filter(Boolean));
    if (colorBar) { colorBar.remove(); colorBar = null; }
    if (colorFilter && !used.has(colorFilter)) colorFilter = "";  // 더 이상 없는 색이면 해제
    if (!used.size) return;
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar) return;
    colorBar = document.createElement("section");
    colorBar.className = "color-filter";
    let html = '<button class="cf-chip' + (colorFilter ? "" : " active") + '" data-color="">전체</button>';
    COLORS.forEach(c => {
      if (used.has(c[0])) html += '<button class="cf-chip sw-' + c[0] + (colorFilter === c[0] ? " active" : "") +
        '" data-color="' + c[0] + '" title="' + c[1] + '"><span class="cf-dot"></span>' + c[1] + '</button>';
    });
    colorBar.innerHTML = html;
    toolbar.insertAdjacentElement("afterend", colorBar);
    colorBar.addEventListener("click", (e) => {
      const chip = e.target.closest(".cf-chip");
      if (!chip) return;
      colorFilter = chip.getAttribute("data-color") || "";
      colorBar.querySelectorAll(".cf-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      filter();
    });
  }
  buildColorFilter();

  // 이미지 클릭 → 라이트박스(원본 1400px) / 카드 수정·삭제 (이벤트 위임 — 1회 등록)
  cardsEl.addEventListener("click", (e) => {
    const imgA = e.target.closest("a.img");
    if (imgA) {
      e.preventDefault();
      const im = imgA.querySelector("img");
      openLightbox(im ? im.src : imgA.getAttribute("href"));
      return;
    }
    if (!window.InvAdmin) return;
    const ed = e.target.closest("[data-edit]");
    const dl = e.target.closest("[data-del]");
    if (ed) { e.preventDefault(); window.InvAdmin.editCard(company.id, ed.getAttribute("data-edit")); }
    else if (dl) {
      e.preventDefault();
      const cid = dl.getAttribute("data-del");
      const card = (company.cards || []).find(c => c.id === cid);
      window.InvAdmin.deleteCard(company.id, cid, card && card.title);
    }
  });

  function openLightbox(src) {
    if (!src) return;
    const ov = document.createElement("div");
    ov.className = "inv-lightbox";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "첨부 이미지 원본";
    ov.appendChild(img);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    ov.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }

  render(cards);

  // 카드 추가/수정/삭제 후: 전체 새로고침 없이 그 자리에서 다시 그리고 스크롤 위치 유지
  window.__INV_PAGE_REFRESH = async function () {
    const y = window.scrollY;
    let ok;
    try { ok = await loadData(); } catch (_) { location.reload(); return; }
    if (!ok) { location.href = "index.html"; return; }  // 기업 자체가 삭제됨
    updateHeader();
    recomputeCards();
    buildColorFilter();
    filter();
    requestAnimationFrame(() => window.scrollTo(0, y));
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  }
  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  }

  // ── 비공개 리포 이미지 하이드레이션 (data-priv → 인증 blob) ──
  const _privBlobCache = {};
  async function _hydratePrivImages() {
    const pat = (localStorage.getItem("sv_github_pat") || "").trim();
    if (!pat) return;
    const imgs = document.querySelectorAll("img[data-priv]");
    for (const img of imgs) {
      const rel = img.getAttribute("data-priv");
      img.removeAttribute("data-priv");
      try {
        if (!_privBlobCache[rel]) {
          const r = await fetch("https://api.github.com/repos/whysosary-dot/invest-private/contents/research/" + encodeURI(rel) + "?ref=main", {
            headers: { Authorization: "token " + pat, Accept: "application/vnd.github.raw" }
          });
          if (!r.ok) continue;
          _privBlobCache[rel] = URL.createObjectURL(await r.blob());
        }
        img.src = _privBlobCache[rel];
        const a = img.closest("a.img");
        if (a) a.href = _privBlobCache[rel];
      } catch (_) {}
    }
  }
  new MutationObserver(() => { _hydratePrivImages(); }).observe(document.getElementById("cards") || document.body, { childList: true, subtree: true });
  _hydratePrivImages();

})();
