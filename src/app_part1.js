/* ================= App logic ================= */
"use strict";
/* Filled by regApply() once the store is read: which records these are depends
   on the active regulation, and every view reads them by name. */
let COUNTRIES = [];
let byIso = {};

/* ---------- persisted demo state (localStorage) ---------- */
const LS_KEY = "regwatch-proto-v1";
let store = { overrides: {}, manual: [] };
try { const raw = localStorage.getItem(LS_KEY); if (raw) store = JSON.parse(raw); } catch (e) {}
store.overrides = store.overrides || {}; store.manual = store.manual || [];
store.sources = store.sources || [];
delete store.edits; /* country records are read-only: the SharePoint workbook is the source of truth */
function saveStore(){ try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }

/* Real agent output (src/data_watch.js, generated) when the build included it,
   otherwise the demo queue shipped in data_c4.js. */
const WATCH_SOURCE = typeof WATCH_QUEUE_AGENT !== "undefined" ? WATCH_QUEUE_AGENT : WATCH_QUEUE;
let queue = WATCH_SOURCE.map(q => ({ ...q }));
(store.manual || []).forEach(m => queue.push({ ...m }));
queue.forEach(q => { const o = store.overrides[q.id]; if (o) Object.assign(q, o); });
/* apply validated items to country timelines */
function applyValidated(){
  /* Watch items belong to the regulation that produced them - REC has no agent
     yet, so nothing is grafted onto its timelines. */
  if (regId() !== "nis2") return;
  queue.filter(q => q.status === "validated").forEach(q => {
    const c = byIso[q.iso]; if (!c) return;
    if (!c.timeline.some(t => t._qid === q.id) && !q.preloaded) {
      if (WATCH_SOURCE.some(w => w.id === q.id && w.status === "validated")) { q.preloaded = true; return; }
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
/* Le rôle vient du navigateur, et la version client ne propose pas les mêmes
   que la version équipe : quelqu'un qui a ouvert l'une puis l'autre garde un
   rôle qui n'existe plus ici. Le laisser tel quel affichait une page blanche.
   On retombe sur le rôle le plus restreint, qui est toujours proposé. */
if (!roleSel.querySelector(`[value="${role}"]`)) { role = "reader"; store.role = role; }
roleSel.value = role;
initLang();
document.querySelectorAll(".lang-switch button").forEach(b => {
  b.addEventListener("click", () => setLang(b.dataset.lang));
});
roleSel.addEventListener("change", () => {
  role = roleSel.value; store.role = role; saveStore();
  /* Un onglet qui n'appartient pas au rôle courant ne doit ni rester visible -
     ce serait inviter un clic qui ne peut pas aboutir - ni rester affiché sous
     les yeux de celui qui vient de changer de rôle : la vue resterait à l'écran
     alors que plus aucun onglet ne la désigne. Le test passe par regHasTab()
     plutôt que par une liste d'onglets, sinon chaque nouvelle règle de
     visibilité devrait être répétée ici. La fiche pays fait exception : elle
     n'est l'onglet de personne, et tous les rôles la lisent. */
  regSyncTabs();
  if (currentRoute.v !== "country" && !regHasTab(currentRoute.v)) { location.hash = "#/overview"; return; }
  refreshBadge(); renderCurrent();
});

/* ---------- la roue crantée : l'onglet Diagnostic ----------
 *
 * Le diagnostic sert une fois - au moment où l'on signale un problème - et se
 * regarde le reste du temps sans y toucher. Un sixième onglet permanent pour
 * cela déplace tous les autres et laisse croire à une rubrique de travail. Il
 * est donc replié derrière une roue crantée à côté du rôle : absent tant qu'on
 * ne la presse pas, et alors ouvert directement, pour que le clic ait un effet
 * visible plutôt que de faire apparaître un onglet de plus quelque part.
 *
 * L'état est mémorisé comme le rôle et la langue : sans cela, recharger la page
 * depuis l'onglet Diagnostic le refermait sous les pieds de celui qui venait de
 * l'ouvrir - exactement ce que regHasTab() a déjà eu à corriger une fois.
 *
 * Le bouton n'existe que dans la version équipe (bloc DEV du squelette) ; dans
 * la version client, diagOn() répond simplement toujours non.
 */
let diagShown = store.diag === true;
function diagOn(){ return diagShown; }
const diagGear = document.getElementById("diagGear");
if (diagGear) {
  const syncGear = () => diagGear.setAttribute("aria-pressed", String(diagShown));
  syncGear();
  diagGear.addEventListener("click", () => {
    diagShown = !diagShown; store.diag = diagShown; saveStore();
    syncGear(); regSyncTabs();
    /* Refermer en restant sur la vue laisserait un écran que plus aucun onglet
       ne désigne ; l'ouvrir sans y aller laisserait le clic sans réponse. */
    location.hash = diagShown ? "#/dev"
      : (currentRoute.v === "dev" ? "#/overview" : location.hash);
  });
}

/* ---------- helpers ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmtDate = d => { if (!d) return "-"; const [y, m, dd] = d.split("-"); const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]; return `${+dd} ${M} ${y}`; };
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function lvlColor(l){ return cssVar("--m" + l); }

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
/* A generated timeline entry carries a key rather than a sentence: the
   interface is bilingual and nothing generated should arrive pre-written in
   one language. Hand-written entries still carry their own text. */
const evText = ev => ev.textKey ? t(ev.textKey) : (ev.text || "");
const lvlChip = c => { const f = lvlColor(c.maturity); return `<span class="chip lvl" style="background:${f};color:${inkOn(f)}">${t("common.level")} ${c.maturity}</span>`; };
const fwChip = c => `<span class="chip fw-${c.fw}">${t("fw." + c.fw)}</span>`;
/* Le paramètre s'appelait `t` : il masquait la fonction de traduction, ce qui
   rendait ces deux puces intraduisibles sans qu'aucune clé ne manque. */
const srcChip = kind => kind === "official" ? `<span class="chip src-official">${t("chip.official")}</span>`
  : kind === "manual" ? `<span class="chip src-manual">${t("chip.manual")}</span>`
  : `<span class="chip src-unofficial">${t("chip.unofficial")}</span>`;
const stChip = s => ({ pending: `<span class="chip st-pending">${t("chip.pending")}</span>`,
  validated: `<span class="chip st-validated">${t("chip.validated")}</span>`,
  rejected: `<span class="chip st-rejected">${t("chip.rejected")}</span>` }[s] || "");

/* pending badge */
function refreshBadge(){
  const n = queue.filter(q => q.status === "pending").length;
  const b = document.getElementById("pendingBadge");
  b.textContent = n;
  b.hidden = !(role === "validator" && n > 0);
}

/* ---------- routing ---------- */
const VIEWS = ["overview", "countries", "country", "inbox", "insights", "sources",
               "dev", "devchat"];
let currentRoute = { v: "overview", arg: null };
function parseHash(){
  const h = (location.hash || "#/overview").replace(/^#\//, "");
  const [v, arg] = h.split("/");
  return VIEWS.includes(v) ? { v, arg } : { v: "overview", arg: null };
}
function renderCurrent(){ route(currentRoute.v, currentRoute.arg, true); }
function route(v, arg, force){
  const render = {
    overview: renderOverview, countries: renderCountries,
    country: () => renderCountry(arg), inbox: renderInbox,
    insights: renderInsights, sources: renderSources,
    /* Absents de la version client : le rendu comme la vue. */
    dev: typeof renderDev === "function" ? renderDev : null,
    devchat: typeof renderDevChat === "function" ? renderDevChat : null,
  };
  /* Une vue qui n'existe pas dans cette version - un lien partagé, un signet,
     un stockage venu de l'autre version - ramène à l'accueil plutôt que de
     laisser l'écran vide sur une exception. */
  if (!render[v] || !$("#v-" + v)) { v = "overview"; arg = null; }
  currentRoute = { v, arg };
  VIEWS.forEach(x => { const el = $("#v-" + x); if (el) el.classList.toggle("on", x === v); });
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === v || (v === "country" && a.dataset.v === "countries")));
  render[v]();
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
  const spec = regSpec();
  /* The tiles are the regulation's own headline numbers. NIS 2 counts lateness
     against a deadline it has passed; REC's question at this stage is how far
     each country has got, so it counts levels instead. Reusing the NIS 2 tiles
     would have shown "0 on time" for 27 countries and meant nothing. */
  const tiles = regId() === "nis2" ? `
    <div class="tile"><div class="v">${k.transposed}<small> / ${k.eu}</small></div><div class="s">${t("ov.tileTransposed")}</div></div>
    <div class="tile"><div class="v">${k.onTime}<small> / ${k.eu}</small></div><div class="s">${t("ov.tileOnTime")}</div></div>
    <div class="tile"><div class="v">≈&nbsp;${k.avgDelay}<small> ${t("common.months")}</small></div><div class="s">${t("ov.tileDelay")}</div></div>
    <div class="tile"><div class="v">${k.fwFinal}<small> ${t("ov.sFinal")}</small> · ${k.fwTemp}<small> ${t("ov.sTemp")}</small> · ${k.fwNone}<small> ${t("ov.sNone")}</small></div><div class="s">${t("ov.tileFw")}</div></div>` : `
    <div class="tile"><div class="v">${counts[4]}<small> / ${COUNTRIES.length}</small></div><div class="s">${t("ov.recAdopted")}</div></div>
    <div class="tile"><div class="v">${counts[3]}</div><div class="s">${t("ov.recInParliament")}</div></div>
    <div class="tile"><div class="v">${counts[1] + counts[2]}</div><div class="s">${t("ov.recEarly")}</div></div>
    <div class="tile"><div class="v">${COUNTRIES.filter(c => c.lawInForce).length}<small> / ${COUNTRIES.length}</small></div><div class="s">${t("ov.recInForce")}</div></div>`;

  el.innerHTML = `
  <h1 class="pg">${t(spec.titleKey)}</h1>
  <p class="pg-sub">${t(spec.subKey)}</p>
  ${spec.caveat ? `<div class="rolenote">${t(spec.caveat)}</div>` : ""}
  <div class="tiles">${tiles}</div>
  <div class="grid-ov">
    <div class="card">
      <div class="cap"><h2>${t("ov.map")}</h2><button class="btn" id="expMap">${t("ov.exportPng")}</button></div>
      <div class="bd">
        <div class="map-wrap" id="mapHost"></div>
        <div class="map-legend" id="mapLegend"></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><div class="cap"><h2>${t("ov.latest")}</h2></div><div class="bd"><div class="feed" id="feed"></div></div></div>
      <div class="card"><div class="cap"><h2>${t("ov.levels")}</h2></div><div class="bd" id="lvlHelp"></div></div>
    </div>
  </div>`;
  drawMap($("#mapHost"), $("#mapLegend"), counts);
  /* feed: last validated events across countries */
  const events = [];
  COUNTRIES.forEach(c => c.timeline.forEach(t => events.push({ ...t, c })));
  events.sort((a, b) => b.date < a.date ? -1 : 1);
  $("#feed").innerHTML = events.slice(0, 7).map(e => `
    <div class="feed-it"><div class="d">${fmtDate(e.date)}</div>
      <div class="t"><span class="c"><i class="fi">${flagSvg(e.c.iso)}</i> ${esc(e.c.name)}</span> - ${esc(evText(e))}</div></div>`).join("");
  $("#lvlHelp").innerHTML = [4, 3, 2, 1].map(l => `
    <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px">
      <span class="leg-sw" style="background:${lvlColor(l)};margin-top:3px"></span>
      <div style="font-size:12.5px;color:var(--ink2)"><b style="color:var(--ink)">${t("common.level")} ${l}</b> - ${esc(regLevelLabel(l))} <span style="color:var(--muted)">(${counts[l]} ${t("common.countries")})</span></div>
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
    showTip(`<b>${c.flag} ${esc(c.name)}${c.eu ? "" : " (non-EU)"}</b><span class="m">${esc(regLevelLabel(c.maturity))}</span><br>${esc(c.summary)}<br><span class="m">${t("map.lastUpdate")} ${fmtDate(c.lastUpdate)}</span>`, e.clientX, e.clientY);
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
    [1, 2, 3, 4].map(l => `<span class="leg-it"><span class="leg-sw" style="background:${lvlColor(l)}"></span>${t("common.level")} ${l} <span class="n">(${counts[l]})</span></span>`).join("") +
    `<span class="leg-it"><span class="leg-sw" style="background:${cssVar('--untracked')}"></span>${t("map.notTracked")}</span>`;
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
