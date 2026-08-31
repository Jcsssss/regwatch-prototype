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

function kpiPalette(){
  const dark = matchMedia("(prefers-color-scheme: dark)").matches
    || document.documentElement.dataset.theme === "dark";
  return (document.documentElement.dataset.theme === "light") ? KPI_LIGHT
       : dark ? KPI_DARK : KPI_LIGHT;
}

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

/* ---------- shaping ---------- */


/* ---------- SVG helpers ---------- */

const kpiEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function kpiTip(text){
  return ` data-tip="${kpiEsc(text)}"`;
}

/* A ranked horizontal bar chart. One series, single hue: magnitude, not identity. */
function kpiBarChart(items, opts){
  const o = Object.assign({ unit: "", max: null, colour: kpiPalette()[0] }, opts || {});
  if (!items.length) return `<p class="q-note">${t("kpi.noData")}</p>`;
  const rowH = 26, padL = 148, padR = 54, padT = 6;
  const W = 720, H = padT + items.length * rowH + 8;
  const max = o.max != null ? o.max : Math.max(...items.map(i => i.value), 1);
  const x = v => padL + (W - padL - padR) * (v / (max || 1));

  let svg = `<svg class="kpi-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img">`;
  /* recessive gridlines */
  for (let g = 0; g <= 4; g++) {
    const gx = padL + (W - padL - padR) * (g / 4);
    svg += `<line x1="${gx}" y1="${padT}" x2="${gx}" y2="${H - 8}" class="kpi-grid"/>`;
    svg += `<text x="${gx}" y="${H - 1}" class="kpi-axis" text-anchor="middle">${Math.round(max * g / 4)}</text>`;
  }
  items.forEach((it, i) => {
    const y = padT + i * rowH;
    const w = Math.max(2, x(it.value) - padL);
    svg += `<text x="${padL - 8}" y="${y + 15}" class="kpi-lbl" text-anchor="end">${kpiEsc(it.label)}</text>`;
    /* 4px rounded data-end, anchored to the baseline; 2px gap between bars */
    svg += `<rect x="${padL}" y="${y + 3}" width="${w}" height="${rowH - 8}" rx="4"
             fill="${o.colour}"${kpiTip(it.label + " : " + it.value + (o.unit ? " " + o.unit : ""))}/>`;
    svg += `<text x="${padL + w + 6}" y="${y + 15}" class="kpi-val">${it.value}${o.unit ? " " + o.unit : ""}</text>`;
  });
  return svg + `</svg>`;
}

/* Stacked horizontal bars: one bar per group, segments = the indicator's values. */
function kpiStackChart(groups, keys, opts){
  const pal = kpiPalette();
  if (!groups.length) return `<p class="q-note">${t("kpi.noData")}</p>`;
  const rowH = 34, padL = 128, padR = 20, padT = 4;
  const W = 720, H = padT + groups.length * rowH + 6;
  const max = Math.max(...groups.map(g => g.total), 1);
  const span = W - padL - padR;

  let svg = `<svg class="kpi-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img">`;
  groups.forEach((g, i) => {
    const y = padT + i * rowH;
    svg += `<text x="${padL - 8}" y="${y + 20}" class="kpi-lbl" text-anchor="end">${kpiEsc(g.label)}</text>`;
    let cx = padL;
    keys.forEach((k, ki) => {
      const n = g.counts[k] || 0;
      if (!n) return;
      const w = span * (n / max);
      /* 2px surface gap between segments so adjacent fills never touch */
      svg += `<rect x="${cx}" y="${y + 6}" width="${Math.max(2, w - 2)}" height="${rowH - 16}" rx="4"
               fill="${pal[ki % pal.length]}"${kpiTip(g.label + " - " + k + " : " + n)}/>`;
      if (w > 30) svg += `<text x="${cx + w / 2 - 1}" y="${y + 20}" class="kpi-seg">${n}</text>`;
      cx += w;
    });
    /* The trailing total only earns its place when the bar has more than one
       segment; otherwise it repeats the number already inside it. */
    const segs = keys.filter(k => g.counts[k]).length;
    if (segs > 1) svg += `<text x="${cx + 6}" y="${y + 20}" class="kpi-val">${g.total}</text>`;
  });
  return svg + `</svg>`;
}

function kpiLegend(keys){
  const pal = kpiPalette();
  return `<div class="kpi-legend">${keys.map((k, i) =>
    `<span class="kpi-leg"><span class="sw" style="background:${pal[i % pal.length]}"></span>${kpiEsc(k)}</span>`
  ).join("")}</div>`;
}

/* ---------- one panel ---------- */

function kpiPanel(panel, index){
  const meta = KPI_CATALOGUE.find(k => k.kpi === panel.kpi);
  if (!meta) return "";
  const rows = kpiRowsFor(panel.kpi).filter(r => r.value);
  const known = rows.length;
  const total = kpiRowsFor(panel.kpi).length;

  let chart = "", legend = "", table = "";
  const groupBy = panel.group || "";

  if (meta.type === "numeric") {
    if (groupBy) {
      /* Average per group - a mean of two countries is not a fact, so the count
         travels with it in the tooltip. */
      const acc = {};
      rows.forEach(r => {
        const v = kpiNum(r.value); if (v === null) return;
        const g = kpiGroupOf(r, groupBy);
        (acc[g] = acc[g] || []).push(v);
      });
      const items = Object.keys(acc).sort().map(g => ({
        label: g + " (" + acc[g].length + ")",
        value: Math.round(acc[g].reduce((a, b) => a + b, 0) / acc[g].length * 10) / 10
      })).sort((a, b) => b.value - a.value);
      chart = kpiBarChart(items, {});
      table = items.map(i => [i.label, i.value]);
    } else {
      const items = rows.map(r => ({ label: r.country, value: kpiNum(r.value) }))
        .filter(i => i.value !== null).sort((a, b) => b.value - a.value);
      chart = kpiBarChart(items, {});
      table = items.map(i => [i.label, i.value]);
    }
  } else {
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
    chart = kpiStackChart(list, keys, {});
    /* Legend whenever there are two or more series - identity is never colour alone. */
    if (keys.length >= 2) legend = kpiLegend(keys);
    table = list.map(g => [g.label].concat(keys.map(k => g.counts[k] || 0)));
    table.unshift([t("kpi.group")].concat(keys));
  }

  const head = meta.type === "numeric" ? [t("kpi.group"), t("kpi.value")] : null;
  return `<div class="card kpi-panel" data-panel="${index}">
    <div class="cap">
      <h2>${kpiEsc(panel.kpi)}</h2>
      <div class="kpi-tools">
        <select class="kpi-group" data-panel="${index}" aria-label="${t("kpi.groupBy")}">
          <option value="" ${!groupBy ? "selected" : ""}>${t("kpi.noGroup")}</option>
          <option value="region" ${groupBy === "region" ? "selected" : ""}>${t("kpi.byRegion")}</option>
          <option value="maturity" ${groupBy === "maturity" ? "selected" : ""}>${t("kpi.byMaturity")}</option>
        </select>
        <button class="btn kpi-remove" data-panel="${index}" type="button" aria-label="${t("kpi.remove")}">✕</button>
      </div>
    </div>
    <div class="bd">
      <p class="q-note" style="margin-top:0">${kpiEsc(meta.tab)} · ${t("kpi.type." + meta.type)} · ${t("kpi.coverage", { n: known, total: total })}</p>
      ${legend}
      <div class="kpi-wrap">${chart}</div>
      ${kpiState().table ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl">
        ${head ? `<thead><tr>${head.map(h => `<th>${kpiEsc(h)}</th>`).join("")}</tr></thead>` : ""}
        <tbody>${table.map((r, ri) => `<tr>${r.map((c, ci) =>
          (ri === 0 && !head) ? `<th>${kpiEsc(c)}</th>` :
          `<td${ci ? ' class="num"' : ""}>${kpiEsc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>` : ""}
    </div>
  </div>`;
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
      <select id="kRegion" aria-label="${t("kpi.region")}">
        <option value="">${t("kpi.allRegions")}</option>
        ${regions.map(r => `<option value="${kpiEsc(r)}" ${s.region === r ? "selected" : ""}>${t("reg." + r) || r}</option>`).join("")}
      </select>
      <select id="kLevel" aria-label="${t("kpi.maturity")}">
        <option value="">${t("kpi.allLevels")}</option>
        ${levels.map(l => `<option value="${l}" ${String(s.maturity) === String(l) ? "selected" : ""}>${t("common.level")} ${l}</option>`).join("")}
      </select>
      <select id="kAdd" aria-label="${t("kpi.add")}">
        <option value="">${t("kpi.add")}</option>
        ${Object.keys(byTab).sort().map(tab => `<optgroup label="${kpiEsc(tab)}">${
          byTab[tab].map(k => `<option value="${kpiEsc(k.kpi)}">${kpiEsc(k.kpi)}</option>`).join("")
        }</optgroup>`).join("")}
      </select>
      <label class="q-toggle"><input type="checkbox" id="kTable" ${s.table ? "checked" : ""}> ${t("kpi.showTable")}</label>
      <button class="btn" id="kCsv" type="button">${t("ins.csv")}</button>
      <button class="btn" id="kReset" type="button">${t("inbox.reset")}</button>
    </div>
    <p class="q-note" style="margin:0">${t("kpi.help")}</p>
  </div></div>

  ${s.panels.map((p, i) => kpiPanel(p, i)).join("") ||
    `<div class="card"><div class="bd"><p class="q-note">${t("kpi.empty")}</p></div></div>`}`;

  /* filters */
  $("#kRegion").addEventListener("change", e => { s.region = e.target.value; saveStore(); renderInsights(); });
  $("#kLevel").addEventListener("change", e => { s.maturity = e.target.value; saveStore(); renderInsights(); });
  $("#kTable").addEventListener("change", e => { s.table = e.target.checked; saveStore(); renderInsights(); });
  $("#kAdd").addEventListener("change", e => {
    if (!e.target.value) return;
    s.panels.push({ kpi: e.target.value, group: "" });
    saveStore(); renderInsights();
  });
  $("#kReset").addEventListener("click", () => { delete store.kpi; saveStore(); renderInsights(); });
  $("#kCsv").addEventListener("click", kpiExportCSV);
  el.querySelectorAll(".kpi-group").forEach(sel => sel.addEventListener("change", e => {
    s.panels[+e.target.dataset.panel].group = e.target.value; saveStore(); renderInsights();
  }));
  el.querySelectorAll(".kpi-remove").forEach(b => b.addEventListener("click", () => {
    s.panels.splice(+b.dataset.panel, 1); saveStore(); renderInsights();
  }));
  el.querySelectorAll("[data-tip]").forEach(n => {
    n.addEventListener("mousemove", e => showTip(n.dataset.tip, e.clientX, e.clientY));
    n.addEventListener("mouseleave", hideTip);
  });
}

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
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `regwatch-kpi-${lang}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
