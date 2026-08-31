/* ================= Configurable KPI dashboard =================
 *
 * The workbook's KPI sheet is a tidy table: one row per country per indicator.
 * This turns it into a board a consultant composes - pick indicators, add them
 * as panels, filter the whole board at once, export.
 *
 * Chart form follows the indicator's type, never the other way round:
 *   numeric      a ranked bar of countries (or of group averages)
 *   boolean      how many countries answer yes / no
 *   categorical  how many countries fall in each value
 * Grouping by region or maturity turns any of them into stacked/grouped bars.
 *
 * Panels sit side by side in a grid and are drawn at half width by default: two
 * or three charts read together tell the story one big chart cannot, and a
 * panel that needs the room can be widened on its own.
 *
 * Palette: four hues, validated with the dataviz palette checker in both light
 * and dark mode (lightness band, chroma floor, CVD separation, normal-vision
 * floor, contrast). Six hues could not clear CVD separation in the narrow dark
 * band, so the board folds anything beyond four into "Other" rather than
 * inventing a fifth colour.
 */
"use strict";

const KPI_LIGHT = ["#5b34e0", "#0d9c55", "#3b82c4", "#b8860b"];
const KPI_DARK  = ["#7c5cf0", "#12a75f", "#4a95d0", "#b8892a"];
const KPI_MAX_SERIES = 4;
const KPI_TOP = 12;   /* rows shown before a panel offers "show every country" */

function kpiPalette(){
  const dark = matchMedia("(prefers-color-scheme: dark)").matches
    || document.documentElement.dataset.theme === "dark";
  return (document.documentElement.dataset.theme === "light") ? KPI_LIGHT
       : dark ? KPI_DARK : KPI_LIGHT;
}

/* Indicators offered as ready-made examples. High coverage, one per workbook
   tab, and a mix of types - the point is to show what the board can draw, so a
   consultant recognises the shape they want instead of reading 33 names. */
const KPI_SUGGESTED = [
  "Maturity Level",
  "Exceeded time from EU deadline (month)",
  "Type of national text",
  "Cybersecurity framework directives published",
  "Number of private sectors added",
  "Types of registration",
  "Method for incident reporting",
  "Organism in charge of the audit",
  "Number of cyber requirements for EE",
  "Registration availability"
];

/* ---------- state, persisted so a board survives a reload ---------- */

function kpiState(){
  const s = store.kpi || (store.kpi = {});
  if (!Array.isArray(s.panels) || !s.panels.length) {
    /* A board that opens empty teaches nothing. These three are the questions
       the workbook is most often asked. */
    s.panels = [
      { kpi: "Maturity Level", group: "region" },
      { kpi: "Exceeded time from EU deadline (month)", group: "" },
      { kpi: "Transposition finalized", group: "maturity" }
    ];
  }
  s.region = s.region || "";
  s.maturity = s.maturity || "";
  s.table = !!s.table;
  return s;
}

function kpiRowsFor(name){
  const s = kpiState();
  return KPI_ROWS.filter(r => r.kpi === name)
    .filter(r => !s.region || r.region === s.region)
    .filter(r => !s.maturity || String(r.maturity) === String(s.maturity));
}

const kpiNum = v => { const m = /^-?\d+(?:[.,]\d+)?$/.exec(String(v).trim()); return m ? parseFloat(m[0].replace(",", ".")) : null; };
const kpiGroupOf = (r, by) => by === "region" ? (r.region || "-")
                            : by === "maturity" ? "Level " + (r.maturity ?? "-")
                            : "";

/* ---------- SVG helpers ---------- */

const kpiEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function kpiTip(text){
  return ` data-tip="${kpiEsc(text)}"`;
}

/* Three sizes, one geometry table. A half-width panel keeps the same marks and
   the same type sizes as a full-width one - it just carries fewer pixels of
   plot - so nothing has to be re-read at a different scale. */
const KPI_GEOM = {
  wide:    { W: 720, rowH: 26, padL: 148, padR: 54, grid: true,  minW: 560 },
  compact: { W: 520, rowH: 24, padL: 118, padR: 46, grid: true,  minW: 380 },
  mini:    { W: 270, rowH: 17, padL: 92,  padR: 34, grid: false, minW: 0 }
};

/* A ranked horizontal bar chart. One series, single hue: magnitude, not identity. */
function kpiBarChart(items, opts){
  const o = Object.assign({ unit: "", size: "compact", colour: kpiPalette()[0] }, opts || {});
  const g = KPI_GEOM[o.size];
  if (!items.length) return `<p class="q-note">${t("kpi.noData")}</p>`;
  const padT = 6;
  const W = g.W, H = padT + items.length * g.rowH + (g.grid ? 8 : 2);
  const max = Math.max(...items.map(i => i.value), 1);
  const x = v => g.padL + (W - g.padL - g.padR) * (v / (max || 1));

  let svg = `<svg class="kpi-svg" style="min-width:${g.minW}px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img">`;
  if (g.grid) {
    /* recessive gridlines */
    for (let k = 0; k <= 4; k++) {
      const gx = g.padL + (W - g.padL - g.padR) * (k / 4);
      svg += `<line x1="${gx}" y1="${padT}" x2="${gx}" y2="${H - 8}" class="kpi-grid"/>`;
      svg += `<text x="${gx}" y="${H - 1}" class="kpi-axis" text-anchor="middle">${Math.round(max * k / 4)}</text>`;
    }
  }
  items.forEach((it, i) => {
    const y = padT + i * g.rowH;
    const w = Math.max(2, x(it.value) - g.padL);
    svg += `<text x="${g.padL - 8}" y="${y + g.rowH / 2 + 2}" class="kpi-lbl" text-anchor="end">${kpiEsc(it.label)}</text>`;
    /* 4px rounded data-end, anchored to the baseline; 2px gap between bars */
    svg += `<rect x="${g.padL}" y="${y + 3}" width="${w}" height="${g.rowH - 8}" rx="4"
             fill="${o.colour}"${kpiTip(it.label + " : " + it.value + (o.unit ? " " + o.unit : ""))}/>`;
    svg += `<text x="${g.padL + w + 6}" y="${y + g.rowH / 2 + 2}" class="kpi-val">${it.value}${o.unit ? " " + o.unit : ""}</text>`;
  });
  return svg + `</svg>`;
}

/* Stacked horizontal bars: one bar per group, segments = the indicator's values. */
function kpiStackChart(groups, keys, opts){
  const pal = kpiPalette();
  const o = Object.assign({ size: "compact" }, opts || {});
  const g = KPI_GEOM[o.size];
  if (!groups.length) return `<p class="q-note">${t("kpi.noData")}</p>`;
  const rowH = g.rowH + 8, padT = 4;
  const W = g.W, H = padT + groups.length * rowH + 6;
  const max = Math.max(...groups.map(x => x.total), 1);
  const span = W - g.padL - g.padR;

  let svg = `<svg class="kpi-svg" style="min-width:${g.minW}px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img">`;
  groups.forEach((grp, i) => {
    const y = padT + i * rowH;
    svg += `<text x="${g.padL - 8}" y="${y + rowH / 2 + 3}" class="kpi-lbl" text-anchor="end">${kpiEsc(grp.label)}</text>`;
    let cx = g.padL;
    keys.forEach((k, ki) => {
      const n = grp.counts[k] || 0;
      if (!n) return;
      const w = span * (n / max);
      /* 2px surface gap between segments so adjacent fills never touch */
      svg += `<rect x="${cx}" y="${y + 6}" width="${Math.max(2, w - 2)}" height="${rowH - 16}" rx="4"
               fill="${pal[ki % pal.length]}"${kpiTip(grp.label + " - " + k + " : " + n)}/>`;
      if (w > 26) svg += `<text x="${cx + w / 2 - 1}" y="${y + rowH / 2 + 3}" class="kpi-seg">${n}</text>`;
      cx += w;
    });
    /* The trailing total only earns its place when the bar has more than one
       segment; otherwise it repeats the number already inside it. */
    const segs = keys.filter(k => grp.counts[k]).length;
    if (segs > 1) svg += `<text x="${cx + 6}" y="${y + rowH / 2 + 3}" class="kpi-val">${grp.total}</text>`;
  });
  return svg + `</svg>`;
}

function kpiLegend(keys){
  const pal = kpiPalette();
  return `<div class="kpi-legend">${keys.map((k, i) =>
    `<span class="kpi-leg"><span class="sw" style="background:${pal[i % pal.length]}"></span>${kpiEsc(k)}</span>`
  ).join("")}</div>`;
}

/* ---------- dropdowns that always drop down ----------
 *
 * A native <select> puts its menu wherever the browser likes - near the top of
 * the page that means over the control, hiding the filter row the person just
 * used. These are a button plus a panel positioned under it, so the list opens
 * downward every time, and the long indicator list gets a search box.
 */

const KPI_DD = {};   /* dropdown id -> callback(value) */

function kpiDD(id, current, groups, opts){
  const o = Object.assign({ search: false, label: "", cls: "" }, opts || {});
  const items = [];
  groups.forEach(g => {
    if (g.g) items.push(`<div class="dd-g">${kpiEsc(g.g)}</div>`);
    g.items.forEach(it => items.push(
      `<button type="button" class="dd-o${it.v === current ? " on" : ""}" role="option"
        aria-selected="${it.v === current}" data-v="${kpiEsc(it.v)}">${kpiEsc(it.l)}</button>`));
  });
  const flat = groups.reduce((a, g) => a.concat(g.items), []);
  const cur = flat.find(i => i.v === current);
  return `<div class="dd ${o.cls}" data-dd="${kpiEsc(id)}">
    <button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false"
      ${o.label ? `aria-label="${kpiEsc(o.label)}"` : ""}><span>${kpiEsc(cur ? cur.l : (o.label || ""))}</span><i class="dd-car">▾</i></button>
    <div class="dd-pop" hidden>
      ${o.search ? `<input type="search" class="dd-q" placeholder="${t("kpi.search")}" aria-label="${t("kpi.search")}">` : ""}
      <div class="dd-list" role="listbox">${items.join("")}</div>
    </div>
  </div>`;
}

function kpiCloseDD(){
  document.querySelectorAll(".dd-pop").forEach(p => {
    if (p.hidden) return;
    p.hidden = true;
    const b = p.parentElement.querySelector(".dd-btn");
    if (b) b.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", kpiCloseDD);
document.addEventListener("keydown", e => { if (e.key === "Escape") kpiCloseDD(); });

function kpiWireDD(root){
  root.querySelectorAll(".dd").forEach(dd => {
    const btn = dd.querySelector(".dd-btn"), pop = dd.querySelector(".dd-pop");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const wasOpen = !pop.hidden;
      kpiCloseDD();
      if (wasOpen) return;
      pop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      const q = pop.querySelector(".dd-q");
      if (q) { q.value = ""; q.dispatchEvent(new Event("input")); q.focus(); }
      const on = pop.querySelector(".dd-o.on");
      if (on) on.scrollIntoView({ block: "nearest" });
    });
    pop.addEventListener("click", e => e.stopPropagation());
    const q = pop.querySelector(".dd-q");
    if (q) q.addEventListener("input", () => {
      const needle = q.value.trim().toLowerCase();
      pop.querySelectorAll(".dd-o").forEach(o => {
        o.hidden = !!needle && !o.textContent.toLowerCase().includes(needle);
      });
      /* A group heading with nothing left under it is noise. */
      pop.querySelectorAll(".dd-g").forEach(g => {
        let n = g.nextElementSibling, any = false;
        while (n && n.classList.contains("dd-o")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
        g.hidden = !any;
      });
    });
    pop.querySelectorAll(".dd-o").forEach(o => o.addEventListener("click", () => {
      kpiCloseDD();
      const cb = KPI_DD[dd.dataset.dd];
      if (cb) cb(o.dataset.v);
    }));
  });
}

/* ---------- shaping: an indicator -> categories, series, table ---------- */

/* One shape used by the on-screen chart, the table and the Excel export, so the
   three can never drift apart. */
function kpiShape(panel){
  const meta = KPI_CATALOGUE.find(k => k.kpi === panel.kpi);
  if (!meta) return null;
  const all = kpiRowsFor(panel.kpi);
  const rows = all.filter(r => r.value);
  const groupBy = panel.group || "";
  const pal = kpiPalette();

  if (meta.type === "numeric") {
    let items;
    if (groupBy) {
      /* Average per group - a mean of two countries is not a fact, so the count
         travels with it in the label. */
      const acc = {};
      rows.forEach(r => {
        const v = kpiNum(r.value); if (v === null) return;
        const g = kpiGroupOf(r, groupBy);
        (acc[g] = acc[g] || []).push(v);
      });
      items = Object.keys(acc).map(g => ({
        label: g + " (" + acc[g].length + ")",
        value: Math.round(acc[g].reduce((a, b) => a + b, 0) / acc[g].length * 10) / 10
      }));
    } else {
      items = rows.map(r => ({ label: r.country, value: kpiNum(r.value) })).filter(i => i.value !== null);
    }
    items.sort((a, b) => b.value - a.value);
    const seriesName = groupBy ? t("kpi.average") : panel.kpi;
    return {
      meta, kind: "bar", items, known: rows.length, total: all.length,
      /* The column header and the chart's series name are the same string, so
         Excel still names the series correctly after a refresh. */
      keys: [seriesName],
      head: [groupBy ? t("kpi.group") : t("kpi.country"), seriesName],
      table: items.map(i => [i.label, i.value]),
      series: [{ name: seriesName, colour: pal[0], values: items.map(i => i.value) }],
      categories: items.map(i => i.label)
    };
  }

  const counts = {};
  rows.forEach(r => { counts[r.value] = (counts[r.value] || 0) + 1; });
  let keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  let fold = null;
  if (keys.length > KPI_MAX_SERIES) {
    fold = keys.slice(KPI_MAX_SERIES - 1);
    keys = keys.slice(0, KPI_MAX_SERIES - 1).concat([t("kpi.other")]);
  }
  const bucket = v => (fold && fold.includes(v)) ? t("kpi.other") : v;

  const groups = {};
  rows.forEach(r => {
    const g = groupBy ? kpiGroupOf(r, groupBy) : t("kpi.allCountries");
    const e = groups[g] || (groups[g] = { label: g, counts: {}, total: 0 });
    const k = bucket(r.value);
    e.counts[k] = (e.counts[k] || 0) + 1; e.total++;
  });
  const list = Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  return {
    meta, kind: "stack", groups: list, keys, known: rows.length, total: all.length,
    head: [t("kpi.group")].concat(keys),
    table: list.map(g => [g.label].concat(keys.map(k => g.counts[k] || 0))),
    series: keys.map((k, i) => ({ name: k, colour: pal[i % pal.length], values: list.map(g => g.counts[k] || 0) })),
    categories: list.map(g => g.label)
  };
}

/* ---------- one panel ---------- */

function kpiPanel(panel, index){
  const sh = kpiShape(panel);
  if (!sh) return "";
  const s = kpiState();
  const size = panel.wide ? "wide" : "compact";
  const groupBy = panel.group || "";

  let chart = "", legend = "", more = "";
  if (sh.kind === "bar") {
    const capped = !panel.all && sh.items.length > KPI_TOP;
    chart = kpiBarChart(capped ? sh.items.slice(0, KPI_TOP) : sh.items, { size });
    if (sh.items.length > KPI_TOP) {
      more = `<button class="btn lnk kpi-all" data-panel="${index}" type="button">${
        capped ? t("kpi.showAll", { n: sh.items.length }) : t("kpi.showTop", { n: KPI_TOP })}</button>`;
    }
  } else {
    chart = kpiStackChart(sh.groups, sh.keys, { size });
    /* Legend whenever there are two or more series - identity is never colour alone. */
    if (sh.keys.length >= 2) legend = kpiLegend(sh.keys);
  }

  const groupDD = kpiDD("g" + index, groupBy, [{ items: [
    { v: "", l: t("kpi.noGroup") },
    { v: "region", l: t("kpi.byRegion") },
    { v: "maturity", l: t("kpi.byMaturity") }
  ] }], { label: t("kpi.groupBy") });

  return `<div class="card kpi-panel${panel.wide ? " wide" : ""}" data-panel="${index}">
    <div class="cap">
      <h2>${kpiEsc(panel.kpi)}</h2>
      <div class="kpi-tools">
        ${groupDD}
        <button class="btn icon kpi-wide" data-panel="${index}" type="button"
          aria-label="${t(panel.wide ? "kpi.narrow" : "kpi.widen")}"
          title="${t(panel.wide ? "kpi.narrow" : "kpi.widen")}">${panel.wide ? "½" : "1／1"}</button>
        <button class="btn icon kpi-remove" data-panel="${index}" type="button"
          aria-label="${t("kpi.remove")}" title="${t("kpi.remove")}">✕</button>
      </div>
    </div>
    <div class="bd">
      <p class="q-note" style="margin-top:0">${kpiEsc(sh.meta.tab)} · ${t("kpi.type." + sh.meta.type)} · ${t("kpi.coverage", { n: sh.known, total: sh.total })}</p>
      ${legend}
      <div class="kpi-wrap">${chart}</div>
      ${more}
      ${s.table ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl">
        <thead><tr>${sh.head.map(h => `<th>${kpiEsc(h)}</th>`).join("")}</tr></thead>
        <tbody>${sh.table.map(r => `<tr>${r.map((c, ci) =>
          ci ? `<td class="num">${kpiEsc(c)}</td>` : `<th>${kpiEsc(c)}</th>`).join("")}</tr>`).join("")}</tbody>
      </table></div>` : ""}
    </div>
  </div>`;
}

/* ---------- example charts ---------- */

/* Four thumbnails drawn from the live data, each one an indicator that is not
   already on the board. They are the answer to "what can I put here?" - a name
   in a list does not show you the shape of the answer, a chart does. */
function kpiSuggestions(){
  const s = kpiState();
  const on = new Set(s.panels.map(p => p.kpi));
  const picks = KPI_SUGGESTED.filter(name => !on.has(name)
    && KPI_CATALOGUE.some(k => k.kpi === name)).slice(0, 4);
  if (!picks.length) return "";

  const tiles = picks.map(name => {
    const meta = KPI_CATALOGUE.find(k => k.kpi === name);
    const rows = kpiRowsFor(name).filter(r => r.value);
    let items;
    if (meta.type === "numeric") {
      items = rows.map(r => ({ label: r.country, value: kpiNum(r.value) }))
        .filter(i => i.value !== null).sort((a, b) => b.value - a.value).slice(0, 5);
    } else {
      const counts = {};
      rows.forEach(r => { counts[r.value] = (counts[r.value] || 0) + 1; });
      items = Object.keys(counts).map(k => ({ label: k.length > 16 ? k.slice(0, 15) + "…" : k, value: counts[k] }))
        .sort((a, b) => b.value - a.value).slice(0, 5);
    }
    const sub = meta.type === "numeric" ? t("kpi.sugTop") : t("kpi.sugCount");
    return `<button type="button" class="kpi-sug-tile" data-kpi="${kpiEsc(name)}" title="${t("kpi.sugAdd")}">
      <span class="kpi-sug-h">${kpiEsc(name)}</span>
      <span class="kpi-sug-s">${kpiEsc(meta.tab)} · ${sub}</span>
      ${kpiBarChart(items, { size: "mini" })}
      <span class="kpi-sug-add">${t("kpi.sugAdd")}</span>
    </button>`;
  }).join("");

  return `<div class="card"><div class="cap"><h2>${t("kpi.sugTitle")}</h2>
      <button class="btn lnk" id="kSugMore" type="button">${t("kpi.sugShuffle")}</button></div>
    <div class="bd"><p class="q-note" style="margin-top:0">${t("kpi.sugHelp")}</p>
    <div class="kpi-sug">${tiles}</div></div></div>`;
}

/* ---------- the view ---------- */

function renderInsights(){
  const el = $("#v-insights");
  const s = kpiState();
  const regions = [...new Set(KPI_ROWS.map(r => r.region).filter(Boolean))].sort();
  const levels = [...new Set(KPI_ROWS.map(r => r.maturity).filter(v => v != null))].sort();
  const scope = KPI_ROWS.filter(r => (!s.region || r.region === s.region)
                                  && (!s.maturity || String(r.maturity) === String(s.maturity)));
  const countries = new Set(scope.map(r => r.country)).size;
  const byTab = {};
  KPI_CATALOGUE.forEach(k => { (byTab[k.tab] = byTab[k.tab] || []).push(k); });

  const regionDD = kpiDD("region", s.region, [{ items:
    [{ v: "", l: t("kpi.allRegions") }].concat(regions.map(r => ({ v: r, l: t("reg." + r) || r })))
  }], { label: t("kpi.region") });
  const levelDD = kpiDD("level", String(s.maturity), [{ items:
    [{ v: "", l: t("kpi.allLevels") }].concat(levels.map(l => ({ v: String(l), l: t("common.level") + " " + l })))
  }], { label: t("kpi.maturity") });
  const addDD = kpiDD("add", " ", Object.keys(byTab).sort().map(tab => ({
    g: tab, items: byTab[tab].map(k => ({ v: k.kpi, l: k.kpi }))
  })), { label: t("kpi.add"), search: true, cls: "dd-add" });

  el.innerHTML = `
  <h1 class="pg">${t("ins.title")}</h1>
  <p class="pg-sub">${t("kpi.sub")}</p>

  <div class="tiles">
    <div class="tile"><div class="v">${countries}<small> / 29</small></div><div class="s">${t("kpi.tCountries")}</div></div>
    <div class="tile"><div class="v">${KPI_CATALOGUE.length}</div><div class="s">${t("kpi.tIndicators")}</div></div>
    <div class="tile"><div class="v">${s.panels.length}</div><div class="s">${t("kpi.tPanels")}</div></div>
    <div class="tile"><div class="v">${Object.keys(byTab).length}</div><div class="s">${t("kpi.tTabs")}</div></div>
  </div>

  <div class="card"><div class="bd">
    <div class="filters">
      ${addDD}
      ${regionDD}
      ${levelDD}
      <label class="q-toggle"><input type="checkbox" id="kTable" ${s.table ? "checked" : ""}> ${t("kpi.showTable")}</label>
      <button class="btn" id="kXlsx" type="button">${t("kpi.xlsx")}</button>
      <button class="btn" id="kCsv" type="button">${t("ins.csv")}</button>
      <button class="btn" id="kReset" type="button">${t("inbox.reset")}</button>
    </div>
    <p class="q-note" style="margin:0">${t("kpi.help")}</p>
  </div></div>

  ${kpiSuggestions()}

  <div class="kpi-board">${s.panels.map((p, i) => kpiPanel(p, i)).join("") ||
    `<div class="card"><div class="bd"><p class="q-note">${t("kpi.empty")}</p></div></div>`}</div>`;

  /* filters */
  KPI_DD.region = v => { s.region = v; saveStore(); renderInsights(); };
  KPI_DD.level  = v => { s.maturity = v; saveStore(); renderInsights(); };
  KPI_DD.add    = v => kpiAdd(v);
  s.panels.forEach((p, i) => {
    KPI_DD["g" + i] = v => { s.panels[i].group = v; saveStore(); renderInsights(); };
  });
  kpiWireDD(el);

  $("#kTable").addEventListener("change", e => { s.table = e.target.checked; saveStore(); renderInsights(); });
  $("#kReset").addEventListener("click", () => { delete store.kpi; saveStore(); renderInsights(); });
  $("#kCsv").addEventListener("click", kpiExportCSV);
  $("#kXlsx").addEventListener("click", kpiExportXlsx);
  const sug = $("#kSugMore");
  if (sug) sug.addEventListener("click", () => {
    /* Rotate the shortlist so the four on show are not always the same four. */
    KPI_SUGGESTED.push(KPI_SUGGESTED.shift(), KPI_SUGGESTED.shift(), KPI_SUGGESTED.shift(), KPI_SUGGESTED.shift());
    renderInsights();
  });
  el.querySelectorAll(".kpi-sug-tile").forEach(b =>
    b.addEventListener("click", () => kpiAdd(b.dataset.kpi)));
  el.querySelectorAll(".kpi-wide").forEach(b => b.addEventListener("click", () => {
    const p = s.panels[+b.dataset.panel]; p.wide = !p.wide; saveStore(); renderInsights();
  }));
  el.querySelectorAll(".kpi-all").forEach(b => b.addEventListener("click", () => {
    const p = s.panels[+b.dataset.panel]; p.all = !p.all; saveStore(); renderInsights();
  }));
  el.querySelectorAll(".kpi-remove").forEach(b => b.addEventListener("click", () => {
    s.panels.splice(+b.dataset.panel, 1); saveStore(); renderInsights();
  }));
  el.querySelectorAll("[data-tip]").forEach(n => {
    n.addEventListener("mousemove", e => showTip(n.dataset.tip, e.clientX, e.clientY));
    n.addEventListener("mouseleave", hideTip);
  });
}

/* The board can be long, so a panel appended at the bottom is invisible from
   the filter row - which reads as "the button does nothing". Scroll to it and
   flag it. */
function kpiAdd(name){
  if (!name || !KPI_CATALOGUE.some(k => k.kpi === name)) return;
  const s = kpiState();
  const at = s.panels.findIndex(p => p.kpi === name);
  if (at < 0) s.panels.push({ kpi: name, group: "" });
  saveStore();
  renderInsights();
  const index = at < 0 ? s.panels.length - 1 : at;
  const node = document.querySelector(`#v-insights .kpi-panel[data-panel="${index}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("flash");
  setTimeout(() => node.classList.remove("flash"), 1400);
}

/* ---------- exports ---------- */

/* The whole board as one CSV - the filters apply, so the export matches what is
   on screen rather than the raw sheet. */
function kpiExportCSV(){
  const s = kpiState();
  const lines = [["KPI", "Tab", "Country", "Region", "Maturity", "Value"].join(";")];
  const wanted = new Set(s.panels.map(p => p.kpi));
  KPI_ROWS.filter(r => wanted.has(r.kpi))
    .filter(r => !s.region || r.region === s.region)
    .filter(r => !s.maturity || String(r.maturity) === String(s.maturity))
    .forEach(r => lines.push([r.kpi, r.tab, r.country, r.region, r.maturity, r.value]
      .map(v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(";")));
  kpiSave(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
          `regwatch-kpi-${lang}.csv`);
}

/* The workbook a consultant actually hands over: one data sheet with the rows
   behind the board, then one sheet per panel carrying its table AND a real
   Excel chart bound to those cells. */
function kpiExportXlsx(){
  const s = kpiState();
  const taken = new Set();
  const wanted = new Set(s.panels.map(p => p.kpi));
  const data = [["KPI", "Tab", "Country", "Region", "Maturity", "Value"]];
  KPI_ROWS.filter(r => wanted.has(r.kpi))
    .filter(r => !s.region || r.region === s.region)
    .filter(r => !s.maturity || String(r.maturity) === String(s.maturity))
    .forEach(r => data.push([r.kpi, r.tab, r.country, r.region, r.maturity, r.value]));

  const sheets = [{ name: xlSheetName(t("kpi.sheetData"), taken), rows: data,
                    widths: [46, 24, 18, 10, 10, 34], chart: null }];

  s.panels.forEach(panel => {
    const sh = kpiShape(panel);
    if (!sh || !sh.categories.length) return;
    const name = xlSheetName(panel.kpi, taken);
    sheets.push({
      name,
      rows: [sh.head].concat(sh.table),
      widths: [30].concat(sh.head.slice(1).map(() => 16)),
      chart: {
        sheet: name, title: panel.kpi,
        categories: sh.categories, series: sh.series
      }
    });
  });

  kpiSave(xlsxBlob(sheets), `regwatch-kpi-${lang}.xlsx`);
}

/* One saver for both. The blob is built synchronously inside the click handler,
   so the gesture is still live; iOS Safari ignores `download` on a blob: URL,
   which is why the link is put in the page for the person to tap there. */
function kpiSave(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
