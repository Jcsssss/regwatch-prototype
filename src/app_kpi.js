/* ================= KPI chart builder =================
 *
 * The workbook's KPI sheet is a tidy table: one row per country per indicator.
 * This turns it into one chart a consultant composes.
 *
 * The page is three things, in the order the work happens:
 *   1. scope       which countries everything below is about
 *   2. the chart   compose it and watch it redraw as you change the controls
 *   3. examples    what else the data can be made to say
 *
 * There is one chart, not a board of them. Adding a second indicator crosses it
 * into the same picture rather than opening another one: countries down the
 * side, indicators across the top, every cell coloured on its own column's
 * scale. That is the question a comparison actually asks - "who is where on
 * these three things at once" - and it is the only single-chart form that takes
 * a numeric and a categorical indicator side by side without lying about
 * either. When every chosen indicator is numeric and their ranges are
 * comparable, grouped bars are offered as well.
 *
 * For one indicator the form follows its type:
 *   numeric      a ranked bar - magnitude, single hue
 *   categorical  share bar, donut or one square per country - identity
 *
 * Palette: four categorical hues, validated with the dataviz palette checker in
 * both light and dark mode (lightness band, chroma floor, CVD separation,
 * normal-vision floor, contrast); anything beyond four folds into "Other"
 * rather than inventing a fifth. Magnitude uses a sequential ramp of the brand
 * violet, light to dark, never a second hue.
 */
"use strict";

const KPI_LIGHT = ["#5b34e0", "#0d9c55", "#3b82c4", "#b8860b"];
const KPI_DARK  = ["#7c5cf0", "#12a75f", "#4a95d0", "#b8892a"];
const KPI_MAX_SERIES = 4;
const KPI_TOP = 12;   /* rows shown before the chart offers "show every country" */

/* Sequential ramp for magnitude: one hue, light to dark. `ink` says which steps
   need light text - a step is unreadable under the wrong one. */
const KPI_SEQ_LIGHT = { steps: ["#efeafe", "#d6c9fa", "#b09bf3", "#7f5cec", "#4b25c4"], light: [0, 0, 0, 1, 1] };
const KPI_SEQ_DARK  = { steps: ["#241a4a", "#342267", "#48309b", "#6544d8", "#8f76ec"], light: [1, 1, 1, 1, 0] };

function kpiDarkMode(){
  return document.documentElement.dataset.theme === "dark"
    || (document.documentElement.dataset.theme !== "light"
        && matchMedia("(prefers-color-scheme: dark)").matches);
}
function kpiPalette(){ return kpiDarkMode() ? KPI_DARK : KPI_LIGHT; }
function kpiRamp(){ return kpiDarkMode() ? KPI_SEQ_DARK : KPI_SEQ_LIGHT; }

/* Ready-made examples, each one deliberately a different form so the row shows
   what can be drawn, not just which indicators exist. */
const KPI_EXAMPLES = [
  { kpis: ["Type of national text"], group: "", form: "donut" },
  { kpis: ["Exceeded time from EU deadline (month)"], group: "region", form: "bars" },
  { kpis: ["Registration availability"], group: "", form: "grid" },
  { kpis: ["Cybersecurity framework directives published"], group: "region", form: "stack" },
  { kpis: ["Maturity Level", "Exceeded time from EU deadline (month)", "Transposition finalized"], group: "", form: "matrix" },
  { kpis: ["Maturity Level"], group: "", form: "bars" },
  { kpis: ["Method for incident reporting"], group: "", form: "stack" },
  { kpis: ["Number of cyber requirements for EE", "Number of cyber requirements for EI"], group: "", form: "grouped" },
  { kpis: ["Types of registration"], group: "", form: "donut" },
  { kpis: ["Organism in charge of the audit"], group: "", form: "grid" },
  { kpis: ["Number of private sectors added"], group: "", form: "bars" },
  { kpis: ["Transposition finalized"], group: "maturity", form: "stack" },
  { kpis: ["Sectors added"], group: "region", form: "grid" },
  { kpis: ["Number of public sectors added", "Number of private sectors added"], group: "region", form: "grouped" }
];

/* ---------- state, persisted so the chart survives a reload ---------- */

function kpiState(){
  const s = store.kpi || (store.kpi = {});
  if (!s.builder || !Array.isArray(s.builder.kpis)) {
    s.builder = { kpis: ["Maturity Level"], group: "region", form: "bars" };
  }
  /* Earlier versions kept a board of panels; the chart is single now. */
  delete s.panels;
  delete s.table;
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

/* Two sizes, one geometry table. The small one keeps the same marks and the
   same type sizes - it just carries fewer pixels of plot - so nothing has to be
   re-read at a different scale. */
const KPI_GEOM = {
  wide: { W: 720, rowH: 26, padL: 148, padR: 54, grid: true,  minW: 520 },
  mini: { W: 300, rowH: 18, padL: 96,  padR: 36, grid: false, minW: 0 }
};

/* A ranked horizontal bar chart. One series, single hue: magnitude, not identity. */
function kpiBarChart(items, opts){
  const o = Object.assign({ unit: "", size: "wide", colour: kpiPalette()[0] }, opts || {});
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

/* Several numeric indicators, one bar each, grouped per country. Offered only
   when the ranges are comparable - a shared axis is a claim that they are. */
function kpiGroupedBars(cols, rows, opts){
  const pal = kpiPalette();
  const o = Object.assign({ size: "wide" }, opts || {});
  const g = KPI_GEOM[o.size];
  if (!rows.length) return `<p class="q-note">${t("kpi.noData")}</p>`;
  const barH = o.size === "mini" ? 7 : 11, gap = 2, padT = 6;
  const blockH = cols.length * (barH + gap) + 12;
  const W = g.W, H = padT + rows.length * blockH + 10;
  const max = Math.max(1, ...rows.map(r => Math.max(...r.values.map(v => v == null ? 0 : v))));
  const span = W - g.padL - g.padR;

  let svg = `<svg class="kpi-svg" style="min-width:${g.minW}px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img">`;
  for (let k = 0; k <= 4; k++) {
    const gx = g.padL + span * (k / 4);
    svg += `<line x1="${gx}" y1="${padT}" x2="${gx}" y2="${H - 10}" class="kpi-grid"/>`;
    svg += `<text x="${gx}" y="${H - 1}" class="kpi-axis" text-anchor="middle">${Math.round(max * k / 4)}</text>`;
  }
  rows.forEach((r, i) => {
    const y0 = padT + i * blockH;
    svg += `<text x="${g.padL - 8}" y="${y0 + blockH / 2}" class="kpi-lbl" text-anchor="end">${kpiEsc(r.label)}</text>`;
    r.values.forEach((v, ci) => {
      const y = y0 + 4 + ci * (barH + gap);
      if (v == null) {
        svg += `<text x="${g.padL + 3}" y="${y + barH - 1}" class="kpi-axis">-</text>`;
        return;
      }
      const w = Math.max(2, span * (v / max));
      svg += `<rect x="${g.padL}" y="${y}" width="${w}" height="${barH}" rx="3"
               fill="${pal[ci % pal.length]}"${kpiTip(r.label + " - " + cols[ci].name + " : " + v)}/>`;
      if (o.size !== "mini") svg += `<text x="${g.padL + w + 5}" y="${y + barH - 1}" class="kpi-val">${v}</text>`;
    });
  });
  return svg + `</svg>`;
}

/* Stacked horizontal bars: one bar per group, segments = the indicator's values. */
function kpiStackChart(groups, keys, opts){
  const pal = kpiPalette();
  const o = Object.assign({ size: "wide" }, opts || {});
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
  const o = Object.assign({ size: "wide" }, opts || {});
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
  const o = Object.assign({ size: "wide" }, opts || {});
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

function kpiLegend(keys, title){
  const pal = kpiPalette();
  return `<div class="kpi-legend">${title ? `<span class="kpi-leg-t">${kpiEsc(title)}</span>` : ""}${keys.map((k, i) =>
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

/* ---------- shaping: one indicator -> categories, series, table ---------- */

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
    bucket,
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

/* ---------- crossing several indicators into one chart ---------- */

/* Rows down the side, indicators across the top. Each column is coloured on its
   own scale - a sequential ramp for a measure, the categorical hues for an
   answer - because two indicators share no scale and pretending otherwise is
   the whole trap. */
function kpiCross(names, groupBy){
  const shapes = names.map(n => kpiShape(n, groupBy)).filter(Boolean);
  if (!shapes.length) return null;

  /* Row keys: countries, or the groups when one is chosen. */
  const rowSet = new Set();
  names.forEach(n => kpiRowsFor(n).filter(r => r.value)
    .forEach(r => rowSet.add(groupBy ? kpiGroupOf(r, groupBy) : r.country)));
  const rowKeys = [...rowSet].sort();

  const cols = shapes.map(shape => {
    if (shape.numeric) {
      const byRow = {};
      shape.items.forEach(i => { byRow[groupBy ? i.label.replace(/ \(\d+\)$/, "") : i.label] = i.value; });
      const vals = Object.values(byRow);
      return { name: shape.name, numeric: true, byRow,
               min: Math.min(...vals), max: Math.max(...vals), keys: [] };
    }
    const byRow = {};
    if (groupBy) {
      shape.groups.forEach(g => {
        /* One cell cannot hold a whole breakdown, so it holds the answer most of
           the group gives, and says how much of the group that is. */
        const top = shape.keys.reduce((a, k) => (g.counts[k] || 0) > (g.counts[a] || 0) ? k : a, shape.keys[0]);
        byRow[g.label] = { key: top, note: (g.counts[top] || 0) + "/" + g.total,
                           tip: shape.keys.filter(k => g.counts[k]).map(k => k + " " + g.counts[k]).join(" · ") };
      });
    } else {
      shape.groups.forEach(g => g.cells.forEach(c => { byRow[c.country] = { key: c.key, note: "", tip: c.key }; }));
    }
    return { name: shape.name, numeric: false, byRow, keys: shape.keys };
  });

  /* Sorted on the first column, because a matrix nobody has ordered is a wall. */
  const first = cols[0];
  rowKeys.sort((a, b) => {
    if (first.numeric) return (first.byRow[b] ?? -Infinity) - (first.byRow[a] ?? -Infinity) || a.localeCompare(b);
    const ka = first.byRow[a], kb = first.byRow[b];
    return first.keys.indexOf(ka && ka.key) - first.keys.indexOf(kb && kb.key) || a.localeCompare(b);
  });

  return { cols, rowKeys, shapes };
}

function kpiMatrixChart(cross, opts){
  const o = Object.assign({ size: "wide", all: false }, opts || {});
  const pal = kpiPalette(), ramp = kpiRamp();
  const rows = o.all ? cross.rowKeys : cross.rowKeys.slice(0, KPI_TOP);

  const head = `<div class="kpi-mx-r kpi-mx-head"><span class="kpi-mx-lbl"></span>${
    cross.cols.map(c => `<span class="kpi-mx-h">${kpiEsc(c.name)}</span>`).join("")}</div>`;

  const body = rows.map(rk => `<div class="kpi-mx-r">
    <span class="kpi-mx-lbl">${kpiEsc(rk)}</span>${cross.cols.map(c => {
      const v = c.byRow[rk];
      if (v === undefined || v === null) return `<span class="kpi-mx-c empty"${kpiTip(rk + " - " + c.name + " : " + t("kpi.unknown"))}>-</span>`;
      if (c.numeric) {
        const span = c.max - c.min;
        const step = span ? Math.round((v - c.min) / span * 4) : 4;
        return `<span class="kpi-mx-c" style="background:${ramp.steps[step]};color:${
          ramp.light[step] ? "#fff" : "var(--ink)"}"${kpiTip(rk + " - " + c.name + " : " + v)}>${v}</span>`;
      }
      const ki = c.keys.indexOf(v.key);
      return `<span class="kpi-mx-c cat" style="background:${ki < 0 ? "var(--line2)" : pal[ki % pal.length]}"
        ${kpiTip(rk + " - " + c.name + " : " + v.tip)}>${kpiEsc(v.note || v.key)}</span>`;
    }).join("")}</div>`).join("");

  return `<div class="kpi-mx" style="--cols:${cross.cols.length}">${head}${body}</div>`;
}

/* A legend per categorical column, plus a ramp caption per measure - identity
   is never colour alone, and a ramp without its ends is unreadable. */
function kpiCrossLegend(cross){
  const ramp = kpiRamp();
  return cross.cols.map(c => c.numeric
    ? `<div class="kpi-legend"><span class="kpi-leg-t">${kpiEsc(c.name)}</span>
        <span class="kpi-leg"><span class="kpi-ramp">${ramp.steps.map(s =>
          `<i style="background:${s}"></i>`).join("")}</span>${c.min} → ${c.max}</span></div>`
    : kpiLegend(c.keys, c.name)).join("");
}

/* ---------- which forms an indicator selection can honestly take ---------- */

function kpiForms(names, groupBy){
  if (names.length > 1) {
    const shapes = names.map(n => kpiShape(n, groupBy)).filter(Boolean);
    const forms = ["matrix"];
    /* Grouped bars put several measures on ONE axis, which is a claim that they
       are comparable. Only offered when they all are: same kind of quantity and
       ranges within an order of magnitude of each other. */
    if (shapes.every(s => s.numeric)) {
      const maxes = shapes.map(s => Math.max(...s.items.map(i => i.value), 1));
      if (Math.max(...maxes) / Math.min(...maxes) <= 5) forms.push("grouped");
    }
    return forms;
  }
  const shape = kpiShape(names[0], groupBy);
  if (!shape) return ["bars"];
  return shape.numeric ? ["bars"] : ["stack", "donut", "grid", "bars"];
}
function kpiResolveForm(names, groupBy, form){
  const allowed = kpiForms(names, groupBy);
  return allowed.includes(form) ? form : allowed[0];
}

/* ---------- draw whatever is selected ---------- */

/* Returns the pieces of a chart: legend above, plot, and the note under it.
   One entry point for the builder, the examples and nothing else. */
function kpiChart(sel, size){
  const names = sel.kpis.filter(kpiMeta);
  if (!names.length) return { legend: "", chart: `<p class="q-note">${t("kpi.noneChosen")}</p>`, note: "", more: "" };
  const form = kpiResolveForm(names, sel.group, sel.form);

  if (names.length > 1) {
    const cross = kpiCross(names, sel.group);
    if (form === "grouped") {
      const cols = cross.cols;
      const rows = cross.rowKeys.map(rk => ({ label: rk, values: cols.map(c => c.byRow[rk] ?? null) }));
      const shown = sel.all ? rows : rows.slice(0, KPI_TOP);
      return { legend: kpiLegend(cols.map(c => c.name)),
               chart: kpiGroupedBars(cols, shown, { size }),
               note: kpiCrossNote(cross),
               more: kpiMore(rows.length, sel.all) };
    }
    return { legend: kpiCrossLegend(cross),
             chart: kpiMatrixChart(cross, { size, all: sel.all }),
             note: kpiCrossNote(cross),
             more: kpiMore(cross.rowKeys.length, sel.all) };
  }

  const shape = kpiShape(names[0], sel.group);
  const note = `${kpiEsc(shape.meta.tab)} · ${t("kpi.type." + shape.meta.type)} · ${t("kpi.coverage", { n: shape.known, total: shape.total })}`;
  if (shape.numeric) {
    const shown = sel.all ? shape.items : shape.items.slice(0, KPI_TOP);
    return { legend: "", chart: kpiBarChart(shown, { size }), note,
             more: kpiMore(shape.items.length, sel.all) };
  }
  const legend = shape.keys.length >= 2 ? kpiLegend(shape.keys) : "";
  if (form === "donut") return { legend, chart: kpiDonutChart(shape.groups, shape.keys, { size }), note, more: "" };
  if (form === "grid")  return { legend, chart: kpiGridChart(shape.groups, shape.keys, { size }), note, more: "" };
  if (form === "bars") {
    /* Counts per answer, summed over the groups - a plain ranking of answers. */
    const pal = kpiPalette();
    const items = shape.keys.map((k, i) => ({
      label: k, value: shape.groups.reduce((n, g) => n + (g.counts[k] || 0), 0), colour: pal[i % pal.length]
    })).filter(i => i.value).sort((a, b) => b.value - a.value);
    return { legend: "", chart: kpiBarChart(items, { size }), note, more: "" };
  }
  return { legend, chart: kpiStackChart(shape.groups, shape.keys, { size }), note, more: "" };
}

function kpiMore(n, all){
  if (n <= KPI_TOP) return "";
  return `<button class="btn lnk" id="kAll" type="button">${
    all ? t("kpi.showTop", { n: KPI_TOP }) : t("kpi.showAll", { n })}</button>`;
}
function kpiCrossNote(cross){
  return cross.cols.map(c => kpiEsc(c.name)).join("  ·  ") + "  ·  "
       + t("kpi.crossRows", { n: cross.rowKeys.length });
}

/* ---------- the builder ---------- */

/* Everything is in `store.kpi.builder`; changing a control rewrites this one
   card, so the chart redraws under the controls instead of sending the reader
   anywhere. */
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

  const allowed = chosen.length ? kpiForms(chosen, b.group) : [];
  const formDD = allowed.length > 1
    ? kpiDD("bForm", kpiResolveForm(chosen, b.group, b.form),
        [{ items: allowed.map(f => ({ v: f, l: t("kpi.form." + f) })) }], { label: t("kpi.formLbl") })
    : "";

  const chips = chosen.map(n => `<span class="kpi-chip">${kpiEsc(n)}
    <button type="button" class="kpi-chip-x" data-kpi="${kpiEsc(n)}" aria-label="${t("kpi.remove")}">✕</button></span>`).join("");

  const d = kpiChart(b, "wide");
  return `<div class="cap"><h2>${t("kpi.buildTitle")}</h2>
      <button class="btn" id="kXlsx" type="button">${t("kpi.xlsx")}</button></div>
    <div class="bd">
      <div class="kpi-build-row">
        ${addDD}${groupDD}${formDD}
        ${chosen.length ? `<button class="btn lnk" id="kClear" type="button">${t("kpi.clear")}</button>` : ""}
      </div>
      ${chips ? `<div class="kpi-chips">${chips}</div>` : ""}
      <p class="q-note kpi-build-help">${chosen.length > 1 ? t("kpi.crossHelp") : t("kpi.buildHelp")}</p>
      <div class="kpi-preview">
        ${d.note ? `<p class="q-note kpi-meta">${d.note}</p>` : ""}
        ${d.legend}
        <div class="kpi-wrap">${d.chart}</div>
        ${d.more}
      </div>
    </div>`;
}

function renderBuilder(){
  const host = $("#kBuild");
  if (!host) return;
  const s = kpiState(), b = s.builder;
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
  const all = $("#kAll");
  if (all) all.addEventListener("click", () => { b.all = !b.all; saveStore(); renderBuilder(); });
  $("#kXlsx").addEventListener("click", kpiExportXlsx);
  kpiWireTips(host);
}

/* ---------- example charts ---------- */

/* Four worked examples at a time, each a different form and drawn from the live
   data. A name in a list does not show you the shape of the answer; a chart
   does. The arrows walk the shortlist rather than shuffling it, so a consultant
   can go back to the one they just saw. */
function kpiExamples(){
  const s = kpiState();
  const usable = KPI_EXAMPLES.filter(e => e.kpis.every(kpiMeta));
  if (!usable.length) return "";
  const page = Math.floor(s.exStart / 4), pages = Math.ceil(usable.length / 4);

  const tiles = usable.slice(s.exStart, s.exStart + 4).map((ex, i) => {
    const d = kpiChart(ex, "mini");
    return `<div class="kpi-ex">
      <div class="kpi-ex-h">${kpiEsc(ex.kpis.join(" · "))}</div>
      <div class="kpi-ex-s">${t("kpi.form." + kpiResolveForm(ex.kpis, ex.group, ex.form))}${
        ex.group ? " · " + t(ex.group === "region" ? "kpi.byRegion" : "kpi.byMaturity") : ""}</div>
      ${d.legend}
      <div class="kpi-wrap">${d.chart}</div>
      <button type="button" class="btn lnk kpi-ex-use" data-ex="${s.exStart + i}">${t("kpi.exUse")}</button>
    </div>`;
  }).join("");

  return `<div class="card" id="kEx"><div class="cap"><h2>${t("kpi.exTitle")}</h2>
      <div class="kpi-ex-nav">
        <button class="btn icon" id="kExPrev" type="button" aria-label="${t("kpi.exPrev")}" title="${t("kpi.exPrev")}">‹</button>
        <span class="kpi-ex-pg">${page + 1} / ${pages}</span>
        <button class="btn icon" id="kExNext" type="button" aria-label="${t("kpi.exNext")}" title="${t("kpi.exNext")}">›</button>
      </div></div>
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
      <button class="btn" id="kReset" type="button">${t("inbox.reset")}</button>
    </div>
    <p class="q-note" style="margin:0">${t("kpi.help")}</p>
  </div></div>

  <div class="card kpi-builder" id="kBuild"></div>

  ${kpiExamples()}`;

  KPI_DD.region = v => { s.region = v; saveStore(); renderInsights(); };
  KPI_DD.level  = v => { s.maturity = v; saveStore(); renderInsights(); };
  kpiWireDD(el);
  renderBuilder();

  $("#kReset").addEventListener("click", () => { delete store.kpi; saveStore(); renderInsights(); });

  const usable = KPI_EXAMPLES.filter(e => e.kpis.every(kpiMeta));
  const step = n => {
    const pages = Math.ceil(usable.length / 4);
    s.exStart = ((Math.floor(s.exStart / 4) + n + pages) % pages) * 4;
    saveStore(); renderInsights();
    const ex = $("#kEx"); if (ex) ex.scrollIntoView({ block: "nearest" });
  };
  const prev = $("#kExPrev"), next = $("#kExNext");
  if (prev) prev.addEventListener("click", () => step(-1));
  if (next) next.addEventListener("click", () => step(1));
  el.querySelectorAll(".kpi-ex-use").forEach(b => b.addEventListener("click", () => {
    const ex = usable[+b.dataset.ex];
    s.builder = { kpis: ex.kpis.slice(), group: ex.group, form: ex.form };
    saveStore(); renderInsights();
    const host = $("#kBuild"); if (host) host.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  kpiWireTips(el);
}

/* ---------- export ---------- */

/* The workbook a consultant hands over: the rows behind the chart, then one
   sheet per indicator carrying its table AND a real Excel chart bound to those
   cells - and, when several indicators are crossed, the crossed table itself. */
function kpiExportXlsx(){
  const s = kpiState();
  const b = s.builder;
  const names = b.kpis.filter(kpiMeta);
  if (!names.length) return;
  const taken = new Set();

  const data = [["KPI", "Tab", "Country", "Region", "Maturity", "Value"]];
  const wanted = new Set(names);
  KPI_ROWS.filter(r => wanted.has(r.kpi))
    .filter(r => !s.region || r.region === s.region)
    .filter(r => !s.maturity || String(r.maturity) === String(s.maturity))
    .forEach(r => data.push([r.kpi, r.tab, r.country, r.region, r.maturity, r.value]));

  const sheets = [{ name: xlSheetName(t("kpi.sheetData"), taken), rows: data,
                    widths: [46, 24, 18, 10, 10, 34], chart: null }];

  if (names.length > 1) {
    /* The crossed table, exactly as the matrix shows it, so the comparison
       survives the trip into Excel. */
    const cross = kpiCross(names, b.group);
    const head = [b.group ? t("kpi.group") : t("kpi.country")].concat(cross.cols.map(c => c.name));
    const rows = cross.rowKeys.map(rk => [rk].concat(cross.cols.map(c => {
      const v = c.byRow[rk];
      return v === undefined || v === null ? "" : (c.numeric ? v : v.key);
    })));
    sheets.push({ name: xlSheetName(t("kpi.sheetCross"), taken), rows: [head].concat(rows),
                  widths: [26].concat(cross.cols.map(() => 22)), chart: null });
  }

  names.forEach(kpiName => {
    const shape = kpiShape(kpiName, b.group);
    if (!shape || !shape.categories.length) return;
    const name = xlSheetName(kpiName, taken);
    /* A donut on screen becomes a pie in Excel; everything else is a bar. */
    const pie = !shape.numeric && names.length === 1
                && kpiResolveForm(names, b.group, b.form) === "donut" && shape.groups.length === 1;
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
  });

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
