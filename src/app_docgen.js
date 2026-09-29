/* ================= le generateur de rapports personnalises =================
 *
 * Ce que l'outil savait faire : quatre slides sur un pays, toujours les memes.
 * Ce que les consultants demandent : un rapport, pour les pays qu'ils suivent,
 * avec les rubriques dont ils ont besoin ce jour-la. Un client qui opere dans
 * vingt pays veut vingt pays ; une note interne en veut trois.
 *
 * Le plan plutot que le bouton
 *   Un rapport est decrit par un plan : une destination (note interne ou
 *   support client), un perimetre de pays, une liste de blocs, une langue. Le
 *   plan est une donnee : il se garde d'une fois sur l'autre, se relit, et
 *   pourra un jour venir d'ailleurs que du formulaire - de l'assistant, par
 *   exemple, qui n'aurait qu'a le remplir.
 *
 * Le questionnaire plutot que la case a cocher
 *   Une seule page de vingt reglages fait renoncer. On pose donc quatre
 *   questions, dans l'ordre ou on se les pose : pour qui, sur quels pays, avec
 *   quoi dedans, et qui redige l'analyse. Chaque etape affiche ce qu'elle
 *   change sur le rapport, et la derniere recapitule avant de generer.
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
  const ids = DG_BLOCKS.map(b => b.id);
  return {
    purpose: s.purpose === "client" ? "client" : "internal",
    title: typeof s.title === "string" ? s.title : "",
    audience: typeof s.audience === "string" ? s.audience : "",
    scope: ["sel", "eu", "done", "todo", "pick"].includes(s.scope) ? s.scope : "sel",
    isos: Array.isArray(s.isos) ? s.isos.filter(i => byIso[i]) : [],
    blocks: Array.isArray(s.blocks) ? s.blocks.filter(b => ids.includes(b)) : DG_DEFAULT_BLOCKS.slice(),
    ai: s.ai !== false,
    lang: s.lang === "en" ? "en" : s.lang === "fr" ? "fr" : lang
  };
}
function dgSavePlan(p){
  store.docgen = { purpose: p.purpose, title: p.title, audience: p.audience,
                   scope: p.scope, isos: p.isos, blocks: p.blocks, ai: p.ai, lang: p.lang };
  saveStore();
}

/* Le perimetre. « La selection de la vue europeenne » est propose en premier :
   c'est le perimetre que le consultant vient de composer a l'ecran, et le
   reconstituer ici serait lui demander deux fois la meme chose. */
function dgCountries(plan){
  const all = COUNTRIES.slice().sort((a, b) =>
    rptCountryName(a, plan.lang).localeCompare(rptCountryName(b, plan.lang), plan.lang));
  if (plan.scope === "pick") return all.filter(c => plan.isos.includes(c.iso));
  if (plan.scope === "eu") return all.filter(c => c.eu);
  if (plan.scope === "done") return all.filter(c => c.eu && euYes(euCell(c.iso, "id", "F")));
  if (plan.scope === "todo") return all.filter(c => c.eu && !euYes(euCell(c.iso, "id", "F")));
  const sel = euSelection().map(c => c.iso);
  return all.filter(c => sel.includes(c.iso));
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

  const title = plan.title || (L ? "NIS 2 transposition across Europe"
                                 : "Transposition de NIS 2 en Europe");
  s.shapes.push(rptTextBox(s.id++, DG_X, rptEmu(0.62), rptEmu(5.5), rptH(1, 9, 0),
    [{ runs: [{ t: (plan.purpose === "client"
        ? (L ? "Client report" : "Support client")
        : (L ? "Internal note" : "Note interne"))
        + (plan.audience ? " \u00b7 " + plan.audience : ""),
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
  s.shapes.push(rptTextBox(s.id++, rx, ry, rw, DG_BOT - ry,
    ctx.plan.blocks.map(id => {
      const b = dgBlock(id);
      return { runs: [{ t: b ? dgT(b.tKey) : id, sz: 950, b: false, color: "262626" }],
               bullet: true, space: 30 };
    })));
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
  const user = JSON.stringify({ sections: want, perimeter: ctx.cs.map(dgName), data: facts });
  const msgs = [{ role: "system", content: sys }, { role: "user", content: user }];
  let text = "";
  try {
    const data = await chatPost(msgs, { response_format: { type: "json_object" } }, 1500);
    text = ((data.choices || [])[0] || {}).message.content || "";
  } catch (e) {
    /* Tous les points de terminaison ne connaissent pas response_format : on
       redemande sans, et on lit le JSON dans la reponse. */
    const data = await chatPost(msgs, null, 1500);
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

async function dgGenerate(plan, onStep){
  const cs = dgCountries(plan);
  if (!cs.length) throw new Error(t("dg.errNoCountry"));
  if (!plan.blocks.length) throw new Error(t("dg.errNoBlock"));
  const step = onStep || function(){};

  /* Le contenu redige suit la langue du rapport le temps de la generation, comme
     pour les slides pays, puis revient a celle de l'interface. */
  const prevLang = rptLang;
  rptLang = plan.lang;
  dgLang = plan.lang;
  rptDraftUsed = false;
  rptNoReco = plan.purpose === "client";
  const ctx = { plan: plan, lang: plan.lang, cs: cs, ai: {}, usedAi: false,
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
    if (wantAi.length) {
      step(t("dg.stepAi"));
      try { ctx.ai = await dgAnalyse(plan, ctx, wantAi); }
      catch (e) { ctx.ai = {}; console.error(e); }
      ctx.usedAi = Object.keys(ctx.ai).length > 0;
    }
    step(t("dg.stepSlides"));
    plan.blocks.forEach(id => {
      const b = dgBlock(id);
      if (b) slides.push.apply(slides, b.slides(ctx));
    });
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

  step(t("dg.stepPack"));
  const blob = await rptPackage(slides);
  const name = (plan.title || (plan.lang === "en" ? "NIS 2 report" : "Rapport NIS 2"))
    .replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return { blob: blob, slides: slides.length,
           filename: "RegWatch - " + name + " - " + new Date().toISOString().slice(0, 10) + ".pptx" };
}

/* ================= le questionnaire =================
 * Quatre questions, une par ecran, puis un recapitulatif. Le bouton principal
 * avance ; on peut revenir. Chaque ecran dit ce qu'il change, et le
 * recapitulatif annonce le nombre de slides avant de lancer : c'est ce chiffre
 * qui fait retirer un bloc plutot que de decouvrir un fichier de soixante pages.
 */
const DG_STEPS = ["purpose", "scope", "blocks", "ai", "recap"];

function docgenDialog(){
  const old = document.getElementById("dgDlg");
  if (old) old.remove();
  const plan = dgPlan();
  let step = 0;

  const dlg = document.createElement("dialog");
  dlg.id = "dgDlg";
  document.body.appendChild(dlg);

  /* Le nombre de slides annonce : la somme des blocs, plus la couverture. Les
     tableaux sont comptes par page, avec la meme regle que dgPaged. */
  function slideEstimate(){
    const cs = dgCountries(plan);
    let n = 1;
    plan.blocks.forEach(id => {
      if (DG_PER_COUNTRY[id]) { n += DG_PER_COUNTRY[id] * cs.length; return; }
      if (id === "synth" || id === "news" || id === "sources") { n += 1; return; }
      /* Une estimation, pas un compte : les lignes d'un tableau n'ont pas
         toutes la meme hauteur, et le chiffre sert a decider d'une rubrique,
         pas a numeroter les slides. On compte une ligne et demie en moyenne. */
      const rowH = rptH(1.5, 9, 4);
      const room = DG_BOT - DG_TOP - (plan.ai ? rptEmu(1.4) : 0);
      n += Math.max(1, Math.ceil(cs.length / Math.max(3, Math.floor(room / rowH))));
    });
    return n;
  }

  function flagsGrid(){
    const all = COUNTRIES.slice().sort((a, b) => a.name.localeCompare(b.name, lang));
    return `<div class="dg-flags">${all.map(c => `
      <button type="button" class="dg-flag" data-iso="${c.iso}"
        aria-pressed="${plan.isos.includes(c.iso)}" title="${esc(c.name)}">
        <i class="fi">${flagSvg(c.iso)}</i><span>${esc(c.name)}</span></button>`).join("")}</div>`;
  }

  function screen(){
    const k = DG_STEPS[step];
    const cs = dgCountries(plan);
    if (k === "purpose") return `
      <p class="dg-q">${t("dg.q1")}</p>
      <div class="rpt-set" data-k="purpose"><div class="rpt-opts">
        <button class="rpt-opt" type="button" data-v="internal" aria-pressed="${plan.purpose === "internal"}">${t("dg.internal")}</button>
        <button class="rpt-opt" type="button" data-v="client" aria-pressed="${plan.purpose === "client"}">${t("dg.client")}</button>
      </div></div>
      <p class="q-note">${t(plan.purpose === "client" ? "dg.clientNote" : "dg.internalNote")}</p>
      <label class="dg-f"><span>${t("dg.titleField")}</span>
        <input id="dgTitle" type="text" value="${esc(plan.title)}" placeholder="${esc(t("dg.titlePh"))}"></label>
      <label class="dg-f"><span>${t("dg.audienceField")}</span>
        <input id="dgAud" type="text" value="${esc(plan.audience)}" placeholder="${esc(t("dg.audiencePh"))}"></label>
      <div class="rpt-set" data-k="lang"><span class="rpt-lab">${t("rpt.lang")}</span><div class="rpt-opts">
        <button class="rpt-opt" type="button" data-v="fr" aria-pressed="${plan.lang === "fr"}">Français</button>
        <button class="rpt-opt" type="button" data-v="en" aria-pressed="${plan.lang === "en"}">English</button>
      </div></div>`;
    if (k === "scope") return `
      <p class="dg-q">${t("dg.q2")}</p>
      <div class="rpt-set" data-k="scope"><div class="rpt-opts">
        ${[["sel", t("dg.scopeSel")], ["eu", t("dg.scopeEu")], ["done", t("dg.scopeDone")],
           ["todo", t("dg.scopeTodo")], ["pick", t("dg.scopePick")]]
          .map(([v, l]) => `<button class="rpt-opt" type="button" data-v="${v}" aria-pressed="${plan.scope === v}">${l}</button>`).join("")}
      </div></div>
      ${plan.scope === "pick" ? flagsGrid() : ""}
      <p class="q-note">${t("dg.scopeCount", { n: cs.length })}${cs.length
        ? " · " + esc(cs.slice(0, 8).map(c => c.name).join(", ")) + (cs.length > 8 ? "…" : "")
        : ""}</p>`;
    if (k === "blocks") return `
      <p class="dg-q">${t("dg.q3")}</p>
      <div class="dg-blocks">${DG_BLOCKS.map(b => {
        const on = plan.blocks.includes(b.id);
        const per = DG_PER_COUNTRY[b.id];
        return `<button type="button" class="dg-block" data-b="${b.id}" aria-pressed="${on}">
          <b>${t(b.tKey)}</b><span>${t("dg.d." + b.id)}</span>
          ${per ? `<em>${t("dg.perCountry", { n: per * cs.length })}</em>` : ""}</button>`;
      }).join("")}</div>`;
    if (k === "ai") return `
      <p class="dg-q">${t("dg.q4")}</p>
      <div class="rpt-set" data-k="ai"><div class="rpt-opts">
        <button class="rpt-opt" type="button" data-v="1" aria-pressed="${plan.ai}">${t("dg.aiOn")}</button>
        <button class="rpt-opt" type="button" data-v="0" aria-pressed="${!plan.ai}">${t("dg.aiOff")}</button>
      </div></div>
      <div class="rpt-note">${t("dg.aiNote")}</div>
      ${plan.ai && typeof chatReady === "function" && !chatReady()
        ? `<p class="q-note">${t("dg.aiNoKey")}</p>` : ""}`;
    const blocks = plan.blocks.map(id => t(dgBlock(id).tKey)).join(", ");
    return `
      <p class="dg-q">${t("dg.q5")}</p>
      <dl class="dg-recap">
        <dt>${t("dg.rPurpose")}</dt><dd>${t(plan.purpose === "client" ? "dg.client" : "dg.internal")}${plan.audience ? " · " + esc(plan.audience) : ""}</dd>
        <dt>${t("dg.rTitle")}</dt><dd>${esc(plan.title || t("dg.titleDefault"))}</dd>
        <dt>${t("dg.rScope")}</dt><dd>${t("dg.scopeCount", { n: cs.length })}${cs.length && cs.length <= 12 ? " · " + esc(cs.map(c => c.name).join(", ")) : ""}</dd>
        <dt>${t("dg.rBlocks")}</dt><dd>${blocks || "-"}</dd>
        <dt>${t("dg.rAi")}</dt><dd>${t(plan.ai ? "dg.aiOn" : "dg.aiOff")}</dd>
        <dt>${t("dg.rSlides")}</dt><dd>${slideEstimate()}</dd>
      </dl>
      <div class="rpt-note">${t("dg.recapNote")}</div>`;
  }

  function render(){
    const last = step === DG_STEPS.length - 1;
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
  }

  function wire(){
    dlg.querySelector("#dgX").addEventListener("click", () => dlg.close());
    const back = dlg.querySelector("#dgBack");
    if (back) back.addEventListener("click", () => { read(); step--; render(); });

    dlg.querySelectorAll(".rpt-set").forEach(set => set.addEventListener("click", e => {
      const b = e.target.closest(".rpt-opt");
      if (!b) return;
      const k = set.dataset.k;
      if (k === "ai") plan.ai = b.dataset.v === "1";
      else plan[k] = b.dataset.v;
      read();
      render();
    }));
    dlg.querySelectorAll(".dg-flag").forEach(b => b.addEventListener("click", () => {
      const iso = b.dataset.iso;
      plan.isos = plan.isos.includes(iso) ? plan.isos.filter(i => i !== iso) : plan.isos.concat([iso]);
      render();
    }));
    dlg.querySelectorAll(".dg-block").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.b;
      /* L'ordre des blocs dans le rapport est celui de DG_BLOCKS, pas celui des
         clics : un sommaire qui suit l'ordre des clics surprend son auteur. */
      plan.blocks = plan.blocks.includes(id)
        ? plan.blocks.filter(x => x !== id)
        : DG_BLOCKS.filter(x => x.id === id || plan.blocks.includes(x.id)).map(x => x.id);
      render();
    }));
    dlg.querySelector("#dgNext").addEventListener("click", () => {
      read();
      /* On ne laisse pas avancer sur un ecran dont la reponse est vide : la
         faute se voyait cinq ecrans plus loin, au moment de generer, et il
         fallait revenir en arriere pour comprendre laquelle. */
      const k = DG_STEPS[step];
      if (k === "scope" && !dgCountries(plan).length) {
        dlg.querySelector("#dgMsg").textContent = t("dg.errNoCountry");
        return;
      }
      if (k === "blocks" && !plan.blocks.length) {
        dlg.querySelector("#dgMsg").textContent = t("dg.errNoBlock");
        return;
      }
      if (step < DG_STEPS.length - 1) { step++; render(); return; }
      run();
    });
  }

  function read(){
    const ti = dlg.querySelector("#dgTitle"), au = dlg.querySelector("#dgAud");
    if (ti) plan.title = ti.value.trim();
    if (au) plan.audience = au.value.trim();
    dgSavePlan(plan);
  }

  async function run(){
    const go = dlg.querySelector("#dgNext"), msg = dlg.querySelector("#dgMsg");
    go.disabled = true;
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
