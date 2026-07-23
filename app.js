// ---- CONFIGURATION ----
// Your Google Sheet ID and tab name (from the URL: /d/<SHEET_ID>/... and the tab label at the bottom)
const SHEET_ID = "1u5ULzznDU94EP-A_KYJsCPFKDgzsU4LHBKQUKndziRo";
const SHEET_NAME = "Source";

const GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&headers=1&_=${Date.now()}`;

// Expected headers (normalized: trimmed, lowercased, spaces removed)
const HEADERS = {
  cat0: "kategorija0",
  cat1: "kategorija1",
  artikel: "artikel",
  opomba: "opomba",
  akcija: "akcija",
  trgovina: "trgovina",
  cena: "cena",
  kolicina: "količina",
  enota: "enota",
  cenaEnota: "cena/količino",
  trgovinaArtikel: "trgovina-artikel"
};

function norm(s) {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, "");
}

// ---- STATE ----
let rows = [];          // parsed article rows
let state = {
  screen: "home",       // home | cat1 | articles | search
  cat0: null,
  cat1: null,
  query: "",
  sortField: "unit",    // 'unit' (Cena/količino) | 'total' (Cena)
  sortDir: "asc",        // 'asc' | 'desc'
  promoOnly: false,
  stores: new Set()      // selected stores to show (empty set = show all)
};

// ---- DOM ----
const el = {
  content: document.getElementById("content"),
  pageTitle: document.getElementById("pageTitle"),
  backBtn: document.getElementById("backBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  crumb: document.getElementById("crumb"),
  searchWrap: document.getElementById("searchWrap"),
  searchInput: document.getElementById("searchInput"),
  filterBar: document.getElementById("filterBar"),
  sortFieldBtn: document.getElementById("sortFieldBtn"),
  sortDirBtn: document.getElementById("sortDirBtn"),
  promoBtn: document.getElementById("promoBtn"),
  storeChips: document.getElementById("storeChips")
};

el.backBtn.addEventListener("click", goBack);
el.refreshBtn.addEventListener("click", () => loadData(true));
el.searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  state.screen = state.query.trim() ? "search" : "home";
  render();
});
el.sortFieldBtn.addEventListener("click", () => {
  state.sortField = state.sortField === "unit" ? "total" : "unit";
  render();
});
el.sortDirBtn.addEventListener("click", () => {
  state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  render();
});
el.promoBtn.addEventListener("click", () => {
  state.promoOnly = !state.promoOnly;
  render();
});

// ---- LOAD & PARSE ----
function loadData(forceReload) {
  el.content.innerHTML = `
    <div class="state">
      <div class="spinner"></div>
      <p>Nalagam cene …</p>
    </div>`;

  const url = forceReload ? GVIZ_URL.replace(/_=\d+/, "_=" + Date.now()) : GVIZ_URL;

  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then((text) => {
      const match = text.match(/setResponse\((.*)\);?\s*$/s);
      if (!match) throw new Error("Nepričakovan odgovor iz Google Sheets.");
      const json = JSON.parse(match[1]);
      if (json.status === "error") {
        const msg = (json.errors && json.errors[0] && json.errors[0].detailed_message) || "Napaka pri branju.";
        throw new Error(msg);
      }
      rows = parseTable(json.table);
      render();
    })
    .catch((err) => {
      showError(err.message);
    });
}

function parseTable(table) {
  const colIndex = {};
  table.cols.forEach((c, i) => {
    const label = norm(c.label);
    for (const key in HEADERS) {
      if (label === HEADERS[key]) colIndex[key] = i;
    }
  });

  function cellVal(row, key) {
    const i = colIndex[key];
    if (i === undefined) return null;
    const cell = row.c[i];
    if (!cell) return null;
    return cell;
  }
  function cellStr(row, key) {
    const cell = cellVal(row, key);
    if (!cell) return "";
    return (cell.f !== undefined && cell.f !== null) ? String(cell.f).trim() : String(cell.v ?? "").trim();
  }
  function cellNum(row, key) {
    const cell = cellVal(row, key);
    if (!cell || cell.v === null || cell.v === undefined) return null;
    if (typeof cell.v === "number") return cell.v;
    const n = parseFloat(String(cell.v).replace(/[^\d,.-]/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  function cellBool(row, key) {
    const cell = cellVal(row, key);
    if (!cell) return false;
    if (typeof cell.v === "boolean") return cell.v;
    const s = norm(cell.f || cell.v);
    return ["da", "yes", "true", "1", "y"].includes(s);
  }

  const out = [];
  (table.rows || []).forEach((row) => {
    if (!row.c) return;
    const artikel = cellStr(row, "artikel");
    const cat0 = cellStr(row, "cat0");
    if (!artikel && !cat0) return; // skip blank rows

    out.push({
      cat0: cat0 || "Brez kategorije",
      cat1: cellStr(row, "cat1") || "Brez podkategorije",
      artikel: artikel || "(neznan izdelek)",
      opomba: cellStr(row, "opomba"),
      akcija: cellBool(row, "akcija"),
      trgovina: cellStr(row, "trgovina") || "?",
      cenaDisplay: cellStr(row, "cena"),
      cena: cellNum(row, "cena"),
      kolicina: cellNum(row, "kolicina"),
      enota: cellStr(row, "enota"),
      cenaEnotaDisplay: cellStr(row, "cenaEnota"),
      cenaEnota: cellNum(row, "cenaEnota")
    });
  });
  return out;
}

function showError(msg) {
  el.content.innerHTML = `
    <div class="errorBox">
      <strong>Ni bilo mogoče naložiti podatkov.</strong><br>
      ${escapeHtml(msg)}<br><br>
      Preveri, da je Google Sheet deljen z nastavitvijo "Kdor koli s povezavo" in da je ime zavihka pravilno.
      <div><button onclick="loadData(true)">Poskusi znova</button></div>
    </div>`;
}

// ---- NAVIGATION ----
function goHome() {
  state.screen = "home";
  state.cat0 = null;
  state.cat1 = null;
  state.query = "";
  el.searchInput.value = "";
  render();
}
function goBack() {
  if (state.screen === "articles") {
    state.screen = "cat1";
    state.cat1 = null;
    render();
  } else if (state.screen === "cat1" || state.screen === "search") {
    goHome();
  }
}

// ---- RENDER ----
function render() {
  updateChrome();
  if (state.screen === "home") renderHome();
  else if (state.screen === "cat1") renderCat1();
  else if (state.screen === "articles") renderArticles();
  else if (state.screen === "search") renderSearch();
}

function updateChrome() {
  el.backBtn.hidden = state.screen === "home";
  el.searchWrap.hidden = state.screen !== "home";
  el.filterBar.hidden = state.screen !== "articles";

  if (state.screen === "home") {
    el.pageTitle.textContent = "Cene";
    el.crumb.textContent = "";
  } else if (state.screen === "cat1") {
    el.pageTitle.textContent = state.cat0;
    el.crumb.textContent = "";
  } else if (state.screen === "articles") {
    el.pageTitle.textContent = state.cat1;
    el.crumb.textContent = state.cat0 + " › " + state.cat1;
  } else if (state.screen === "search") {
    el.pageTitle.textContent = "Iskanje";
    el.crumb.textContent = "";
  }

  if (state.screen === "articles") {
    el.sortFieldBtn.textContent = state.sortField === "unit" ? "€ / enoto" : "€ skupaj";
    el.sortFieldBtn.classList.add("active");
    el.sortDirBtn.textContent = state.sortDir === "asc" ? "↑ najcenejše" : "↓ najdražje";
    el.sortDirBtn.classList.add("active");
    el.promoBtn.classList.toggle("active", state.promoOnly);
  }
}

function renderHome() {
  const groups = {};
  rows.forEach((r) => {
    groups[r.cat0] = (groups[r.cat0] || 0) + 1;
  });
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, "sl"));

  if (names.length === 0) {
    el.content.innerHTML = `<div class="empty">Ni podatkov v razpredelnici.</div>`;
    return;
  }

  el.content.innerHTML = `<div class="grid">` +
    names.map((n) => `
      <button class="tile" data-cat0="${escapeAttr(n)}">
        <span class="tile-name">${escapeHtml(n)}</span>
        <span class="tile-count">${groups[n]} izdelkov</span>
      </button>`).join("") +
    `</div>`;

  el.content.querySelectorAll(".tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cat0 = btn.dataset.cat0;
      state.screen = "cat1";
      render();
    });
  });
}

function renderCat1() {
  const groups = {};
  rows.filter((r) => r.cat0 === state.cat0).forEach((r) => {
    groups[r.cat1] = (groups[r.cat1] || 0) + 1;
  });
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, "sl"));

  el.content.innerHTML = `<div class="grid">` +
    names.map((n) => `
      <button class="tile" data-cat1="${escapeAttr(n)}">
        <span class="tile-name">${escapeHtml(n)}</span>
        <span class="tile-count">${groups[n]} izdelkov</span>
      </button>`).join("") +
    `</div>`;

  el.content.querySelectorAll(".tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cat1 = btn.dataset.cat1;
      state.screen = "articles";
      // reset store filter selection for the new list, keep sort/promo prefs
      state.stores = new Set();
      render();
    });
  });
}

function renderArticles() {
  let list = rows.filter((r) => r.cat0 === state.cat0 && r.cat1 === state.cat1);
  renderStoreChips(list);
  list = applyFiltersAndSort(list);
  renderArticleList(list);
}

function renderSearch() {
  const q = norm(state.query);
  let list = rows.filter((r) =>
    norm(r.artikel).includes(q) || norm(r.trgovina).includes(q) || norm(r.cat1).includes(q) || norm(r.cat0).includes(q)
  );
  el.filterBar.hidden = true;
  el.content.innerHTML = `<div class="searchHint">${list.length} zadetkov</div>`;
  const listEl = document.createElement("div");
  list = list.slice().sort((a, b) => (a.cenaEnota ?? Infinity) - (b.cenaEnota ?? Infinity));
  listEl.className = "articleList";
  listEl.innerHTML = list.map(articleRowHtml).join("");
  el.content.appendChild(listEl);
}

function renderStoreChips(list) {
  const stores = Array.from(new Set(list.map((r) => r.trgovina))).sort((a, b) => a.localeCompare(b, "sl"));
  el.storeChips.innerHTML = stores.map((s) => `
    <button class="chip chip--store ${state.stores.has(s) ? "active" : ""}" data-store="${escapeAttr(s)}">${escapeHtml(s)}</button>
  `).join("");
  el.storeChips.querySelectorAll(".chip--store").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.dataset.store;
      if (state.stores.has(s)) state.stores.delete(s);
      else state.stores.add(s);
      render();
    });
  });
}

function applyFiltersAndSort(list) {
  if (state.promoOnly) list = list.filter((r) => r.akcija);
  if (state.stores.size > 0) list = list.filter((r) => state.stores.has(r.trgovina));

  const field = state.sortField === "unit" ? "cenaEnota" : "cena";
  const dir = state.sortDir === "asc" ? 1 : -1;
  list = list.slice().sort((a, b) => {
    const av = a[field] ?? Infinity;
    const bv = b[field] ?? Infinity;
    return (av - bv) * dir;
  });
  return list;
}

function renderArticleList(list) {
  if (list.length === 0) {
    el.content.innerHTML = `<div class="empty">Ni izdelkov s temi filtri.</div>`;
    return;
  }
  el.content.innerHTML = `<div class="articleList">${list.map(articleRowHtml).join("")}</div>`;
}

function articleRowHtml(r) {
  const qty = r.kolicina ? `${r.kolicina} ${r.enota}`.trim() : "";
  return `
    <div class="article">
      <div class="article-main">
        <div class="article-name">${escapeHtml(r.artikel)}</div>
        <div class="article-sub">
          <span>${escapeHtml(r.trgovina)}</span>
          ${qty ? `<span>· ${escapeHtml(qty)}</span>` : ""}
          ${r.opomba ? `<span class="article-note">· ${escapeHtml(r.opomba)}</span>` : ""}
          ${r.akcija ? `<span class="promoTag">AKCIJA</span>` : ""}
        </div>
      </div>
      <div class="article-price">
        <div class="price-main">${escapeHtml(r.cenaDisplay || "")}</div>
        ${r.cenaEnotaDisplay ? `<div class="price-unit">${escapeHtml(r.cenaEnotaDisplay)}/enoto</div>` : ""}
      </div>
    </div>`;
}

// ---- utils ----
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---- INIT ----
loadData(false);
