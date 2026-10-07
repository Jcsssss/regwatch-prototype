/* ================= le generateur de rapports personnalises =================
 *
 * Ce que l'outil savait faire : quatre slides sur un pays, toujours les memes.
 * Ce que les consultants demandent : un rapport, pour les pays qu'ils suivent,
 * avec les rubriques dont ils ont besoin ce jour-la. Un client qui opere dans
 * vingt pays veut vingt pays ; une note interne en veut trois.
 *
 * Le plan plutot que le bouton
 *   Un rapport est decrit par un plan : les pays, la langue, les graphiques de
 *   la vue europeenne a y joindre, et l'analyse de l'IA (avec quel modele). Le
 *   plan est une donnee : il se garde d'une fois sur l'autre, se relit, et
 *   pourra un jour venir d'ailleurs que du formulaire.
 *
 * Un seul usage : le support client
 *   Une premiere version demandait la destination (note interne ou support
 *   client), un titre, un destinataire, et laissait choisir les rubriques. A
 *   l'usage, le rapport part chez un client : les recommandations internes en
 *   sont toujours retirees, la couverture porte un titre fixe, et les rubriques
 *   sont celles du rapport de veille habituel (DG_DEFAULT_BLOCKS). Ce qui
 *   varie d'un client a l'autre, ce sont ses pays et les graphiques qu'on lui
 *   montre.
 *
 * Le questionnaire plutot que la case a cocher
 *   Quatre ecrans : les pays (un par un) et la langue, les graphiques de la vue
 *   europeenne, l'analyse de l'IA, le recapitulatif.
 *
 * Tout doit rester modifiable dans le PowerPoint
 *   C'est la contrainte qui a decide de la forme des slides. Pas d'image : les
 *   chiffres sont des zones de texte, les barres des rectangles, les tableaux
 *   de vrais tableaux PowerPoint. Un consultant doit pouvoir corriger un mot
 *   sans regenerer le fichier, et reprendre une slide dans un autre support.
 *
 * L'analyse de l'IA est signee
 *   Quand le consultant la demande, l'IA redige les paragraphes d'analyse a
 *   partir des seuls chiffres du rapport. Chaque paragraphe arrive dans un
 *   encadre intitule, qui dit qu'il a ete propose par l'IA et qu'il attend une
 *   relecture. Le texte reste une zone de texte ordinaire : on le corrige, on
 *   le reecrit, on supprime l'encadre. Une analyse anonyme aurait fini citee
 *   telle quelle devant un client.
 *
 * Ce module ne reconstruit pas ce qui existe : les slides de fiche pays sont
 * celles d'app_report.js, et l'emballage du .pptx est rptPackage().
 */
"use strict";

/* Les deux couleurs de statut de la charte qu'app_report.js n'avait pas eu a
   nommer. Le reste vient de la : violet, violet profond, vert, bleu, gris. */
const RPT_AMBER = "FFCA4A", RPT_RED = "FF2A49";

/* ---------- la geometrie des slides du rapport ---------- */
const DG_X = rptEmu(0.5);                         /* marge gauche */
const DG_W = RPT_W - rptEmu(1.0);                 /* largeur utile */
const DG_WIN = 12.333;                            /* la meme, en pouces */
const DG_TOP = rptEmu(1.12);                      /* haut du contenu */
const DG_BOT = RPT_H - rptEmu(0.52);              /* bas du contenu */

/* ---------- le plan ---------- */
/* Garde dans le store : on revient souvent produire le meme rapport a un mois
   d'intervalle, et retrouver ses choix vaut mieux que les refaire. */
const DG_DEFAULT_BLOCKS = ["synth", "matrix", "fw", "inc", "reg", "news", "sources"];

function dgPlan(){
  const s = store.docgen || {};
  return {
    purpose: "client",
    isos: Array.isArray(s.isos) ? s.isos.filter(i => byIso[i]) : [],
    blocks: DG_DEFAULT_BLOCKS.slice(),
    charts: Array.isArray(s.charts) ? s.charts.filter(x => typeof x === "string") : [],
    ai: s.ai === true,
    model: typeof s.model === "string" ? s.model : "",
    lang: s.lang === "en" ? "en" : s.lang === "fr" ? "fr" : lang
  };
}
function dgSavePlan(p){
  store.docgen = { isos: p.isos, charts: p.charts, ai: p.ai, model: p.model, lang: p.lang };
  saveStore();
}

/* Le perimetre : les pays choisis un par un. Les raccourcis d'avant (la
   selection de la vue europeenne, les 27, les pays transposes) produisaient des
   rapports dont personne ne savait plus dire, une semaine apres, pourquoi tel
   pays y figurait. */
function dgCountries(plan){
  return COUNTRIES.slice()
    .sort((a, b) => rptCountryName(a, plan.lang).localeCompare(rptCountryName(b, plan.lang), plan.lang))
    .filter(c => plan.isos.includes(c.iso));
}

/* ---------- les graphiques de la vue europeenne ----------
 * Les memes que sur la page « Vue europeenne », recalcules sur les pays du
 * rapport, plus « Mes visuels ». Ils entrent dans le rapport comme images : un
 * graphique de la vue europeenne est du HTML, et le refaire en formes
 * PowerPoint serait une seconde implementation de chacun. Le titre de la slide,
 * lui, reste une zone de texte.
 */
function dgChartCatalog(sel){
  if (typeof EU_CHARTS === "undefined" || typeof SHEET_DATA === "undefined"
      || regId() !== "nis2" || !sel.length) return [];
  const out = [];
  EU_SECTIONS.forEach(sec => {
    if (sec.key === "mine") {
      euMine().forEach(v => {
        let ch;
        try { ch = euVisualBuild(v.spec, sel); } catch (e) { return; }
        ch.id = "mine-" + v.id;
        ch.wide = ["map", "pyramid", "stairs", "bars"].includes(v.spec.form);
        out.push({ id: ch.id, sec: sec, ch: ch });
      });
      return;
    }
    (EU_CHARTS[sec.key] || []).forEach(fn => {
      let ch = null;
      try { ch = fn(sel); } catch (e) { console.error("graphique", sec.key, e); }
      if (ch && ch.id) out.push({ id: ch.id, sec: sec, ch: ch });
    });
  });
  return out;
}
const dgChartTitle = it => (euText(it.id).title || it.ch.title);

/* La capture se fait dans la langue du rapport et sur fond clair, quel que soit
   l'ecran : un rapport anglais tire d'une interface francaise en theme sombre
   portait sinon des graphiques francais sur fond noir. Les deux reglages sont
   rendus a l'interface dans le finally. */
async function dgChartImages(plan, cs){
  if (!plan.charts.length) return [];
  const root = document.documentElement;
  const prevLang = lang, prevTheme = root.dataset.theme;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-30000px;top:0";
  document.body.appendChild(host);
  const out = [];
  try {
    lang = plan.lang;
    if (typeof applyCountryNames === "function") applyCountryNames();
    root.dataset.theme = "light";
    const items = dgChartCatalog(cs).filter(it => plan.charts.includes(it.id));
    for (const it of items) {
      const box = document.createElement("div");
      box.style.width = (it.ch.wide ? 1100 : 620) + "px";
      box.innerHTML = euCard(it.ch, cs);
      host.appendChild(box);
      const card = box.firstElementChild;
      const title = ($(".eu-title", card) || {}).textContent || it.ch.title;
      /* Le titre devient celui de la slide, en texte modifiable : on ne le
         garde pas en double dans l'image. */
      const head = $(".eu-card-h", card);
      if (head) head.remove();
      await new Promise(r => requestAnimationFrame(() => r()));
      const blob = await euCardPng(card, 2);
      const bmp = await createImageBitmap(blob);
      out.push({ id: it.id, title: title.trim(), w: bmp.width, h: bmp.height,
                 bytes: new Uint8Array(await blob.arrayBuffer()) });
      bmp.close && bmp.close();
      box.remove();
    }
  } finally {
    lang = prevLang;
    if (typeof applyCountryNames === "function") applyCountryNames();
    if (prevTheme) root.dataset.theme = prevTheme; else delete root.dataset.theme;
    host.remove();
  }
  return out;
}

/* ---------- la vue d'ensemble europeenne ----------
 * La deuxieme slide de chaque rapport, sur le modele de l'infographie
 * « NIS 2 : current state and key updates on European transpositions » de
 * l'equipe : transposition, referentiels, enregistrement et audits. Ses
 * chiffres sont recalcules sur les pays du rapport, a partir du classeur, et
 * elle est faite de formes PowerPoint : un anneau est un arc, un chiffre une
 * zone de texte. Seule la carte est une image, dessinee pour ces memes pays.
 */
const DG_OV = { bg: "451DC7", band: "250F6B", green: "04F06A", white: "FFFFFF",
  ontime: "04F06A", late: "4682B4", todo: "FF2A49", pub: "04F06A", draft: "FFCA4A",
  reg: "4682B4", aud: "FFCA4A", track: "E9E5F9" };

/* Une forme quelconque : rectangle, ellipse, arc (blockArc), anneau (donut),
   avec ou sans texte. Les angles sont en 60 000e de degre, 0 a trois heures,
   dans le sens des aiguilles d'une montre. */
function dgSp(s, x, y, w, h, o){
  o = o || {};
  const id = s.id++;
  const gd = (o.adj || []).map(([n, v]) => `<a:gd name="${n}" fmla="val ${Math.round(v)}"/>`).join("");
  const fill = o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : "<a:noFill/>";
  const ln = o.line ? `<a:ln w="${o.lineW || 12700}"><a:solidFill><a:srgbClr val="${o.line}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>";
  const paras = (o.paras || []).map(p => `<a:p><a:pPr algn="${p.align || "l"}"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc>`
    + `<a:spcBef><a:spcPts val="${p.space || 0}"/></a:spcBef><a:buNone/></a:pPr>`
    + p.runs.map(r => rptRunXml(Object.assign({ b: false, i: false }, r))).join("") + "</a:p>").join("") || "<a:p/>";
  const ins = o.inset == null ? 0 : o.inset;
  s.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="ov${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>`
    + `<a:prstGeom prst="${o.prst || "rect"}"><a:avLst>${gd}</a:avLst></a:prstGeom>${fill}${ln}</p:spPr>`
    + `<p:txBody><a:bodyPr wrap="square" lIns="${ins}" tIns="${ins}" rIns="${ins}" bIns="${ins}" anchor="${o.anchor || "t"}"><a:noAutofit/></a:bodyPr>`
    + `<a:lstStyle/>${paras}</p:txBody></p:sp>`);
}
/* Un texte : des morceaux { t, b, color, sz }, sur une ou plusieurs lignes. */
const dgOvP = (runs, sz, align) => ({ align: align, runs: runs.map(r => Object.assign({ sz: sz, color: DG_OV.white }, r)) });

/* L'anneau : un disque blanc, une piste, l'arc de la part, et « n / total ». */
function dgOvRing(s, x, y, d, n, total, color){
  const E = rptEmu;
  dgSp(s, E(x), E(y), E(d), E(d), { prst: "ellipse", fill: DG_OV.white });
  const th = 11000;
  dgSp(s, E(x + d * .06), E(y + d * .06), E(d * .88), E(d * .88), { prst: "donut", fill: DG_OV.track, adj: [["adj", th]] });
  const frac = total ? n / total : 0;
  if (frac >= 1) dgSp(s, E(x + d * .06), E(y + d * .06), E(d * .88), E(d * .88), { prst: "donut", fill: color, adj: [["adj", th]] });
  else if (frac > 0) dgSp(s, E(x + d * .06), E(y + d * .06), E(d * .88), E(d * .88), { prst: "blockArc", fill: color,
    adj: [["adj1", 16200000], ["adj2", (16200000 + frac * 21600000) % 21600000], ["adj3", th]] });
  dgSp(s, E(x), E(y), E(d), E(d), { anchor: "ctr", paras: [{ align: "ctr", runs: [
    { t: String(n), sz: Math.round(d * 2300), b: true, color: RPT_DEEP },
    { t: " /" + total, sz: Math.round(d * 1000), color: "8C8C8C" }] }] });
}

/* Les chiffres, recalcules sur les pays du rapport. Les libelles des sources
   viennent de l'interface (t) : la langue de l'ecran passe a celle du rapport
   le temps de les lire. */
function dgOverviewData(cs, L){
  const n = cs.length;
  const tr = { ontime: [], late: [], todo: [] };
  cs.forEach(c => tr[euTrState(c).k].push(c));
  const pub = cs.filter(c => c.fw === "final" || c.fw === "reference").length;
  const draft = cs.filter(c => c.fw === "temporary").length;
  /* Les exigences, comme le graphique de la vue europeenne : un referentiel
     hors d'echelle (l'E-ITS estonien) est ecarte des moyennes et des extremes. */
  const items = cs.map(c => ({ ee: euNum(euCell(c.iso, "fw", "L")), ie: euNum(euCell(c.iso, "fw", "M")) }))
    .filter(x => x.ee != null || x.ie != null);
  const sorted = items.map(x => x.ee || 0).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 1;
  const kept = items.filter(x => Math.max(x.ee || 0, x.ie || 0) <= med * 4);
  const stat = k => {
    const v = kept.map(x => x[k]).filter(v => v != null && v > 0);
    return v.length ? { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v), min: Math.min(...v) } : null;
  };
  const prev = lang;
  let srcs = [];
  try {
    lang = L ? "en" : "fr";
    srcs = ["P", "R", "T", "U", "V", "Q", "S", "W", "Y"]
      .map(col => ({ label: euSrcLabel(col), n: cs.filter(c => euYes(euCell(c.iso, "fw", col))).length }))
      /* « Autre guide », « autre cadre » : des categories, pas des sources. */
      .filter(x => x.n && !/^(autres?|other)\b/i.test(x.label)).sort((a, b) => b.n - a.n).slice(0, 4).map(x => x.label);
  } finally { lang = prev; }
  const regOpen = cs.filter(c => euYes(euCell(c.iso, "reg", "D"))).length;
  const delays = cs.map(c => euNum(euCell(c.iso, "reg", "J"))).filter(v => v != null && v > 0);
  const audM = cs.map(c => { const v = euCell(c.iso, "aud", "M"); return /^\s*\d/.test(v || "") ? euNum(v) : null; })
    .filter(v => v != null && v > 0);
  return { n, tr, pub, draft, analysed: items.length, ee: stat("ee"), ie: stat("ie"), srcs,
    regOpen, delay: delays.length ? [Math.min(...delays), Math.max(...delays)] : null,
    aud: audM.length, audRange: audM.length ? [Math.min(...audM), Math.max(...audM)] : null };
}
function dgOvMonths(m, L){
  if (m < 1) { const d = Math.round(m * 30); return L ? d + " days" : d + " jours"; }
  const r = Math.round(m * 10) / 10;
  return L ? r + (r > 1 ? " months" : " month") : String(r).replace(".", ",") + " mois";
}
function dgOvFreq(m, L){
  if (m === 12) return L ? "once a year" : "une fois par an";
  if (m % 12 === 0) return L ? "every " + m / 12 + " years" : "tous les " + m / 12 + " ans";
  return L ? "every " + m + " months" : "tous les " + m + " mois";
}

/* La carte des pays du rapport, en image : les formes d'un pays ne se
   redessinent pas en PowerPoint. Fond transparent, pour le violet de la slide. */
async function dgOverviewMap(cs){
  if (typeof MAP_DATA === "undefined") return null;
  const col = { ontime: "#" + DG_OV.ontime, late: "#" + DG_OV.late, todo: "#" + DG_OV.todo };
  const sel = new Map(cs.map(c => [c.iso, col[euTrState(c).k]]));
  const vb = MAP_DATA.viewBox.split(/\s+/).map(Number);
  const paths = Object.entries(MAP_DATA.paths).map(([iso, d]) => sel.has(iso)
    ? `<path d="${d}" fill="${sel.get(iso)}" stroke="#451DC7" stroke-width=".8"/>`
    : `<path d="${d}" fill="#FFFFFF" fill-opacity=".2" stroke="#451DC7" stroke-width=".6"/>`).join("");
  const W = 900, H = Math.round(W * vb[3] / vb[2]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${W}" height="${H}">${paths}</svg>`;
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  cv.getContext("2d").drawImage(img, 0, 0, W, H);
  const blob = await new Promise((ok, ko) => cv.toBlob(b => b ? ok(b) : ko(new Error("toBlob")), "image/png"));
  return { w: W, h: H, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function dgOverviewSlide(ctx){
  const L = ctx.lang === "en", E = rptEmu, cs = ctx.cs;
  const D = dgOverviewData(cs, L);
  const s = { shapes: [], id: 10, media: [] };
  const P = (x, y, w, h, paras, o) => dgSp(s, E(x), E(y), E(w), E(h), Object.assign({ paras: paras }, o || {}));
  const B = t_ => ({ t: t_, b: true });

  /* Le fond violet s'arrete au-dessus du pied de page, qui reste lisible. */
  dgSp(s, 0, 0, RPT_W, E(6.95), { fill: DG_OV.bg });
  P(0.45, 0.28, 12.4, 0.5, [dgOvP([B(L ? "NIS 2: where " : "NIS 2 : où en sont les "),
    { t: L ? "European transpositions" : "transpositions européennes", b: true, color: DG_OV.green },
    B(L ? " stand" : " ?")], 2000)]);
  P(0.45, 0.78, 12.4, 0.3, [dgOvP([{ t: (L ? "Report perimeter: " : "Périmètre du rapport : ")
    + (cs.length > 8 ? cs.length + (L ? " countries" : " pays") : cs.map(dgName).join(", ")) }], 1000)]);

  /* --- transposition --- */
  P(0.45, 1.2, 6.1, 0.35, [dgOvP([Object.assign(B(L ? "What is the current state of national transpositions?" : "Où en sont les transpositions nationales ?"), { color: DG_OV.green })], 1300)]);
  const rings = [
    [D.tr.ontime.length, DG_OV.ontime, L ? ["Countries that have ", "transposed on time"] : ["Pays ayant transposé ", "dans les délais"]],
    [D.tr.late.length, DG_OV.late, L ? ["Countries that have transposed ", "after the EU deadline"] : ["Pays ayant transposé ", "après l'échéance européenne"]],
    [D.tr.todo.length, DG_OV.todo, L ? ["Countries that have ", "not yet transposed"] : ["Pays n'ayant ", "pas encore transposé"]]
  ];
  rings.forEach(([n, color, txt], i) => {
    const y = 1.7 + i * 1.2;
    dgOvRing(s, 0.55, y, 0.92, n, D.n, color);
    P(1.65, y + 0.12, 2.0, 0.7, [dgOvP([{ t: txt[0] }, B(txt[1])], 1100)]);
  });
  if (D.tr.todo.length)
    P(1.65, 1.7 + 2 * 1.2 + 0.62, 2.0, 0.45, [dgOvP([{ t: D.tr.todo.map(dgName).join(", ") }], 850)]);
  if (ctx.ovMap) {
    const bw = 2.85, bh = 3.35, k = Math.min(bw / ctx.ovMap.w, bh / ctx.ovMap.h);
    const w = ctx.ovMap.w * k, h = ctx.ovMap.h * k, x = 3.75 + (bw - w) / 2, y = 1.62;
    const id = s.id++, rid = "rIdOvMap";
    s.media.push({ rid: rid, bytes: ctx.ovMap.bytes });
    s.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Map ${id}" descr="Map"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
      + `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
      + `<p:spPr><a:xfrm><a:off x="${Math.round(E(x))}" y="${Math.round(E(y))}"/><a:ext cx="${Math.round(E(w))}" cy="${Math.round(E(h))}"/></a:xfrm>`
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>');
    [[DG_OV.ontime, L ? "On time" : "Dans les délais", 0], [DG_OV.late, L ? "After the deadline" : "Après l'échéance", 1.0],
     [DG_OV.todo, L ? "Not yet" : "Pas encore", 2.15]].forEach(([c, lab, dx]) => {
      dgSp(s, E(3.75 + dx), E(5.0), E(0.11), E(0.11), { fill: c });
      P(3.9 + dx, 4.96, 1.05, 0.2, [dgOvP([{ t: lab }], 800)]);
    });
  }
  dgSp(s, E(6.75), E(1.2), E(0.02), E(3.75), { fill: DG_OV.white });

  /* --- referentiels --- */
  P(7.0, 1.2, 5.9, 0.35, [dgOvP([Object.assign(B(L ? "Where do we stand on cybersecurity frameworks?" : "Où en sont les référentiels de cybersécurité ?"), { color: DG_OV.green })], 1300)]);
  dgOvRing(s, 7.05, 1.65, 0.92, D.pub, D.n, DG_OV.pub);
  P(8.1, 1.72, 1.95, 0.8, [dgOvP(L ? [{ t: "Officially published a " }, B("NIS 2 framework"), { t: " or recommend an existing one" }]
    : [{ t: "Ont publié un " }, B("référentiel NIS 2"), { t: " ou en recommandent un existant" }], 1050)]);
  dgOvRing(s, 10.15, 1.65, 0.92, D.draft, D.n, DG_OV.draft);
  P(11.2, 1.82, 1.75, 0.6, [dgOvP(L ? [{ t: "Shared a " }, B("draft or partial framework")] : [{ t: "Ont partagé un " }, B("référentiel provisoire ou partiel")], 1050)]);
  P(7.0, 2.78, 5.9, 0.32, [dgOvP([B(D.analysed > 1
    ? (L ? D.analysed + " national frameworks analysed: no clear common trend" : D.analysed + " référentiels nationaux analysés : pas de tendance commune")
    : (L ? "Requirements published by the national frameworks" : "Exigences publiées par les référentiels nationaux"))], 1150)]);
  const rowLab = (y, txt) => P(7.0, y, 1.75, 0.45, [dgOvP([{ t: txt, i: true }], 1000)], { anchor: "ctr" });
  rowLab(3.22, L ? "A varying number of requirements" : "Un nombre d'exigences variable");
  [["ee", L ? "EE" : "EE"], ["ie", L ? "IE" : "EI"]].forEach(([k, lab], r) => {
    const st = D[k];
    [["avg", L ? "Average" : "Moyenne"], ["max", "Max"], ["min", "Min"]].forEach(([f, fl], c) => {
      P(8.85 + c * 1.37, 3.2 + r * 0.38, 1.28, 0.3, [dgOvP([{ t: fl + " " + lab + " : " }, B(st ? String(st[f]) : "-")], 950, "ctr")],
        { line: DG_OV.green, lineW: 9525, anchor: "ctr" });
    });
  });
  const chips = (y, lab, list, fill) => {
    rowLab(y, lab);
    list.forEach((txt, i) => P(8.85 + i * 0.81, y + 0.02, 0.76, 0.42,
      [dgOvP([{ t: txt.length > 22 ? txt.slice(0, 21) + "…" : txt }], 750, "ctr")], { fill: fill, anchor: "ctr", inset: E(0.03) }));
  };
  chips(4.0, L ? "Multiple sources of inspiration" : "Des sources d'inspiration multiples", D.srcs.concat(["…"]), DG_OV.band);
  chips(4.55, L ? "Common topics, different granularity" : "Des thèmes communs, une granularité différente",
    (L ? ["IAM", "Detection", "Audits", "Recovery"] : ["IAM", "Détection", "Audits", "Reprise"]).concat(["…"]), "4682B4");

  /* --- enregistrement et audits --- */
  dgSp(s, 0, E(5.15), RPT_W, E(1.25), { fill: DG_OV.band });
  P(0.45, 5.2, 12.4, 0.3, [dgOvP([Object.assign(B(L ? "Where do we stand on registration and audits?" : "Où en sont l'enregistrement et les audits ?"), { color: DG_OV.green })], 1300, "ctr")]);
  dgOvRing(s, 0.9, 5.52, 0.8, D.regOpen, D.n, DG_OV.reg);
  P(1.85, 5.6, 2.4, 0.65, [dgOvP(L ? [B("Registration"), { t: " or pre-registration modalities available" }]
    : [{ t: "Modalités d'" }, B("enregistrement"), { t: " ou de pré-enregistrement disponibles" }], 1050)]);
  P(4.55, 5.6, 2.8, 0.65, [dgOvP(D.delay
    ? (L ? [B("Registration time"), { t: " ranges from " }, B(dgOvMonths(D.delay[0], true)), { t: " to " }, B(dgOvMonths(D.delay[1], true))]
         : [B("Délai d'enregistrement"), { t: " : de " }, B(dgOvMonths(D.delay[0], false)), { t: " à " }, B(dgOvMonths(D.delay[1], false))])
    : [{ t: L ? "No registration time set in these countries" : "Aucun délai d'enregistrement fixé dans ces pays" }], 1050)], { anchor: "ctr" });
  dgOvRing(s, 7.65, 5.52, 0.8, D.aud, D.n, DG_OV.aud);
  P(8.6, 5.6, 1.95, 0.65, [dgOvP(L ? [{ t: "Shared " }, B("specific audit frequencies"), { t: " for EE" }]
    : [{ t: "Ont fixé une " }, B("fréquence d'audit"), { t: " pour les EE" }], 1050)]);
  P(10.65, 5.6, 2.3, 0.65, [dgOvP(D.audRange
    ? (D.audRange[0] === D.audRange[1]
      ? (L ? [B("Audits"), { t: " " + dgOvFreq(D.audRange[0], true) }] : [B("Audits"), { t: " " + dgOvFreq(D.audRange[0], false) }])
      : (L ? [B("Audit frequency"), { t: " from " }, B(dgOvFreq(D.audRange[0], true)), { t: " to " }, B(dgOvFreq(D.audRange[1], true))]
           : [B("Fréquence des audits"), { t: " : de " }, B(dgOvFreq(D.audRange[0], false)), { t: " à " }, B(dgOvFreq(D.audRange[1], false))]))
    : [{ t: L ? "No audit frequency set yet" : "Aucune fréquence d'audit encore fixée" }], 1050)], { anchor: "ctr" });

  /* --- la phrase de conclusion, tiree des chiffres --- */
  const done = D.tr.ontime.length + D.tr.late.length;
  P(0.45, 6.45, 12.4, 0.42, [dgOvP([{ t: "→ " }, B(done === D.n
      ? (L ? "Every country in this report has transposed NIS 2" : "Tous les pays de ce rapport ont transposé NIS 2")
      : (L ? done + " of the " + D.n + " countries in this report have transposed NIS 2" : done + " des " + D.n + " pays de ce rapport ont transposé NIS 2")),
    { t: L ? ": compliance is increasingly time-bound." : " : la mise en conformité devient de plus en plus contrainte dans le temps." }], 1300, "ctr")],
    { anchor: "ctr" });
  return s;
}

const dgXml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* Une slide par graphique : le titre en zone de texte, l'image ajustee a la
   zone de contenu sans deformation. */
function dgChartSlide(img, ctx){
  const s = dgSlide(img.title, ctx.scopeLine);
  const maxW = DG_W, maxH = DG_BOT - DG_TOP;
  const k = Math.min(maxW / img.w, maxH / img.h);
  const w = Math.round(img.w * k), h = Math.round(img.h * k);
  const x = DG_X + Math.round((maxW - w) / 2), y = DG_TOP;
  const id = s.id++, rid = "rIdImg" + id;
  s.media = [{ rid: rid, bytes: img.bytes }];
  s.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Chart ${id}" descr="${dgXml(img.title)}"/>`
    + '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
    + `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>');
  return s;
}

/* ---------- l'impact environnemental d'une analyse ----------
 * Aucun fournisseur ne publie la consommation d'une requete sur Azure OpenAI.
 * L'estimation est donc un ordre de grandeur, affiche comme tel, a partir de
 * deux mesures publiques : Google (aout 2025) mesure 0,24 Wh pour une requete
 * texte mediane de Gemini, et Epoch AI (2025) estime une requete GPT-4o
 * courante a environ 0,3 Wh. On en tire une energie par millier de jetons
 * rediges selon la taille du modele ; la lecture des donnees (jetons d'entree)
 * compte pour un dixieme ; les modeles qui raisonnent (GPT-5, serie o)
 * redigent des jetons invisibles, comptes de 1,5 a 4 fois. Le carbone suit
 * avec 250 g CO2e par kWh, l'ordre de grandeur du mix electrique europeen.
 */
const DG_IMPACT = [
  /* Les plus grands modeles du marche (Claude Opus, par exemple) : quelques
     fois un GPT-4o. */
  { re: /opus/i, wh: [0.6, 2.4] },
  { re: /nano/i, wh: [0.03, 0.12] },
  { re: /mini|small|haiku|flash|lite/i, wh: [0.08, 0.35] },
  { re: /./, wh: [0.3, 1.2] }
];
const DG_REASONING = /^(o\d|gpt-5)|opus/i;
const DG_G_PER_WH = 0.25;
const DG_PHONE_WH = 15;   /* une recharge complete de smartphone */
function dgImpact(model, inTok, outTok){
  const p = DG_IMPACT.find(x => x.re.test(model || "")) || DG_IMPACT[2];
  const r = DG_REASONING.test(model || "") ? [1.5, 4] : [1, 1];
  const wh = [0, 1].map(i => (outTok * r[i] / 1000) * p.wh[i] + (inTok / 1000) * p.wh[i] * 0.1);
  return { wh: wh, g: wh.map(v => v * DG_G_PER_WH), phone: wh.map(v => 100 * v / DG_PHONE_WH) };
}
/* Les jetons d'un rapport : ce que le modele lira (les chiffres de chaque
   rubrique, en JSON) et ce qu'il redigera (quelques phrases par rubrique). */
function dgTokens(plan, cs){
  const ctx = { plan: plan, lang: plan.lang, cs: cs, ai: {} };
  const facts = {};
  plan.blocks.forEach(id => { const b = dgBlock(id); if (b && b.ask) { try { facts[id] = b.ask(ctx); } catch (e) {} } });
  const want = Object.keys(facts).length;
  return { inTok: Math.round(JSON.stringify(facts).length / 3.5) + 450, outTok: 160 * want };
}
/* Les modeles annonces mais pas encore deployes. Ils sont montres avec leur
   estimation : le consultant voit d'avance ce qu'un modele plus grand couterait. */
const DG_MODELS_SOON = ["Claude Opus 5.5"];
/* La couleur d'un choix suit son impact. Ne pas utiliser l'IA est l'option
   verte ; un modele est jaune tant que son estimation haute reste sous 2 Wh,
   rouge au-dela. Le but est assume : faire se demander, avant de cliquer, si
   le rapport a vraiment besoin d'un modele, et duquel. */
function dgEcoLevel(im){ return im.wh[1] < 2 ? "mid" : "high"; }

function dgFmt(v){
  const n = v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Number(v.toPrecision(1));
  return n.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB");
}

/* ---------- lecture du classeur, avec ses propres intitules ----------
   Les en-tetes du classeur sont lus par tools/sheets_to_countries.py et voyagent
   avec les donnees. Un tableau du rapport porte donc le nom que la colonne
   porte dans le classeur : un lecteur qui ouvre les deux retrouve la meme
   colonne, et une colonne renommee la-bas n'oblige a rien ici. */
/* La langue du rapport, le temps de sa construction. Les lectures du classeur
   passent par `tc` et `tc` suit la langue de l'ecran : un rapport demande en
   anglais depuis l'interface francaise en sortait des cellules francaises. */
let dgLang = "fr";

function dgLabel(sheet, col, fallback){
  const sh = typeof SHEET_DATA !== "undefined" && SHEET_DATA.sheets[sheet];
  const f = sh && (sh.fields || []).find(x => x.c === col);
  return f ? tc(f.l, dgLang) : fallback;
}
/* Une valeur de cellule, prete a etre ecrite : traduite, sur une ligne, sans
   l'URL qui suit souvent le nom d'un texte legal, et bornee en longueur. Une
   case vide devient le tiret : dans un tableau, « - » se lit comme une absence,
   un blanc comme un oubli. */
function dgVal(iso, sheet, col, max){
  const v = tc(euCell(iso, sheet, col), dgLang);
  if (euNC(v)) return "-";
  const s = String(v).split(/\n|https?:\/\//)[0].replace(/\s+/g, " ").trim();
  if (!s) return "-";
  const n = max || 80;
  const cut = s.length > n ? s.slice(0, n - 1) + "…" : s;
  /* Le classeur repond « Yes » et « YES » dans une colonne dont l'intitule est
     traduit : un tableau francais portait donc un en-tete francais et une
     reponse anglaise. Seul le premier mot est touche, le reste de la cellule
     reste le texte libre du classeur. */
  return cut.replace(/^(yes|no)\b/i, m => dgLang === "fr"
    ? (/^y/i.test(m) ? "Oui" : "Non")
    : (/^y/i.test(m) ? "Yes" : "No"));
}
function dgDate(iso, sheet, col){
  const v = euCell(iso, sheet, col);
  if (euNC(v)) return "-";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? rptDate(v) : dgVal(iso, sheet, col, 28);
}

/* ---------- briques de slide ----------
   Aucune n'est une image : tout ce qui suit est une forme PowerPoint, deplacable
   et modifiable une fois le fichier ouvert. */

/* L'en-tete : le titre du bloc, son sous-titre, et le filet violet. */
function dgSlide(title, sub){
  const s = { shapes: [], id: 10 };
  s.shapes.push(rptTextBox(s.id++, DG_X, rptEmu(0.34), DG_W, rptH(1, 21, 0),
    [{ runs: [{ t: title, sz: 2100, b: true, color: RPT_VIOLET }] }]));
  if (sub) s.shapes.push(rptTextBox(s.id++, DG_X, rptEmu(0.78), DG_W, rptH(1, 10, 0),
    [{ runs: [{ t: sub, sz: 1000, b: false, color: "595959" }] }]));
  s.shapes.push(rptDots(s.id++, DG_X, rptEmu(1.02), DG_W));
  return s;
}
/* Le pied de page, pose a la fin sur chaque slide : la source des chiffres et
   la date a laquelle ils ont ete lus. Un rapport qui circule sans cette ligne
   se fait citer un an plus tard. */
function dgFoot(s, plan, i, n){
  /* Les slides de fiche pays viennent d'app_report.js : elles portent leurs
     formes, pas le compteur d'identifiants que les slides d'ici promenent. Sans
     ce garde-fou, le pied de page s'ecrivait avec id="NaN" - un fichier que
     PowerPoint propose de reparer, et dont la reparation echoue. */
  if (typeof s.id !== "number") s.id = 9200;
  const L = plan.lang === "en";
  const scanned = typeof SHEET_DATA !== "undefined" && SHEET_DATA.scanned;
  const src = (L ? "RegWatch - NIS 2 comparative workbook" : "RegWatch - classeur comparatif NIS 2")
    + (scanned ? (L ? ", read on " : ", lu le ") + rptDate(scanned) : "");
  s.shapes.push(rptTextBox(s.id++, DG_X, RPT_H - rptEmu(0.36), rptEmu(9), rptH(1, 7.5, 0),
    [{ runs: [{ t: src, sz: 750, b: false, color: "8C8C8C" }] }]));
  s.shapes.push(rptTextBox(s.id++, RPT_W - rptEmu(1.4), RPT_H - rptEmu(0.36), rptEmu(0.9), rptH(1, 7.5, 0),
    [{ runs: [{ t: (i + 1) + " / " + n, sz: 750, b: false, color: "8C8C8C" }], align: "r" }]));
}

/* Une rangee de cartouches chiffres. Le nombre et son intitule sont deux zones
   de texte distinctes : on corrige l'un sans toucher l'autre. */
function dgKpis(s, y, items){
  const gap = rptEmu(0.16);
  const w = Math.floor((DG_W - gap * (items.length - 1)) / items.length);
  const h = rptEmu(1.05);
  items.forEach((it, i) => {
    const x = DG_X + i * (w + gap);
    s.shapes.push(rptRect(s.id++, x, y, w, h, RPT_GREY));
    s.shapes.push(rptRect(s.id++, x, y, rptEmu(0.05), h, it.color || RPT_VIOLET));
    s.shapes.push(rptTextBox(s.id++, x + rptEmu(0.18), y + rptEmu(0.13), w - rptEmu(0.3), rptH(1, 26, 0),
      [{ runs: [{ t: String(it.n), sz: 2600, b: true, color: RPT_DEEP }] }]));
    s.shapes.push(rptTextBox(s.id++, x + rptEmu(0.18), y + rptEmu(0.58), w - rptEmu(0.3), rptH(2, 9, 0),
      [{ runs: [{ t: it.label, sz: 900, b: false, color: "404040" }] }]));
  });
  return y + h;
}

/* Un histogramme horizontal en rectangles : une part, son compte, et la liste
   des pays. Les barres sont des formes - on en change la couleur, on en deplace
   une, on en supprime une. */
function dgBars(s, y, items, opts){
  opts = opts || {};
  const total = items.reduce((n, it) => n + it.n, 0) || 1;
  const labW = rptEmu(2.5), barW = DG_W - labW - rptEmu(4.9);
  const rowH = rptEmu(0.46);
  items.forEach((it, i) => {
    const yy = y + i * rowH;
    s.shapes.push(rptTextBox(s.id++, DG_X, yy + rptEmu(0.05), labW - rptEmu(0.1), rptH(2, 9.5, 0),
      [{ runs: [{ t: it.label, sz: 950, b: true, color: "262626" }] }]));
    const w = Math.max(rptEmu(0.02), Math.round(barW * it.n / total));
    s.shapes.push(rptRect(s.id++, DG_X + labW, yy + rptEmu(0.04), barW, rptEmu(0.26), "FFFFFF", "D9D9D9"));
    s.shapes.push(rptRect(s.id++, DG_X + labW, yy + rptEmu(0.04), w, rptEmu(0.26), it.color || RPT_VIOLET));
    s.shapes.push(rptTextBox(s.id++, DG_X + labW + barW + rptEmu(0.12), yy + rptEmu(0.05),
      rptEmu(0.6), rptH(1, 11, 0),
      [{ runs: [{ t: String(it.n), sz: 1100, b: true, color: RPT_DEEP }] }]));
    if (opts.names !== false)
      s.shapes.push(rptTextBox(s.id++, DG_X + labW + barW + rptEmu(0.78), yy + rptEmu(0.07),
        DG_W - labW - barW - rptEmu(0.9), rptH(2, 8, 0),
        [{ runs: [{ t: it.names || "", sz: 800, b: false, color: "595959" }] }]));
  });
  return y + items.length * rowH;
}

/* Un vrai tableau PowerPoint, et non une grille de zones de texte.
   La difference se voit des qu'on y touche : une ligne s'insere, une colonne se
   redimensionne, le texte recircule. Une grille de zones de texte se casse au
   premier mot ajoute, et c'est ce qui est demande ici - que tout reste
   modifiable dans le fichier. */
function dgTableXml(id, x, y, cols, rows, heights, opts){
  opts = opts || {};
  const sz = Math.round((opts.size || 9) * 100);
  const cell = (txt, head, band) => {
    const runs = rptRuns(String(txt == null ? "" : txt),
      { sz: sz, b: !!head, i: false, color: head ? "FFFFFF" : "1A1A1A" });
    return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>'
      + `<a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>`
      + runs.map(rptRunXml).join("") + "</a:p></a:txBody>"
      + `<a:tcPr marL="${rptEmu(0.07)}" marR="${rptEmu(0.07)}" marT="${rptEmu(0.03)}"`
      + ` marB="${rptEmu(0.03)}" anchor="ctr">`
      + `<a:solidFill><a:srgbClr val="${head ? RPT_VIOLET : (band ? RPT_GREY : "FFFFFF")}"/></a:solidFill>`
      + '<a:lnB w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:lnB></a:tcPr></a:tc>';
  };
  const tr = (cells, h, head, band) =>
    `<a:tr h="${h}">` + cells.map(v => cell(v, head, band)).join("") + "</a:tr>";
  const total = heights.reduce((n, h) => n + h, 0);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="tbl${id}"/>`
    + '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/>'
    + `</p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/>`
    + `<a:ext cx="${DG_W}" cy="${total}"/></p:xfrm>`
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">'
    + '<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>'
    + cols.map(c => `<a:gridCol w="${Math.round(DG_W * c.w)}"/>`).join("") + "</a:tblGrid>"
    + tr(cols.map(c => c.label), heights[0], true, false)
    + rows.map((r, i) => tr(r, heights[i + 1], false, i % 2 === 1)).join("")
    + "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>";
}

/* La hauteur d'une ligne, estimee sur la cellule la plus longue.
   Compter les lignes plutot que les rangees : un premier essai donnait la meme
   hauteur a toutes les lignes et paginait a vingt et une par slide. Les noms de
   textes legaux tiennent sur deux lignes, parfois trois, et le tableau sortait
   par le bas de la slide - un tiers des pays manquait a l'arrivee. */
const DG_ROW_MIN = rptEmu(0.26);
function dgRowH(cells, cols, sizePt){
  let lines = 1;
  cells.forEach((v, i) => {
    lines = Math.max(lines, rptLines(v, DG_WIN * cols[i].w - 0.18, sizePt));
  });
  return Math.max(DG_ROW_MIN, rptH(lines, sizePt, 4));
}
function dgTable(s, y, cols, rows, opts){
  const sz = (opts || {}).size || 9;
  const heights = [dgRowH(cols.map(c => c.label), cols, sz)]
    .concat(rows.map(r => dgRowH(r, cols, sz)));
  s.shapes.push(dgTableXml(s.id++, DG_X, y, cols, rows, heights, opts));
  return y + heights.reduce((n, h) => n + h, 0);
}
/* L'encadre d'analyse. Il porte son intitule : « Analyse proposee par l'IA, a
   relire ». Le liserai rouge et la mention ne sont pas decoratifs - ils
   distinguent, dans un fichier qui circulera, ce que l'outil a lu dans le
   classeur de ce qu'un modele a redige. */
/* La hauteur que prendra l'encadre. Reservee et dessinee a partir du meme
   calcul : au premier essai, la place reservee dans le tableau et la hauteur
   reelle de l'encadre differaient, et l'encadre recouvrait la derniere ligne. */
function dgAiHeight(text){
  const lines = String(text).split(/\n+/).filter(Boolean)
    .reduce((n, p) => n + rptLines(p, DG_WIN - 0.36, 10), 0);
  return Math.min(rptEmu(2.1), Math.max(rptEmu(0.95), rptEmu(0.42) + rptH(lines, 10, 6)));
}
function dgAnalysisBox(s, y, text, plan, h){
  const L = plan.lang === "en";
  const label = L ? "Analysis drafted by AI - review and edit before sharing"
                  : "Analyse proposée par l'IA - à relire et à modifier avant diffusion";
  const box = h || rptEmu(1.15);
  s.shapes.push(rptRect(s.id++, DG_X, y, DG_W, box, RPT_GREY));
  s.shapes.push(rptRect(s.id++, DG_X, y, rptEmu(0.05), box, RPT_RED));
  s.shapes.push(rptTextBox(s.id++, DG_X + rptEmu(0.16), y + rptEmu(0.08), DG_W - rptEmu(0.32), rptH(1, 8, 0),
    [{ runs: [{ t: label, sz: 800, b: true, color: RPT_RED }] }]));
  s.shapes.push(rptTextBox(s.id++, DG_X + rptEmu(0.16), y + rptEmu(0.29), DG_W - rptEmu(0.32),
    box - rptEmu(0.37),
    String(text).split(/\n+/).filter(Boolean).map(p => ({
      runs: [{ t: p, sz: 1000, b: false, color: "1A1A1A" }], align: "just", space: 30 }))));
  return y + box;
}

/* ---------- les blocs ----------
 * Un bloc sait trois choses : comment il s'appelle, ce qu'il produit comme
 * slides, et ce qu'il donne a lire a l'IA s'il faut une analyse. Ajouter une
 * rubrique au generateur, c'est ajouter une entree ici : le formulaire, le
 * recapitulatif et l'analyse la reprennent sans y toucher.
 */
const DG_BLOCKS = [
  {
    id: "synth",
    tKey: "dg.b.synth",
    /* La slide d'ouverture : quatre chiffres et, si elle est demandee, l'analyse.
       C'est la seule slide que beaucoup de lecteurs liront. */
    slides: (ctx) => {
      const L = ctx.lang === "en", cs = ctx.cs;
      const tr = cs.filter(c => euYes(euCell(c.iso, "id", "F")));
      const fw = k => cs.filter(c => c.fw === k).length;
      const late = cs.filter(c => euNum(euCell(c.iso, "id", "I")) > 0);
      const s = dgSlide(L ? "Where transposition stands" : "Où en est la transposition",
        ctx.scopeLine);
      let y = dgKpis(s, DG_TOP, [
        { n: tr.length + " / " + cs.length, label: L ? "transposition finalised" : "transposition finalisée" },
        { n: fw("final") + fw("reference"), label: L ? "published national framework" : "référentiel national publié",
          color: RPT_BLUE },
        { n: fw("temporary"), label: L ? "provisional framework only" : "référentiel provisoire seulement",
          color: RPT_AMBER },
        { n: late.length, label: L ? "beyond the EU deadline" : "au-delà de l'échéance européenne",
          color: RPT_RED }
      ]);
      y += rptEmu(0.28);
      const byLvl = [4, 3, 2, 1].map(n => {
        const g = cs.filter(c => c.maturity === n);
        return { label: (L ? "Level " : "Niveau ") + n, n: g.length,
                 names: g.map(dgName).join(", "),
                 color: n >= 4 ? RPT_GREEN : n === 3 ? RPT_BLUE : n === 2 ? RPT_AMBER : "BFBFBF" };
      });
      s.shapes.push(rptTextBox(s.id++, DG_X, y, DG_W, rptH(1, 11, 0),
        [{ runs: [{ t: L ? "Maturity levels" : "Niveaux de maturité", sz: 1100, b: true, color: "000000" }] }]));
      y = dgBars(s, y + rptEmu(0.26), byLvl) + rptEmu(0.24);
      if (ctx.ai.synth) {
        const h = dgAiHeight(ctx.ai.synth);
        dgAnalysisBox(s, Math.max(y, DG_BOT - h), ctx.ai.synth, ctx.plan, h);
      }
      return [s];
    },
    ask: (ctx) => {
      const cs = ctx.cs;
      return {
        countries: cs.length,
        transposed: cs.filter(c => euYes(euCell(c.iso, "id", "F"))).map(dgName),
        notTransposed: cs.filter(c => !euYes(euCell(c.iso, "id", "F"))).map(dgName),
        levels: [1, 2, 3, 4].map(n => ({ level: n, countries: cs.filter(c => c.maturity === n).map(dgName) })),
        frameworks: ["final", "reference", "temporary", "none"].map(k =>
          ({ state: k, countries: cs.filter(c => c.fw === k).map(dgName) }))
      };
    }
  },

  {
    id: "matrix",
    tKey: "dg.b.matrix",
    /* Le tableau de transposition, pays par pays. Le rapport de veille que les
       consultants montent a la main commence par celui-la. */
    slides: (ctx) => {
      const L = ctx.lang === "en";
      const cols = [
        { label: L ? "Country" : "Pays", w: 0.16 },
        { label: dgLabel("id", "D", L ? "Maturity level" : "Niveau de maturité"), w: 0.08 },
        { label: dgLabel("id", "F", L ? "Transposition finalised" : "Transposition finalisée"), w: 0.12 },
        { label: dgLabel("id", "E", L ? "Entry into force" : "Entrée en vigueur"), w: 0.14 },
        { label: dgLabel("id", "I", L ? "Months past the deadline" : "Mois de retard"), w: 0.1 },
        { label: dgLabel("id", "K", L ? "Main transposition text" : "Texte principal"), w: 0.4 }
      ];
      const rows = ctx.cs.map(c => [dgName(c), String(c.maturity), dgVal(c.iso, "id", "F", 18),
        dgDate(c.iso, "id", "E"), dgVal(c.iso, "id", "I", 16), dgVal(c.iso, "id", "K", 110)]);
      return dgPaged(ctx, L ? "Transposition, country by country" : "Transposition, pays par pays",
        cols, rows, "matrix");
    },
    ask: (ctx) => ctx.cs.map(c => ({ country: dgName(c), level: c.maturity,
      transposed: dgVal(c.iso, "id", "F", 18), inForce: dgDate(c.iso, "id", "E"),
      monthsLate: dgVal(c.iso, "id", "I", 16) }))
  },

  {
    id: "fw",
    tKey: "dg.b.fw",
    slides: (ctx) => {
      const L = ctx.lang === "en";
      const cols = [
        { label: L ? "Country" : "Pays", w: 0.15 },
        { label: dgLabel("fw", "D", L ? "Framework published" : "Référentiel publié"), w: 0.12 },
        { label: dgLabel("fw", "F", L ? "Name of framework" : "Nom du référentiel"), w: 0.33 },
        { label: dgLabel("fw", "G", L ? "Last publication" : "Dernière publication"), w: 0.12 },
        { label: dgLabel("fw", "L", L ? "Requirements, essential" : "Exigences, essentielles"), w: 0.14 },
        { label: dgLabel("fw", "M", L ? "Requirements, important" : "Exigences, importantes"), w: 0.14 }
      ];
      const rows = ctx.cs.map(c => [dgName(c), dgVal(c.iso, "fw", "D", 20), dgVal(c.iso, "fw", "F", 80),
        dgDate(c.iso, "fw", "G"), dgVal(c.iso, "fw", "L", 14), dgVal(c.iso, "fw", "M", 14)]);
      return dgPaged(ctx, L ? "National cybersecurity frameworks" : "Référentiels nationaux de cybersécurité",
        cols, rows, "fw");
    },
    ask: (ctx) => ctx.cs.map(c => ({ country: dgName(c), state: c.fw,
      framework: dgVal(c.iso, "fw", "F", 80),
      requirementsEssential: dgVal(c.iso, "fw", "L", 14),
      requirementsImportant: dgVal(c.iso, "fw", "M", 14) }))
  },

  {
    id: "inc",
    tKey: "dg.b.inc",
    slides: (ctx) => {
      const L = ctx.lang === "en";
      const cols = [
        { label: L ? "Country" : "Pays", w: 0.15 },
        { label: dgLabel("inc", "F", L ? "Authority" : "Autorité"), w: 0.24 },
        { label: dgLabel("inc", "H", L ? "Method" : "Méthode"), w: 0.14 },
        { label: dgLabel("inc", "G", L ? "Mandatory since" : "Obligatoire depuis"), w: 0.13 },
        { label: dgLabel("inc", "P", L ? "Specific timeline" : "Délais spécifiques"), w: 0.34 }
      ];
      const rows = ctx.cs.map(c => [dgName(c), dgVal(c.iso, "inc", "F", 55), dgVal(c.iso, "inc", "H", 58),
        dgDate(c.iso, "inc", "G"), dgVal(c.iso, "inc", "P", 90)]);
      return dgPaged(ctx, L ? "Incident reporting" : "Notification des incidents", cols, rows, "inc");
    },
    ask: (ctx) => ctx.cs.map(c => ({ country: dgName(c), authority: dgVal(c.iso, "inc", "F", 55),
      method: dgVal(c.iso, "inc", "H", 58), since: dgDate(c.iso, "inc", "G"),
      timeline: dgVal(c.iso, "inc", "P", 90) }))
  },

  {
    id: "reg",
    tKey: "dg.b.reg",
    slides: (ctx) => {
      const L = ctx.lang === "en";
      const cols = [
        { label: L ? "Country" : "Pays", w: 0.15 },
        { label: dgLabel("reg", "D", L ? "Registration open" : "Enregistrement ouvert"), w: 0.13 },
        { label: dgLabel("reg", "F", L ? "Authority in charge" : "Autorité en charge"), w: 0.24 },
        { label: dgLabel("reg", "I", L ? "Method" : "Méthode"), w: 0.16 },
        { label: dgLabel("reg", "H", L ? "Deadline" : "Échéance"), w: 0.32 }
      ];
      const rows = ctx.cs.map(c => [dgName(c), dgVal(c.iso, "reg", "D", 20), dgVal(c.iso, "reg", "F", 55),
        dgVal(c.iso, "reg", "I", 44), dgDate(c.iso, "reg", "H")]);
      return dgPaged(ctx, L ? "Registration of entities" : "Enregistrement des entités", cols, rows, "reg");
    },
    ask: (ctx) => ctx.cs.map(c => ({ country: dgName(c), open: dgVal(c.iso, "reg", "D", 20),
      authority: dgVal(c.iso, "reg", "F", 55), deadline: dgDate(c.iso, "reg", "H") }))
  },

  {
    id: "news",
    tKey: "dg.b.news",
    /* La veille validee des six derniers mois, sur le perimetre du rapport. Rien
       d'incertain : la file d'attente ne sort pas de l'outil. */
    slides: (ctx) => {
      const L = ctx.lang === "en";
      const items = dgNews(ctx);
      const s = dgSlide(L ? "Recent developments" : "Actualités récentes",
        items.length ? ctx.scopeLine
          : (L ? "No validated update over the period" : "Aucune actualité validée sur la période"));
      let y = DG_TOP;
      const col = rptColumn(DG_X, y, DG_WIN, 200);
      items.slice(0, 12).forEach(it => {
        col.bullets(["<b>" + it.when + " " + it.where + "</b> " + it.title], 10);
      });
      if (!items.length)
        col.bullets([L ? "The watch agent recorded nothing validated for these countries over the last six months."
                       : "L'agent de veille n'a rien de validé sur ces pays au cours des six derniers mois."], 10);
      const aiBox = ctx.ai.news ? dgAiHeight(ctx.ai.news) : 0;
      const room = ctx.ai.news ? DG_BOT - aiBox - rptEmu(0.18) : DG_BOT;
      s.shapes = s.shapes.concat(col.render(room));
      if (ctx.ai.news) dgAnalysisBox(s, DG_BOT - aiBox, ctx.ai.news, ctx.plan, aiBox);
      return [s];
    },
    ask: (ctx) => dgNews(ctx).slice(0, 25).map(it => ({ date: it.when, country: it.where, title: it.title }))
  },

  {
    id: "fiche",
    tKey: "dg.b.fiche",
    /* Les slides de fiche pays d'app_report.js, telles quelles. Trois par pays :
       au-dela d'une poignee de pays, le rapport devient un recueil, et le
       formulaire le dit avant de generer. */
    slides: (ctx) => {
      const out = [];
      ctx.cs.forEach(c => {
        out.push(rptSlide1(c, ctx.lang), rptSlide2(c, ctx.lang), rptSlide3(c, ctx.lang));
      });
      return out;
    }
  },

  {
    id: "fwdetail",
    tKey: "dg.b.fwdetail",
    slides: (ctx) => ctx.cs.map(c => rptSlide4(c, ctx.lang))
  },

  {
    id: "sources",
    tKey: "dg.b.sources",
    /* La slide de methode. Elle ferme le rapport et repond a la question que
       pose tout destinataire : d'ou viennent ces chiffres. */
    slides: (ctx) => {
      const L = ctx.lang === "en";
      const s = dgSlide(L ? "Sources and method" : "Sources et méthode", "");
      const scanned = typeof SHEET_DATA !== "undefined" && SHEET_DATA.scanned;
      const col = rptColumn(DG_X, DG_TOP, DG_WIN, 200);
      col.rub(L ? "Where the figures come from" : "D'où viennent les chiffres");
      col.bullets([
        (L ? "<b>Comparative workbook</b> " : "<b>Classeur comparatif</b> ")
          + (typeof SHEET_DATA !== "undefined" ? SHEET_DATA.workbook : "")
          + (scanned ? (L ? ", read on " : ", lu le ") + rptDate(scanned) : "")
          + (L ? ". Every figure in the tables is a cell of that workbook, read as it stands."
               : ". Chaque chiffre des tableaux est une case de ce classeur, lue telle quelle."),
        L ? "<b>Watch agent</b> national authority feeds and official journals, read automatically, then validated by the NIS 2 team before they appear."
          : "<b>Agent de veille</b> flux des autorités nationales et journaux officiels, lus automatiquement, puis validés par l'équipe NIS 2 avant de paraître.",
        L ? "<b>Empty cells</b> a dash means the workbook does not fill that column for this country, not that the answer is no."
          : "<b>Cases vides</b> un tiret signifie que le classeur ne renseigne pas cette colonne pour ce pays, pas que la réponse est négative."
      ], 10);
      col.rub(L ? "Reading this report" : "Lire ce rapport");
      col.bullets([
        L ? "The figures are a snapshot of the workbook on the day it was read. A transposition voted since then is not here."
          : "Les chiffres sont un état du classeur au jour de sa lecture. Une transposition votée depuis n'y figure pas.",
        ctx.usedAi
          ? (L ? "The paragraphs framed in red were drafted by AI from these figures alone. They are a proposal, to be reviewed."
               : "Les paragraphes encadrés en rouge ont été rédigés par l'IA à partir de ces seuls chiffres. Ce sont des propositions, à relire.")
          : (L ? "This report carries no AI-drafted text." : "Ce rapport ne porte aucun texte rédigé par l'IA."),
        L ? "Generated with RegWatch. Every shape in this file is editable: correct, cut, or reuse a slide in another deck."
          : "Généré avec RegWatch. Toutes les formes de ce fichier sont modifiables : corriger, retirer, ou reprendre une slide dans un autre support."
      ], 10);
      s.shapes = s.shapes.concat(col.render(DG_BOT));
      return [s];
    }
  }
];
const dgName = (c) => rptCountryName(c, dgLang);
/* Un libelle dans la langue du rapport. t() rendrait celle de l'ecran : un
   rapport demande en francais depuis l'interface anglaise sortait un sommaire
   anglais au-dessus de slides francaises. */
function dgT(key){
  const d = (typeof I18N !== "undefined" && I18N[dgLang]) || (typeof I18N !== "undefined" ? I18N.en : {});
  return d[key] || ((typeof I18N !== "undefined" && I18N.en[key]) || key);
}
const dgBlock = id => DG_BLOCKS.find(b => b.id === id);
/* Les blocs qui produisent une slide par pays : le formulaire avertit quand le
   perimetre les rend volumineux. */
const DG_PER_COUNTRY = { fiche: 3, fwdetail: 1 };

/* Un tableau qui deborde devient plusieurs slides, et la suite porte la mention
   « suite ». Reduire la police jusqu'a faire tenir vingt-sept pays sur une
   slide produisait un tableau illisible. */
function dgPaged(ctx, title, cols, rows, aiKey){
  const L = ctx.lang === "en";
  const sz = 9;
  const hasAi = aiKey && ctx.ai[aiKey];
  const headH = dgRowH(cols.map(c => c.label), cols, sz);
  const aiBox = hasAi ? dgAiHeight(ctx.ai[aiKey]) : 0;
  const aiH = aiBox + rptEmu(0.18);
  /* Les pages se remplissent a la hauteur reelle des lignes. Une page en porte
     au moins une, meme trop haute : mieux vaut une ligne qui deborde qu'une
     boucle qui ne finit pas. */
  const pages = [];
  /* Un dixieme de pouce de marge : l'estimation de hauteur est approchee, et
     c'est la derniere ligne qui en paye le defaut - elle passait sous le pied
     de page. */
  const slack = rptEmu(0.12);
  let cur = [], used = headH, room = DG_BOT - DG_TOP - slack - (hasAi ? aiH : 0);
  rows.forEach(r => {
    const h = dgRowH(r, cols, sz);
    if (cur.length && used + h > room) {
      pages.push(cur);
      cur = []; used = headH; room = DG_BOT - DG_TOP - slack;
    }
    cur.push(r); used += h;
  });
  if (cur.length || !pages.length) pages.push(cur);
  return pages.map((page, i) => {
    const s = dgSlide(title + (i ? (L ? " (continued)" : " (suite)") : ""),
      i ? "" : ctx.scopeLine);
    dgTable(s, DG_TOP, cols, page, { size: sz });
    /* L'encadre est cale au bas de la slide et non sous le tableau : les
       hauteurs de lignes sont estimees, et un tableau un peu plus haut que
       prevu poussait l'encadre hors de la slide. */
    if (!i && hasAi) dgAnalysisBox(s, DG_BOT - aiBox, ctx.ai[aiKey], ctx.plan, aiBox);
    return s;
  });
}

/* La veille validee du perimetre, la plus recente d'abord. Les items europeens
   (iso « EU ») restent : une decision de la Commission concerne tout le monde. */
function dgNews(ctx){
  const since = new Date(Date.now() - 183 * 864e5).toISOString().slice(0, 10);
  const want = new Set(ctx.cs.map(c => c.iso));
  return (typeof queue === "undefined" ? [] : queue)
    .filter(q => q.status === "validated" && (q.detected || "") >= since
                 && (want.has(q.iso) || q.iso === "EU"))
    .sort((a, b) => (b.detected || "").localeCompare(a.detected || ""))
    .map(q => ({ when: rptDate(q.detected), title: dgItemTitle(q, ctx.lang),
      where: q.iso === "EU" ? (ctx.lang === "en" ? "European Union" : "Union européenne")
                            : (byIso[q.iso] ? dgName(byIso[q.iso]) : q.iso) }));
}
function dgItemTitle(q, l){
  const s = l === "en" ? (q.titleEn || q.title) : q.title;
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 190);
}

/* ---------- la couverture ---------- */
function dgCover(ctx){
  const L = ctx.lang === "en", plan = ctx.plan;
  const s = { shapes: [], id: 10 };
  /* La couverture suit la mise en page des slides pays : fond blanc, bandeau
     gris a droite, titre violet, filet pointille sous chaque rubrique. Un
     premier essai posait un grand aplat violet profond et un titre blanc : une
     couverture qui ne ressemblait a aucun support CYBER WATCH, et qu'il aurait
     fallu refaire a la main avant de la montrer. */
  s.shapes.push(rptRect(s.id++, RPT_SPLIT, 0, RPT_W - RPT_SPLIT, RPT_H, RPT_GREY));

  const title = L ? "NIS 2 transposition across Europe" : "Transposition de NIS 2 en Europe";
  s.shapes.push(rptTextBox(s.id++, DG_X, rptEmu(0.62), rptEmu(5.5), rptH(1, 9, 0),
    [{ runs: [{ t: L ? "NIS 2 watch report" : "Rapport de veille NIS 2",
      sz: 900, b: true, color: RPT_VIOLET }] }]));
  s.shapes.push(rptTextBox(s.id++, DG_X, rptEmu(0.92), rptEmu(5.5), rptH(3, 28, 0),
    [{ runs: [{ t: title, sz: 2800, b: true, color: RPT_VIOLET }] }]));
  /* Le vert de la charte, en accent et en petite quantite. */
  s.shapes.push(rptRect(s.id++, DG_X, rptEmu(2.42), rptEmu(1.1), rptEmu(0.07), RPT_GREEN));
  s.shapes.push(rptTextBox(s.id++, DG_X, rptEmu(2.68), rptEmu(5.5), rptH(2, 10, 0),
    [{ runs: [{ t: (L ? "Built with RegWatch on " : "Construit avec RegWatch le ")
        + rptDate(new Date().toISOString().slice(0, 10))
        + (L ? ", from the NIS 2 comparative workbook."
             : ", à partir du classeur comparatif NIS 2."),
      sz: 1000, b: false, color: "404040" }] }]));

  /* Les chiffres de tete, dans la colonne de gauche. */
  const card = (yy, n, label, color) => {
    s.shapes.push(rptRect(s.id++, DG_X, yy, rptEmu(5.4), rptEmu(0.72), RPT_GREY));
    s.shapes.push(rptRect(s.id++, DG_X, yy, rptEmu(0.05), rptEmu(0.72), color || RPT_VIOLET));
    s.shapes.push(rptTextBox(s.id++, DG_X + rptEmu(0.18), yy + rptEmu(0.13), rptEmu(1.5), rptH(1, 20, 0),
      [{ runs: [{ t: String(n), sz: 2000, b: true, color: RPT_DEEP }] }]));
    s.shapes.push(rptTextBox(s.id++, DG_X + rptEmu(1.85), yy + rptEmu(0.24), rptEmu(3.4), rptH(2, 9.5, 0),
      [{ runs: [{ t: label, sz: 950, b: false, color: "404040" }] }]));
    return yy + rptEmu(0.86);
  };
  let y = rptEmu(3.75);
  y = card(y, ctx.cs.length, L ? "countries covered" : "pays couverts");
  y = card(y, ctx.slideCount, L ? "slides in this report" : "slides dans ce rapport", RPT_BLUE);

  /* Le bandeau gris porte le perimetre et le sommaire, comme les slides pays y
     portent leurs rubriques de droite. */
  const rx = RPT_SPLIT + rptEmu(0.42), rw = RPT_W - RPT_SPLIT - rptEmu(0.84);
  const head = (yy, label) => {
    s.shapes.push(rptRect(s.id++, rx, yy + rptEmu(0.02), rptEmu(0.1), rptEmu(0.2), RPT_VIOLET));
    s.shapes.push(rptTextBox(s.id++, rx + rptEmu(0.18), yy, rw - rptEmu(0.18), rptH(1, 13, 0),
      [{ runs: [{ t: label, sz: 1300, b: true, color: "000000" }] }]));
    s.shapes.push(rptDots(s.id++, rx, yy + rptH(1, 13, 0) + rptEmu(0.04), rw));
    return yy + rptEmu(0.42);
  };
  let ry = head(rptEmu(0.62), L ? "Perimeter" : "Périmètre");
  /* La place du perimetre est reservee d'avance : la liste des vingt-sept pays
     tient sur plusieurs lignes que l'estimation comptait pour une, et le titre
     du sommaire se posait dessus. */
  const names = ctx.cs.map(dgName).join(", ");
  const nLines = rptLines(names, (rw / RPT_IN) - 0.1, 9.5);
  const nH = Math.max(rptEmu(0.4), rptH(nLines, 9.5, 0) + rptEmu(0.1));
  s.shapes.push(rptTextBox(s.id++, rx, ry, rw, nH,
    [{ runs: [{ t: names, sz: 950, b: false, color: "262626" }], align: "just", space: 0 }]));
  ry = head(ry + nH + rptEmu(0.2), L ? "Contents" : "Sommaire");
  const contents = ctx.plan.blocks.map(id => { const b = dgBlock(id); return b ? dgT(b.tKey) : id; });
  contents.unshift(L ? "NIS 2 across Europe: the overview" : "NIS 2 en Europe : la vue d'ensemble");
  if (ctx.charts && ctx.charts.length)
    contents.splice(1, 0, (L ? "European view charts (" : "Graphiques de la vue européenne (") + ctx.charts.length + ")");
  s.shapes.push(rptTextBox(s.id++, rx, ry, rw, DG_BOT - ry,
    contents.map(txt => ({ runs: [{ t: txt, sz: 950, b: false, color: "262626" }], bullet: true, space: 30 }))));
  return s;
}

/* ---------- l'analyse de l'IA ----------
 * Un seul appel pour tout le rapport. Un appel par bloc coutait quatre fois
 * plus cher et produisait quatre analyses qui se repetaient, chacune ignorant
 * ce que les autres venaient de dire.
 *
 * Le modele ne recoit que les chiffres du rapport, deja calcules, et il lui est
 * demande de ne rien ajouter : pas de date qui ne soit pas dans les donnees, pas
 * de pays absent du perimetre. Ce qu'il rend est une proposition encadree, pas
 * une source.
 */
async function dgAnalyse(plan, ctx, want){
  const out = {};
  if (!plan.ai || !want.length || typeof chatReady !== "function" || !chatReady()) return out;
  const L = plan.lang === "en";
  const model = plan.model ? { model: plan.model } : {};
  const facts = {};
  want.forEach(id => { const b = dgBlock(id); if (b && b.ask) facts[id] = b.ask(ctx); });
  const sys = (L
    ? "You write the analysis paragraphs of a consulting report on the transposition of the NIS 2 directive. "
    : "Tu rédiges les paragraphes d'analyse d'un rapport de conseil sur la transposition de la directive NIS 2. ")
    + (L
      ? "Use only the figures given. Never invent a date, a country or a text. Name countries explicitly. "
        + "Two to four sentences per section, factual, no bullet points, no heading, no filler. "
        + "Write in English. Answer with a JSON object whose keys are exactly the section ids given."
      : "N'utilise que les chiffres fournis. N'invente jamais une date, un pays ou un texte. Nomme les pays explicitement. "
        + "Deux à quatre phrases par section, factuelles, sans puces, sans titre, sans remplissage. "
        + "Écris en français. Réponds par un objet JSON dont les clés sont exactement les identifiants de section fournis.")
    + (plan.purpose === "client"
      ? (L ? " The reader is a client: describe what the figures imply for a company operating in these countries."
           : " Le lecteur est un client : dis ce que les chiffres impliquent pour une entreprise qui opère dans ces pays.")
      : (L ? " The reader is an internal team: point out what has moved and what deserves a check."
           : " Le lecteur est une équipe interne : signale ce qui a bougé et ce qui mérite une vérification."));
  const user = JSON.stringify({ sections: want, perimeter: ctx.cs.map(dgName), data: facts,
    chartsShownToTheReader: (ctx.charts || []).map(c => c.title) });
  const msgs = [{ role: "system", content: sys }, { role: "user", content: user }];
  let text = "";
  try {
    const data = await chatPost(msgs, Object.assign({ response_format: { type: "json_object" } }, model), 1500);
    text = ((data.choices || [])[0] || {}).message.content || "";
  } catch (e) {
    /* Tous les points de terminaison ne connaissent pas response_format : on
       redemande sans, et on lit le JSON dans la reponse. */
    const data = await chatPost(msgs, Object.assign({}, model), 1500);
    text = ((data.choices || [])[0] || {}).message.content || "";
  }
  let obj = null;
  try { obj = JSON.parse(text); }
  catch (e) {
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
  }
  if (!obj) return out;
  want.forEach(id => {
    const v = obj[id];
    if (typeof v === "string" && v.trim()) out[id] = v.trim();
    else if (Array.isArray(v) && v.length) out[id] = v.join(" ");
  });
  return out;
}

/* ---------- la generation ---------- */
function dgScopeLine(plan, cs){
  const L = plan.lang === "en";
  if (cs.length > 6) return cs.length + (L ? " countries" : " pays");
  return cs.map(dgName).join(", ");
}

/* Les slides du rapport, sans les emballer. L'apercu du questionnaire et la
   generation passent par ici : ce que l'on voit avant de telecharger est ce
   qui sera dans le fichier. En apercu, l'IA n'est pas appelee - l'encadre de
   l'analyse porte un texte d'attente a sa place, a la bonne taille. */
let dgChartCache = null;
async function dgBuild(plan, onStep, preview){
  const cs = dgCountries(plan);
  if (!cs.length) throw new Error(t("dg.errNoCountry"));
  const step = onStep || function(){};

  /* Le contenu redige suit la langue du rapport le temps de la generation, comme
     pour les slides pays, puis revient a celle de l'interface. */
  const prevLang = rptLang;
  rptLang = plan.lang;
  dgLang = plan.lang;
  rptDraftUsed = false;
  rptNoReco = plan.purpose === "client";
  const ctx = { plan: plan, lang: plan.lang, cs: cs, ai: {}, usedAi: false, charts: [],
                scopeLine: dgScopeLine(plan, cs), slideCount: 0 };

  /* L'analyse d'abord : elle occupe de la place sur les slides, donc les slides
     ne peuvent pas etre construites avant de savoir si elle est la. */
  const wantAi = plan.ai ? plan.blocks.filter(id => (dgBlock(id) || {}).ask) : [];
  const slides = [];
  try {
    /* Les enregistrements rediges suivent la langue du rapport pendant toute la
       construction, l'analyse comprise : le modele lit les memes phrases que
       celles qui paraitront sur les slides. */
    if (typeof applyContentLang === "function") applyContentLang(plan.lang);
    if (plan.charts.length) {
      /* Les captures de l'apercu resservent a la generation : meme langue,
         memes pays, memes graphiques. */
      const key = JSON.stringify([plan.lang, cs.map(c => c.iso), plan.charts, store.euText || {}]);
      if (!dgChartCache || dgChartCache.key !== key) {
        step(t("dg.stepCharts"));
        dgChartCache = { key: key, imgs: await dgChartImages(plan, cs) };
      }
      ctx.charts = dgChartCache.imgs;
    }
    ctx.ovMap = await dgOverviewMap(cs).catch(e => { console.error("carte", e); return null; });
    if (wantAi.length && preview) {
      const ph = plan.lang === "en"
        ? "The AI analysis will be drafted here when the report is generated, from the figures of this slide."
        : "L'analyse de l'IA sera rédigée ici à la génération du rapport, à partir des chiffres de cette slide.";
      wantAi.forEach(id => { ctx.ai[id] = ph; });
      ctx.usedAi = true;
    } else if (wantAi.length) {
      step(t("dg.stepAi"));
      try { ctx.ai = await dgAnalyse(plan, ctx, wantAi); }
      catch (e) { ctx.ai = {}; console.error(e); }
      ctx.usedAi = Object.keys(ctx.ai).length > 0;
    }
    step(t("dg.stepSlides"));
    plan.blocks.forEach((id, i) => {
      const b = dgBlock(id);
      if (b) slides.push.apply(slides, b.slides(ctx));
      /* Les graphiques suivent la synthese : ils en sont l'illustration. */
      if (i === 0) ctx.charts.forEach(img => slides.push(dgChartSlide(img, ctx)));
    });
    /* La vue d'ensemble europeenne ouvre chaque rapport, juste apres la
       couverture, recalculee sur les pays du rapport. */
    const ov = dgOverviewSlide(ctx);
    if (ov) slides.unshift(ov);
    ctx.slideCount = slides.length + 1;
    slides.unshift(dgCover(ctx));
    /* Le pied de page est pose ici, avant que la langue ne revienne a celle de
       l'ecran : pose apres, il datait un rapport anglais en francais. Il porte
       le rang de la slide, donc il attend qu'elles soient toutes construites. */
    slides.forEach((sl, i) => dgFoot(sl, plan, i, slides.length));
  } finally {
    if (typeof applyContentLang === "function") applyContentLang();
    rptLang = prevLang;
    rptNoReco = false;
  }

  /* Les phrases tirees des textes legaux qu'une slide pays aurait utilisees se
     signalent, comme dans le generateur de fiche. */
  if (rptDraftUsed) {
    const note = plan.lang === "en"
      ? "Draft - sentences drawn from the legal texts, not yet reviewed"
      : "Brouillon - phrases tirées des textes légaux, non encore relues";
    slides.forEach(s => s.shapes.push(
      rptTextBox(9000, rptEmu(4.2), RPT_H - rptEmu(0.36), rptEmu(5.2), rptH(1, 7.5, 0),
        [{ runs: [{ t: note, sz: 750, b: true, color: "FF2A49" }] }])));
  }
  return slides;
}

async function dgGenerate(plan, onStep){
  const step = onStep || function(){};
  const slides = await dgBuild(plan, step, false);
  step(t("dg.stepPack"));
  const blob = await rptPackage(slides);
  const name = plan.lang === "en" ? "NIS 2 report" : "Rapport NIS 2";
  return { blob: blob, slides: slides.length,
           filename: "RegWatch - " + name + " - " + new Date().toISOString().slice(0, 10) + ".pptx" };
}

/* ---------- l'apercu d'une slide ----------
 * Un rendu HTML des formes que ce module ecrit, et d'elles seulement : zones de
 * texte, rectangles, filets, tableaux, images. Il lit le XML de la slide tel
 * qu'il partira dans le fichier, si bien qu'un defaut de mise en page se voit
 * ici avant de se voir dans PowerPoint. Le gabarit Wavestone (logo, pied de
 * page du masque) n'est pas redessine : l'apercu le dit.
 */
const DG_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const DG_NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
function dgSlideHTML(slide, W, urls){
  const k = W / RPT_W;
  const px = v => (Number(v || 0) * k).toFixed(2) + "px";
  const fpx = sz => (Number(sz || 1000) / 100 * 12700 * k).toFixed(2) + "px";
  const doc = new DOMParser().parseFromString(rptSlideXml(slide), "application/xml");
  const A = (el, name) => el ? el.getElementsByTagNameNS(DG_NS_A, name)[0] : null;
  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const box = el => {
    const off = A(el, "off"), ext = A(el, "ext");
    return `left:${px(off && off.getAttribute("x"))};top:${px(off && off.getAttribute("y"))};`
      + `width:${px(ext && ext.getAttribute("cx"))};height:${px(ext && ext.getAttribute("cy"))};`;
  };
  const fillOf = el => {
    const f = el && [...el.children].find(c => c.localName === "solidFill");
    const c = f && A(f, "srgbClr");
    return c ? "#" + c.getAttribute("val") : "";
  };
  const runs = p => kids(p, "r").map(r => {
    const pr = A(r, "rPr"), c = pr && A(pr, "srgbClr");
    const tt = A(r, "t");
    return `<span style="font-size:${fpx(pr && pr.getAttribute("sz"))};font-weight:${pr && pr.getAttribute("b") === "1" ? 700 : 400};`
      + `${pr && pr.getAttribute("i") === "1" ? "font-style:italic;" : ""}color:${c ? "#" + c.getAttribute("val") : "#000"}">`
      + esc(tt ? tt.textContent : "") + "</span>";
  }).join("");
  const paras = body => kids(body, "p").map(p => {
    const pr = kids(p, "pPr")[0];
    const al = { ctr: "center", r: "right", just: "justify" }[pr && pr.getAttribute("algn")] || "left";
    const bu = pr && A(pr, "buChar");
    const sb = pr && A(pr, "spcPts");
    return `<p style="margin:${sb ? (Number(sb.getAttribute("val")) / 100 * 12700 * k).toFixed(2) : 0}px 0 0;text-align:${al};line-height:1.2;`
      + `${bu ? `padding-left:${px(rptEmu(0.16))};text-indent:-${px(rptEmu(0.16))};` : ""}">`
      + (bu ? `<span style="color:#${RPT_VIOLET}">${esc(bu.getAttribute("char"))}&nbsp;</span>` : "")
      + (runs(p) || "&nbsp;") + "</p>";
  }).join("");
  const out = [];
  const tree = doc.getElementsByTagNameNS("*", "spTree")[0];
  [...(tree ? tree.children : [])].forEach(el => {
    const n = el.localName;
    if (n === "sp") {
      const sp = kids(el, "spPr")[0];
      const fill = fillOf(sp);
      const ln = sp && kids(sp, "ln")[0];
      const lc = ln && fillOf(ln);
      const lw = ln && ln.getAttribute("w") ? Math.max(1, Number(ln.getAttribute("w")) * k) : 1;
      const body = kids(el, "txBody")[0];
      const bp = body && A(body, "bodyPr");
      const geom = A(sp, "prstGeom"), prst = geom ? geom.getAttribute("prst") : "rect";
      const adj = {};
      [...(geom ? geom.getElementsByTagNameNS(DG_NS_A, "gd") : [])].forEach(g =>
        { adj[g.getAttribute("name")] = Number((g.getAttribute("fmla") || "").replace(/^val\s+/, "")); });
      const ext = A(el, "ext"), wpx = Number(ext.getAttribute("cx")) * k, hpx = Number(ext.getAttribute("cy")) * k;
      /* Les anneaux et les arcs, dessines en SVG avec les memes reglages. */
      let shape = "";
      if (prst === "donut" || prst === "blockArc") {
        const th = (adj.adj3 || adj.adj || 25000) / 100000 * Math.min(wpx, hpx);
        const r = Math.min(wpx, hpx) / 2 - th / 2, cx = wpx / 2, cy = hpx / 2;
        if (prst === "donut") shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fill}" stroke-width="${th}"/>`;
        else {
          const a0 = (adj.adj1 || 0) / 60000 * Math.PI / 180, a1 = (adj.adj2 || 0) / 60000 * Math.PI / 180;
          let sweep = a1 - a0; if (sweep <= 0) sweep += 2 * Math.PI;
          const p = a => (cx + r * Math.cos(a)).toFixed(2) + " " + (cy + r * Math.sin(a)).toFixed(2);
          shape = `<path d="M${p(a0)} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p(a0 + sweep)}" fill="none" stroke="${fill}" stroke-width="${th}"/>`;
        }
        out.push(`<svg class="dgp-sp" style="${box(el)}overflow:visible" viewBox="0 0 ${wpx} ${hpx}">${shape}</svg>`);
        return;
      }
      const anchor = bp && bp.getAttribute("anchor");
      const flex = anchor === "ctr" ? "display:flex;flex-direction:column;justify-content:center;" : anchor === "b" ? "display:flex;flex-direction:column;justify-content:flex-end;" : "";
      const ins = bp && bp.getAttribute("lIns") ? Number(bp.getAttribute("lIns")) * k : 0;
      out.push(`<div class="dgp-sp" style="${box(el)}${flex}${ins ? "padding:" + ins + "px;" : ""}${fill ? "background:" + fill + ";" : ""}`
        + `${prst === "ellipse" ? "border-radius:50%;" : ""}${lc ? "outline:" + lw.toFixed(1) + "px solid " + lc + ";outline-offset:-" + lw.toFixed(1) + "px;" : ""}">`
        + (body ? paras(body) : "") + "</div>");
    } else if (n === "cxnSp") {
      const ln = A(el, "ln");
      out.push(`<div class="dgp-sp" style="${box(el)}height:0;border-top:1.5px dotted ${fillOf(ln) || "#451DC7"}"></div>`);
    } else if (n === "graphicFrame") {
      const tbl = A(el, "tbl");
      if (!tbl) return;
      const cols = [...tbl.getElementsByTagNameNS(DG_NS_A, "gridCol")].map(g => px(g.getAttribute("w")));
      const rows = [...tbl.getElementsByTagNameNS(DG_NS_A, "tr")];
      out.push(`<table class="dgp-tbl" style="${box(el)}height:auto"><colgroup>${cols.map(w => `<col style="width:${w}">`).join("")}</colgroup>`
        + rows.map(tr => `<tr style="height:${px(tr.getAttribute("h"))}">` + kids(tr, "tc").map(tc => {
          const pr = kids(tc, "tcPr")[0];
          return `<td style="background:${fillOf(pr) || "transparent"};padding:${px(rptEmu(0.03))} ${px(rptEmu(0.07))}">${paras(kids(tc, "txBody")[0])}</td>`;
        }).join("") + "</tr>").join("") + "</table>");
    } else if (n === "pic") {
      const blip = A(el, "blip");
      const rid = blip && blip.getAttributeNS(DG_NS_R, "embed");
      const m = (slide.media || []).find(x => x.rid === rid);
      if (!m) return;
      if (!m.url) { m.url = URL.createObjectURL(new Blob([m.bytes], { type: "image/png" })); urls && urls.push(m.url); }
      out.push(`<img class="dgp-sp" alt="" src="${m.url}" style="${box(el)}">`);
    }
  });
  return `<div class="dgp" style="width:${W}px;height:${(RPT_H * k).toFixed(1)}px">${out.join("")}</div>`;
}

/* ================= le questionnaire =================
 * Quatre ecrans, puis la generation. Le bouton principal avance ; on peut
 * revenir. Le recapitulatif annonce le nombre de slides avant de lancer.
 */
const DG_STEPS = ["scope", "charts", "ai", "preview"];
const DG_ICON_ZOOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/></svg>';

function docgenDialog(){
  const old = document.getElementById("dgDlg");
  if (old) old.remove();
  const plan = dgPlan();
  let step = 0;
  /* Les modeles proposes, lus une fois aupres du proxy a l'arrivee sur
     l'ecran de l'analyse. */
  let models = null;
  /* L'onglet de graphiques ouvert. */
  let chartSec = null;
  /* Les slides de l'apercu et les adresses d'images a liberer a la fermeture. */
  let prevSlides = null, prevSeq = 0;
  const prevUrls = [];

  const dlg = document.createElement("dialog");
  dlg.id = "dgDlg";
  document.body.appendChild(dlg);

  function flagsGrid(){
    const all = COUNTRIES.slice().sort((a, b) => a.name.localeCompare(b.name, lang));
    return `<div class="dg-flags">${all.map(c => `
      <button type="button" class="dg-flag" data-iso="${c.iso}"
        aria-pressed="${plan.isos.includes(c.iso)}" title="${esc(c.name)}">
        <i class="fi">${flagSvg(c.iso)}</i><span>${esc(c.name)}</span></button>`).join("")}</div>`;
  }

  /* Un graphique en vignette : la carte de la vue europeenne elle-meme, reduite.
     La vignette ne sert qu'a reconnaitre le graphique ; la loupe l'ouvre en
     grand pour verifier que c'est le bon. */
  function chartTile(it, cs){
    const on = plan.charts.includes(it.id);
    const w = it.ch.wide ? 1100 : 620;
    return `<div class="dg-chart" data-c="${esc(it.id)}" role="button" tabindex="0" aria-pressed="${on}">
      <div class="dg-chart-prev"><div class="dg-chart-in" style="width:${w}px;zoom:${(170 / w).toFixed(4)}">${euCard(it.ch, cs)}</div></div>
      <div class="dg-chart-f"><span class="dg-chk" aria-hidden="true"></span>
        <b>${esc(dgChartTitle(it))}</b>
        <button type="button" class="dg-zoom" data-z="${esc(it.id)}" title="${esc(t("dg.zoom"))}" aria-label="${esc(t("dg.zoom"))}">${DG_ICON_ZOOM}</button></div>
    </div>`;
  }

  /* Un seul choix, trois issues : sans IA (vert), un modele deploye, un modele
     a venir. Chaque carte porte son estimation et une jauge a la meme echelle :
     l'ecart entre les options se voit avant de se lire. */
  function aiChoices(cs){
    const ready = typeof chatReady !== "function" || chatReady();
    const tok = dgTokens(plan, cs);
    const live = ready && models ? models.list : [];
    const opts = live.map(m => ({ m: m, im: dgImpact(m, tok.inTok, tok.outTok), soon: false }))
      .concat(DG_MODELS_SOON.filter(m => !live.includes(m))
        .map(m => ({ m: m, im: dgImpact(m, tok.inTok, tok.outTok), soon: true })));
    const max = Math.max(...opts.map(o => o.im.wh[1]), 0.001);
    const gauge = (im, lvl) => `<span class="dg-gauge"><span class="dg-gauge-f ${lvl}" style="width:${Math.max(4, 100 * im.wh[1] / max).toFixed(1)}%"></span></span>`;
    const card = o => {
      const lvl = dgEcoLevel(o.im);
      const on = !o.soon && plan.ai && plan.model === o.m;
      return `<button type="button" class="dg-ai ${lvl}${o.soon ? " soon" : ""}" data-m="${esc(o.m)}" aria-pressed="${on}"${o.soon ? " disabled" : ""}>
        <span class="dg-ai-h"><b>${esc(o.m)}</b>
          ${o.soon ? `<span class="dg-pill soon">${t("dg.soon")}</span>` : ""}
          <span class="dg-pill ${lvl}">${t(lvl === "high" ? "dg.ecoHigh" : "dg.ecoMid")}</span></span>
        <span class="dg-eco">${t("dg.ecoWh", { a: dgFmt(o.im.wh[0]), b: dgFmt(o.im.wh[1]) })} · ${t("dg.ecoG", { a: dgFmt(o.im.g[0]), b: dgFmt(o.im.g[1]) })}
          <em>${t("dg.ecoPhone", { a: dgFmt(o.im.phone[0]), b: dgFmt(o.im.phone[1]) })}</em></span>
        ${gauge(o.im, lvl)}</button>`;
    };
    return `<div class="dg-ais">
        <button type="button" class="dg-ai none" data-m="" aria-pressed="${!plan.ai}">
          <span class="dg-ai-h"><b>${t("dg.aiOff")}</b><span class="dg-pill none">${t("dg.ecoNone")}</span></span>
          <span class="dg-eco">${t("dg.ecoZero")}</span>
          <span class="dg-gauge"><span class="dg-gauge-f none" style="width:0"></span></span></button>
        ${ready && !models ? `<p class="q-note">${t("dg.modelsLoading")}</p>` : ""}
        ${opts.map(card).join("")}
      </div>
      ${!ready ? `<p class="q-note">${t("dg.aiNoKey")}</p>` : ""}
      <details class="dg-eco-how"><summary>${t("dg.ecoHowT")}</summary>
        <p>${t("dg.ecoHow", { inT: tok.inTok.toLocaleString(), outT: tok.outTok.toLocaleString() })}</p></details>`;
  }

  function screen(){
    const k = DG_STEPS[step];
    const cs = dgCountries(plan);
    if (k === "scope") return `
      <p class="dg-q">${t("dg.q2")}</p>
      <div class="rpt-set" data-k="lang"><span class="rpt-lab">${t("rpt.lang")}</span><div class="rpt-opts">
        <button class="rpt-opt" type="button" data-v="fr" aria-pressed="${plan.lang === "fr"}">Français</button>
        <button class="rpt-opt" type="button" data-v="en" aria-pressed="${plan.lang === "en"}">English</button>
      </div></div>
      <span class="rpt-lab dg-lab">${t("dg.countriesLab")}</span>
      ${flagsGrid()}
      <p class="q-note" id="dgScopeN">${scopeNote(cs)}</p>`;
    if (k === "charts") {
      const cat = dgChartCatalog(cs);
      if (!cat.length) return `<p class="dg-q">${t("dg.qCharts")}</p><p class="q-note">${t("dg.noCharts")}</p>`;
      const secs = [];
      cat.forEach(it => {
        let g = secs.find(x => x.sec === it.sec);
        if (!g) secs.push(g = { sec: it.sec, items: [] });
        g.items.push(it);
      });
      if (!secs.some(g => g.sec.key === chartSec)) chartSec = secs[0].sec.key;
      const cur = secs.find(g => g.sec.key === chartSec);
      return `<p class="dg-q">${t("dg.qCharts")}</p>
        <p class="q-note">${t("dg.chartsNote")} <b id="dgChartsN">${t("dg.chartsN", { n: plan.charts.length })}</b></p>
        <div class="dg-tabs" role="tablist">${secs.map(g => {
          const n = g.items.filter(it => plan.charts.includes(it.id)).length;
          return `<button type="button" role="tab" class="dg-tab" data-sec="${g.sec.key}" aria-selected="${g.sec.key === chartSec}">
            ${t(g.sec.tKey)}<em data-n="${g.sec.key}"${n ? "" : " hidden"}>${n}</em></button>`;
        }).join("")}</div>
        <div class="dg-charts" role="tabpanel">${cur.items.map(it => chartTile(it, cs)).join("")}</div>`;
    }
    if (k === "ai") return `
      <p class="dg-q">${t("dg.q4")}</p>
      ${aiChoices(cs)}`;
    /* L'apercu : les slides elles-memes, construites comme a la generation.
       Elles arrivent apres l'ecran (la capture des graphiques prend un
       instant) dans #dgPrev. */
    return `
      <p class="dg-q">${t("dg.qPreview")}</p>
      <div class="dg-prev" id="dgPrev"><p class="q-note">${t("dg.prevLoading")}</p></div>
      <p class="q-note">${t("dg.prevNote")}</p>`;
  }
  function scopeNote(cs){
    return t("dg.scopeCount", { n: cs.length }) + (cs.length
      ? " · " + esc(cs.slice(0, 8).map(c => c.name).join(", ")) + (cs.length > 8 ? "…" : "") : "");
  }

  function render(){
    const last = step === DG_STEPS.length - 1;
    dlg.classList.toggle("wide", DG_STEPS[step] === "charts" || DG_STEPS[step] === "preview");
    dlg.innerHTML = `
      <div class="rpt-box dg-box">
        <div class="rpt-h"><h2>${t("dg.title")}</h2>
          <button class="x" type="button" id="dgX" aria-label="${t("fiche.close")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button></div>
        <div class="dg-steps">${DG_STEPS.map((_, i) =>
          `<span class="dg-dot${i === step ? " on" : ""}${i < step ? " done" : ""}"></span>`).join("")}
          <span class="dg-stepn">${t("dg.stepOf", { i: step + 1, n: DG_STEPS.length })}</span></div>
        <div class="rpt-b dg-b">${screen()}</div>
        <div class="rpt-f">
          ${step ? `<button class="btn" type="button" id="dgBack">${t("dg.back")}</button>` : ""}
          <span class="rpt-msg" id="dgMsg"></span>
          <button class="btn primary" type="button" id="dgNext">${last ? t("dg.go") : t("dg.next")}</button>
        </div>
      </div>`;
    wire();
    if (DG_STEPS[step] === "preview") loadPreview();
    if (DG_STEPS[step] === "ai" && !models && typeof chatModels === "function"
        && (typeof chatReady !== "function" || chatReady())) {
      chatModels().then(m => {
        models = m;
        if (!m.list.includes(plan.model)) plan.model = plan.ai ? (m.def || m.list[0] || "") : "";
        if (!plan.model) plan.ai = false;
        dgSavePlan(plan);
        if (DG_STEPS[step] === "ai") render();
      });
    }
  }

  async function loadPreview(){
    const seq = ++prevSeq;
    const box = dlg.querySelector("#dgPrev");
    try {
      const slides = await dgBuild(plan, msg => {
        const b = dlg.querySelector("#dgPrev");
        if (b && seq === prevSeq) b.innerHTML = `<p class="q-note">${esc(msg)}</p>`;
      }, true);
      if (seq !== prevSeq || DG_STEPS[step] !== "preview") return;
      prevSlides = slides;
      const b = dlg.querySelector("#dgPrev");
      if (!b) return;
      b.innerHTML = `<p class="dg-prev-n">${t("dg.prevCount", { n: slides.length })}</p>
        <div class="dg-prev-grid">${slides.map((sl, i) => `
          <button type="button" class="dg-prev-s" data-i="${i}" title="${esc(t("dg.zoom"))}">
            <!-- dessinee a 960 px puis reduite : en dessous de quelques pixels, les
                 navigateurs agrandissent le texte et la mise en page se defait -->
            <div class="dg-prev-z" style="zoom:${(230 / 960).toFixed(4)}">${dgSlideHTML(sl, 960, prevUrls)}</div><span>${i + 1}</span></button>`).join("")}</div>`;
      b.querySelectorAll(".dg-prev-s").forEach(x => x.addEventListener("click", () => openSlide(+x.dataset.i)));
    } catch (e) {
      console.error(e);
      if (box && seq === prevSeq) box.innerHTML = `<p class="q-note">${esc(t("rpt.failed") + " " + e.message)}</p>`;
    }
  }
  /* Une slide en grand, avec de quoi passer a la suivante. */
  function openSlide(i){
    if (!prevSlides || !prevSlides[i]) return;
    closeZoom();
    const W = Math.min(1100, Math.round(window.innerWidth * 0.86));
    const lb = document.createElement("div");
    lb.className = "dg-lb"; lb.id = "dgLb";
    lb.innerHTML = `<div class="dg-lb-in" role="dialog">
      <div class="dg-lb-h"><b>${t("dg.prevSlide", { i: i + 1, n: prevSlides.length })}</b>
        <button type="button" class="btn" id="dgLbPrev"${i ? "" : " disabled"}>‹</button>
        <button type="button" class="btn" id="dgLbNext"${i < prevSlides.length - 1 ? "" : " disabled"}>›</button>
        <button class="x" type="button" id="dgLbX" aria-label="${t("fiche.close")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="dg-lb-b">${dgSlideHTML(prevSlides[i], W, prevUrls)}</div></div>`;
    dlg.appendChild(lb);
    lb.addEventListener("click", e => { if (e.target === lb) closeZoom(); });
    lb.querySelector("#dgLbX").addEventListener("click", closeZoom);
    lb.querySelector("#dgLbPrev").addEventListener("click", () => openSlide(i - 1));
    lb.querySelector("#dgLbNext").addEventListener("click", () => openSlide(i + 1));
    lb.tabIndex = -1;
    lb.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" && i) openSlide(i - 1);
      if (e.key === "ArrowRight" && i < prevSlides.length - 1) openSlide(i + 1);
    });
    lb.focus();
  }

  /* La loupe : le graphique a sa taille de la vue europeenne, avec le bouton
     pour le prendre ou le retirer sans revenir a la vignette. */
  function openZoom(id){
    const cs = dgCountries(plan);
    const it = dgChartCatalog(cs).find(x => x.id === id);
    if (!it) return;
    closeZoom();
    const lb = document.createElement("div");
    lb.className = "dg-lb"; lb.id = "dgLb";
    const on = () => plan.charts.includes(id);
    lb.innerHTML = `<div class="dg-lb-in" role="dialog" aria-label="${esc(dgChartTitle(it))}">
      <div class="dg-lb-h"><b>${esc(dgChartTitle(it))}</b>
        <button type="button" class="btn${on() ? "" : " primary"}" id="dgLbPick">${t(on() ? "dg.unpick" : "dg.pick")}</button>
        <button class="x" type="button" id="dgLbX" aria-label="${t("fiche.close")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="dg-lb-b"><div class="dg-lb-card" style="width:${it.ch.wide ? 1100 : 640}px">${euCard(it.ch, cs)}</div></div>
    </div>`;
    dlg.appendChild(lb);
    lb.addEventListener("click", e => { if (e.target === lb) closeZoom(); });
    lb.querySelector("#dgLbX").addEventListener("click", closeZoom);
    lb.querySelector("#dgLbPick").addEventListener("click", () => { toggleChart(id); closeZoom(); });
    lb.querySelector("#dgLbX").focus();
  }
  function closeZoom(){ const lb = dlg.querySelector("#dgLb"); if (lb) lb.remove(); }
  /* Echap ferme d'abord la loupe, pas tout le questionnaire. */
  dlg.addEventListener("cancel", e => { if (dlg.querySelector("#dgLb")) { e.preventDefault(); closeZoom(); } });

  function toggleChart(id){
    plan.charts = plan.charts.includes(id) ? plan.charts.filter(x => x !== id) : plan.charts.concat([id]);
    dgSavePlan(plan);
    /* Sans re-rendre : reconstruire toutes les vignettes a chaque clic se voyait. */
    const tile = [...dlg.querySelectorAll(".dg-chart")].find(x => x.dataset.c === id);
    if (tile) tile.setAttribute("aria-pressed", String(plan.charts.includes(id)));
    const n = dlg.querySelector("#dgChartsN");
    if (n) n.textContent = t("dg.chartsN", { n: plan.charts.length });
    const tab = dlg.querySelector('.dg-tab[aria-selected="true"] em');
    if (tab) {
      const k = dlg.querySelectorAll('.dg-chart[aria-pressed="true"]').length;
      tab.textContent = k; tab.hidden = !k;
    }
  }

  function wire(){
    dlg.querySelector("#dgX").addEventListener("click", () => dlg.close());
    const back = dlg.querySelector("#dgBack");
    if (back) back.addEventListener("click", () => { step--; render(); });

    dlg.querySelectorAll(".rpt-set").forEach(set => set.addEventListener("click", e => {
      const b = e.target.closest(".rpt-opt");
      if (!b) return;
      const k = set.dataset.k;
      if (k === "ai") plan.ai = b.dataset.v === "1";
      else plan[k] = b.dataset.v;
      dgSavePlan(plan);
      render();
    }));
    dlg.querySelectorAll(".dg-flag").forEach(b => b.addEventListener("click", () => {
      const iso = b.dataset.iso;
      plan.isos = plan.isos.includes(iso) ? plan.isos.filter(i => i !== iso) : plan.isos.concat([iso]);
      dgSavePlan(plan);
      b.setAttribute("aria-pressed", String(plan.isos.includes(iso)));
      const n = dlg.querySelector("#dgScopeN");
      if (n) n.innerHTML = scopeNote(dgCountries(plan));
    }));
    dlg.querySelectorAll(".dg-chart").forEach(tile => {
      tile.addEventListener("click", e => {
        const z = e.target.closest(".dg-zoom");
        if (z) { e.stopPropagation(); openZoom(z.dataset.z); return; }
        toggleChart(tile.dataset.c);
      });
      tile.addEventListener("keydown", e => {
        if (e.target !== tile || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault(); toggleChart(tile.dataset.c);
      });
    });
    dlg.querySelectorAll(".dg-tab").forEach(b => b.addEventListener("click", () => {
      chartSec = b.dataset.sec;
      const body = dlg.querySelector(".dg-b"), top = body ? body.scrollTop : 0;
      render();
      const nb = dlg.querySelector(".dg-b"); if (nb) nb.scrollTop = top;
    }));
    dlg.querySelectorAll(".dg-ai:not([disabled])").forEach(b => b.addEventListener("click", () => {
      plan.model = b.dataset.m;
      plan.ai = !!plan.model;
      dgSavePlan(plan);
      dlg.querySelectorAll(".dg-ai").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    }));
    dlg.querySelector("#dgNext").addEventListener("click", () => {
      /* On ne laisse pas avancer sans pays : la faute se voyait au moment de
         generer, trois ecrans plus loin. */
      if (DG_STEPS[step] === "scope" && !dgCountries(plan).length) {
        dlg.querySelector("#dgMsg").textContent = t("dg.errNoCountry");
        return;
      }
      if (step < DG_STEPS.length - 1) { step++; render(); return; }
      run();
    });
  }

  async function run(){
    const go = dlg.querySelector("#dgNext"), msg = dlg.querySelector("#dgMsg");
    go.disabled = true;
    /* Les graphiques choisis sont ceux du perimetre au moment du choix : un pays
       retire depuis peut faire disparaitre un graphique (« Mes visuels » qui ne
       se calcule plus). On ne garde que ceux qui existent encore. */
    const ids = dgChartCatalog(dgCountries(plan)).map(it => it.id);
    plan.charts = plan.charts.filter(id => ids.includes(id));
    try {
      const { blob, filename, slides } = await dgGenerate(plan, s => { msg.textContent = s; });
      const url = URL.createObjectURL(blob);
      /* Un lien a toucher plutot qu'un telechargement declenche : le geste de
         l'utilisateur a expire pendant les `await`. Le meme choix qu'ailleurs. */
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.className = "btn primary"; a.textContent = t("rpt.ready");
      go.replaceWith(a);
      msg.textContent = t("dg.done", { n: slides }) + " " + filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      msg.textContent = t("rpt.failed") + " " + err.message;
      go.disabled = false;
      console.error(err);
    }
  }

  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { prevUrls.forEach(u => URL.revokeObjectURL(u)); prevUrls.length = 0; });
  render();
  if (dlg.showModal) dlg.showModal();
}

/* ================= « ce que je sais faire » =================
 * La question qui revient de la part des consultants n'est pas « comment
 * fonctionne l'assistant » mais « qu'est-ce qu'il sait faire ». Elle se posait
 * parce que rien ne repondait : une zone de saisie vide n'annonce rien.
 *
 * La liste est construite a partir des outils reellement declares au modele
 * (chatTools()), pas d'un texte a cote. Un outil ajoute apparait ici ; un outil
 * retire disparait. Chaque ligne porte un exemple sur lequel on clique : c'est
 * la seule facon de decouvrir ce qu'une phrase permet.
 */
/* Un outil, une ou deux lignes. Les noms sont ceux de CHAT_TOOLS : un outil
   ajoute la-bas apparait ici des qu'il est nomme, et un outil retire disparait
   sans que personne n'ait a se souvenir de cette liste. L'assistant technique
   (DEV_TOOLS) n'y figure pas : il ne parle qu'au role Developpeur. */
const DG_SKILL_BY_TOOL = {
  get_country: ["sk.country", "sk.compare"],
  list_countries: ["sk.list"],
  query_kpi: ["sk.kpi"],
  search_corpus: ["sk.search"],
  watch_items: ["sk.watch"],
  scope_rules: ["sk.scope"],
  official_documents: ["sk.official"],
  describe_columns: ["sk.columns"],
  create_visual: ["sk.visual"],
  draw_chart: ["sk.chart"]
};

function dgSkills(){
  const tools = typeof chatTools === "function" ? chatTools() : [];
  const seen = [];
  tools.forEach(tl => {
    (DG_SKILL_BY_TOOL[tl.name] || []).forEach(k => { if (!seen.includes(k)) seen.push(k); });
  });
  return seen;
}

function dgSkillsHTML(){
  const rows = dgSkills().map(k => `
    <button type="button" class="dg-skill" data-ask="${esc(t(k + ".ex"))}">
      <b>${t(k + ".t")}</b><span>${t(k + ".d")}</span>
      <em>${esc(t(k + ".ex"))}</em></button>`).join("");
  return `<div class="dg-skills">
    <p class="dg-skills-h">${t("sk.title")}</p>
    <p class="q-note">${t("sk.sub")}</p>
    ${rows}
    <button type="button" class="dg-skill report" id="dgSkillReport">
      <b>${t("sk.report.t")}</b><span>${t("sk.report.d")}</span>
      <em>${t("sk.report.ex")}</em></button>
    <p class="q-note">${t("sk.limits")}</p>
  </div>`;
}
