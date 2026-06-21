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

  let data;
  try {
    const res = await fetch("data/companies.json?ts=" + Date.now());
    data = await res.json();
  } catch (e) {
    cardsEl.innerHTML = '<p style="color:#c33">데이터를 불러올 수 없습니다 (' + e + ')</p>';
    return;
  }

  const company = (data.companies || []).find(c => c.id === id);
  if (!company) {
    nameEl.textContent = "기업을 찾을 수 없습니다";
    metaEl.textContent = "id=" + id;
    empty.hidden = false;
    return;
  }
  if (company.ticker) {
    const naverUrl = "https://m.stock.naver.com/domestic/stock/" + encodeURIComponent(company.ticker) + "/total";
    nameEl.innerHTML = '<a href="' + naverUrl + '" target="_blank" rel="noopener noreferrer" class="name-link">' + escapeHtml(company.name) + ' <span class="name-link-icon">↗</span></a>';
  } else {
    nameEl.textContent = company.name;
  }
  metaEl.textContent = [company.ticker, company.sector].filter(Boolean).join(" · ");

  const cards = (company.cards || []).slice().sort((a, b) => {
    return String(b.date || "").localeCompare(String(a.date || ""));
  });

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
      div.className = "card";

      const imgBlock = k.source_image
        ? '<a class="img" href="' + encodeURI(k.source_image) + '" target="_blank" rel="noopener">' +
          '<img loading="lazy" src="' + encodeURI(k.source_image) + '" alt="source image" /></a>'
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

      div.innerHTML =
        "<h3>" + escapeHtml(k.title || "(제목 없음)") + "</h3>" +
        '<p class="date">' + escapeHtml(k.date || "") + "</p>" +
        imgBlock + chartBlock +
        (bullets ? "<ul>" + bullets + "</ul>" : "") +
        (tags ? '<div class="tags">' + tags + "</div>" : "");
      cardsEl.appendChild(div);
    }

    requestAnimationFrame(() => {
      chartQueue.forEach(({ id, cfg }) => drawChart(id, cfg));
    });
    counter.textContent = list.length + " / " + cards.length;
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

  function filter() {
    const t = (q.value || "").trim().toLowerCase();
    if (!t) return render(cards);
    const choMode = isChosungQuery(t);
    const tCho = choMode ? t.replace(/\s+/g, "") : "";
    const out = cards.filter(k => {
      const hay = [k.title, k.date, ...(k.summary || []), ...(k.tags || [])]
        .filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(t)) return true;
      if (choMode) return toChosung(hay).replace(/\s+/g, "").includes(tCho);
      return false;
    });
    render(out);
  }

  q.addEventListener("input", filter);
  render(cards);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  }
  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  }
})();
