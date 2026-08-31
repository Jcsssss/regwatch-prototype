/* ================= Configurable KPI dashboard =================
 *
 * The workbook's KPI sheet is a tidy table: one row per country per indicator.
 * This turns it into charts a consultant composes.
 *
 * The page reads top to bottom as the work does:
 *   1. scope        which countries the whole page is about
 *   2. the builder  compose a chart and watch it redraw as you change it
 *   3. the board    the charts you kept
 *   4. examples     what else the data can be made to say
 *
 * The builder is the centre of gravity: pick one or more indicators, a
 * grouping and a form, and the preview under the controls updates on every
 * change - nothing is added to the board until it already looks right.
 *
 * Several indicators are drawn as small multiples, never as several series on
 * one axis: "months late" and "number of sectors" share no scale, and putting
 * them on the same axis would invent a comparison the data does not support.
 *
 * Chart form follows the indicator's type:
 *   numeric      a ranked bar - magnitude, single hue
 *   categorical  share bar, donut or a grid of countries - identity, four hues
 *
 * Palette: four hues, validated with the dataviz palette checker in both light
 * and dark mode (lightness band, chroma floor, CVD separation, normal-vision
 * floor, contrast). Six hues could not clear CVD separation in the narrow dark
 * band, so anything beyond four folds into "Other" rather than inventing a
 * fifth colour.
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

/* Ready-made examples, each one deliberately a different form so the row shows
   what the board can draw, not just which indicators exist. */
const KPI_EXAMPLES = [
  { kpis: ["Type of national text"], group: "", form: "donut" },
  { kpis: ["Exceeded time from EU deadline (month)"], group: "region", form: "bars" },
  { kpis: ["Registration availability"], group: "", form: "grid" },
  { kpis: ["Cybersecurity framework directives published"], group: "region", form: "stack" },
  { kpis: ["Maturity Level"], group: "", form: "bars" },
  { kpis: ["Method for incident reporting"], group: "", form: "stack" },
  { kpis: ["Types of registration"], group: "", form: "donut" },
  { kpis: ["Organism in charge of the audit"], group: "", form: "grid" },
  { kpis: ["Number of private sectors added"], group: "", form: "bars" },
  { kpis: ["Transposition finalized"], group: "maturity", form: "stack" },
  { kpis: ["Sectors added"], group: "region", form: "grid" },
  { kpis: ["Number of cyber requirements for EE"], group: "", form: "bars" }
];

/* ---------- state, persisted so a board survives a reload ---------- */

function kpiState(){
  const s = store.kpi || (store.kpi = {});
  if (!Array.isArray(s.panels)) s.panels = [];
  /* Panels used to carry a single `kpi`; keep those boards readable. */
  s.panels = s.panels.map(p => p.kpis ? p : { kpis: [p.kpi], group: p.group || "", form: "auto", wide: !!p.wide });
  if (!s.builder || !Array.isArray(s.builder.kpis)) {
    s.builder = { kpis: ["Maturity Level"], group: "region", form: "bars" };
  }
  s.region = s.region || "";
  s.maturity = s.maturity || "";
  s.exStart = s.exStart || 0;
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
const kpiMeta = name => KPI_CATALOGUE.find(k => k.kpi === name);

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
  mini:    { W: 300, rowH: 18, padL: 96,  padR: 36, grid: false, minW: 0 }
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
             fill="${it.colour || o.colour}"${kpiTip(it.label + " : " + it.value + (o.unit ? " " + o.unit : ""))}/>`;
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

/* Donuts, one per group. Part-to-whole with at most four slices, which is the
   only case where a ring beats a bar: the whole is the point and the reader
   compares each part to it. The centre carries the count, so nothing depends
   on judging an angle. */
function kpiDonutChart(groups, keys, opts){
  const pal = kpiPalette();
  const o = Object.assign({ size: "compact" }, opts || {});
  if (!groups.length) return `<p class="q-note">${t("kpi.noData")}</p>`;
  const R = 54, r = 33, C = 62;         /* outer radius, inner radius, half-box */
  const gap = 0.02;                     /* radians of surface between slices */
  const box = o.size === "mini" ? 104 : 158;

  const one = grp => {
    let a = -Math.PI / 2, svg = "";
    const total = grp.total || 1;
    keys.forEach((k, ki) => {
      const n = grp.counts[k] || 0;
      if (!n) return;
      const sweep = (n / total) * Math.PI * 2;
      const single = n === total;
      const a0 = a + (single ? 0 : gap / 2), a1 = a + sweep - (single ? 0.0001 : gap / 2);
      a += sweep;
      if (a1 <= a0) return;
      const p = (rad, ang) => [(C + rad * Math.cos(ang)).toFixed(1), (C + rad * Math.sin(ang)).toFixed(1)];
      const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1);
      const [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      svg += `<path d="M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z"
               fill="${pal[ki % pal.length]}"${kpiTip(grp.label + " - " + k + " : " + n + " (" + Math.round(n / total * 100) + "%)")}/>`;
    });
    svg += `<text x="${C}" y="${C + 3}" class="kpi-hero" text-anchor="middle">${grp.total}</text>`;
    svg += `<text x="${C}" y="${C + 17}" class="kpi-axis" text-anchor="middle">${t("kpi.countries")}</text>`;
    return `<figure class="kpi-donut">
      <svg viewBox="0 0 ${C * 2} ${C * 2}" role="img" width="${box}" height="${box}">${svg}</svg>
      ${groups.length > 1 ? `<figcaption>${kpiEsc(grp.label)}</figcaption>` : ""}
    </figure>`;
  };
  return `<div class="kpi-donuts">${groups.map(one).join("")}</div>`;
}

/* One square per country, coloured by its answer. Twenty-nine countries is
   small enough to show every one of them, so the reader counts rather than
   estimates, and can find their own country in the picture. */
function kpiGridChart(blocks, keys, opts){
  const pal = kpiPalette();
  const o = Object.assign({ size: "compact" }, opts || {});
  const mini = o.size === "mini";
  const cell = mini ? 16 : 26;
  return `<div class="kpi-grid-wrap">${blocks.map(b => `
    ${blocks.length > 1 ? `<div class="kpi-grid-h">${kpiEsc(b.label)}</div>` : ""}
    <div class="kpi-cells" style="--cell:${cell}px">${b.cells.map(c => {
      const ki = keys.indexOf(c.key);
      return `<span class="kpi-cell" style="background:${ki < 0 ? "var(--line2)" : pal[ki % pal.length]}"
        ${kpiTip(c.country + " : " + c.key)}>${mini ? "" : kpiEsc(c.iso)}</span>`;
    }).join("")}</div>`).join("")}</div>`;
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
 * the page that means over the control, hiding the row the person just used.
 * These are a button plus a panel positioned under it, so the list opens
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

/* One shape used by every on-screen form and by the Excel export, so they can
   never drift apart. */
function kpiShape(name, groupBy){
  const meta = kpiMeta(name);
  if (!meta) return null;
  const all = kpiRowsFor(name);
  const rows = all.filter(r => r.value);
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
    /* The column header and the chart's series name are the same string, so
       Excel still names the series correctly after a refresh. */
    const seriesName = groupBy ? t("kpi.average") : name;
    return {
      name, meta, numeric: true, items, known: rows.length, total: all.length,
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
    const e = groups[g] || (groups[g] = { label: g, counts: {}, total: 0, cells: [] });
    const k = bucket(r.value);
    e.counts[k] = (e.counts[k] || 0) + 1; e.total++;
    e.cells.push({ country: r.country, iso: kpiIso(r.country), key: k });
  });
  const list = Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  /* Countries grouped by their own answer, so the grid reads as blocks of
     colour instead of confetti. */
  list.forEach(g => g.cells.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key)
                                        || a.country.localeCompare(b.country)));
  return {
    name, meta, numeric: false, groups: list, keys, known: rows.length, total: all.length,
    head: [t("kpi.group")].concat(keys),
    table: list.map(g => [g.label].concat(keys.map(k => g.counts[k] || 0))),
    series: keys.map((k, i) => ({ name: k, colour: pal[i % pal.length], values: list.map(g => g.counts[k] || 0) })),
    categories: list.map(g => g.label)
  };
}

/* Country records already carry the ISO code the grid labels its cells with. */
function kpiIso(country){
  const c = COUNTRIES.find(x => x.name === country);
  return c ? c.iso : country.slice(0, 2).toUpperCase();
}

/* Which forms an indicator can honestly take. A ranked bar is the only sound
   form for a numeric measure across countries; a breakdown can be a share bar,
   a donut or a grid of countries. */
function kpiForms(shape){
  return shape.numeric ? ["bars"] : ["stack", "donut", "grid", "bars"];
}
function kpiResolveForm(shape, form){
  const allowed = kpiForms(shape);
  return allowed.includes(form) ? form : allowed[0];
}

/* Draw a shape in the requested form. The legend comes back separately because
   it belongs above the plot, not inside the SVG. */
function kpiDraw(shape, form, size, opts){
  const o = opts || {};
  const f = kpiResolveForm(shape, form);
  if (shape.numeric) {
    const capped = !o.all && shape.items.length > KPI_TOP;
    return { chart: kpiBarChart(capped ? shape.items.slice(0, KPI_TOP) : shape.items, { size }),
             legend: "", capped, rows: shape.items.length };
  }
  const legend = shape.keys.length >= 2 ? kpiLegend(shape.keys) : "";
  if (f === "donut") return { chart: kpiDonutChart(shape.groups, shape.keys, { size }), legend };
  if (f === "grid")  return { chart: kpiGridChart(shape.groups, shape.keys, { size }), legend };
  if (f === "bars") {
    /* Counts per answer, summed over the groups - a plain ranking of answers. */
    const pal = kpiPalette();
    const items = shape.keys.map((k, i) => ({
      label: k, value: shape.groups.reduce((n, g) => n + (g.counts[k] || 0), 0),
      colour: pal[i % pal.length]
    })).filter(i => i.value).sort((a, b) => b.value - a.value);
    return { chart: kpiBarChart(items, { size }), legend: "" };
  }
  return { chart: kpiStackChart(shape.groups, shape.keys, { size }), legend };
}

/* ---------- one panel ---------- */

/* A panel holds one indicator or several. Several are drawn as small multiples,
   never as several series on one axis: two indicators measured in different
   units would imply a shared scale they do not have. */
function kpiPanelBody(panel, size, id){
  const names = panel.kpis.filter(kpiMeta);
  if (!names.length) return `<p class="q-note">${t("kpi.noneChosen")}</p>`;
  const multi = names.length > 1;

  const one = name => {
    const shape = kpiShape(name, panel.group);
    const d = kpiDraw(shape, panel.form, multi ? "mini" : size, { all: panel.all });
    const more = (d.capped !== undefined && d.rows > KPI_TOP && !multi)
      ? `<button class="btn lnk kpi-all" data-panel="${id}" type="button">${
          d.capped ? t("kpi.showAll", { n: d.rows }) : t("kpi.showTop", { n: KPI_TOP })}</button>` : "";
    return `<div class="kpi-one">
      ${multi ? `<h3 class="kpi-h3">${kpiEsc(name)}</h3>` : ""}
      <p class="q-note kpi-meta">${kpiEsc(shape.meta.tab)} · ${t("kpi.type." + shape.meta.type)} · ${t("kpi.coverage", { n: shape.known, total: shape.total })}</p>
      ${d.legend}
      <div class="kpi-wrap">${d.chart}</div>
      ${more}
    </div>`;
  };
  return multi ? `<div class="kpi-multi">${names.map(one).join("")}</div>` : one(names[0]);
}

function kpiPanelTitle(panel){
  return panel.kpis.length > 1 ? panel.kpis.join("  ·  ") : (panel.kpis[0] || "");
}

function kpiPanel(panel, index){
  const size = panel.wide ? "wide" : "compact";
  const groupDD = kpiDD("g" + index, panel.group || "", [{ items: [
    { v: "", l: t("kpi.noGroup") },
    { v: "region", l: t("kpi.byRegion") },
    { v: "maturity", l: t("kpi.byMaturity") }
  ] }], { label: t("kpi.groupBy") });

  return `<div class="card kpi-panel${panel.wide ? " wide" : ""}" data-panel="${index}">
    <div class="cap">
      <h2>${kpiEsc(kpiPanelTitle(panel))}</h2>
      <div class="kpi-tools">
        ${groupDD}
        <button class="btn icon kpi-wide" data-panel="${index}" type="button"
          aria-label="${t(panel.wide ? "kpi.narrow" : "kpi.widen")}"
          title="${t(panel.wide ? "kpi.narrow" : "kpi.widen")}">${panel.wide ? "½" : "1／1"}</button>
        <button class="btn icon kpi-remove" data-panel="${index}" type="button"
          aria-label="${t("kpi.remove")}" title="${t("kpi.remove")}">✕</button>
      </div>
    </div>
    <div class="bd">${kpiPanelBody(panel, size, index)}</div>
  </div>`;
}

/* ---------- the builder ---------- */

/* Everything the builder needs is in `store.kpi.builder`; changing any control
   rewrites this one card, so the chart redraws under the controls instead of
   sending the reader to the bottom of the page. */
function kpiBuilderHTML(){
  const s = kpiState();
  const b = s.builder;
  const byTab = {};
  KPI_CATALOGUE.forEach(k => { (byTab[k.tab] = byTab[k.tab] || []).push(k); });

  const chosen = b.kpis.filter(kpiMeta);
  const addDD = kpiDD("bAdd", " ", Object.keys(byTab).sort().map(tab => ({
    g: tab, items: byTab[tab].filter(k => !chosen.includes(k.kpi)).map(k => ({ v: k.kpi, l: k.kpi }))
  })).filter(g => g.items.length), { label: t("kpi.add"), search: true, cls: "dd-add" });

  const groupDD = kpiDD("bGroup", b.group || "", [{ items: [
    { v: "", l: t("kpi.noGroup") },
    { v: "region", l: t("kpi.byRegion") },
    { v: "maturity", l: t("kpi.byMaturity") }
  ] }], { label: t("kpi.groupBy") });

  /* Only offer forms every chosen indicator can actually take. */
  const shapes = chosen.map(n => kpiShape(n, b.group)).filter(Boolean);
  const allowed = shapes.length
    ? shapes.map(kpiForms).reduce((a, f) => a.filter(x => f.includes(x)))
    : ["bars"];
  const formDD = kpiDD("bForm", allowed.includes(b.form) ? b.form : allowed[0],
    [{ items: allowed.map(f => ({ v: f, l: t("kpi.form." + f) })) }], { label: t("kpi.formLbl") });

  const chips = chosen.map(n => `<span class="kpi-chip">${kpiEsc(n)}
    <button type="button" class="kpi-chip-x" data-kpi="${kpiEsc(n)}" aria-label="${t("kpi.remove")}">✕</button></span>`).join("");

  const preview = chosen.length
    ? kpiPanelBody({ kpis: chosen, group: b.group, form: b.form, all: true }, "wide", "b")
    : `<p class="q-note">${t("kpi.noneChosen")}</p>`;

  return `<div class="cap"><h2>${t("kpi.buildTitle")}</h2>
      <button class="btn primary" id="kKeep" type="button" ${chosen.length ? "" : "disabled"}>${t("kpi.keep")}</button></div>
    <div class="bd">
      <div class="kpi-build-row">
        ${addDD}${groupDD}${allowed.length > 1 ? formDD : ""}
        ${chosen.length ? `<button class="btn lnk" id="kClear" type="button">${t("kpi.clear")}</button>` : ""}
      </div>
      ${chips ? `<div class="kpi-chips">${chips}</div>` : ""}
      <p class="q-note kpi-build-help">${t("kpi.buildHelp")}</p>
      <div class="kpi-preview">${preview}</div>
    </div>`;
}

function renderBuilder(){
  const host = $("#kBuild");
  if (!host) return;
  const s = kpiState();
  const b = s.builder;
  host.innerHTML = kpiBuilderHTML();

  KPI_DD.bAdd   = v => { if (!b.kpis.includes(v)) b.kpis.push(v); saveStore(); renderBuilder(); };
  KPI_DD.bGroup = v => { b.group = v; saveStore(); renderBuilder(); };
  KPI_DD.bForm  = v => { b.form = v; saveStore(); renderBuilder(); };
  kpiWireDD(host);

  host.querySelectorAll(".kpi-chip-x").forEach(x => x.addEventListener("click", () => {
    b.kpis = b.kpis.filter(k => k !== x.dataset.kpi); saveStore(); renderBuilder();
  }));
  const clear = $("#kClear");
  if (clear) clear.addEventListener("click", () => { b.kpis = []; saveStore(); renderBuilder(); });
  $("#kKeep").addEventListener("click", () => {
    s.panels.push({ kpis: b.kpis.slice(), group: b.group, form: b.form, wide: b.kpis.length > 1 });
    saveStore();
    renderInsights();
    kpiFlash(s.panels.length - 1);
  });
  kpiWireTips(host);
}

/* ---------- example charts ---------- */

/* Four worked examples, each a different form and drawn from the live data.
   A name in a list does not show you the shape of the answer; a chart does. */
function kpiExamples(){
  const s = kpiState();
  const usable = KPI_EXAMPLES.filter(e => e.kpis.every(kpiMeta));
  if (!usable.length) return "";
  const idx = [0, 1, 2, 3].map(i => (s.exStart + i) % usable.length);

  const tiles = idx.map(i => {
    const ex = usable[i];
    const shape = kpiShape(ex.kpis[0], ex.group);
    const d = kpiDraw(shape, ex.form, "mini");
    return `<div class="kpi-ex">
      <div class="kpi-ex-h">${kpiEsc(ex.kpis[0])}</div>
      <div class="kpi-ex-s">${kpiEsc(shape.meta.tab)} · ${t("kpi.form." + kpiResolveForm(shape, ex.form))}${
        ex.group ? " · " + t(ex.group === "region" ? "kpi.byRegion" : "kpi.byMaturity") : ""}</div>
      ${d.legend}
      <div class="kpi-wrap">${d.chart}</div>
      <button type="button" class="btn lnk kpi-ex-use" data-ex="${i}">${t("kpi.exUse")}</button>
    </div>`;
  }).join("");

  return `<div class="card" id="kEx"><div class="cap"><h2>${t("kpi.exTitle")}</h2>
      <button class="btn lnk" id="kExMore" type="button">${t("kpi.exMore")}</button></div>
    <div class="bd"><p class="q-note" style="margin-top:0">${t("kpi.exHelp")}</p>
    <div class="kpi-exs">${tiles}</div></div></div>`;
}

/* ---------- the view ---------- */

function kpiWireTips(root){
  root.querySelectorAll("[data-tip]").forEach(n => {
    n.addEventListener("mousemove", e => showTip(n.dataset.tip, e.clientX, e.clientY));
    n.addEventListener("mouseleave", hideTip);
  });
}

function renderInsights(){
  const el = $("#v-insights");
  const s = kpiState();
  const regions = [...new Set(KPI_ROWS.map(r => r.region).filter(Boolean))].sort();
  const levels = [...new Set(KPI_ROWS.map(r => r.maturity).filter(v => v != null))].sort();

  const regionDD = kpiDD("region", s.region, [{ items:
    [{ v: "", l: t("kpi.allRegions") }].concat(regions.map(r => ({ v: r, l: t("reg." + r) || r })))
  }], { label: t("kpi.region") });
  const levelDD = kpiDD("level", String(s.maturity), [{ items:
    [{ v: "", l: t("kpi.allLevels") }].concat(levels.map(l => ({ v: String(l), l: t("common.level") + " " + l })))
  }], { label: t("kpi.maturity") });

  el.innerHTML = `
  <h1 class="pg">${t("ins.title")}</h1>
  <p class="pg-sub">${t("kpi.sub")}</p>

  <div class="card"><div class="bd">
    <div class="filters">
      ${regionDD}
      ${levelDD}
      <span class="kpi-spacer"></span>
      <button class="btn" id="kXlsx" type="button">${t("kpi.xlsx")}</button>
      <button class="btn" id="kReset" type="button">${t("inbox.reset")}</button>
    </div>
    <p class="q-note" style="margin:0">${t("kpi.help")}</p>
  </div></div>

  <div class="card kpi-builder" id="kBuild"></div>

  <div class="kpi-board">${s.panels.map((p, i) => kpiPanel(p, i)).join("")}</div>

  ${kpiExamples()}`;

  KPI_DD.region = v => { s.region = v; saveStore(); renderInsights(); };
  KPI_DD.level  = v => { s.maturity = v; saveStore(); renderInsights(); };
  s.panels.forEach((p, i) => {
    KPI_DD["g" + i] = v => { s.panels[i].group = v; saveStore(); renderInsights(); };
  });
  kpiWireDD(el);
  renderBuilder();

  $("#kReset").addEventListener("click", () => { delete store.kpi; saveStore(); renderInsights(); });
  $("#kXlsx").addEventListener("click", kpiExportXlsx);
  const more = $("#kExMore");
  if (more) more.addEventListener("click", () => {
    const usable = KPI_EXAMPLES.filter(e => e.kpis.every(kpiMeta));
    s.exStart = (s.exStart + 4) % usable.length; saveStore(); renderInsights();
    const ex = $("#kEx"); if (ex) ex.scrollIntoView({ block: "nearest" });
  });
  el.querySelectorAll(".kpi-ex-use").forEach(b => b.addEventListener("click", () => {
    const ex = KPI_EXAMPLES.filter(e => e.kpis.every(kpiMeta))[+b.dataset.ex];
    /* An example loads into the builder rather than straight onto the board:
       it is a starting point to adjust, not a finished panel. */
    s.builder = { kpis: ex.kpis.slice(), group: ex.group, form: ex.form };
    saveStore(); renderInsights();
    const host = $("#kBuild"); if (host) host.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  el.querySelectorAll(".kpi-wide").forEach(b => b.addEventListener("click", () => {
    const p = s.panels[+b.dataset.panel]; p.wide = !p.wide; saveStore(); renderInsights();
  }));
  el.querySelectorAll(".kpi-all").forEach(b => b.addEventListener("click", () => {
    const p = s.panels[+b.dataset.panel]; if (!p) return;
    p.all = !p.all; saveStore(); renderInsights();
  }));
  el.querySelectorAll(".kpi-remove").forEach(b => b.addEventListener("click", () => {
    s.panels.splice(+b.dataset.panel, 1); saveStore(); renderInsights();
  }));
  kpiWireTips(el);
}

/* The board can be long, so a panel appended at the bottom is invisible from
   the builder - which reads as "the button did nothing". Scroll to it, flag it. */
function kpiFlash(index){
  const node = document.querySelector(`#v-insights .kpi-panel[data-panel="${index}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("flash");
  setTimeout(() => node.classList.remove("flash"), 1400);
}

/* ---------- export ---------- */

/* The workbook a consultant actually hands over: one data sheet with the rows
   behind the charts, then one sheet per indicator carrying its table AND a real
   Excel chart bound to those cells. */
function kpiExportXlsx(){
  const s = kpiState();
  const taken = new Set();
  /* The builder's chart counts: it is usually the one being worked on. */
  const panels = s.panels.concat(s.builder.kpis.length ? [s.builder] : []);
  const wanted = new Set([].concat(...panels.map(p => p.kpis)));

  const data = [["KPI", "Tab", "Country", "Region", "Maturity", "Value"]];
  KPI_ROWS.filter(r => wanted.has(r.kpi))
    .filter(r => !s.region || r.region === s.region)
    .filter(r => !s.maturity || String(r.maturity) === String(s.maturity))
    .forEach(r => data.push([r.kpi, r.tab, r.country, r.region, r.maturity, r.value]));

  const sheets = [{ name: xlSheetName(t("kpi.sheetData"), taken), rows: data,
                    widths: [46, 24, 18, 10, 10, 34], chart: null }];

  const done = new Set();
  panels.forEach(panel => panel.kpis.forEach(kpiName => {
    const key = kpiName + "|" + (panel.group || "");
    if (done.has(key)) return;
    done.add(key);
    const shape = kpiShape(kpiName, panel.group);
    if (!shape || !shape.categories.length) return;
    const name = xlSheetName(kpiName, taken);
    /* A donut on screen becomes a pie in Excel; everything else is a bar. */
    const pie = !shape.numeric && kpiResolveForm(shape, panel.form) === "donut"
                && shape.groups.length === 1;
    const pal = kpiPalette();
    sheets.push({
      name,
      rows: pie ? [[t("kpi.value"), t("kpi.countries")]].concat(
                    shape.keys.map(k => [k, shape.groups[0].counts[k] || 0]))
                : [shape.head].concat(shape.table),
      widths: [30, 16, 16, 16, 16],
      chart: pie ? {
        sheet: name, title: kpiName, type: "pie",
        categories: shape.keys,
        series: [{ name: t("kpi.countries"), colour: pal[0],
                   colours: shape.keys.map((k, i) => pal[i % pal.length]),
                   values: shape.keys.map(k => shape.groups[0].counts[k] || 0) }]
      } : {
        sheet: name, title: kpiName, type: "bar",
        categories: shape.categories, series: shape.series
      }
    });
  }));

  kpiSave(xlsxBlob(sheets), `regwatch-kpi-${lang}.xlsx`);
}

/* The blob is built synchronously inside the click handler, so the gesture is
   still live - iOS Safari refuses a download once the gesture is gone. */
function kpiSave(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
