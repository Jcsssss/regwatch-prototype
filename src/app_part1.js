/* ================= App logic ================= */
"use strict";
const COUNTRIES = [...COUNTRIES_1, ...COUNTRIES_2, ...COUNTRIES_3, ...COUNTRIES_4];
const byIso = Object.fromEntries(COUNTRIES.map(c => [c.iso, c]));

/* ---------- persisted demo state (localStorage) ---------- */
const LS_KEY = "regwatch-proto-v1";
let store = { overrides: {}, manual: [] };
try { const raw = localStorage.getItem(LS_KEY); if (raw) store = JSON.parse(raw); } catch (e) {}
store.overrides = store.overrides || {}; store.manual = store.manual || []; store.edits = store.edits || {};
function saveStore(){ try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }

let queue = WATCH_QUEUE.map(q => ({ ...q }));
(store.manual || []).forEach(m => queue.push({ ...m }));
queue.forEach(q => { const o = store.overrides[q.id]; if (o) Object.assign(q, o); });
/* apply saved manual record edits (field-level overrides of the imported data) */
function applyEdits(){
  Object.entries(store.edits).forEach(([iso, p]) => {
    const c = byIso[iso]; if (!c) return;
    Object.entries(p).forEach(([k, v]) => { if (k !== "removedQids" && k !== "editedOn") c[k] = v; });
  });
}
applyEdits();
/* apply validated items to country timelines */
function applyValidated(){
  queue.filter(q => q.status === "validated").forEach(q => {
    const c = byIso[q.iso]; if (!c) return;
    if (((store.edits[q.iso] || {}).removedQids || []).includes(q.id)) return;
    if (!c.timeline.some(t => t._qid === q.id) && !q.preloaded) {
      if (WATCH_QUEUE.some(w => w.id === q.id && w.status === "validated")) { q.preloaded = true; return; }
      c.timeline.push({ date: q.detected, text: q.title, _qid: q.id, added: true });
      c.timeline.sort((a, b) => a.date < b.date ? -1 : 1);
      if (q.validatedOn && q.validatedOn > c.lastUpdate) c.lastUpdate = q.validatedOn;
    }
  });
}
applyValidated();

/* ---------- role ---------- */
let role = store.role || "reader";
const roleSel = document.getElementById("roleSel");
roleSel.value = role;
roleSel.addEventListener("change", () => { role = roleSel.value; store.role = role; saveStore(); refreshBadge(); renderCurrent(); });

/* ---------- helpers ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmtDate = d => { if (!d) return "—"; const [y, m, dd] = d.split("-"); const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]; return `${+dd} ${M} ${y}`; };
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function lvlColor(l){ return cssVar("--m" + l); }
const LVL_SHORT = { 1: "Level 1 — preliminary work", 2: "Level 2 — bill in parliament", 3: "Level 3 — law approved, framework pending/provisional", 4: "Level 4 — law + final framework" };

/* tooltip */
const tip = document.getElementById("tip");
function showTip(html, x, y){
  tip.innerHTML = html; tip.style.opacity = "1";
  const r = tip.getBoundingClientRect();
  let px = x + 14, py = y + 14;
  if (px + r.width > innerWidth - 8) px = x - r.width - 12;
  if (py + r.height > innerHeight - 8) py = y - r.height - 12;
  tip.style.left = px + "px"; tip.style.top = py + "px";
}
function hideTip(){ tip.style.opacity = "0"; }

/* chips */
function inkOn(hex){ /* readable text colour for a given fill */
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#241a3d" : "#ffffff";
}
const lvlChip = c => { const f = lvlColor(c.maturity); return `<span class="chip lvl" style="background:${f};color:${inkOn(f)}">Level ${c.maturity}</span>`; };
const fwChip = c => `<span class="chip fw-${c.fw}">${FW_LABEL[c.fw]}</span>`;
const srcChip = t => t === "official" ? `<span class="chip src-official">Official</span>` : t === "manual" ? `<span class="chip src-manual">Manual — consultant input</span>` : `<span class="chip src-unofficial">Unofficial — verify</span>`;
const stChip = s => ({ pending: `<span class="chip st-pending">Pending validation</span>`, validated: `<span class="chip st-validated">Validated</span>`, rejected: `<span class="chip st-rejected">Rejected</span>` }[s] || "");

/* pending badge */
function refreshBadge(){
  const n = queue.filter(q => q.status === "pending").length;
  const b = document.getElementById("pendingBadge");
  b.textContent = n;
  b.hidden = !(role === "validator" && n > 0);
}

/* ---------- routing ---------- */
const VIEWS = ["overview", "countries", "country", "inbox", "insights", "sources"];
let currentRoute = { v: "overview", arg: null };
function parseHash(){
  const h = (location.hash || "#/overview").replace(/^#\//, "");
  const [v, arg] = h.split("/");
  return VIEWS.includes(v) ? { v, arg } : { v: "overview", arg: null };
}
function renderCurrent(){ route(currentRoute.v, currentRoute.arg, true); }
function route(v, arg, force){
  currentRoute = { v, arg };
  VIEWS.forEach(x => $("#v-" + x).classList.toggle("on", x === v));
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === v || (v === "country" && a.dataset.v === "countries")));
  ({ overview: renderOverview, countries: renderCountries, country: () => renderCountry(arg), inbox: renderInbox, insights: renderInsights, sources: renderSources })[v]();
  if (!force) window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", () => { const r = parseHash(); route(r.v, r.arg); });

/* theme change → re-render (map/charts use resolved colors) */
new MutationObserver(() => renderCurrent()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderCurrent());

/* ---------- KPIs ---------- */
function kpis(){
  const eu = COUNTRIES.filter(c => c.eu);
  const transposed = eu.filter(c => c.transposed);
  const onTime = eu.filter(c => c.onTime);
  const late = eu.filter(c => c.transposed && !c.onTime && c.delayMonths != null);
  const avgDelay = late.length ? Math.round(late.reduce((s, c) => s + c.delayMonths, 0) / late.length) : 0;
  const fwFinal = eu.filter(c => c.fw === "final").length;
  const fwTemp = eu.filter(c => c.fw === "temporary").length;
  const fwNone = eu.filter(c => c.fw === "none").length;
  return { eu: eu.length, transposed: transposed.length, onTime: onTime.length, late: late.length, avgDelay, fwFinal, fwTemp, fwNone };
}

/* ---------- Overview ---------- */
function renderOverview(){
  const k = kpis();
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  COUNTRIES.forEach(c => counts[c.maturity]++);
  const el = $("#v-overview");
  el.innerHTML = `
  <h1 class="pg">NIS 2 transposition across Europe</h1>
  <p class="pg-sub">EU-27 plus the United Kingdom and Norway. Every figure below is computed from validated country records; click a country on the map or in the list to open its full record.</p>
  <div class="tiles">
    <div class="tile"><div class="v">${k.transposed}<small> / ${k.eu}</small></div><div class="s">EU members with a transposition law adopted</div></div>
    <div class="tile"><div class="v">${k.onTime}<small> / ${k.eu}</small></div><div class="s">Transposed on time (17 Oct 2024)</div></div>
    <div class="tile"><div class="v">~${k.avgDelay}<small> months</small></div><div class="s">Average delay of late transposers</div></div>
    <div class="tile"><div class="v">${k.fwFinal}<small> final</small> · ${k.fwTemp}<small> temp.</small> · ${k.fwNone}<small> none</small></div><div class="s">Cybersecurity frameworks (EU-27)</div></div>
  </div>
  <div class="grid-ov">
    <div class="card">
      <div class="cap"><h2>Transposition maturity map</h2><button class="btn" id="expMap">Export PNG</button></div>
      <div class="bd">
        <div class="map-wrap" id="mapHost"></div>
        <div class="map-legend" id="mapLegend"></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><div class="cap"><h2>Latest validated updates</h2></div><div class="bd"><div class="feed" id="feed"></div></div></div>
      <div class="card"><div class="cap"><h2>Maturity levels</h2></div><div class="bd" id="lvlHelp"></div></div>
    </div>
  </div>`;
  drawMap($("#mapHost"), $("#mapLegend"), counts);
  /* feed: last validated events across countries */
  const events = [];
  COUNTRIES.forEach(c => c.timeline.forEach(t => events.push({ ...t, c })));
  events.sort((a, b) => b.date < a.date ? -1 : 1);
  $("#feed").innerHTML = events.slice(0, 7).map(e => `
    <div class="feed-it"><div class="d">${fmtDate(e.date)}</div>
      <div class="t"><span class="c">${e.c.flag} ${esc(e.c.name)}</span> — ${esc(e.text)}</div></div>`).join("");
  $("#lvlHelp").innerHTML = [4, 3, 2, 1].map(l => `
    <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px">
      <span class="leg-sw" style="background:${lvlColor(l)};margin-top:3px"></span>
      <div style="font-size:12.5px;color:var(--ink2)"><b style="color:var(--ink)">Level ${l}</b> — ${esc(LEVELS[l].label)} <span style="color:var(--muted)">(${counts[l]} countries)</span></div>
    </div>`).join("");
  $("#expMap").addEventListener("click", exportMapPNG);
}

/* ---------- Map ---------- */
const SMALL = ["MT", "LU", "CY"];
function drawMap(host, legendHost, counts){
  let svg = `<svg id="euromap" viewBox="${MAP_DATA.viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of Europe coloured by NIS 2 transposition maturity level">`;
  svg += `<rect x="-2000" y="-2000" width="6000" height="6000" fill="${cssVar('--surface')}"/>`;
  const stroke = cssVar("--map-stroke");
  for (const [iso, d] of Object.entries(MAP_DATA.paths)) {
    const c = byIso[iso];
    const fill = c ? lvlColor(c.maturity) : cssVar("--untracked");
    svg += `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.7" stroke-linejoin="round" ${c ? `class="ctry" data-iso="${iso}" tabindex="0" aria-label="${esc(c.name)}, level ${c.maturity}"` : ""}></path>`;
  }
  svg += `</svg>`;
  host.innerHTML = svg;
  const svgEl = $("#euromap", host);
  /* small-country markers */
  SMALL.forEach(iso => {
    const p = svgEl.querySelector(`path[data-iso="${iso}"]`); if (!p) return;
    let b; try { b = p.getBBox(); } catch (e) { return; }
    if (!b || !b.width) return;
    const c = byIso[iso];
    const ci = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ci.setAttribute("cx", b.x + b.width / 2); ci.setAttribute("cy", b.y + b.height / 2);
    ci.setAttribute("r", 7); ci.setAttribute("fill", lvlColor(c.maturity));
    ci.setAttribute("stroke", cssVar("--map-stroke")); ci.setAttribute("stroke-width", "1.4");
    ci.setAttribute("class", "ctry"); ci.setAttribute("data-iso", iso);
    svgEl.appendChild(ci);
  });
  svgEl.addEventListener("mousemove", e => {
    const t = e.target.closest(".ctry");
    if (!t) { hideTip(); return; }
    const c = byIso[t.dataset.iso];
    showTip(`<b>${c.flag} ${esc(c.name)}${c.eu ? "" : " (non-EU)"}</b><span class="m">${esc(LVL_SHORT[c.maturity])}</span><br>${esc(c.summary)}<br><span class="m">Last update ${fmtDate(c.lastUpdate)}</span>`, e.clientX, e.clientY);
  });
  svgEl.addEventListener("mouseleave", hideTip);
  svgEl.addEventListener("click", e => {
    const t = e.target.closest(".ctry");
    if (t) { hideTip(); location.hash = "#/country/" + t.dataset.iso; }
  });
  svgEl.addEventListener("keydown", e => {
    const t = e.target.closest(".ctry");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = "#/country/" + t.dataset.iso; }
  });
  if (legendHost) legendHost.innerHTML =
    [1, 2, 3, 4].map(l => `<span class="leg-it"><span class="leg-sw" style="background:${lvlColor(l)}"></span>Level ${l} <span class="n">(${counts[l]})</span></span>`).join("") +
    `<span class="leg-it"><span class="leg-sw" style="background:${cssVar('--untracked')}"></span>Not tracked</span>`;
}

function exportMapPNG(){
  const svgEl = $("#euromap");
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("width", 1500);
  const vb = clone.getAttribute("viewBox").split(" ").map(Number);
  clone.setAttribute("height", Math.round(1500 * vb[3] / vb[2]));
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = 1500; cv.height = Math.round(1500 * vb[3] / vb[2]);
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.download = "regwatch-nis2-map.png";
    a.href = cv.toDataURL("image/png");
    a.click();
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
}
