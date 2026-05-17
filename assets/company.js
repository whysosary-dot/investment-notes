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
  nameEl.textContent = company.name;
  metaEl.textContent = [company.ticker, company.sector].filter(Boolean).join(" · ");

  const cards = (company.cards || []).slice().sort((a, b) => {
    return String(b.date || "").localeCompare(String(a.date || ""));
  });

  function drawChart(canvasId, cfg) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
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
    const bg = cfg.data.map((_, i) => i < n - 1 ? PREV : latestColor());
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

      let chartBlock = "";
      if (k.chart) {
        const cid = "chart-" + escapeAttr(k.id);
        let badge = "";
        if (k.chart.consensus != null && k.chart.surprise_pct != null) {
          const isShock = k.chart.surprise === false;
          const sign = k.chart.surprise_pct >= 0 ? "+" : "";
          badge = '<span class="chart-badge ' + (isShock ? "shock" : "surp") + '">' +
            sign + k.chart.surprise_pct + "%</span>";
        }
        chartBlock =
          '<div class="card-chart">' +
          '<div class="chart-hd">' +
          '<span class="chart-lbl">' + escapeHtml(k.chart.title || "영업이익") +
          " (" + escapeHtml(k.chart.unit || "억원") + ")</span>" + badge +
          "</div>" +
          '<div class="chart-wrap"><canvas id="' + cid + '" role="img" ' +
          'aria-label="' + escapeAttr((k.chart.title || "영업이익") + " 추이") + '"></canvas></div>' +
          "</div>";
        chartQueue.push({ id: cid, cfg: k.chart });
      }

      const bullets = (k.summary || []).map(s => "<li>" + escapeHtml(s) + "</li>").join("");
      const tags = (k.tags || []).map(t => '<span class="tag">' + escapeHtml(t) + "</span>").join("");

      div.innerHTML =
        "<h3>" + escapeHtml(k.title || "(제목 없음)") + "</h3>" +
        '<p class="date">' + escapeHtml(k.date || "") + "</p>" +
        imgBlock +
        chartBlock +
        (bullets ? "<ul>" + bullets + "</ul>" : "") +
        (tags ? '<div class="tags">' + tags + "</div>" : "");
      cardsEl.appendChild(div);
    }

    requestAnimationFrame(() => {
      chartQueue.forEach(({ id, cfg }) => drawChart(id, cfg));
    });

    counter.textContent = list.length + " / " + cards.length;
  }

  function filter() {
    const t = (q.value || "").trim().toLowerCase();
    if (!t) return render(cards);
    const out = cards.filter(k => {
      const hay = [k.title, k.date, ...(k.summary || []), ...(k.tags || [])]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
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
