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

  function render(list) {
    cardsEl.innerHTML = "";
    if (!list.length) {
      empty.hidden = false;
      counter.textContent = "0 / " + cards.length;
      return;
    }
    empty.hidden = true;
    for (const k of list) {
      const div = document.createElement("article");
      div.className = "card";
      const imgBlock = k.source_image
        ? '<a class="img" href="' + encodeURI(k.source_image) + '" target="_blank" rel="noopener">' +
          '<img loading="lazy" src="' + encodeURI(k.source_image) + '" alt="source image" /></a>'
        : "";
      const bullets = (k.summary || []).map(s => '<li>' + escapeHtml(s) + '</li>').join("");
      const tags = (k.tags || []).map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join("");
      div.innerHTML =
        '<h3>' + escapeHtml(k.title || "(제목 없음)") + '</h3>' +
        '<p class="date">' + escapeHtml(k.date || "") + '</p>' +
        imgBlock +
        (bullets ? '<ul>' + bullets + '</ul>' : '') +
        (tags ? '<div class="tags">' + tags + '</div>' : '');
      cardsEl.appendChild(div);
    }
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
    return String(s).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[ch]));
  }
})();
