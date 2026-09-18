/* ---------- la vue europeenne ----------
 *
 * Les graphiques de l'etude comparative (NIS2_Comparative_Study), recalcules a
 * chaque ouverture depuis le classeur Cyber Watch porte par l'outil. Rien n'est
 * saisi ici : quand le classeur change et que l'outil est reconstruit, chaque
 * compteur, chaque drapeau et chaque titre suit.
 *
 * Ce qui reste au consultant : le message. Le titre propose est une phrase
 * factuelle calculee (« 19 pays sur 27… ») ; il peut le reecrire et ajouter son
 * analyse sous le graphique. Ces textes sont enregistres dans le navigateur, par
 * graphique, et un titre reecrit ne suit plus les donnees - un bouton le ramene
 * a la phrase calculee.
 *
 * Organisation : les sections suivent la fiche pays (transposition, perimetre,
 * incidents, enregistrement, referentiel, audits, sanctions), pour qu'un
 * lecteur passe de la vue d'un pays a la comparaison sans changer de reperes.
 *
 * Sources : SHEET_DATA (une case par colonne du classeur) et SECTOR_DATA
 * (feuille Sectors - P3). Les champs types de COUNTRIES ne servent qu'a la
 * liste des pays : ils sont plus anciens que le classeur sur plusieurs retards,
 * et deux sources pour un meme chiffre finiraient par se contredire a l'ecran.
 *
 * Lecture prudente : plusieurs colonnes numeriques portent du texte
 * (« 36 ; ad-hoc », « 15 a 45 jours »). Le premier nombre est retenu quand il y
 * en a un ; sinon le pays tombe dans une categorie explicite (« sans cycle
 * fixe », « non precise ») et le texte d'origine reste lisible au survol.
 */

const EU_SECTIONS = [
  { key: "tr", icon: "clock", tKey: "eu.s.tr" },
  { key: "scope", icon: "grid", tKey: "eu.s.scope" },
  { key: "inc", icon: "alert", tKey: "fiche.inc" },
  { key: "reg", icon: "card", tKey: "fiche.reg" },
  { key: "fw", icon: "shield", tKey: "fiche.fw" },
  { key: "aud", icon: "search", tKey: "fiche.aud" },
  { key: "san", icon: "scale", tKey: "fiche.san" },
  { key: "mine", icon: "sparkle", tKey: "eu.s.mine" }
];

/* ---------- lecture ---------- */
function euCell(iso, key, col){
  const r = typeof SHEET_DATA !== "undefined" && SHEET_DATA.rows[iso];
  const v = r && r[key] && r[key][col];
  return v == null ? null : String(v);
}
/* Pour l'affichage seulement : la valeur dans la langue de l'interface. Les
   tests (euYes, /platform/...) lisent euCell, la valeur d'origine. */
const euShow = (iso, key, col) => { const v = euCell(iso, key, col); return v == null ? v : tc(v); };
const euNC = v => v == null || v === "NC";
const euYes = v => v != null && /^\s*(yes|oui)\b/i.test(v);
const euNo = v => v != null && /^\s*(no|non)\b/i.test(v);
function euNum(v){
  if (euNC(v)) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  /* « 15 a 45 jours » : un delai en jours, ramene au mois */
  return /jour|day/i.test(v) ? Math.round(n / 30 * 10) / 10 : n;
}
const euRound = n => Math.round(n * 10) / 10;
const euFmt = n => String(euRound(n)).replace(".", lang === "fr" ? "," : ".");

/* ---------- selection des pays ---------- */
const EU_REGIONS = ["North", "South", "East", "West"];
const EU_PRESETS = ["all", "done", "todo", "regions", "custom"];
function euAll(){ return COUNTRIES.slice().sort((a, b) => a.name.localeCompare(b.name, lang)); }
function euTransposed(iso){ return euYes(euCell(iso, "id", "F")); }
/* Par defaut : tous les pays suivis, et aucune region cochee - on choisit ses
   regions soi-meme. Les anciens choix enregistres (« UE 27 », une region seule)
   sont repris sous cette forme. */
function euSelState(){
  const s = store.euSel || {};
  let preset = s.preset, regions = Array.isArray(s.regions) ? s.regions.filter(r => EU_REGIONS.includes(r)) : [];
  if (typeof preset === "string" && preset.startsWith("r:")) { regions = [preset.slice(2)]; preset = "regions"; }
  if (!EU_PRESETS.includes(preset)) preset = "all";
  return { preset, isos: Array.isArray(s.isos) ? s.isos : [], regions };
}
function euSelection(){
  const s = euSelState();
  const all = euAll();
  if (s.preset === "all") return all;
  if (s.preset === "done") return all.filter(c => c.eu && euTransposed(c.iso));
  if (s.preset === "todo") return all.filter(c => c.eu && !euTransposed(c.iso));
  if (s.preset === "custom") return all.filter(c => s.isos.includes(c.iso));
  /* Les regions se lisent parmi les Etats membres : le Royaume-Uni et la
     Norvege restent des comparateurs, pas un voisinage. */
  return all.filter(c => c.eu && s.regions.includes(c.region));
}

/* ---------- textes du consultant ---------- */
function euText(id){ return (store.euText || {})[id] || {}; }
function euSaveText(id, field, value){
  store.euText = store.euText || {};
  const cur = Object.assign({}, store.euText[id]);
  if (value) cur[field] = value; else delete cur[field];
  if (Object.keys(cur).length) store.euText[id] = cur; else delete store.euText[id];
  saveStore();
}

/* ---------- briques graphiques ---------- */
const euName = iso => (byIso[iso] || {}).name || iso;
function euFlag(iso, tipHtml){
  const tipTxt = `<b>${esc(euName(iso))}</b>${tipHtml ? "<br>" + tipHtml : ""}`;
  return `<a class="eu-flag" href="#/country/${iso}" data-tip="${esc(tipTxt)}" aria-label="${esc(euName(iso))}">${flagSvg(iso)}</a>`;
}
function euFlags(isos, max, tipOf){
  const shown = max ? isos.slice(0, max) : isos;
  const more = isos.length - shown.length;
  return `<span class="eu-flags">${shown.map(i => euFlag(i, tipOf ? tipOf(i) : "")).join("")}${more > 0
    ? `<span class="eu-more" data-tip="${esc(isos.slice(max).map(euName).join(", "))}">+${more}</span>` : ""}</span>`;
}
/* Jauge circulaire de l'etude : un nombre, sur le total de la selection. */
function euRing(n, total, color, label, isos){
  const r = 30, C = 2 * Math.PI * r, p = total ? n / total : 0;
  return `<div class="eu-ring">
    <div class="eu-ring-g"><svg viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r="${r}" fill="none" style="stroke:var(--surface3)" stroke-width="8"/>
      <circle cx="38" cy="38" r="${r}" fill="none" style="stroke:${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/>
    </svg>
    <div class="eu-ring-n"><b>${n}</b><span>/${total}</span></div></div>
    <div class="eu-ring-l"><span>${label}</span>${isos && isos.length ? euFlags(isos, 12) : ""}</div>
  </div>`;
}
function euLegend(items){
  return `<div class="eu-legend">${items.map(it =>
    `<span><i style="background:${it.color}"></i>${it.label} <em>${it.n}</em></span>`).join("")}</div>`;
}
/* Carte : une couleur par categorie ; hors selection, le pays s'efface. */
function euMap(sel, catOf, cats){
  const inSel = new Set(sel.map(c => c.iso));
  let paths = "";
  for (const [iso, d] of Object.entries(MAP_DATA.paths)) {
    const c = byIso[iso];
    if (!c || !inSel.has(iso)) {
      paths += `<path d="${d}" style="fill:var(--untracked)" opacity="${c ? .55 : 1}" stroke-width=".7"/>`;
      continue;
    }
    const k = catOf(c);
    const cat = cats.find(x => x.k === k.k) || cats[cats.length - 1];
    const tipTxt = `<b>${esc(c.name)}</b><span class="m">${cat.label}</span>${k.raw ? "<br>" + esc(k.raw) : ""}`;
    paths += `<path class="ctry" data-iso="${iso}" d="${d}" style="fill:${cat.color}" stroke-width=".7"
      data-tip="${esc(tipTxt)}"/>`;
  }
  return `<svg class="eu-map" viewBox="${MAP_DATA.viewBox}" role="img">${paths}</svg>`;
}
/* Paliers en escalier : chaque barre commence ou la precedente s'arrete, la
   longueur est le nombre de pays. C'est la forme du « generalized delay » de
   l'etude, et elle se lit comme une repartition cumulee. */
function euStairs(groups, total){
  let cum = 0;
  const rows = groups.map(g => {
    const n = g.isos.length;
    const left = total ? cum / total * 100 : 0;
    const w = total ? n / total * 100 : 0;
    cum += n;
    return `<div class="eu-st-row${n ? "" : " empty"}">
      <div class="eu-st-f">${euFlags(g.isos, 0, g.tipOf)}</div>
      <div class="eu-st-t">
        <div class="eu-st-b" style="left:${left}%;width:max(${w}%,6px);background:${g.color}"
          data-tip="${esc(`<b>${g.label}</b><br>${n} ${t("common.countries")}`)}"></div>
        <span class="eu-st-l" style="left:${left + w <= 72 ? left + w : left > 25 ? left : left + 1}%" data-side="${left + w <= 72 ? "after" : left > 25 ? "before" : "inside"}">
          <b>${g.label}</b> · ${n}</span>
      </div></div>`;
  }).join("");
  return `<div class="eu-stairs">${rows}</div>`;
}
/* Barres de part : x pays sur n, et les drapeaux concernes. */
function euShare(rows, total, opts){
  opts = opts || {};
  return `<div class="eu-share">${rows.map(r => {
    if (r.head) return `<div class="eu-sh-h">${r.head}</div>`;
    const n = r.isos.length;
    const p = total ? n / total * 100 : 0;
    return `<div class="eu-sh-row">
      <div class="eu-sh-l">${r.label}</div>
      <div class="eu-sh-t"><div class="eu-sh-b" style="width:${p}%;background:${r.color || "var(--accent)"}"></div></div>
      <span class="eu-sh-n"><b>${n}</b>/${total}</span>
      <div class="eu-sh-f">${euFlags(r.isos, opts.flags || 6, r.tipOf)}</div>
    </div>`;
  }).join("")}</div>`;
}
function euGroup(sel, fn){
  const m = new Map();
  sel.forEach(c => {
    const k = fn(c);
    if (k == null) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(c.iso);
  });
  return m;
}

/* ---------- les graphiques ---------- */
const EU_C = {
  good: "var(--m4)", mid: "var(--accent)", soft: "var(--m1)", warn: "#f5b82e",
  bad: "#ff3b5c", nc: "var(--line2)", ee: "var(--ee)", ie: "var(--ie)"
};

function euTrState(c){
  const f = euCell(c.iso, "id", "F");
  const delay = euNum(euCell(c.iso, "id", "I"));
  if (!euYes(f)) return { k: "todo", delay: null };
  if (!delay || /in time/i.test(euCell(c.iso, "id", "G") || "")) return { k: "ontime", delay: 0 };
  return { k: "late", delay };
}

const EU_CHARTS = {
  tr: [
    function trState(sel){
      const n = sel.length;
      const g = { ontime: [], late: [], todo: [] };
      sel.forEach(c => g[euTrState(c).k].push(c.iso));
      const cats = [
        { k: "ontime", label: t("eu.cat.onTime"), color: EU_C.good },
        { k: "late", label: t("eu.cat.late"), color: EU_C.mid },
        { k: "todo", label: t("eu.cat.notYet"), color: EU_C.warn }
      ];
      return {
        id: "tr-state", wide: true, src: "id!F, id!I",
        title: t("eu.t.trState", { late: g.late.length, n, todo: g.todo.length }),
        body: `<div class="eu-mapgrid">
          <div>${euMap(sel, c => {
            const s = euTrState(c);
            return { k: s.k, raw: s.k === "late" ? t("eu.delayM", { n: euFmt(s.delay) }) : "" };
          }, cats)}${euLegend(cats.map(x => Object.assign({ n: g[x.k].length }, x)))}</div>
          <div class="eu-rings">
            ${euRing(g.ontime.length, n, EU_C.good, t("eu.ring.onTime"), g.ontime)}
            ${euRing(g.late.length, n, EU_C.mid, t("eu.ring.late"), g.late)}
            ${euRing(g.todo.length, n, EU_C.warn, t("eu.ring.notYet"), g.todo)}
          </div></div>`
      };
    },
    function trDelay(sel){
      const n = sel.length;
      const B = [
        { label: t("eu.cat.onTime"), test: d => d === 0, color: EU_C.good },
        { label: t("eu.b.lt", { n: 6 }), test: d => d > 0 && d < 6, color: "var(--green)" },
        { label: t("eu.b.range", { a: 6, b: 12 }), test: d => d >= 6 && d < 12, color: "color-mix(in srgb,var(--green) 55%,var(--accent))" },
        { label: t("eu.b.range", { a: 12, b: 18 }), test: d => d >= 12 && d < 18, color: "var(--m2)" },
        { label: t("eu.b.range", { a: 18, b: 24 }), test: d => d >= 18 && d < 24, color: "var(--accent2)" },
        { label: t("eu.b.gt", { n: 24 }), test: d => d >= 24, color: "var(--ink)" }
      ];
      const groups = B.map(b => ({ label: b.label, color: b.color, isos: [],
        tipOf: iso => t("eu.delayM", { n: euFmt(euTrState(byIso[iso]).delay || 0) }) }));
      const todo = { label: t("eu.cat.notYet"), color: EU_C.warn, isos: [] };
      const late = [];
      sel.forEach(c => {
        const s = euTrState(c);
        if (s.k === "todo") { todo.isos.push(c.iso); return; }
        if (s.k === "late") late.push(s.delay);
        const i = B.findIndex(b => b.test(s.delay));
        if (i >= 0) groups[i].isos.push(c.iso);
      });
      const avg = late.length ? late.reduce((a, b) => a + b, 0) / late.length : 0;
      const all = groups.filter(g => g.isos.length).concat(todo.isos.length ? [todo] : []);
      return {
        id: "tr-delay", wide: true, src: "id!F, id!I",
        title: late.length ? t("eu.t.trDelay", { n: late.length, avg: euFmt(avg) }) : t("eu.t.trDelayNone"),
        body: `<div class="eu-side">
          ${euStairs(all, n)}
          <div class="eu-kpis">
            <div class="eu-kpi"><b>${euFmt(avg)}</b><span>${t("eu.k.avgDelay")}</span></div>
            <div class="eu-kpi"><b>${late.length ? Math.max(...late) : 0}</b><span>${t("eu.k.maxDelay")}</span></div>
            <div class="eu-kpi"><b>${todo.isos.length}</b><span>${t("eu.k.notYet")}</span></div>
          </div></div>`
      };
    },
    function trSemester(sel){
      const order = ["In time", "S2 2024", "S1 2025", "S2 2025", "S1 2026", "S2 2026", "S1 2027", "S2 2027"];
      const g = euGroup(sel, c => {
        const v = euCell(c.iso, "id", "G");
        return euNC(v) || !euTransposed(c.iso) ? "NC" : v;
      });
      const keys = order.filter(k => g.has(k)).concat([...g.keys()].filter(k => !order.includes(k) && k !== "NC"));
      const max = Math.max(1, ...keys.map(k => g.get(k).length));
      const lab = k => k === "In time" ? t("eu.cat.onTime") : k;
      const dated = keys.filter(k => k !== "In time");
      const filled = keys.reduce((s, k) => s + g.get(k).length, 0);
      return {
        id: "tr-sem", src: "id!E, id!G", filled,
        title: dated.length ? t("eu.t.trSem", { a: dated[0], b: dated[dated.length - 1], n: (g.get("In time") || []).length }) : "",
        body: `<div class="eu-cols">${keys.map((k, i) => `<div class="eu-col">
            <span class="eu-col-n">${g.get(k).length}</span>
            <div class="eu-col-stack" style="height:${g.get(k).length / max * 100}%">
              ${g.get(k).map(iso => euFlag(iso, esc(fmtDateL(euCell(iso, "id", "E")) || ""))).join("")}</div>
            <span class="eu-col-l${i === 0 ? " first" : ""}">${lab(k)}</span></div>`).join("")}
          </div>
          ${g.has("NC") ? `<p class="eu-foot">${t("eu.notYetList")} ${euFlags(g.get("NC"), 0)}</p>` : ""}`
      };
    },
    function trDoc(sel){
      const g = euGroup(sel, c => euNC(euCell(c.iso, "id", "J")) ? null : euCell(c.iso, "id", "J"));
      const rows = [...g.entries()].sort((a, b) => b[1].length - a[1].length)
        .map(([k, isos], i) => ({ label: esc(euCat("doc", k)), isos, color: [EU_C.mid, EU_C.soft, EU_C.good][i] || EU_C.nc }));
      const top = rows[0];
      return {
        id: "tr-doc", src: "id!J", filled: rows.reduce((s, r) => s + r.isos.length, 0),
        title: top ? t("eu.t.trDoc", { n: top.isos.length, total: sel.length, kind: top.label.toLowerCase() }) : "",
        body: euShare(rows, sel.length)
      };
    }
  ],

  scope: [
    function scopeGrid(sel){
      if (typeof SECTOR_DATA === "undefined") return null;
      const isos = sel.map(c => c.iso).filter(i => SECTOR_DATA.rows[i]);
      const tiles = list => list.map(r => {
        const a = [], o = [], gp = [];
        isos.forEach(iso => {
          const st = sectorState(iso, r[0]);
          if (!st || !st.tracked || st.nc) return;
          if (st.add) a.push(iso);
          if (st.other) o.push(iso);
          if (st.gaps.length) gp.push(iso);
        });
        const txt = (iso, f) => { const st = sectorState(iso, r[0]); const v = f === "gaps" ? st.gaps.join(", ") : st[f]; return esc(String(v).slice(0, 220)) + (String(v).length > 220 ? "…" : ""); };
        const tracked = SECTOR_DATA.sectors.some(s => s.k === r[0]);
        return `<div class="eu-sec${a.length ? " hot" : ""}">
          <div class="eu-sec-h"><span class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">${SECT_ICONS[r[0]] || ""}</svg></span><b>${t(r[1])}</b></div>
          ${tracked ? `<div class="eu-sec-m">
            ${a.length ? `<div><span class="stag add">${t("sect.st.add")} · ${a.length}</span>${euFlags(a, 6, i => txt(i, "add"))}</div>` : ""}
            ${gp.length ? `<div><span class="stag gap">${t("sect.st.gap")} · ${gp.length}</span>${euFlags(gp, 6, i => txt(i, "gaps"))}</div>` : ""}
            ${o.length ? `<div><span class="stag oth">${t("sect.st.other")} · ${o.length}</span>${euFlags(o, 6, i => txt(i, "other"))}</div>` : ""}
            ${!a.length && !gp.length && !o.length ? `<span class="stag same">${t("eu.sec.same")}</span>` : ""}
          </div>` : `<div class="eu-sec-m"><span class="stag mute">${t("sect.st.none")}</span></div>`}
        </div>`;
      }).join("");
      let nAdd = new Set(), topK = null, topN = -1;
      FICHE_EE.concat(FICHE_EI).forEach(r => {
        let k = 0;
        isos.forEach(iso => { const st = sectorState(iso, r[0]); if (st && st.tracked && (st.add || st.other)) k++; if (st && st.add) nAdd.add(iso); });
        if (k > topN) { topN = k; topK = r; }
      });
      return {
        id: "scope-grid", wide: true, src: "Sectors - P3", filled: isos.length,
        title: t("eu.t.scopeGrid", { n: nAdd.size, total: sel.length, sector: topK ? t(topK[1]).toLowerCase() : "" }),
        body: `<div class="eu-ann"><h4><i class="ee"></i>${t("fiche.annex1")}</h4><div class="eu-secs">${tiles(FICHE_EE)}</div></div>
          <div class="eu-ann"><h4><i class="ei"></i>${t("fiche.annex2")}</h4><div class="eu-secs">${tiles(FICHE_EI)}</div></div>`
      };
    },
    function scopeNew(sel){
      if (typeof SECTOR_DATA === "undefined") return null;
      const yes = [], no = [];
      sel.forEach(c => {
        const r = SECTOR_DATA.rows[c.iso];
        if (!r) return;
        (r._new && r._new !== "NC" ? yes : no).push(c.iso);
      });
      return {
        id: "scope-new", wide: true, src: "Sectors - P3 · NEW SECTORS", filled: yes.length + no.length,
        title: t("eu.t.scopeNew", { n: yes.length, total: sel.length }),
        body: `<div class="eu-big">
          ${euRing(yes.length, sel.length, "var(--ok)", t("eu.ring.newSectors"))}
          <ul class="eu-list">${yes.map(iso => `<li>${euFlag(iso)}<div><b>${esc(euName(iso))}</b>
            <span>${esc(SECTOR_DATA.rows[iso]._new.split("\n")[0].slice(0, 170))}${SECTOR_DATA.rows[iso]._new.length > 170 ? "…" : ""}</span></div></li>`).join("")}</ul>
        </div>`
      };
    }
  ],

  inc: [
    function incDef(sel){
      const yes = [], no = [], nc = [];
      sel.forEach(c => { const v = euCell(c.iso, "inc", "L"); (euYes(v) ? yes : euNo(v) ? no : nc).push(c.iso); });
      const crit = iso => esc(String(euShow(iso, "inc", "N") || euShow(iso, "inc", "M") || "").slice(0, 200));
      return {
        id: "inc-def", wide: true, src: "inc!L, inc!M, inc!N", filled: yes.length + no.length,
        title: t("eu.t.incDef", { yes: yes.length, no: no.length }),
        body: `<div class="eu-duo">
          <div class="eu-bub">
            <div class="eu-bub-n" style="--bc:var(--accent)"><b>${yes.length}</b><span>${t("common.countries")}</span></div>
            <div><h4>${t("eu.inc.same")}</h4><p>${t("eu.inc.sameD")}</p>${euFlags(yes, 0)}</div>
          </div>
          <div class="eu-bub">
            <div class="eu-bub-n" style="--bc:var(--ok)"><b>${no.length}</b><span>${t("common.countries")}</span></div>
            <div><h4>${t("eu.inc.more")}</h4><p>${t("eu.inc.moreD")}</p>${euFlags(no, 0, crit)}</div>
          </div>
        </div>
        ${nc.length ? `<p class="eu-foot">${t("eu.ncList")} ${euFlags(nc, 0)}</p>` : ""}`
      };
    },
    function incOrg(sel){
      const org = euGroup(sel, c => euNC(euCell(c.iso, "inc", "E")) ? null : euCell(c.iso, "inc", "E"));
      const meth = euGroup(sel, c => { const v = euCell(c.iso, "inc", "H"); return euNC(v) ? null : /mail/i.test(v) ? "mail" : "platform"; });
      const spec = euGroup(sel, c => euYes(euCell(c.iso, "inc", "P")) ? "yes" : null);
      const orgRows = [...org.entries()].sort((a, b) => b[1].length - a[1].length)
        .map(([k, isos]) => ({ label: esc(euCat("org", k)), isos, color: EU_C.mid }));
      const top = orgRows[0];
      return {
        id: "inc-org", src: "inc!E, inc!H, inc!P",
        title: top ? t("eu.t.incOrg", { n: top.isos.length, org: top.label }) : "",
        body: euShare([{ head: t("eu.h.incOrg") }].concat(orgRows, [
          { head: t("eu.h.incMethod") },
          { label: t("eu.cat.platform"), isos: meth.get("platform") || [], color: EU_C.good },
          { label: t("eu.cat.mail"), isos: meth.get("mail") || [], color: EU_C.soft },
          { head: t("eu.h.incTimeline") },
          { label: t("eu.inc.timelineDiff"), isos: spec.get("yes") || [], color: EU_C.warn,
            tipOf: iso => esc(euShow(iso, "inc", "Q") || "") }
        ]), sel.length)
      };
    },
    function incSince(sel){
      /* Date a laquelle la notification devient obligatoire, par semestre : la
         meme lecture que l'entree en vigueur, mais sur la colonne propre aux
         incidents - certains pays la decalent. */
      const g = euGroup(sel, c => {
        const v = euCell(c.iso, "inc", "G");
        const m = /^(\d{4})-(\d{2})/.exec(v || "");
        return m ? `S${+m[2] <= 6 ? 1 : 2} ${m[1]}` : null;
      });
      const keys = [...g.keys()].sort((a, b) => a.slice(3) + a[1] < b.slice(3) + b[1] ? -1 : 1);
      const other = sel.filter(c => ![...g.values()].some(v => v.includes(c.iso))).map(c => c.iso);
      const max = Math.max(1, ...keys.map(k => g.get(k).length));
      return {
        id: "inc-since", src: "inc!G", filled: sel.length - other.length,
        title: keys.length ? t("eu.t.incSince", { a: keys[0], b: keys[keys.length - 1] }) : "",
        body: `<div class="eu-cols">${keys.map(k => `<div class="eu-col">
            <span class="eu-col-n">${g.get(k).length}</span>
            <div class="eu-col-stack" style="height:${g.get(k).length / max * 100}%">
              ${g.get(k).map(iso => euFlag(iso, esc(fmtDateL(euCell(iso, "inc", "G"))))).join("")}</div>
            <span class="eu-col-l">${k}</span></div>`).join("")}</div>
          ${other.length ? `<p class="eu-foot">${t("eu.otherList")} ${euFlags(other, 0, iso => esc(String(euShow(iso, "inc", "G") || t("fiche.nc")).slice(0, 160)))}</p>` : ""}`
      };
    }
  ],

  reg: [
    function regMap(sel){
      const n = sel.length;
      const cat = c => {
        const d = euCell(c.iso, "reg", "D"), m = euCell(c.iso, "reg", "I");
        if (!euYes(d)) return { k: "none" };
        if (/mail/i.test(m || "")) return { k: "mail" };
        if (/platform/i.test(m || "")) return { k: "platform" };
        return { k: "other", raw: tc(m) };
      };
      const cats = [
        { k: "platform", label: t("eu.cat.platform"), color: EU_C.mid },
        { k: "mail", label: t("eu.cat.mail"), color: EU_C.soft },
        { k: "other", label: t("eu.cat.otherProcess"), color: EU_C.good },
        { k: "none", label: t("eu.cat.regNone"), color: "var(--surface3)" }
      ];
      const g = euGroup(sel, c => cat(c).k);
      const open = n - (g.get("none") || []).length;
      return {
        id: "reg-map", wide: true, src: "reg!D, reg!I",
        title: t("eu.t.regMap", { n: open, total: n, p: (g.get("platform") || []).length }),
        body: `<div class="eu-mapgrid">
          <div>${euMap(sel, cat, cats)}${euLegend(cats.map(x => Object.assign({ n: (g.get(x.k) || []).length }, x)))}</div>
          <div class="eu-rings">
            ${euRing(open, n, EU_C.mid, t("eu.ring.regOpen"))}
            <ul class="eu-bul">
              <li><b>${(g.get("platform") || []).length}</b> ${t("eu.reg.platforms")}</li>
              <li><b>${(g.get("mail") || []).length}</b> ${t("eu.reg.mail")}</li>
              ${(g.get("other") || []).length ? `<li><b>${g.get("other").length}</b> ${t("eu.reg.other")}</li>` : ""}
            </ul>
            ${(g.get("none") || []).length ? `<div class="eu-ring-l">${t("eu.reg.none")}${euFlags(g.get("none"), 0)}</div>` : ""}
          </div></div>`
      };
    },
    function regDelay(sel){
      const B = [
        { label: t("eu.b.le1"), test: d => d <= 1, color: "#ff3b5c" },
        { label: t("eu.b.months", { n: 2 }), test: d => d > 1 && d <= 2, color: "#f5b82e" },
        { label: t("eu.b.months", { n: 3 }), test: d => d > 2 && d <= 3, color: "var(--green)" },
        { label: t("eu.b.range", { a: 4, b: 6 }), test: d => d > 3 && d <= 6, color: "var(--m4)" },
        { label: t("eu.b.gt", { n: 6 }), test: d => d > 6, color: "var(--accent)" }
      ];
      const groups = B.map(b => ({ label: b.label, color: b.color, isos: [],
        tipOf: iso => esc(String(euShow(iso, "reg", "J")).slice(0, 140)) }));
      const vals = [], other = [];
      sel.forEach(c => {
        const d = euNum(euCell(c.iso, "reg", "J"));
        if (d == null) { other.push(c.iso); return; }
        vals.push(d);
        groups[B.findIndex(b => b.test(d))].isos.push(c.iso);
      });
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const shown = groups.filter(g => g.isos.length);
      const fmtD = d => d < 1 ? t("eu.days", { n: Math.round(d * 30) }) : t("eu.monthsN", { n: euFmt(d) });
      return {
        id: "reg-delay", wide: true, src: "reg!J", filled: vals.length,
        title: vals.some(v => v > 0) ? t("eu.t.regDelay", { a: fmtD(Math.min(...vals.filter(v => v > 0))), b: fmtD(Math.max(...vals)) }) : "",
        body: `<div class="eu-side">
          ${euStairs(shown, vals.length)}
          <div class="eu-kpis">
            <div class="eu-kpi"><b>${euFmt(avg)}</b><span>${t("eu.k.avgReg")}</span></div>
            <div class="eu-kpi"><b>${(groups[0].isos || []).length}</b><span>${t("eu.k.regShort")}</span></div>
          </div></div>
          ${other.length ? `<p class="eu-foot">${t("eu.ncList")} ${euFlags(other, 0)}</p>` : ""}`
      };
    },
    function regInfo(sel){
      /* Les deux familles de l'etude : ce qu'une entite a sous la main, et ce qui
         demande d'aller chercher l'information aupres de plusieurs equipes. */
      const QW = ["O", "P", "Q", "R", "Z", "S", "T", "U", "V"];
      const CH = ["X", "Y", "AA", "AC", "AB"];
      const row = col => ({ label: esc(euInfoLabel(col)),
        isos: sel.filter(c => euYes(euCell(c.iso, "reg", col))).map(c => c.iso) });
      const q = QW.map(row).map(r => Object.assign(r, { color: EU_C.good })).sort((a, b) => b.isos.length - a.isos.length);
      const h = CH.map(row).map(r => Object.assign(r, { color: EU_C.warn })).sort((a, b) => b.isos.length - a.isos.length);
      const common = q.concat(h).filter(r => r.isos.length >= sel.length * .8).length;
      return {
        id: "reg-info", wide: true, src: "reg!O:AC",
        title: t("eu.t.regInfo", { n: common }),
        body: `<div class="eu-two">
          <div>${euShare([{ head: `<span class="stag add">${t("eu.reg.quick")}</span>${t("eu.reg.quickD")}` }].concat(q), sel.length, { flags: 6 })}</div>
          <div>${euShare([{ head: `<span class="stag oth">${t("eu.reg.hard")}</span>${t("eu.reg.hardD")}` }].concat(h), sel.length, { flags: 6 })}</div>
        </div>`
      };
    }
  ],

  fw: [
    function fwMap(sel){
      const n = sel.length;
      const cat = c => {
        const v = euCell(c.iso, "fw", "D") || "";
        return { k: /final/i.test(v) ? "final" : /temp/i.test(v) ? "temp" : "none",
                 raw: euShow(c.iso, "fw", "F") ? String(euShow(c.iso, "fw", "F")).split("\n")[0].slice(0, 90) : "" };
      };
      const cats = [
        { k: "final", label: t("eu.cat.fwFinal"), color: EU_C.good },
        { k: "temp", label: t("eu.cat.fwTemp"), color: "var(--m1)" },
        { k: "none", label: t("eu.cat.fwNone"), color: "var(--surface3)" }
      ];
      const g = euGroup(sel, c => cat(c).k);
      const L = k => g.get(k) || [];
      return {
        id: "fw-map", wide: true, src: "fw!D, fw!F",
        title: t("eu.t.fwMap", { a: L("final").length, b: L("temp").length, total: n }),
        body: `<div class="eu-mapgrid">
          <div>${euMap(sel, cat, cats)}${euLegend(cats.map(x => Object.assign({ n: L(x.k).length }, x)))}</div>
          <div class="eu-rings">
            ${euRing(L("final").length, n, EU_C.good, t("eu.ring.fwFinal"), L("final"))}
            ${euRing(L("temp").length, n, "var(--m1)", t("eu.ring.fwTemp"), L("temp"))}
            ${euRing(L("none").length, n, "var(--line2)", t("eu.ring.fwNone"), L("none"))}
          </div></div>`
      };
    },
    function fwReq(sel){
      const items = sel.map(c => ({ iso: c.iso, ee: euNum(euCell(c.iso, "fw", "L")), ie: euNum(euCell(c.iso, "fw", "M")),
        name: String(euShow(c.iso, "fw", "F") || "").split(/\n|https?:/)[0].trim().slice(0, 60) }))
        .filter(x => x.ee != null || x.ie != null)
        .sort((a, b) => (b.ee || 0) - (a.ee || 0));
      if (!items.length) return { id: "fw-req", wide: true, src: "fw!L:M", title: "", body: `<p class="eu-empty">${t("eu.empty")}</p>` };
      /* Un referentiel hors d'echelle (l'E-ITS estonien, 1 852 exigences)
         ecraserait tous les autres a quelques pixels : sa barre est coupee, sa
         valeur ecrite, et il est exclu des moyennes, comme dans l'etude. */
      const vals = items.map(x => x.ee || 0).sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)] || 1;
      const out = x => Math.max(x.ee || 0, x.ie || 0) > med * 4;
      const inScale = items.filter(x => !out(x));
      const cap = Math.max(10, ...inScale.map(x => Math.max(x.ee || 0, x.ie || 0))) * 1.08;
      const avg = k => { const v = inScale.map(x => x[k]).filter(v => v != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
      const aEE = avg("ee"), aIE = avg("ie");
      const bar = (v, cls, broken) => v == null ? `<i class="eu-rb ${cls} none"></i>`
        : `<i class="eu-rb ${cls}${broken ? " cut" : ""}" style="height:${broken ? 100 : v / cap * 100}%"><em>${v}</em></i>`;
      const step = Math.ceil(cap / 4 / 50) * 50;
      const grid = [1, 2, 3, 4].map(i => i * step).filter(v => v < cap);
      const lo = Math.min(...inScale.map(x => x.ee || Infinity)), hi = Math.max(...items.map(x => x.ee || 0));
      return {
        id: "fw-req", wide: true, src: "fw!L, fw!M", filled: items.length,
        title: t("eu.t.fwReq", { a: lo, b: hi }),
        body: `<div class="eu-req-wrap"><div class="eu-req">
          <div class="eu-req-plot">
            ${grid.map(v => `<span class="eu-gl" style="bottom:${v / cap * 100}%"><em>${v}</em></span>`).join("")}
            <span class="eu-avg ee" style="bottom:${aEE / cap * 100}%"><em>${t("eu.avgEE", { n: aEE })}</em></span>
            <span class="eu-avg ie" style="bottom:${aIE / cap * 100}%"><em>${t("eu.avgIE", { n: aIE })}</em></span>
            ${items.map(x => `<div class="eu-rc" data-tip="${esc(`<b>${esc(euName(x.iso))}</b>${x.name ? `<span class="m">${esc(x.name)}</span>` : ""}<br>EE : ${x.ee == null ? "-" : x.ee} · IE : ${x.ie == null ? "-" : x.ie}`)}">
              ${bar(x.ee, "ee", out(x))}${bar(x.ie, "ie", out(x))}</div>`).join("")}
          </div>
          <div class="eu-req-x">${items.map(x => `<div>${euFlag(x.iso)}<span>${esc(euName(x.iso))}</span></div>`).join("")}</div>
        </div></div>
        <div class="eu-legend">
          <span><i style="background:var(--ee)"></i>${t("fiche.ee")}</span>
          <span><i style="background:var(--ie)"></i>${t("fiche.ie")}</span>
          ${items.some(out) ? `<span class="eu-note-s">${t("eu.outlier", { list: items.filter(out).map(x => euName(x.iso)).join(", ") })}</span>` : ""}
        </div>`
      };
    },
    function fwDeadline(sel){
      const items = sel.map(c => ({ iso: c.iso, ee: euNum(euCell(c.iso, "fw", "AD")), ie: euNum(euCell(c.iso, "fw", "AE")) }))
        .filter(x => x.ee != null).sort((a, b) => a.ee - b.ee);
      const other = sel.filter(c => !items.some(x => x.iso === c.iso)).map(c => c.iso);
      const max = Math.max(1, ...items.map(x => x.ee));
      /* Du rouge au vert : le plus court est le plus pressant pour l'entite. */
      const col = m => m <= 3 ? "#ff3b5c" : m <= 12 ? "#ff8a3d" : m <= 18 ? "#f5b82e" : m <= 24 ? "var(--green)" : "var(--m4)";
      return {
        id: "fw-deadline", wide: true, src: "fw!AD, fw!AE", filled: items.length,
        title: items.length ? t("eu.t.fwDeadline", { n: items.length, a: items[0].ee, b: items[items.length - 1].ee }) : "",
        body: `<div class="eu-hbars">
          <div class="eu-hb-scale"><span>${t("eu.dl.now")}</span><span>${t("eu.dl.mid")}</span><span>${t("eu.dl.long")}</span></div>
          ${items.map(x => `<div class="eu-hb">
            <div class="eu-hb-l">${euFlag(x.iso)}<span>${esc(euName(x.iso))}</span></div>
            <div class="eu-hb-t"><div class="eu-hb-b" style="width:max(${x.ee / max * 100}%,4px);background:${col(x.ee)}"></div>
              <span>${x.ee === 0 ? t("eu.dl.immediate") : t("eu.monthsN", { n: x.ee })}${x.ie != null && x.ie !== x.ee ? ` <em>(IE : ${x.ie})</em>` : ""}</span></div>
          </div>`).join("")}
        </div>
        ${other.length ? `<p class="eu-foot">${t("eu.ncDeadline")} ${euFlags(other, 0)}</p>` : ""}`
      };
    },
    function fwSources(sel){
      const cols = ["P", "R", "T", "U", "V", "Q", "S", "W", "Y"];
      const rows = cols.map(col => ({ label: esc(euSrcLabel(col)), color: EU_C.mid,
        isos: sel.filter(c => euYes(euCell(c.iso, "fw", col))).map(c => c.iso) }))
        .sort((a, b) => b.isos.length - a.isos.length);
      const pres = sel.filter(c => euYes(euCell(c.iso, "fw", "AA"))).map(c => c.iso);
      return {
        id: "fw-src", src: "fw!O:Y, fw!AA",
        title: rows[0] ? t("eu.t.fwSrc", { src: rows[0].label, n: rows[0].isos.length }) : "",
        body: euShare(rows.concat([{ head: t("eu.h.presumption") },
          { label: t("eu.fw.presumption"), isos: pres, color: EU_C.good, tipOf: iso => esc(euShow(iso, "fw", "AB") || "") }]),
          sel.length, { flags: 6 })
      };
    },
    function fwGradual(sel){
      const diff = sel.filter(c => euYes(euCell(c.iso, "fw", "AF"))).map(c => c.iso);
      const grad = sel.filter(c => euYes(euCell(c.iso, "fw", "AJ"))).map(c => c.iso);
      const dl = sel.filter(c => euYes(euCell(c.iso, "fw", "AC"))).map(c => c.iso);
      const ded = sel.filter(c => /dedicated/i.test(euCell(c.iso, "fw", "E") || "")).map(c => c.iso);
      return {
        id: "fw-ee-ie", src: "fw!E, fw!AC, fw!AF, fw!AJ",
        title: t("eu.t.fwEeIe", { n: diff.length }),
        body: euShare([
          { label: t("eu.fw.dedicated"), isos: ded, color: EU_C.mid },
          { label: t("eu.fw.levelDiff"), isos: diff, color: EU_C.ie, tipOf: iso => esc(String(euShow(iso, "fw", "AG") || "").slice(0, 160)) },
          { label: t("eu.fw.deadlineDiff"), isos: dl, color: EU_C.soft },
          { label: t("eu.fw.gradual"), isos: grad, color: EU_C.good }
        ], sel.length, { flags: 6 })
      };
    }
  ],

  aud: [
    function audPyramid(sel){
      const L = [
        { k: "y1", label: t("eu.aud.y1"), test: m => m <= 12 },
        { k: "y2", label: t("eu.aud.y2"), test: m => m > 12 && m <= 24 },
        { k: "y3", label: t("eu.aud.y3"), test: m => m > 24 && m <= 36 },
        { k: "y5", label: t("eu.aud.y5"), test: m => m > 36 }
      ];
      const g = { y1: [], y2: [], y3: [], y5: [], free: [], nc: [] };
      sel.forEach(c => {
        const v = euCell(c.iso, "aud", "M");
        const m = /^\s*\d/.test(v || "") ? euNum(v) : null;
        if (m != null) { g[L.find(l => l.test(m)).k].push(c.iso); return; }
        if (euNC(v) || /^nc\b/i.test(v)) g.nc.push(c.iso); else g.free.push(c.iso);
      });
      const levels = L.concat([{ k: "free", label: t("eu.aud.free") }]);
      const tipOf = iso => esc(String(euShow(iso, "aud", "M") || "").slice(0, 160));
      const fixed = g.y1.length + g.y2.length + g.y3.length + g.y5.length;
      /* Un vrai sommet, comme dans l'etude : la premiere tranche est un triangle.
         Trop etroite pour porter son libelle, elle l'ecrit a gauche de la pointe. */
      const step = 50 / levels.length;
      const rows = levels.map((l, i) => {
        const a = i * step, b = (i + 1) * step;   /* demi-largeurs haut / bas, en % */
        const out = i === 0;
        return `<div class="eu-pyr-row">
          <div class="eu-pyr-c">
            <div class="eu-pyr-s" style="clip-path:polygon(${50 - a}% 0,${50 + a}% 0,${50 + b}% 100%,${50 - b}% 100%);
              background:color-mix(in srgb,var(--accent) ${100 - i * 16}%,var(--accent-soft))">
              ${out ? "" : `<span style="color:${i < 3 ? "var(--accent-ink)" : "var(--accent2)"}">${l.label}</span>`}</div>
            ${out ? `<span class="eu-pyr-out" style="right:calc(50% + ${(a + b) / 2 + 3}%)">${l.label}</span>` : ""}
          </div>
          <div class="eu-pyr-f"><b>${g[l.k].length}</b>${euFlags(g[l.k], 0, tipOf)}</div>
        </div>`;
      }).join("");
      return {
        id: "aud-pyr", wide: true, src: "aud!M", filled: sel.length - g.nc.length,
        title: t("eu.t.audPyr", { n: fixed, total: sel.length }),
        body: `<div class="eu-side"><div class="eu-pyr">${rows}</div>
          <div class="eu-kpis">
            <div class="eu-kpi"><b>${fixed}</b><span>${t("eu.k.audFixed")}</span></div>
            <div class="eu-kpi"><b>${g.free.length}</b><span>${t("eu.k.audFree")}</span></div>
          </div></div>
          ${g.nc.length ? `<p class="eu-foot">${t("eu.ncList")} ${euFlags(g.nc, 0)}</p>` : ""}`
      };
    },
    function audWho(sel){
      const org = euGroup(sel, c => euNC(euCell(c.iso, "aud", "E")) ? null : euCell(c.iso, "aud", "E"));
      const self = euGroup(sel, c => {
        const v = euCell(c.iso, "aud", "I");
        if (euNC(v)) return null;
        return /both|ee and ei/i.test(v) ? "both" : /only for ei/i.test(v) ? "ei" : /only for ee/i.test(v) ? "ee" : euNo(v) ? "no" : null;
      });
      const orgRows = [...org.entries()].sort((a, b) => b[1].length - a[1].length)
        .map(([k, isos]) => ({ label: esc(euCat("aud", k)), isos, color: EU_C.mid,
          tipOf: iso => esc(String(euShow(iso, "aud", "G") || "").slice(0, 160)) }));
      const selfN = ["both", "ei", "ee"].reduce((s, k) => s + (self.get(k) || []).length, 0);
      return {
        id: "aud-who", wide: true, src: "aud!E, aud!I",
        title: t("eu.t.audWho", { n: selfN }),
        body: `<div class="eu-two"><div>${euShare([{ head: t("eu.h.audOrg") }].concat(orgRows), sel.length, { flags: 6 })}</div>
          <div>${euShare([{ head: t("eu.h.audSelf") },
          { label: t("eu.aud.selfBoth"), isos: self.get("both") || [], color: EU_C.good },
          { label: t("eu.aud.selfEI"), isos: self.get("ei") || [], color: EU_C.ie },
          { label: t("eu.aud.selfEE"), isos: self.get("ee") || [], color: EU_C.ee },
          { label: t("eu.aud.selfNo"), isos: self.get("no") || [], color: EU_C.nc }
        ], sel.length, { flags: 6 })}</div></div>`
      };
    }
  ],

  san: [
    function sanMgmt(sel){
      const pick = col => sel.filter(c => euYes(euCell(c.iso, "san", col))).map(c => c.iso);
      const fin = pick("K"), ban = pick("L"), crim = pick("R");
      const n = sel.length;
      return {
        id: "san-mgmt", wide: true, src: "san!D, san!K, san!L, san!R",
        title: t("eu.t.sanMgmt", { n: fin.length }),
        body: `<div class="eu-san">
          <div class="eu-san-base"><h4>${t("eu.san.base")}</h4>
            <div class="eu-san-cards">
              <div><b>${t("eu.san.b1")}</b><span>${t("eu.san.b1D")}</span></div>
              <div><b>${t("eu.san.b2")}</b><span>${t("eu.san.b2D")}</span></div>
              <div><b>${t("eu.san.b3")}</b><span>${t("eu.san.b3D")}</span></div>
            </div>
            <p class="eu-foot">${t("eu.san.aligned", { n: pick("D").length, total: n })}</p>
          </div>
          <div class="eu-san-plus"><h4>${t("eu.san.plus")}</h4>
            <div class="eu-rings row">
              ${euRing(fin.length, n, EU_C.mid, t("eu.san.fin"), fin)}
              ${euRing(ban.length, n, EU_C.soft, t("eu.san.ban"), ban)}
              ${euRing(crim.length, n, EU_C.bad, t("eu.san.crim"), crim)}
            </div>
          </div>
        </div>`
      };
    },
    function sanMeasures(sel){
      const cols = ["Q", "N", "M", "P", "O", "J", "S", "H"];
      const rows = cols.map(col => ({ label: esc(euSanLabel(col)), color: col === "H" ? EU_C.warn : EU_C.mid,
        isos: sel.filter(c => euYes(euCell(c.iso, "san", col))).map(c => c.iso),
        tipOf: col === "H" ? iso => esc(String(euShow(iso, "san", "I") || "").slice(0, 180)) : null }))
        .sort((a, b) => b.isos.length - a.isos.length);
      const more = sel.filter(c => /more specific/i.test(euCell(c.iso, "san", "F") || "")).map(c => c.iso);
      return {
        id: "san-measures", wide: true, src: "san!F, san!H:S",
        title: t("eu.t.sanMeasures", { n: (rows.find(r => r.label === esc(euSanLabel("H"))) || { isos: [] }).isos.length }),
        body: euShare(rows.concat([{ head: t("eu.h.sanFin") },
          { label: t("eu.san.moreFin"), isos: more, color: EU_C.warn }]), sel.length)
      };
    }
  ]
};

/* Libelles des categories du classeur : traduits quand on les connait, sinon
   repris tels quels - verifiables contre la case. */
function euCat(kind, raw){
  const k = "eu.v." + kind + "." + String(raw).toLowerCase().replace(/[^a-z]+/g, "");
  const s = t(k);
  return s === k ? tc(raw) : s;
}
function euInfoLabel(col){ const k = "eu.info." + col; const s = t(k); return s === k ? ficheLabel("reg", col) : s; }
function euSrcLabel(col){ const k = "eu.src." + col; const s = t(k); return s === k ? ficheLabel("fw", col) : s; }
function euSanLabel(col){ const k = "eu.sanc." + col; const s = t(k); return s === k ? ficheLabel("san", col) : s; }

/* ---------- la carte d'un graphique ---------- */
function euCard(ch, sel){
  const saved = euText(ch.id);
  const title = saved.title || ch.title;
  return `<figure class="eu-card${ch.wide ? " wide" : ""}" data-eu="${ch.id}">
    <div class="eu-card-h">
      <h3 class="eu-title" contenteditable="true" spellcheck="false" data-auto="${esc(ch.title)}"
        title="${esc(t("eu.editTitle"))}">${esc(title)}</h3>
      <button type="button" class="eu-edit" title="${esc(t("eu.editTitle"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg><span>${t("eu.editBtn")}</span></button>
      <button type="button" class="eu-reset" ${saved.title ? "" : "hidden"} title="${esc(t("eu.resetTitle"))}" aria-label="${esc(t("eu.resetTitle"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
      ${ch.mine ? `<button type="button" class="eu-del" data-mine="${ch.mine}" title="${esc(t("eu.mine.delete"))}" aria-label="${esc(t("eu.mine.delete"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>` : ""}
      <button type="button" class="eu-dl" title="${esc(t("eu.dlOne"))}" aria-label="${esc(t("eu.dlOne"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><span>PNG</span></button>
    </div>
    <div class="eu-body">${ch.body}</div>
    <div class="eu-note" contenteditable="true" data-ph="${esc(t("eu.notePh"))}">${esc(saved.note || "")}</div>
    ${ch.meta ? `<figcaption class="eu-src">${esc(ch.meta)}</figcaption>` : ""}
  </figure>`;
}

/* ---------- la page ---------- */
let euSpy = null;
let euScrollBound = false;

function renderEurope(arg){
  const el = $("#v-europe");
  if (!el) return;
  if (typeof SHEET_DATA === "undefined" || regId() !== "nis2") {
    el.innerHTML = `<h1 class="pg">${t("nav.europe")}</h1><p class="pg-sub">${t("eu.nis2only")}</p>`;
    return;
  }
  const s = euSelState();
  const sel = euSelection();
  const all = euAll();
  const presets = [
    { k: "all", label: t("eu.p.all", { n: all.length }) },
    { k: "done", label: t("eu.p.done") },
    { k: "todo", label: t("eu.p.todo") },
    { k: "regions", label: t("eu.regions") },
    { k: "custom", label: t("eu.p.custom") }
  ];

  const sections = EU_SECTIONS.map(sec => {
    if (sec.key === "mine") return `<section class="fsec eu-sec-w eu-mine" id="eusec-mine" data-fsec="mine">
      <div class="fsec-h"><div class="ic">${ficheIcon(sec.icon)}</div><h2>${t(sec.tKey)}</h2>
        <span class="cnt">${t("eu.mine.count", { n: euMine().length })}</span></div>
      <div class="eu-grid">${euMineSection(sel)}</div>
    </section>`;
    const cards = sel.length ? EU_CHARTS[sec.key].map(fn => {
      try { return fn(sel); } catch (e) { console.error("vue europeenne", sec.key, e); return null; }
    }).filter(Boolean).map(ch => euCard(ch, sel)).join("") : "";
    return `<section class="fsec eu-sec-w" id="eusec-${sec.key}" data-fsec="${sec.key}">
      <div class="fsec-h"><div class="ic">${ficheIcon(sec.icon)}</div><h2>${t(sec.tKey)}</h2></div>
      <div class="eu-grid">${cards || `<p class="eu-empty">${t(s.preset === "regions" && !s.regions.length ? "eu.noRegion" : "eu.noSel")}</p>`}</div>
    </section>`;
  }).join("");

  el.innerHTML = `
    <div class="eu-head">
      <div><h1 class="pg">${t("nav.europe")}</h1>
        <p class="pg-sub">${t("eu.sub")}</p></div>
      ${sel.length ? `<button type="button" class="btn eu-dlall" id="euDlAll"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>${t("eu.dlAll")}</button>` : ""}
    </div>
    <div class="eu-filter" id="euFilter">
      <span class="eu-fl">${t("eu.compare")}</span>
      <div class="eu-presets" role="group">${presets.map(p =>
        `<button type="button" data-preset="${p.k}" aria-pressed="${s.preset === p.k}">${p.label}</button>`).join("")}</div>

      <span class="eu-count">${t("eu.count", { n: sel.length })}</span>
      <div class="eu-pick" id="euRegions" ${s.preset === "regions" ? "" : "hidden"}>
        <div class="eu-pick-g eu-rgrid">${EU_REGIONS.map(r => {
          const list = all.filter(c => c.eu && c.region === r);
          const on = s.regions.includes(r);
          return `<label class="eu-chk eu-rchk${on ? " on" : ""}">
            <input type="checkbox" value="${r}" ${on ? "checked" : ""}>
            <span class="eu-rtxt"><b>${t("eu.r." + r)}</b><span>${list.map(c => esc(c.name)).join(", ")}</span></span></label>`;
        }).join("")}</div>
      </div>
      <div class="eu-pick" id="euPick" ${s.preset === "custom" ? "" : "hidden"}>
        <div class="eu-pick-a">
          <button type="button" data-pick="all">${t("eu.pickAll")}</button>
          <button type="button" data-pick="eu">${t("eu.pickEU")}</button>
          <button type="button" data-pick="none">${t("eu.pickNone")}</button>
        </div>
        <div class="eu-pick-g">${all.map(c => `<label class="eu-chk${sel.some(x => x.iso === c.iso) ? " on" : ""}">
          <input type="checkbox" value="${c.iso}" ${sel.some(x => x.iso === c.iso) ? "checked" : ""}>
          <span class="fi">${flagSvg(c.iso)}</span>${esc(c.name)}</label>`).join("")}</div>
      </div>
    </div>
    <div class="fnav eu-nav" id="euNavWrap"><div class="fnav-in" id="euNav">
      ${EU_SECTIONS.map(x => `<button type="button" data-fgo="${x.key}"${x.key === "mine" ? ' class="eu-nav-mine"' : ""}>${ficheIcon(x.icon)}${t(x.tKey)}${
        x.key === "mine" && euMine().length ? ` <em>${euMine().length}</em>` : ""}</button>`).join("")}
      <button type="button" class="eu-nav-sel" id="euNavSel" title="${esc(t("eu.compare"))}">${t("eu.count", { n: sel.length })}</button>
    </div></div>
    ${sections}
    <p class="eu-disclaimer">${t("eu.saved")}</p>`;

  euWire(el);
  /* #/europe/mine : on arrive depuis l'assistant, directement sur ses visuels. */
  if (arg === "mine") {
    /* Une seule fois : sans cela, chaque nouveau rendu (theme, langue, visuel
       ajoute) ramenerait la page sur la section. */
    if (typeof currentRoute !== "undefined") currentRoute.arg = null;
    history.replaceState(null, "", "#/europe");
    const m = $("#eusec-mine", el);
    if (m) setTimeout(() => { if (euSpy) euSpy.lock = Date.now() + 900; m.scrollIntoView({ block: "start" }); euSpy && euSpy.mark("mine"); }, 30);
  }
}

function euSetSel(next){
  store.euSel = next;
  saveStore();
  const y = window.scrollY;
  renderEurope();
  window.scrollTo({ top: y });
}

function euWire(el){
  if (typeof kpiWireTips === "function") kpiWireTips(el);

  /* --- filtre --- */
  el.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const cur = euSelState();
    const p = b.dataset.preset;
    /* La selection personnalisee s'ouvre vide, comme les regions : on coche ses
       pays soi-meme. Rester sur « personnalise » garde ce qui est coche. */
    euSetSel(p === "custom" ? { preset: "custom", regions: cur.regions,
                                isos: cur.preset === "custom" ? cur.isos : [] }
                            : { preset: p, isos: cur.isos, regions: cur.regions });
  }));
  el.querySelectorAll("#euPick .eu-chk input").forEach(i => i.addEventListener("change", () => {
    const isos = [...el.querySelectorAll("#euPick .eu-chk input:checked")].map(x => x.value);
    euSetSel({ preset: "custom", isos, regions: euSelState().regions });
  }));
  el.querySelectorAll("#euRegions .eu-chk input").forEach(i => i.addEventListener("change", () => {
    const regions = [...el.querySelectorAll("#euRegions .eu-chk input:checked")].map(x => x.value);
    euSetSel({ preset: "regions", regions, isos: euSelState().isos });
  }));

  el.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
    const all = euAll();
    const k = b.dataset.pick;
    euSetSel({ preset: "custom", regions: euSelState().regions,
               isos: k === "all" ? all.map(c => c.iso) : k === "eu" ? all.filter(c => c.eu).map(c => c.iso) : [] });
  }));
  const ns = $("#euNavSel", el);
  if (ns) ns.addEventListener("click", () => $("#euFilter", el).scrollIntoView({ behavior: "smooth", block: "center" }));

  /* --- mes visuels --- */
  el.querySelectorAll(".eu-del").forEach(b => b.addEventListener("click", () => {
    if (!confirm(t("eu.mine.confirm"))) return;
    euMineRemove(b.dataset.mine);
    const y = window.scrollY; renderEurope(); window.scrollTo({ top: y });
  }));
  const ask = $("#euMineAsk", el);
  if (ask && typeof assistOpen === "function") ask.addEventListener("click", () => {
    assistOpen();
    const p = $("#assistPanel");
    if (p && (!store.assistSize || store.assistSize.w < 700)) { if (typeof assistClearSize === "function") assistClearSize(); p.classList.add("wide"); }
    if (typeof assistSync === "function") assistSync();
  });

  /* --- telechargement --- */
  el.querySelectorAll(".eu-dl").forEach(b => b.addEventListener("click", () => euDownloadCard(b.closest(".eu-card"), b)));
  const dla = $("#euDlAll", el);
  if (dla) dla.addEventListener("click", () => euDownloadAll(el, dla));

  /* --- carte : clic vers la fiche --- */
  el.querySelectorAll(".eu-map").forEach(svg => svg.addEventListener("click", e => {
    const hit = e.target.closest(".ctry");
    if (hit) { hideTip(); location.hash = "#/country/" + hit.dataset.iso; }
  }));
  el.querySelectorAll(".eu-flag").forEach(a => a.addEventListener("click", hideTip));

  /* --- titres et analyses ---
     Entree valide le titre ; un titre vide revient a la phrase calculee. */
  el.querySelectorAll(".eu-card").forEach(card => {
    const id = card.dataset.eu;
    const h = $(".eu-title", card), reset = $(".eu-reset", card), note = $(".eu-note", card);
    h.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); h.blur(); } });
    h.addEventListener("paste", e => {
      e.preventDefault();
      document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s+/g, " "));
    });
    h.addEventListener("blur", () => {
      const v = h.textContent.replace(/\s+/g, " ").trim();
      const auto = h.dataset.auto;
      if (!v) h.textContent = auto;
      euSaveText(id, "title", v && v !== auto ? v : "");
      reset.hidden = !(v && v !== auto);
    });
    /* Le bouton dit ce que le survol du titre laissait deviner : on y ecrit.
       Il place le curseur dans le titre et en selectionne le texte, pret a
       etre remplace. */
    $(".eu-edit", card).addEventListener("click", () => {
      h.focus();
      const r = document.createRange();
      r.selectNodeContents(h);
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
    });
    h.addEventListener("focus", () => card.classList.add("editing"));
    h.addEventListener("blur", () => card.classList.remove("editing"));
    reset.addEventListener("click", () => { h.textContent = h.dataset.auto; euSaveText(id, "title", ""); reset.hidden = true; });
    note.addEventListener("paste", e => {
      e.preventDefault();
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain") || "");
    });
    note.addEventListener("blur", () => {
      const v = note.innerText.replace(/\n{3,}/g, "\n\n").trim();
      if (!v) note.textContent = "";
      euSaveText(id, "note", v);
    });
  });

  /* --- reperage des sections : meme logique que la fiche pays --- */
  const nav = $("#euNav", el);
  const secs = [...el.querySelectorAll(".eu-sec-w")];
  if (!nav || !secs.length) return;
  const btns = [...nav.querySelectorAll("button[data-fgo]")];
  const mark = k => btns.forEach(b => b.setAttribute("aria-current", b.dataset.fgo === k ? "true" : "false"));
  const current = () => {
    const line = ficheHeader() + (nav.getBoundingClientRect().height || 52) + 12;
    let cur = secs[0];
    secs.forEach(x => { if (x.getBoundingClientRect().top <= line) cur = x; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = secs[secs.length - 1];
    return cur;
  };
  ficheHeader();
  euSpy = { secs, mark, current, lock: 0 };
  if (!euScrollBound) {
    euScrollBound = true;
    let tick = false;
    window.addEventListener("scroll", () => {
      if (tick || !euSpy) return;
      tick = true;
      requestAnimationFrame(() => {
        tick = false;
        const sp = euSpy;
        if (!sp || !document.body.contains(sp.secs[0]) || Date.now() < sp.lock) return;
        sp.mark(sp.current().dataset.fsec);
      });
    }, { passive: true });
  }
  mark(current().dataset.fsec);
  nav.addEventListener("click", e => {
    const b = e.target.closest("button[data-fgo]");
    if (!b) return;
    euSpy.lock = Date.now() + 800;
    mark(b.dataset.fgo);
    const target = $("#eusec-" + b.dataset.fgo, el);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ---------- telechargement des visuels ----------
 *
 * Les graphiques sont du HTML et du CSS, pas un canevas : pour en faire une
 * image, la carte est clonee avec ses styles calcules recopies en ligne, placee
 * dans un SVG <foreignObject>, puis dessinee sur un canevas au double de sa
 * taille (net sur une slide projetee). Aucune bibliotheque : l'outil reste un
 * fichier unique qui s'ouvre hors ligne.
 *
 * Ce qui part dans l'image : le titre tel qu'il est affiche (reecrit ou non),
 * le graphique, l'analyse si elle existe, et la source. Les boutons et la zone
 * d'analyse vide restent a l'ecran. Les couleurs sont celles du theme affiche.
 */
function euInlineClone(src){
  const dst = src.cloneNode(false);
  if (src.nodeType === 1) {
    const cs = getComputedStyle(src);
    let s = "";
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      /* les transitions figeraient l'etat de survol au milieu d'une animation */
      if (p.startsWith("transition") || p.startsWith("animation")) continue;
      s += p + ":" + cs.getPropertyValue(p) + ";";
    }
    dst.setAttribute("style", s);
    ["data-tip", "contenteditable", "title", "href"].forEach(a => dst.removeAttribute(a));
  }
  src.childNodes.forEach(ch => {
    if (ch.nodeType === 1 || ch.nodeType === 3) dst.appendChild(euInlineClone(ch));
  });
  return dst;
}

function euSlug(s){
  return String(s || "visuel").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "visuel";
}

async function euCardPng(card, scale){
  scale = scale || 2;
  const w = Math.ceil(card.getBoundingClientRect().width);
  const clone = euInlineClone(card);
  clone.querySelectorAll(".eu-reset,.eu-dl,.eu-edit,.eu-del,.chat-vis-act,.chat-vis-where").forEach(n => n.remove());
  const note = clone.querySelector(".eu-note");
  if (note && !note.textContent.trim()) note.remove();
  const pad = 16;
  const bg = cssVar("--surface") || "#ffffff";
  clone.style.width = w + "px";
  clone.style.margin = "0";
  /* Les hauteurs recopiees sont celles de la grille, ou une carte s'etire a la
     hauteur de sa voisine : l'image garderait ce vide. */
  [clone, $(".eu-body", clone), $(".eu-note", clone)].forEach(n => {
    if (n) { n.style.height = "auto"; n.style.blockSize = "auto"; }
  });
  clone.style.boxShadow = "none";
  /* L'image est prise au clic sur « PNG » : la souris survole alors l'en-tete,
     et le titre porte son cadre pointille d'edition. Il n'a rien a faire sur
     un visuel exporte. */
  const ttl = $(".eu-title", clone);
  if (ttl) {
    /* Toutes les bordures, y compris les logiques (border-inline-*, border-block-*)
       recopiees du style calcule : remettre « border » a zero ne les touche pas. */
    [...ttl.style].filter(p => /^(border|outline)/.test(p)).forEach(p => ttl.style.removeProperty(p));
    ttl.style.border = "0";
    ttl.style.background = "transparent";
  }

  /* La hauteur change des qu'on retire la zone d'analyse vide : on la mesure
     sur le clone, pose hors ecran, plutot que sur la carte affichee. */
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:" + w + "px";
  host.appendChild(clone);
  document.body.appendChild(host);
  const h = Math.ceil(clone.getBoundingClientRect().height);
  host.remove();

  const W = w + pad * 2, H = h + pad * 2;
  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <foreignObject x="${pad}" y="${pad}" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.decoding = "sync";
  await new Promise((ok, ko) => {
    img.onload = ok; img.onerror = ko;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return await new Promise((ok, ko) => canvas.toBlob(b => b ? ok(b) : ko(new Error("toBlob")), "image/png"));
}

function euCardName(card, i){
  const title = ($(".eu-title", card) || {}).textContent;
  return (i != null ? String(i + 1).padStart(2, "0") + "-" : "") + euSlug(title) + ".png";
}

async function euDownloadCard(card, btn){
  if (btn) btn.classList.add("busy");
  try {
    kpiSave(await euCardPng(card), euCardName(card));
  } catch (e) {
    console.error("export du visuel", e);
    alert(t("eu.dlFail"));
  } finally {
    if (btn) btn.classList.remove("busy");
  }
}

/* Tous les visuels de la page, dans l'ordre de lecture, en une archive. Les
   PNG sont deja compresses : ils sont stockes tels quels (methode 0). */
async function euDownloadAll(root, btn){
  const cards = [...root.querySelectorAll(".eu-card")];
  if (!cards.length) return;
  const label = btn ? btn.innerHTML : "";
  btn && (btn.disabled = true);
  const entries = [];
  const ZIP_TIME = ((2020 - 1980) << 25) | (1 << 21) | (1 << 16);
  try {
    for (let i = 0; i < cards.length; i++) {
      if (btn) btn.textContent = t("eu.dlProgress", { i: i + 1, n: cards.length });
      const bytes = new Uint8Array(await (await euCardPng(cards[i])).arrayBuffer());
      const sec = cards[i].closest(".eu-sec-w");
      const folder = sec ? String(EU_SECTIONS.findIndex(s => s.key === sec.dataset.fsec) + 1).padStart(2, "0")
        + "-" + euSlug(t(EU_SECTIONS.find(s => s.key === sec.dataset.fsec).tKey)) + "/" : "";
      entries.push({ name: folder + euCardName(cards[i], i), method: 0, flags: 0, time: ZIP_TIME,
        crc: crc32(bytes), data: bytes, rawSize: bytes.length });
    }
    kpiSave(writeZip(entries, "application/zip"), "regwatch-vue-europeenne.zip");
  } catch (e) {
    console.error("export des visuels", e);
    alert(t("eu.dlFail"));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
}

/* ---------- visuels sur demande ----------
 *
 * L'assistant ne dessine rien et ne calcule aucun chiffre. Il traduit une
 * demande en une description courte - une feuille, une ou plusieurs colonnes,
 * une forme, eventuellement des regroupements - et c'est l'outil qui compte les
 * pays dans le classeur et dessine avec les briques de la vue europeenne. Un
 * visuel ajoute a « Mes visuels » garde cette description, pas ses chiffres :
 * il se recalcule quand le classeur change, comme les autres.
 *
 * Seule part d'interpretation : les colonnes en texte libre, que l'assistant
 * regroupe par mots-cles. Le regroupement est alors affiche sous le visuel, et
 * la valeur d'origine de chaque pays reste lisible au survol de son drapeau.
 */
const EU_FORMS = ["map", "rings", "share", "stairs", "columns", "pyramid", "bars"];
const EU_PALETTE = ["var(--accent)", "var(--m4)", "#f5b82e", "var(--ie)", "var(--m1)", "#ff3b5c", "var(--accent2)", "#ff8a3d"];

function euNorm(v){
  if (euNC(v)) return null;
  if (euYes(v)) return "YES";
  if (euNo(v)) return "NO";
  return String(v).replace(/\s+/g, " ").trim();
}
/* Les valeurs courantes du classeur, traduites ; les autres restent telles
   qu'ecrites, verifiables contre la case. */
function euValLabel(k){
  if (k === "YES") return t("eu.v.yes");
  if (k === "NO") return t("eu.v.no");
  const slug = String(k).toLowerCase().replace(/[^a-z]+/g, "");
  for (const p of ["eu.val.", "eu.v.org.", "eu.v.aud.", "eu.v.doc."]) {
    const s = t(p + slug);
    if (s !== p + slug) return s;
  }
  return tc(k);
}

/* Ce que l'assistant lit avant de choisir : les colonnes de chaque feuille,
   leur remplissage et leurs valeurs les plus frequentes. */
function euDescribeColumns(a){
  if (typeof SHEET_DATA === "undefined") return { error: "no workbook data" };
  const keys = (a && a.sheets && a.sheets.length ? a.sheets : Object.keys(SHEET_DATA.sheets))
    .filter(k => SHEET_DATA.sheets[k]);
  const rows = Object.values(SHEET_DATA.rows);
  const sheets = {};
  keys.forEach(k => {
    const sh = SHEET_DATA.sheets[k];
    sheets[k] = { name: sh.name, columns: sh.fields.filter(f => f.c !== "C").map(f => {
      const vals = rows.map(r => (r[k] || {})[f.c]).filter(v => !euNC(v));
      const cnt = {};
      vals.forEach(v => { const n = euNorm(v); const s = n.length > 50 ? n.slice(0, 50) + "…" : n; cnt[s] = (cnt[s] || 0) + 1; });
      const top = Object.entries(cnt).sort((x, y) => y[1] - x[1]);
      return { col: f.c, label: f.l, filled: vals.length, distinct: top.length,
        numeric: vals.length > 0 && vals.filter(v => /^\s*\d/.test(v)).length >= vals.length * .6,
        top: top.slice(0, 5).map(([v, n]) => v + " (" + n + ")") };
    }) };
  });
  return { countries: COUNTRIES.length, sheets,
    note: "Sheets: id=transposition, inc=incident reporting, reg=registration, fw=framework, "
      + "aud=audit, san=sanctions, auth=authorities. 'NC' and blanks mean not communicated and are "
      + "never counted. A column with more than 8 distinct values needs `groups`." };
}

/* La description, verifiee et resolue. Une erreur explique quoi corriger :
   l'assistant la lit et relance l'outil. */
function euSpecCheck(spec){
  spec = Object.assign({}, spec || {});
  if (typeof SHEET_DATA === "undefined") throw new Error("no workbook data");
  const sh = SHEET_DATA.sheets[spec.sheet];
  if (!sh) throw new Error("unknown sheet '" + spec.sheet + "'. Use one of: " + Object.keys(SHEET_DATA.sheets).join(", "));
  const cols = [].concat(spec.columns || [], spec.column || []).map(c => String(c).toUpperCase());
  if (!cols.length) throw new Error("give `column` (or `columns` for a share of YES over several columns)");
  const bad = cols.filter(c => !sh.fields.some(f => f.c === c));
  if (bad.length) throw new Error("unknown column(s) " + bad.join(", ") + " in sheet " + spec.sheet + ". Call describe_columns.");
  spec.form = EU_FORMS.includes(spec.form) ? spec.form : "share";
  spec.cols = [...new Set(cols)];
  /* Plusieurs colonnes, c'est « combien de pays disent oui a chacune » : sur des
     colonnes de categories, le compte serait zero partout et le visuel absurde.
     Le modele a fait l'erreur en test ; on la refuse avec la correction. */
  if (spec.cols.length > 1) {
    const rows = Object.values(SHEET_DATA.rows);
    const notYesNo = spec.cols.filter(c => {
      const vals = rows.map(r => (r[spec.sheet] || {})[c]).filter(v => !euNC(v));
      return vals.length && vals.filter(v => euYes(v) || euNo(v)).length < vals.length * .6;
    });
    if (notYesNo.length) throw new Error("`columns` only counts YES answers across YES/NO columns, and "
      + notYesNo.map(c => spec.sheet + "!" + c).join(", ") + " is not a YES/NO column. For the categories of one "
      + "column, pass `column` alone (and `groups` to merge its values).");
  }
  return spec;
}

function euVisualBuild(spec, selDefault){
  spec = euSpecCheck(spec);
  const isos = spec.countries && spec.countries.length && typeof corpusIsos === "function"
    ? corpusIsos(spec.countries) : null;
  const unknown = isos ? spec.countries.filter(x => !corpusIsos([x]).length) : [];
  const sel = isos ? euAll().filter(c => isos.includes(c.iso)) : selDefault;
  if (!sel.length) throw new Error("no country matches the selection");
  /* Ce que le modele doit pouvoir dire : les pays qu'il a nommes et que RegWatch
     ne suit pas, et ceux dont la case ne dit rien. */
  const facts = { notTracked: unknown,
    notCommunicated: sel.filter(c => spec.cols.every(k => euNC(euCell(c.iso, spec.sheet, k)))).map(c => c.name) };
  const n = sel.length;
  const key = spec.sheet, col = spec.cols[0];
  const raw = iso => euCell(iso, key, col);
  const rawTip = iso => esc(String(raw(iso) == null ? t("fiche.nc") : tc(raw(iso))).slice(0, 180));
  const src = key + "!" + spec.cols.join(", " + key + "!");
  let body = "", filled = null, groupsNote = "";

  /* --- plusieurs colonnes : combien de pays repondent oui a chacune --- */
  if (spec.cols.length > 1) {
    const rows = spec.cols.map((c, i) => ({ label: esc(ficheLabel(key, c)), color: EU_PALETTE[i % 2 ? 1 : 0],
      isos: sel.filter(x => euYes(euCell(x.iso, key, c))).map(x => x.iso),
      tipOf: iso => esc(String(euShow(iso, key, c) || t("fiche.nc")).slice(0, 160)) }))
      .sort((a, b) => b.isos.length - a.isos.length);
    return { title: spec.title || ficheLabel(key, col), src, filled: null, total: n,
      body: euShare(rows, n, { flags: 6 }), facts, summary: rows.map(r => ficheLabel(key, spec.cols[rows.indexOf(r)] || col) + ": " + r.isos.length + "/" + n) };
  }

  /* --- une valeur numerique par pays --- */
  const numeric = spec.form === "bars" || (spec.buckets && spec.buckets.length);
  if (numeric) {
    const items = sel.map(c => ({ iso: c.iso, v: euNum(raw(c.iso)) }));
    const known = items.filter(x => x.v != null).sort((a, b) => a.v - b.v);
    const nc = items.filter(x => x.v == null).map(x => x.iso);
    filled = known.length;
    if (!known.length) throw new Error("no numeric value in " + src + " for this selection");
    if (spec.form === "bars") {
      const max = Math.max(1, ...known.map(x => x.v));
      body = `<div class="eu-hbars">${known.map(x => `<div class="eu-hb">
          <div class="eu-hb-l">${euFlag(x.iso, rawTip(x.iso))}<span>${esc(euName(x.iso))}</span></div>
          <div class="eu-hb-t"><div class="eu-hb-b" style="width:max(${x.v / max * 100}%,4px);background:var(--accent)"></div>
            <span>${euFmt(x.v)}${spec.unit ? " " + esc(spec.unit) : ""}</span></div></div>`).join("")}</div>`;
      if (nc.length) body += `<p class="eu-foot">${t("eu.ncList")} ${euFlags(nc, 0, rawTip)}</p>`;
      return { title: spec.title || ficheLabel(key, col), src, filled, total: n, body, facts,
        summary: known.map(x => x.iso + "=" + x.v) };
    }
    /* paliers : des bornes donnees par l'assistant */
    const B = spec.buckets.map((b, i) => ({ label: esc(b.label || ""), min: b.min != null ? +b.min : -Infinity,
      max: b.max != null ? +b.max : Infinity, color: EU_PALETTE[i % EU_PALETTE.length], isos: [], tipOf: rawTip }));
    known.forEach(x => { const b = B.find(g => x.v >= g.min && x.v <= g.max); if (b) b.isos.push(x.iso); else nc.push(x.iso); });
    return Object.assign(euVisualForm(spec, sel, B, nc, rawTip, src, filled), { facts });
  }

  /* --- des categories : valeurs du classeur, ou regroupements par mots-cles --- */
  let groups;
  const nc = [];
  if (spec.groups && spec.groups.length) {
    groups = spec.groups.map((g, i) => ({ label: esc(g.label || ""), kw: [].concat(g.keywords || []).map(k => String(k).toLowerCase()),
      color: EU_PALETTE[i % EU_PALETTE.length], isos: [], tipOf: rawTip }));
    const other = { label: t("eu.v.other"), color: "var(--line2)", isos: [], tipOf: rawTip };
    sel.forEach(c => {
      const v = raw(c.iso);
      if (euNC(v)) { nc.push(c.iso); return; }
      const low = String(v).toLowerCase();
      const g = groups.find(gr => gr.kw.some(k => k === "yes" ? euYes(v) : k === "no" ? euNo(v) : low.includes(k)));
      (g || other).isos.push(c.iso);
    });
    if (other.isos.length) groups.push(other);
    groupsNote = `<p class="eu-mine-g"><b>${t("eu.mine.groups")}</b> ${spec.groups.map(g =>
      `${esc(g.label)} ← « ${[].concat(g.keywords || []).map(esc).join(" », « ")} »`).join(" · ")}</p>`;
  } else {
    const m = new Map();
    sel.forEach(c => {
      const k = euNorm(raw(c.iso));
      if (k == null) { nc.push(c.iso); return; }
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c.iso);
    });
    if (m.size > 8) {
      throw new Error(m.size + " distinct values in " + src + ": pass `groups` with keywords. Values: "
        + [...m.keys()].map(v => v.slice(0, 60)).slice(0, 30).join(" | "));
    }
    /* Oui avant Non quel que soit le compte : on lit « qui le fait » d'abord. */
    const rank = k => k === "YES" ? 0 : k === "NO" ? 2 : 1;
    groups = [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length)
      .map(([k, list], i) => ({ label: esc(euValLabel(k)), isos: list, tipOf: rawTip,
        color: k === "YES" ? "var(--m4)" : k === "NO" ? "var(--m1)" : EU_PALETTE[i % EU_PALETTE.length] }));
  }
  filled = n - nc.length;
  const out = euVisualForm(spec, sel, groups, nc, rawTip, src, filled);
  out.body += groupsNote;
  out.facts = facts;
  return out;
}

function euVisualForm(spec, sel, groups, nc, rawTip, src, filled){
  const n = sel.length;
  const shown = groups.filter(g => g.isos.length);
  const title = spec.title || ficheLabel(spec.sheet, spec.cols[0]);
  const ncFoot = nc.length ? `<p class="eu-foot">${t("eu.ncList")} ${euFlags(nc, 0, rawTip)}</p>` : "";
  let body;
  if (spec.form === "map") {
    const of = {};
    groups.forEach((g, i) => g.isos.forEach(iso => { of[iso] = "g" + i; }));
    const cats = groups.map((g, i) => ({ k: "g" + i, label: g.label, color: g.color }))
      .concat([{ k: "nc", label: t("fiche.nc"), color: "var(--surface3)" }]);
    body = `<div class="eu-mapgrid">
      <div>${euMap(sel, c => ({ k: of[c.iso] || "nc", raw: String(euShow(c.iso, spec.sheet, spec.cols[0]) || "").slice(0, 120) }), cats)}
        ${euLegend(cats.map(x => Object.assign({ n: x.k === "nc" ? nc.length : groups[+x.k.slice(1)].isos.length }, x)))}</div>
      <div>${euShare(shown, n, { flags: 6 })}</div></div>`;
  } else if (spec.form === "rings") {
    body = `<div class="eu-rings row">${shown.slice(0, 6).map(g => euRing(g.isos.length, n, g.color, `<b>${g.label}</b>`, g.isos)).join("")}</div>${ncFoot}`;
  } else if (spec.form === "stairs") {
    body = euStairs(shown, filled) + ncFoot;
  } else if (spec.form === "columns") {
    const max = Math.max(1, ...shown.map(g => g.isos.length));
    body = `<div class="eu-cols">${shown.map(g => `<div class="eu-col">
        <span class="eu-col-n">${g.isos.length}</span>
        <div class="eu-col-stack" style="height:${g.isos.length / max * 100}%">${g.isos.map(iso => euFlag(iso, rawTip(iso))).join("")}</div>
        <span class="eu-col-l">${g.label}</span></div>`).join("")}</div>${ncFoot}`;
  } else if (spec.form === "pyramid") {
    const step = 50 / Math.max(1, groups.length);
    body = `<div class="eu-pyr">${groups.map((g, i) => {
      const a = i * step, b = (i + 1) * step;
      return `<div class="eu-pyr-row"><div class="eu-pyr-c">
          <div class="eu-pyr-s" style="clip-path:polygon(${50 - a}% 0,${50 + a}% 0,${50 + b}% 100%,${50 - b}% 100%);
            background:color-mix(in srgb,var(--accent) ${100 - i * (70 / groups.length)}%,var(--accent-soft))">
            ${i ? `<span style="color:${i < groups.length / 2 ? "var(--accent-ink)" : "var(--accent2)"}">${g.label}</span>` : ""}</div>
          ${i ? "" : `<span class="eu-pyr-out" style="right:calc(50% + ${(a + b) / 2 + 3}%)">${g.label}</span>`}
        </div><div class="eu-pyr-f"><b>${g.isos.length}</b>${euFlags(g.isos, 0, g.tipOf)}</div></div>`;
    }).join("")}</div>${ncFoot}`;
  } else {
    body = euShare(shown, n) + ncFoot;
  }
  return { title, src, filled, total: n, body, summary: shown.map(g => g.label.replace(/&#39;/g, "'").replace(/&amp;/g, "&") + ": " + g.isos.length + "/" + n) };
}

/* ---------- Mes visuels ---------- */
function euMine(){ return Array.isArray(store.euMine) ? store.euMine : []; }
function euMineAdd(spec){
  const id = "v" + Date.now().toString(36);
  store.euMine = euMine().concat([{ id, spec, created: new Date().toISOString().slice(0, 10) }]);
  saveStore();
  return id;
}
function euMineRemove(id){
  store.euMine = euMine().filter(v => v.id !== id);
  if (store.euText) delete store.euText["mine-" + id];
  saveStore();
}

function euMineSection(sel){
  const list = euMine();
  const cards = list.map(v => {
    let ch;
    try { ch = euVisualBuild(v.spec, sel); }
    catch (e) { ch = { title: v.spec.title || "-", src: (v.spec.sheet || "") + "!" + (v.spec.column || ""),
      body: `<p class="eu-empty">${esc(t("eu.mine.broken", { err: e.message }))}</p>` }; }
    ch.id = "mine-" + v.id;
    ch.wide = v.spec.form === "map" || v.spec.form === "pyramid" || v.spec.form === "stairs" || v.spec.form === "bars";
    ch.meta = t("eu.mine.created", { date: fmtDateL(v.created) });
    ch.mine = v.id;
    return euCard(ch, sel);
  }).join("");
  return `<div class="eu-mine-intro">
      <div class="ic">${ficheIcon("sparkle")}</div>
      <div><b>${t("eu.mine.title")}</b><p>${t("eu.mine.intro")}</p></div>
      <button type="button" class="btn primary" id="euMineAsk">${t("eu.mine.create")}</button>
    </div>
    ${cards || `<p class="eu-empty eu-mine-empty">${t("eu.mine.empty")}</p>`}`;
}

/* ---------- l'outil de l'assistant ---------- */
let chatPendingVisuals = [];
function chatCreateVisual(a){
  let ch;
  try { ch = euVisualBuild(a, euAll().filter(c => c.eu)); }
  catch (e) { return { error: e.message }; }
  const spec = {};
  ["title", "form", "sheet", "column", "columns", "groups", "buckets", "countries", "unit"].forEach(k => {
    if (a[k] != null && !(Array.isArray(a[k]) && !a[k].length)) spec[k] = a[k];
  });
  chatPendingVisuals.push({ spec });
  return { rendered: true, title: ch.title, source: ch.src, counts: ch.summary,
    notTracked: (ch.facts || {}).notTracked, notCommunicated: (ch.facts || {}).notCommunicated,
    note: "The visual is displayed under your reply with an 'Add to My visuals' button. Tell the user, "
      + "in one sentence, that once added it is available in " + t("nav.europe") + " > " + t("eu.s.mine")
      + " (use these exact names). Mention countries not tracked by RegWatch and countries whose answer "
      + "is not communicated, if any. If you used groups, say the grouping is yours and should be checked." };
}

function chatVisualHTML(v, key){
  let ch;
  try { ch = euVisualBuild(v.spec, euAll().filter(c => c.eu)); }
  catch (e) { return `<p class="q-note">${esc(e.message)}</p>`; }
  const added = v.addedId && euMine().some(m => m.id === v.addedId);
  return `<figure class="eu-card chat-visual" data-vis="${key}">
    <div class="eu-card-h"><h3 class="eu-title" style="cursor:default">${esc(ch.title)}</h3></div>
    <div class="eu-body">${ch.body}</div>
    <div class="chat-vis-act">
      ${added
        ? `<span class="chat-vis-ok">${t("eu.mine.added")}</span><a class="btn" href="#/europe/mine">${t("eu.mine.open")}</a>`
        : `<button type="button" class="btn primary chat-vis-add" data-vis="${key}">${ficheIcon("sparkle")}${t("eu.mine.add")}</button>`}
      <button type="button" class="btn chat-vis-png" data-vis="${key}">PNG</button>
    </div>
    ${added ? "" : `<p class="q-note chat-vis-where">${t("eu.mine.where")}</p>`}
  </figure>`;
}
