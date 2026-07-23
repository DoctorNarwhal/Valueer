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
  cat2: "kategorija2",
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
let navStack = [];       // history of previous {screen,cat0,cat1} snapshots (for back)
let navForward = [];     // snapshots to redo (for forward)
let state = {
  screen: "home",       // home | cat1 | cat2 | articles | search
  cat0: null,
  cat1: null,
  cat2: null,
  query: "",
  sortField: "unit",    // 'unit' (Cena/količino) | 'total' (Cena)
  sortDir: "asc",        // 'asc' | 'desc'
  promoFilter: "all",    // 'all' | 'promo' | 'nonpromo'
  sparCoupon: false,     // Spar -10% coupon toggle
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
  promoChips: document.getElementById("promoChips"),
  storeChips: document.getElementById("storeChips"),
  priceBarWrap: document.getElementById("priceBarWrap")
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

// ---- SWIPE NAVIGATION (iOS-style: swipe left = back, swipe right = forward) ----
(function setupSwipeNav() {
  let startX = 0, startY = 0, tracking = false;
  const THRESHOLD = 60;     // minimum horizontal distance to count as a swipe
  const RATIO = 1.5;        // must be mostly horizontal, not a vertical scroll

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * RATIO) return;
    if (dx < 0) goBack();
    else goForwardNav();
  }, { passive: true });
})();


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

    const enotaVal = cellStr(row, "enota");
    const rawCenaEnota = cellNum(row, "cenaEnota");
    const upi = unitPriceInfo(rawCenaEnota, enotaVal);

    out.push({
      cat0: cat0 || "Brez kategorije",
      cat1: cellStr(row, "cat1") || "Brez podkategorije",
      cat2: cellStr(row, "cat2") || "Splošno",
      artikel: artikel || "(neznan izdelek)",
      opomba: cellStr(row, "opomba"),
      akcija: cellBool(row, "akcija"),
      trgovina: cellStr(row, "trgovina") || "?",
      cenaDisplay: cellStr(row, "cena"),
      cena: cellNum(row, "cena"),
      kolicina: cellNum(row, "kolicina"),
      enota: enotaVal,
      cenaEnotaDisplay: upi.display,
      cenaEnota: upi.value,
      unitLabel: upi.unitLabel
    });
  });
  return out;
}

// The sheet's "Cena/količino" column is always computed as (Cena/Količina)*1000.
// That's correct as-is when the unit is grams or millilitres (it becomes a
// per-kg / per-litre price) — it just needs the right label. For count-based
// units (kos, or anything else), a "per 1000" price isn't meaningful, so we
// divide back out to get the real per-piece price.
function unitPriceInfo(rawCenaEnota, enota) {
  const e = (enota || "").trim().toLowerCase();
  if (rawCenaEnota === null || rawCenaEnota === undefined || isNaN(rawCenaEnota)) {
    return { value: null, display: "", unitLabel: enota || "enoto" };
  }
  if (e === "g") return { value: rawCenaEnota, display: formatEUR(rawCenaEnota), unitLabel: "kg" };
  if (e === "ml" || e === "mL".toLowerCase()) return { value: rawCenaEnota, display: formatEUR(rawCenaEnota), unitLabel: "L" };
  const corrected = rawCenaEnota / 1000;
  return { value: corrected, display: formatEUR(corrected), unitLabel: enota || "enoto" };
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
function navSnapshot() {
  return { screen: state.screen, cat0: state.cat0, cat1: state.cat1, cat2: state.cat2 };
}
function navApply(s) {
  state.screen = s.screen;
  state.cat0 = s.cat0;
  state.cat1 = s.cat1;
  state.cat2 = s.cat2;
}
// Call before moving to a "deeper" screen (selecting a category, etc.)
function navPush() {
  navStack.push(navSnapshot());
  navForward = [];
}

function goHome() {
  state.screen = "home";
  state.cat0 = null;
  state.cat1 = null;
  state.cat2 = null;
  state.query = "";
  el.searchInput.value = "";
  navStack = [];
  navForward = [];
  render();
}
function goBack() {
  if (state.screen === "search") { goHome(); return; }
  if (navStack.length === 0) return; // already at the top
  navForward.push(navSnapshot());
  navApply(navStack.pop());
  render();
}
function goForwardNav() {
  if (navForward.length === 0) return; // nothing to redo
  navStack.push(navSnapshot());
  navApply(navForward.pop());
  render();
}

// ---- RENDER ----
function render() {
  updateChrome();
  if (state.screen === "home") renderHome();
  else if (state.screen === "cat1") renderCat1();
  else if (state.screen === "cat2") renderCat2();
  else if (state.screen === "articles") renderArticles();
  else if (state.screen === "search") renderSearch();
}

function updateChrome() {
  el.backBtn.hidden = state.screen === "home";
  el.searchWrap.hidden = state.screen !== "home";
  el.filterBar.hidden = state.screen !== "articles";
  el.priceBarWrap.hidden = state.screen !== "articles";

  if (state.screen === "home") {
    el.pageTitle.textContent = "Cene";
    el.crumb.textContent = "";
  } else if (state.screen === "cat1") {
    el.pageTitle.textContent = state.cat0;
    el.crumb.textContent = "";
  } else if (state.screen === "cat2") {
    el.pageTitle.textContent = state.cat1;
    el.crumb.textContent = state.cat0 + " › " + state.cat1;
  } else if (state.screen === "articles") {
    el.pageTitle.textContent = state.cat2;
    el.crumb.textContent = state.cat0 + " › " + state.cat1 + " › " + state.cat2;
  } else if (state.screen === "search") {
    el.pageTitle.textContent = "Iskanje";
    el.crumb.textContent = "";
  }

  if (state.screen === "articles") {
    el.sortFieldBtn.textContent = state.sortField === "unit" ? "€ / enoto" : "€ skupaj";
    el.sortFieldBtn.classList.add("active");
    el.sortDirBtn.textContent = state.sortDir === "asc" ? "↑ najcenejše" : "↓ najdražje";
    el.sortDirBtn.classList.add("active");
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
      navPush();
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
      navPush();
      state.cat1 = btn.dataset.cat1;
      state.screen = "cat2";
      render();
    });
  });
}

function renderCat2() {
  const groups = {};
  rows.filter((r) => r.cat0 === state.cat0 && r.cat1 === state.cat1).forEach((r) => {
    groups[r.cat2] = (groups[r.cat2] || 0) + 1;
  });
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, "sl"));

  el.content.innerHTML = `<div class="grid">` +
    names.map((n) => `
      <button class="tile" data-cat2="${escapeAttr(n)}">
        <span class="tile-name">${escapeHtml(n)}</span>
        <span class="tile-count">${groups[n]} izdelkov</span>
      </button>`).join("") +
    `</div>`;

  el.content.querySelectorAll(".tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      navPush();
      state.cat2 = btn.dataset.cat2;
      state.screen = "articles";
      // reset store filter selection for the new list, keep sort/promo prefs
      state.stores = new Set();
      render();
    });
  });
}

function renderArticles() {
  let list = rows.filter((r) => r.cat0 === state.cat0 && r.cat1 === state.cat1 && r.cat2 === state.cat2);
  renderPromoChips();
  renderStoreChips(list);
  list = applyFiltersAndSort(list);
  renderArticleList(list);
  renderPriceBarBottom(list);
}

function renderPromoChips() {
  const options = [
    { value: "all", label: "Vse" },
    { value: "promo", label: "🏷️" },
    { value: "nonpromo", label: "🚫" }
  ];
  el.promoChips.innerHTML =
    options.map((o) => `
      <button class="chip chip--toggle ${state.promoFilter === o.value ? "active" : ""}" data-promo="${o.value}">${o.label}</button>
    `).join("") +
    `<button id="couponBtn" class="chip chip--toggle ${state.sparCoupon ? "active" : ""}">Spar -10%</button>`;

  el.promoChips.querySelectorAll(".chip--toggle[data-promo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.promoFilter = btn.dataset.promo;
      render();
    });
  });
  el.promoChips.querySelector("#couponBtn").addEventListener("click", () => {
    state.sparCoupon = !state.sparCoupon;
    render();
  });
}

function renderSearch() {
  const q = norm(state.query);
  let list = rows.filter((r) =>
    norm(r.artikel).includes(q) || norm(r.trgovina).includes(q) || norm(r.cat1).includes(q) || norm(r.cat0).includes(q)
  );
  el.filterBar.hidden = true;
  el.content.innerHTML = `<div class="searchHint">${list.length} zadetkov</div>`;
  const listEl = document.createElement("div");
  list = list.slice().sort((a, b) => (priceValue(a, "cenaEnota") ?? Infinity) - (priceValue(b, "cenaEnota") ?? Infinity));
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

// Effective price after the Spar coupon (if active), for a given row/field.
// The coupon stacks on top of any existing promo discount already in Cena.
function priceValue(r, field) {
  const raw = r[field];
  if (raw === null || raw === undefined || isNaN(raw)) return null;
  if (state.sparCoupon && r.trgovina === "Spar") return raw * 0.9;
  return raw;
}

function applyFiltersAndSort(list) {
  if (state.promoFilter === "promo") list = list.filter((r) => r.akcija);
  else if (state.promoFilter === "nonpromo") list = list.filter((r) => !r.akcija);
  if (state.stores.size > 0) list = list.filter((r) => state.stores.has(r.trgovina));

  const field = state.sortField === "unit" ? "cenaEnota" : "cena";
  const dir = state.sortDir === "asc" ? 1 : -1;
  list = list.slice().sort((a, b) => {
    const av = priceValue(a, field) ?? Infinity;
    const bv = priceValue(b, field) ?? Infinity;
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

function renderPriceBarBottom(list) {
  if (!list.length) {
    el.priceBarWrap.innerHTML = "";
    return;
  }
  const field = state.sortField === "unit" ? "cenaEnota" : "cena";
  const fieldLabel = state.sortField === "unit" ? "€ / enoto" : "€ skupaj";
  const stats = priceStats(list, field);
  el.priceBarWrap.innerHTML = renderPriceBarHtml(stats, fieldLabel);
}

function priceStats(list, field) {
  const vals = list.map((r) => priceValue(r, field)).filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, avg, mid: (min + max) / 2, count: vals.length };
}

function formatEUR(v) {
  return "€" + v.toFixed(2).replace(".", ",");
}

function renderPriceBarHtml(stats, fieldLabel) {
  if (!stats) return "";
  const range = stats.max - stats.min;
  const avgPct = range > 0 ? ((stats.avg - stats.min) / range) * 100 : 50;

  return `
    <div class="priceBar">
      <div class="priceBar-title">Razpon cen · ${escapeHtml(fieldLabel)} <span class="priceBar-count">(${stats.count} ${stats.count === 1 ? "izdelek" : "izdelkov"})</span></div>
      <div class="priceBar-track">
        <div class="priceBar-midTick"></div>
        <div class="priceBar-avgLabel" style="left:${avgPct}%">povp. ${formatEUR(stats.avg)}</div>
        <div class="priceBar-avgDot" style="left:${avgPct}%"></div>
      </div>
      <div class="priceBar-endLabels">
        <span>${formatEUR(stats.min)}<br><small>najnižja</small></span>
        <span class="priceBar-midLabel">${formatEUR(stats.mid)}<br><small>sredina</small></span>
        <span>${formatEUR(stats.max)}<br><small>najvišja</small></span>
      </div>
    </div>`;
}

function articleRowHtml(r) {
  const qty = r.kolicina ? `${r.kolicina} ${r.enota}`.trim() : "";
  const isCoupon = state.sparCoupon && r.trgovina === "Spar";
  const discCena = isCoupon ? priceValue(r, "cena") : null;
  const discCenaEnota = isCoupon ? priceValue(r, "cenaEnota") : null;
  const unitLabel = r.unitLabel || r.enota || "enoto";

  return `
    <div class="article">
      <div class="article-main">
        <div class="article-name">${escapeHtml(r.artikel)}</div>
        <div class="article-sub">
          <span>${escapeHtml(r.trgovina)}</span>
          ${qty ? `<span>· ${escapeHtml(qty)}</span>` : ""}
          ${r.opomba ? `<span class="article-note">· ${escapeHtml(r.opomba)}</span>` : ""}
          ${r.akcija ? `<span class="promoTag">AKCIJA</span>` : ""}
          ${isCoupon ? `<span class="couponTag">KUPON -10%</span>` : ""}
        </div>
      </div>
      <div class="article-price">
        <div class="price-main ${isCoupon ? "price-main--struck" : ""}">${escapeHtml(r.cenaDisplay || "")}</div>
        ${discCena !== null ? `<div class="price-main price-discounted">${formatEUR(discCena)}</div>` : ""}
        ${r.cenaEnotaDisplay ? `<div class="price-unit ${isCoupon ? "price-unit--struck" : ""}">${escapeHtml(r.cenaEnotaDisplay)}/${escapeHtml(unitLabel)}</div>` : ""}
        ${discCenaEnota !== null ? `<div class="price-unit price-discounted-unit">${formatEUR(discCenaEnota)}/${escapeHtml(unitLabel)}</div>` : ""}
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
