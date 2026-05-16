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
      a.innerHTML =
        '<h2 class="name">' + escapeHtml(c.name) + '</h2>' +
        '<p class="meta">' +
          [c.ticker, c.sector].filter(Boolean).map(escapeHtml).join(" · ") +
        '</p>' +
        '<span class="count">' + cardCount + ' 카드</span>';
      grid.appendChild(a);
    }
    counter.textContent = list.length + " / " + companies.length;
  }

  function filter() {
    const t = (q.value || "").trim().toLowerCase();
    if (!t) return render(companies);
    const out = companies.filter(c => {
      const hay = [
        c.name, c.ticker, c.sector,
        ...(c.tags || []),
        ...(c.cards || []).flatMap(k => [k.title, ...(k.tags || []), ...(k.summary || [])])
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    });
    render(out);
  }

  q.addEventListener("input", filter);
  render(companies);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[ch]));
  }
})();
