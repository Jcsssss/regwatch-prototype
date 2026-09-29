/* ---------- generation du rapport pays, en PowerPoint ----------
 *
 * Quatre slides par pays, au format et dans l'ordre des supports CYBER WATCH :
 *   1. transposition      etapes cles, autorites, exigences | enregistrement,
 *                         notifications, controles
 *   2. perimetre          secteurs additionnels, secteurs publics |
 *                         correspondances, processus, recommandations
 *   3. calendrier         les evenements en pleine largeur, puis prochaines
 *                         etapes et autres informations
 *   4. referentiel        les themes du cadre national, par famille
 *
 * Pourquoi construire les slides et ne pas patcher un gabarit
 *   app_deck.js remplit deux slides a trous : un gabarit porte la mise en page,
 *   on y substitue des jetons. Cela ne tient plus ici - le nombre de familles
 *   du referentiel change d'un pays a l'autre, et le volume de texte avec. Une
 *   slide a trous imposerait un nombre de blocs fixe, donc des trous vides pour
 *   les uns et du texte coupe pour les autres.
 *
 *   On garde en revanche tout le reste du gabarit : masque, quinze
 *   dispositions, theme, polices. PowerPoint est difficile sur ces parties, et
 *   celles-la sont connues bonnes. Seules les slides sont reecrites.
 *
 * Le placement
 *   PowerPoint ne fait pas couler le texte : chaque bloc porte sa position. On
 *   estime donc la hauteur de chaque paragraphe a partir du nombre de
 *   caracteres et de la largeur disponible, et on empile. L'estimation est
 *   volontairement large : un blanc en bas de colonne se voit moins qu'un
 *   chevauchement.
 */

const RPT_W = 12192000, RPT_H = 6858000;          /* 16:9, en EMU */
const RPT_IN = 914400;                            /* un pouce en EMU */
const RPT_VIOLET = "451DC7", RPT_DEEP = "250F6B", RPT_GREEN = "04F06A";
const RPT_BLUE = "4682B4", RPT_GREY = "F2F2F2", RPT_CARD = "ECECEC";
const RPT_FONT = "Aptos";

function rptEmu(inches){ return Math.round(inches * RPT_IN); }
function rptEsc(s){
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Les textes portent une emphase en ligne, comme dans les supports : <b> pour
   le violet gras, <i> pour l'italique. Un decoupage en fragments plutot qu'un
   analyseur HTML : on ne produit que ces deux balises, et les lire avec le DOM
   ferait dependre la generation d'un document. */
function rptRuns(html, base){
  const parts = String(html).split(/(<\/?[bi]>)/);
  let b = false, i = false;
  const out = [];
  for (const p of parts) {
    if (p === "<b>") { b = true; continue; }
    if (p === "</b>") { b = false; continue; }
    if (p === "<i>") { i = true; continue; }
    if (p === "</i>") { i = false; continue; }
    if (!p) continue;
    const txt = p.replace(/<[^>]*>/g, "");
    if (!txt) continue;
    out.push(Object.assign({}, base, { t: txt, b: b || base.b, i: i || base.i,
      color: b && !base.noEmph ? RPT_VIOLET : base.color }));
  }
  return out.length ? out : [Object.assign({}, base, { t: "" })];
}

function rptRunXml(r){
  const col = r.color || "000000";
  return `<a:r><a:rPr lang="fr-FR" sz="${r.sz}" b="${r.b ? 1 : 0}" i="${r.i ? 1 : 0}"`
    + `${r.u ? ' u="sng"' : ""} dirty="0">`
    + `<a:solidFill><a:srgbClr val="${col}"/></a:solidFill>`
    + `<a:latin typeface="${RPT_FONT}"/><a:cs typeface="${RPT_FONT}"/></a:rPr>`
    + `<a:t>${rptEsc(r.t)}</a:t></a:r>`;
}

/* Une zone de texte. `paras` est une liste de { runs, align, bullet, space }. */
function rptTextBox(id, x, y, w, h, paras, opts){
  opts = opts || {};
  const fill = opts.fill
    ? `<a:solidFill><a:srgbClr val="${opts.fill}"/></a:solidFill>`
    : "<a:noFill/>";
  const body = paras.map(p => {
    const ind = p.bullet
      ? ` marL="${rptEmu(0.16)}" indent="-${rptEmu(0.16)}"`
      : "";
    const bu = p.bullet
      ? `<a:buClr><a:srgbClr val="${RPT_VIOLET}"/></a:buClr>`
        + `<a:buFont typeface="${RPT_FONT}"/><a:buChar char="/"/>`
      : "<a:buNone/>";
    return `<a:p><a:pPr algn="${p.align || "l"}"${ind}>`
      + `<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>`
      + `<a:spcBef><a:spcPts val="${p.space == null ? 20 : p.space}"/></a:spcBef>`
      + `${bu}</a:pPr>${p.runs.map(rptRunXml).join("")}</a:p>`;
  }).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="t${id}"/>`
    + `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</p:spPr>`
    + `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t">`
    + `<a:noAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`;
}

function rptRect(id, x, y, w, h, fill, line){
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="r${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
    + `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`
    + (line ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`
            : "<a:ln><a:noFill/></a:ln>")
    + `</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
}

/* Le filet pointille sous un titre de rubrique. Une ligne en pointilles plutot
   qu'une suite de points dessines : un seul objet au lieu de quarante. */
function rptDots(id, x, y, w){
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="d${id}"/><p:cNvCxnSpPr/>`
    + `<p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/>`
    + `<a:ext cx="${w}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom>`
    + `<a:ln w="19050"><a:solidFill><a:srgbClr val="${RPT_VIOLET}"/></a:solidFill>`
    + `<a:prstDash val="sysDot"/></a:ln></p:spPr></p:cxnSp>`;
}

/* ---------- estimation de hauteur ----------
   PowerPoint ne nous dit pas combien de lignes un paragraphe occupera. On
   l'estime : largeur en pouces x 96 points par pouce, divisee par la largeur
   moyenne d'un caractere, environ 0,50 fois le corps. Large a dessein. */
function rptLines(text, widthIn, sizePt){
  const chars = String(text).replace(/<[^>]*>/g, "").length;
  const perLine = Math.max(12, Math.floor(widthIn * 96 / (sizePt * 0.50)));
  return Math.max(1, Math.ceil(chars / perLine));
}
function rptH(lines, sizePt, spaceBefPt){
  /* 1,40 et non 1,32 : a 1,32 un sous-titre mordait sur la derniere ligne de la
     puce precedente. L'estimation du nombre de lignes est approchee, la marge
     doit l'absorber. */
  return rptEmu((lines * sizePt * 1.40 + (spaceBefPt || 0)) / 72);
}

/* ---------- un empileur de blocs dans une colonne ----------
 *
 * En deux passes, et c'est necessaire. Les phrases ancrees sur les textes
 * legaux sont bien plus longues que les champs du classeur qu'elles remplacent,
 * et une colonne calee sur une seule taille debordait : les rubriques du bas se
 * chevauchaient. On enregistre donc les blocs sans les ecrire, on mesure, puis
 * on choisit l'echelle qui fait tenir. Un corps plus petit se lit ; un
 * chevauchement, non.
 *
 * Quand meme l'echelle minimale ne suffit pas, les derniers blocs sont ecartes
 * plutot que dessines par-dessus les precedents, et la slide le dit.
 */
function rptColumn(x, y, wIn, idStart){
  return {
    x: x, y0: y, w: rptEmu(wIn), wIn: wIn, id: idStart, ops: [], dropped: 0,
    rub: function(label){ this.ops.push({ k: "rub", label: label }); return this; },
    sub: function(label){ this.ops.push({ k: "sub", label: label }); return this; },
    bullets: function(items, sizePt){
      if (items && items.length) this.ops.push({ k: "bul", items: items, sz: sizePt || 8.5 });
      return this;
    },
    /* La hauteur d'un bloc a une echelle donnee. */
    heightOf: function(op, f){
      if (op.k === "rub") return rptH(1, 13 * f, 0) + rptEmu(0.13 * f);
      if (op.k === "sub") return rptH(1, 9 * f, 2) + rptEmu(0.02 * f);
      const sz = op.sz * f;
      const lines = op.items.reduce((n, it) => n + rptLines(it, this.wIn - 0.18, sz), 0);
      return rptH(lines, sz, op.items.length * 2) + rptEmu(0.04);
    },
    total: function(f){
      return this.ops.reduce((h, op) => h + this.heightOf(op, f), 0);
    },
    /* Ecrit la colonne dans la hauteur disponible et rend ses formes. */
    render: function(maxY){
      const room = maxY - this.y0;
      let f = 1;
      while (f > 0.62 && this.total(f) > room) f -= 0.03;
      const sp = [];
      let yy = this.y0;
      for (const op of this.ops) {
        const h = this.heightOf(op, f);
        /* Un bloc qui ne tient plus n'est pas dessine par-dessus le precedent. */
        if (yy + h > maxY) { this.dropped++; continue; }
        if (op.k === "rub") {
          sp.push(rptRect(this.id++, this.x, yy + rptEmu(0.02 * f),
            rptEmu(0.1 * f), rptEmu(0.20 * f), RPT_VIOLET));
          sp.push(rptTextBox(this.id++, this.x + rptEmu(0.18 * f), yy,
            this.w - rptEmu(0.18 * f), rptH(1, 13 * f, 0),
            [{ runs: [{ t: op.label, sz: Math.round(1300 * f), b: true, color: "000000" }] }]));
          sp.push(rptDots(this.id++, this.x, yy + rptH(1, 13 * f, 0) + rptEmu(0.04 * f), this.w));
        } else if (op.k === "sub") {
          sp.push(rptTextBox(this.id++, this.x, yy, this.w, rptH(1, 9 * f, 2),
            [{ runs: [{ t: op.label, sz: Math.round(900 * f), b: true, u: true,
                        color: RPT_VIOLET }], space: 20 }]));
        } else {
          const sz = op.sz * f;
          sp.push(rptTextBox(this.id++, this.x, yy, this.w, h,
            op.items.map(it => ({
              runs: rptRuns(it, { sz: Math.round(sz * 100), b: false, i: false,
                                  color: "000000" }),
              align: "just", bullet: true, space: 20
            }))));
        }
        yy += h;
      }
      this.scale = f;
      return sp;
    }
  };
}

/* ---------- l'en-tete commun aux trois slides de transposition ---------- */
function rptHead(c, lang, x, y, idStart){
  const col = { x: x, y: y, id: idStart, sp: [] };
  const name = rptCountryName(c, lang);
  const title = lang === "en"
    ? "NIS 2 directive transposition in " + name
    : "Transposition de la directive NIS 2 en " + name;
  col.sp.push(rptTextBox(col.id++, col.x, col.y, rptEmu(4.3), rptH(3, 20, 0),
    [{ runs: [{ t: title, sz: 2000, b: true, color: RPT_VIOLET }] }]));
  /* la jauge de maturite, quatre cases, celles atteintes en vert */
  const bx = col.x + rptEmu(4.5), by = col.y + rptEmu(0.05), s = rptEmu(0.23);
  for (let i = 1; i <= 4; i++) {
    const on = i <= c.maturity;
    col.sp.push(rptRect(col.id++, bx + (i - 1) * (s + rptEmu(0.04)), by, s, s,
      on ? RPT_GREEN : "FFFFFF", on ? RPT_GREEN : "999999"));
    col.sp.push(rptTextBox(col.id++, bx + (i - 1) * (s + rptEmu(0.04)),
      by + rptEmu(0.045), s, s,
      [{ runs: [{ t: String(i), sz: 900, b: true, color: on ? "0A2E19" : "666666" }],
         align: "ctr", space: 0 }]));
  }
  col.sp.push(rptTextBox(col.id++, bx - rptEmu(0.25), by + rptEmu(0.33),
    rptEmu(1.9), rptH(4, 7, 0),
    [{ runs: [{ t: rptMaturity(c.maturity, lang), sz: 700, b: true, color: RPT_VIOLET }],
       align: "ctr", space: 0 }]));
  return { shapes: col.sp, bottom: col.y + rptEmu(1.02) };
}

function rptCountryName(c, lang){
  if (lang === "fr" && typeof DECK_FR_NAME !== "undefined" && DECK_FR_NAME[c.iso])
    return DECK_FR_NAME[c.iso];
  return c.nameEn || c.name;
}
/* La legende dans la langue du rapport. t() rendrait celle de l'ecran : un
   rapport demande en anglais depuis l'interface francaise sortait sa jauge en
   francais. */
function rptMaturity(n, lang){
  const d = (I18N[lang] || I18N.en);
  return d["lvl." + n] || I18N.en["lvl." + n] || "";
}

/* ================= le contenu des slides ================= */

/* ---------- les phrases ancrees sur les textes legaux ----------
 *
 * data_prose.js porte, par pays et par bloc, des puces redigees a partir des
 * seuls textes legaux du pays, chacune terminee par sa source. Quand un bloc
 * existe, il remplace les champs du classeur : une phrase de droit citee vaut
 * mieux qu'une juxtaposition de cases, et c'est ce que les supports montrent.
 *
 * Un bloc non relu laisse une trace jusqu'a la slide, qui le dit en pied. Un
 * document qui sort de l'outil doit annoncer lui-meme ce qu'il vaut.
 */
let rptDraftUsed = false;

/* Un support destine au client ne porte pas les recommandations internes : le
   generateur de rapports leve ce drapeau pour cette destination-la, comme la
   version client du site se passe des plans d'action. */
let rptNoReco = false;
function rptProse(iso, key){
  if (typeof PROSE === "undefined") return null;
  const bag = PROSE[iso];
  const blk = bag && bag[key];
  if (!blk || !blk.b || !blk.b.length) return null;
  if (blk.d) rptDraftUsed = true;
  return blk.b.map(x => tc(x, rptLang));
}

/* Une valeur du classeur, prete a etre ecrite. Les cases vides et les « NC »
   ne sont pas ecrites du tout : une slide client n'a pas a afficher les trous
   de notre veille. Elles remontent en revanche dans le compte rendu. */
function rptCell(iso, key, col){
  const v = typeof ficheCell === "function" ? ficheCell(iso, key, col) : null;
  if (v == null || v === "NC") return null;
  /* Dans la langue des slides, pas dans celle de l'interface. */
  return tc(String(v), rptLang);
}
let rptLang = "fr";
/* Les dates des slides suivent la langue des slides, pas celle de l'interface. */
function rptDate(iso){
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(rptLang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function rptYes(v){ return v != null && /^(yes|oui|y)$/i.test(v); }

const RPT_TOP = rptEmu(0.32), RPT_BOT = RPT_H - rptEmu(0.30);
const RPT_LX = rptEmu(0.45), RPT_LW = 5.4;
const RPT_RX = rptEmu(6.75), RPT_RW = 5.9;
const RPT_SPLIT = rptEmu(6.33);

function rptSlide1(c, lang){
  const iso = c.iso, L = lang === "en";
  const head = rptHead(c, lang, RPT_LX, RPT_TOP, 100);

  const left = rptColumn(RPT_LX, head.bottom, RPT_LW, 150);
  left.rub(L ? "Key steps in the transposition process"
             : "Étapes clés dans le processus de transposition");
  left.sub(L ? "Latest events" : "Derniers événements");
  left.bullets(rptEvents(c, lang, 4));
  if (c.next && c.next.length) {
    left.sub(L ? "Next steps" : "Prochaines étapes");
    left.bullets(c.next.slice(0, 2));
  }
  left.rub(L ? "Authorities" : "Autorités");
  left.bullets((c.authorities || []).map(a => "<b>" + a.name + "</b> : " + a.role));
  left.rub(L ? "Cybersecurity requirements" : "Exigences de cybersécurité");
  left.sub("Framework");
  left.bullets(rptFwLines(c, iso, lang));
  const fwd = rptProse(iso, "fw.deadlines");
  if (fwd) { left.sub(L ? "Deadlines" : "Échéances"); left.bullets(fwd); }

  const right = rptColumn(RPT_RX, RPT_TOP, RPT_RW, 400);
  right.rub(L ? "Entity registration" : "Enregistrement des entités");
  right.sub(L ? "Deadlines" : "Échéances");
  right.bullets(rptRegDeadlines(c, iso, lang));
  right.sub(L ? "Platform availability" : "Disponibilité des plateformes");
  right.bullets(rptRegPlatform(iso, lang));
  right.rub(L ? "Incident notification" : "Notifications d'incidents");
  right.sub(L ? "Process and platform" : "Processus et disponibilité de la plateforme");
  right.bullets(rptIncident(iso, lang));
  right.sub(L ? "Deadlines" : "Échéances");
  right.bullets([L ? "Early warning within <b>24 h</b>, notification within <b>72 h</b>, final report within <b>one month</b>"
                   : "Alerte précoce à <b>24 h</b>, notification à <b>72 h</b>, rapport final à <b>un mois</b>"]);
  right.rub(L ? "Controls" : "Contrôles");
  right.bullets(rptControls(iso, lang));

  return { shapes: [rptRect(99, RPT_SPLIT, 0, RPT_W - RPT_SPLIT, RPT_H, RPT_GREY)]
    .concat(head.shapes, left.render(RPT_BOT), right.render(RPT_BOT)) };
}

function rptSlide2(c, lang){
  const iso = c.iso, L = lang === "en";
  const head = rptHead(c, lang, RPT_LX, RPT_TOP, 100);
  const left = rptColumn(RPT_LX, head.bottom, RPT_LW, 150);
  left.rub(L ? "Additional sectors" : "Secteurs additionnels");
  left.bullets(rptSectors(iso, lang, "private"));
  left.rub(L ? "Public sectors" : "Secteurs publics");
  left.bullets(rptSectors(iso, lang, "public"));

  const right = rptColumn(RPT_RX, RPT_TOP, RPT_RW, 400);
  right.rub(L ? "Correspondence with other regulations"
              : "Correspondance à d'autres réglementations");
  right.bullets(rptCorrespondence(c, iso, lang));
  right.rub(L ? "Registration process" : "Processus d'enregistrement");
  right.bullets(rptRegProcess(iso, lang));
  if (!rptNoReco) {
    right.rub(L ? "Wavestone recommendations" : "Recommandations Wavestone");
    right.bullets(rptReco(c, iso, lang));
  }

  return { shapes: [rptRect(99, RPT_SPLIT, 0, RPT_W - RPT_SPLIT, RPT_H, RPT_GREY)]
    .concat(head.shapes, left.render(RPT_BOT), right.render(RPT_BOT)) };
}

function rptSlide3(c, lang){
  const L = lang === "en";
  const head = rptHead(c, lang, RPT_LX, RPT_TOP, 100);
  const ySplit = rptEmu(4.3);

  const top = rptColumn(RPT_LX, head.bottom, 12.4, 150);
  top.rub(L ? "Calendar of recent events" : "Calendrier des derniers événements");
  top.bullets(rptEvents(c, lang, 10), 8);

  const bl = rptColumn(RPT_LX, ySplit, 4.6, 500);
  bl.rub(L ? "Next steps" : "Prochaines étapes");
  bl.bullets((c.next || []).slice(0, 3));
  const br = rptColumn(rptEmu(5.6), ySplit + rptEmu(0.1), 6.2, 700);
  br.rub(L ? "Other important information" : "Autres informations importantes");
  br.bullets(rptOther(c, lang));

  return { shapes: [rptRect(99, rptEmu(5.35), ySplit - rptEmu(0.1),
      RPT_W - rptEmu(5.75), RPT_H - ySplit, RPT_GREY)]
    .concat(head.shapes, top.render(ySplit - rptEmu(0.15)),
            bl.render(RPT_BOT), br.render(RPT_BOT)) };
}

function rptSlide4(c, lang){
  const iso = c.iso, L = lang === "en";
  const fams = rptFamilies(c, iso);
  const name = rptCountryName(c, lang).toUpperCase();
  const sp = [];
  let id = 100;
  sp.push(rptTextBox(id++, rptEmu(0.45), rptEmu(0.22), rptEmu(11), rptH(1, 18, 0),
    [{ runs: [{ t: (L ? "Summary of themes of NIS 2 – " : "Synthèse des thèmes de NIS 2 – ") + name,
               sz: 1800, b: true, color: RPT_VIOLET }] }]));
  /* le bandeau de synthese */
  const bTop = rptEmu(0.92), bH = rptEmu(0.46);
  sp.push(rptRect(id++, 0, bTop, RPT_W, bH, "EFE6FE"));
  const fw = rptFwSummary(c, iso, lang);
  sp.push(rptTextBox(id++, rptEmu(0.7), bTop + rptEmu(0.08), RPT_W - rptEmu(1.4),
    bH, [{ runs: rptRuns(fw, { sz: 950, b: false, i: false, color: "000000" }),
           align: "ctr", space: 0 }]));

  /* trois colonnes ; les familles restantes rejoignent la derniere */
  const groups = [[fams[0]], [fams[1]], fams.slice(2)].filter(g => g && g[0]);
  const colW = 3.9, gap = 0.28;
  groups.forEach((gs, i) => {
    let y = rptEmu(1.58);
    const x = rptEmu(0.45 + i * (colW + gap));
    gs.forEach(g => {
      if (!g) return;
      sp.push(rptRect(id++, x, y, rptEmu(colW), rptEmu(0.26),
        i === 0 ? "8F00FF" : i === 1 ? RPT_VIOLET : RPT_BLUE));
      sp.push(rptTextBox(id++, x, y + rptEmu(0.045), rptEmu(colW), rptEmu(0.26),
        [{ runs: [{ t: g.name, sz: 900, b: true, color: "FFFFFF" }], align: "ctr", space: 0 }]));
      y += rptEmu(0.33);
      g.themes.forEach(th => {
        const nLines = rptLines(th.desc, colW - 0.2, 6.6) + 1;
        const h = rptH(nLines, 6.8, 6);
        /* Une carte qui ne tient plus est ecartee plutot que dessinee sous le
           pied de slide : les referentiels les plus fournis comptent trente
           themes. */
        if (y + h + rptEmu(0.26) > RPT_H - rptEmu(0.5)) return;
        sp.push(rptRect(id++, x, y, rptEmu(colW), h + rptEmu(0.1), RPT_CARD));
        sp.push(rptTextBox(id++, x + rptEmu(0.08), y + rptEmu(0.05),
          rptEmu(colW - 0.16), h,
          [{ runs: [{ t: th.title + (th.n ? " (" + th.n + ")" : ""), sz: 750,
                      b: true, color: RPT_VIOLET }], align: "ctr", space: 0 },
           { runs: [{ t: th.desc, sz: 660, b: false, color: "111111" }],
             align: "just", space: 20 }]));
        y += h + rptEmu(0.16);
      });
      y += rptEmu(0.08);
    });
  });
  sp.push(rptTextBox(id++, rptEmu(0.45), RPT_H - rptEmu(0.42), rptEmu(11.3), rptH(1, 7, 0),
    [{ runs: [{ t: rptFwFromDeck(iso)
        ? (L ? "(x) Number of security requirements by topic"
             : "(x) Nombre d'exigences de sécurité par thème")
        : (L ? "Themes from the Wavestone reference grid: the national framework has no dedicated slide yet"
             : "Thèmes issus de la grille de référence Wavestone : le référentiel national n'a pas encore de slide dédiée"),
               sz: 700, b: false, color: "444444" }] }]));
  sp.push(rptTextBox(id++, RPT_W - rptEmu(1.9), RPT_H - rptEmu(0.42), rptEmu(1.5),
    rptH(1, 7, 0),
    [{ runs: [{ t: "© WAVESTONE", sz: 700, b: true, color: RPT_BLUE }], align: "r" }]));
  return { shapes: sp };
}

/* ================= ou chaque bloc prend sa matiere ================= */

function rptEvents(c, lang, max){
  const evs = [...(c.timeline || [])].sort((a, b) => b.date < a.date ? -1 : 1);
  return evs.slice(0, max).map(ev =>
    "<b>" + (typeof fmtDateL === "function" ? rptDate(ev.date) : ev.date) + "</b> : "
    + (typeof evText === "function" ? evText(ev) : ev.text));
}

function rptFwLines(c, iso, lang){
  {
    const P = rptProse(iso, "fw.framework");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const name = rptCell(iso, "fw", "F") || c.fwName;
  const dedicated = rptCell(iso, "fw", "E");
  if (name) out.push((L ? "Framework: " : "Référentiel : ") + "<b>" + name + "</b>"
    + (dedicated ? " — " + dedicated : ""));
  const ee = rptCell(iso, "fw", "L"), ie = rptCell(iso, "fw", "M");
  if (ee) out.push("<b>" + ee + "</b>" + (L ? " requirements for essential entities" : " exigences pour les entités essentielles")
    + (ie ? ", <b>" + ie + "</b>" + (L ? " for important entities" : " pour les importantes") : ""));
  const dl = rptCell(iso, "fw", "AD");
  if (dl) out.push((L ? "Compliance expected within " : "Conformité attendue sous ")
    + "<b>" + dl + (L ? " months" : " mois") + "</b>");
  const pres = rptCell(iso, "fw", "AB");
  if (pres) out.push((L ? "Presumption of conformity: " : "Présomption de conformité : ") + pres);
  return out;
}

function rptRegDeadlines(c, iso, lang){
  {
    const P = rptProse(iso, "reg.deadlines");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const dl = rptCell(iso, "reg", "H");
  if (dl) out.push((L ? "Registration deadline: " : "Échéance d'enregistrement : ") + "<b>" + dl + "</b>");
  const months = rptCell(iso, "reg", "J");
  if (months) out.push("<b>" + months + (L ? " months" : " mois") + "</b>"
    + (L ? " from the reference date" : " à compter de la date de référence"));
  const upd = rptCell(iso, "reg", "K");
  if (upd) out.push((L ? "Changes to be declared within " : "Toute modification à déclarer sous ")
    + "<b>" + upd + (L ? " months" : " mois") + "</b>");
  const ref = rptCell(iso, "reg", "L");
  if (ref) out.push((L ? "Reference date: " : "Date de référence : ") + ref);
  return out.length ? out : [L ? "Deadline not yet set" : "Échéance non encore fixée"];
}

function rptRegPlatform(iso, lang){
  {
    const P = rptProse(iso, "reg.platform");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const avail = rptCell(iso, "reg", "D");
  if (avail) out.push((L ? "Registration available: " : "Enregistrement disponible : ")
    + "<b>" + avail + "</b>");
  const tool = rptCell(iso, "reg", "E") || rptCell(iso, "reg", "I");
  if (tool) out.push((L ? "Channel: " : "Canal : ") + "<b>" + tool + "</b>");
  const type = rptCell(iso, "reg", "G");
  if (type) out.push((L ? "Type: " : "Type : ") + type);
  const auth = rptCell(iso, "reg", "F");
  if (auth) out.push((L ? "Authority in charge: " : "Autorité en charge : ") + "<b>" + auth + "</b>");
  return out;
}

function rptIncident(iso, lang){
  {
    const P = rptProse(iso, "inc.process");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const org = rptCell(iso, "inc", "F") || rptCell(iso, "inc", "E");
  if (org) out.push((L ? "Reported to " : "Notification à ") + "<b>" + org + "</b>");
  const meth = rptCell(iso, "inc", "H");
  if (meth) out.push((L ? "Method: " : "Méthode : ") + meth);
  const plat = rptCell(iso, "inc", "I");
  if (plat) out.push((L ? "Platform: " : "Plateforme : ") + plat);
  const info = rptCell(iso, "inc", "J");
  if (info) out.push((L ? "Information required: " : "Informations demandées : ") + info);
  const crit = rptCell(iso, "inc", "N");
  if (crit) out.push((L ? "Significant incident criteria: " : "Critères d'incident significatif : ") + crit);
  return out;
}

function rptControls(iso, lang){
  {
    const P = rptProse(iso, "ctl.process");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const who = rptCell(iso, "aud", "D");
  if (who) out.push((L ? "Audits planned " : "Audits prévus ") + "<b>" + who + "</b>");
  const org = rptCell(iso, "aud", "G") || rptCell(iso, "aud", "E");
  if (org) out.push((L ? "Body in charge: " : "Organisme en charge : ") + "<b>" + org + "</b>");
  const typ = rptCell(iso, "aud", "F");
  if (typ) out.push((L ? "Auditors: " : "Auditeurs : ") + typ);
  const bill = rptCell(iso, "aud", "H");
  if (bill) out.push((L ? "Billing: " : "Facturation : ") + bill);
  const self = rptCell(iso, "aud", "I");
  if (self) out.push((L ? "Self-assessment: " : "Auto-évaluation : ") + self);
  const why = rptCell(iso, "aud", "U");
  if (why) out.push((L ? "Unexpected audit: " : "Audit inopiné : ") + why);
  return out;
}

/* Les secteurs additionnels viennent de la feuille « Scope » du classeur quand
   elle est cartographiee ; a defaut, de la section `scope` de l'enregistrement
   pays, qui est ecrite a la main. */
function rptSectors(iso, lang, kind){
  const P = rptProse(iso, kind === "public" ? "sec.public" : "sec.private");
  if (P) return P;
  const L = lang === "en";
  const c = byIso[iso];
  const sec = (c.sections && c.sections.scope) || [];
  if (sec.length) return sec.slice(0, 4);
  return [L ? "No additional sector declared beyond Annexes I and II"
            : "Aucun secteur additionnel déclaré au-delà des annexes I et II"];
}

function rptCorrespondence(c, iso, lang){
  {
    const P = rptProse(iso, "corr");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const rely = rptCell(iso, "fw", "O");
  const names = ["P:ISO 27001/27002", "Q:IEC 62443", "R:NIST CSF", "S:NIST SP 800-53",
                 "T:CIS Controls", "U:NIS 1", "V:CyFun"];
  const on = names.filter(n => rptYes(rptCell(iso, "fw", n.split(":")[0])))
                  .map(n => n.split(":")[1]);
  if (on.length) out.push((L ? "Relies on " : "S'appuie sur ") + "<b>" + on.join(", ") + "</b>");
  else if (rely) out.push((L ? "Relies on other frameworks: " : "S'appuie sur d'autres référentiels : ") + rely);
  const nat = rptCell(iso, "fw", "X");
  if (nat) out.push((L ? "National frameworks: " : "Référentiels nationaux : ") + "<b>" + nat + "</b>");
  const guid = rptCell(iso, "fw", "Z");
  if (guid) out.push((L ? "National guidance: " : "Guides nationaux : ") + guid);
  return out;
}

function rptRegProcess(iso, lang){
  {
    const P = rptProse(iso, "reg.process");
    if (P) return P;
  }
  const L = lang === "en", out = [];
  const type = rptCell(iso, "reg", "G");
  if (type) out.push("<b>" + type + "</b>");
  const notif = rptCell(iso, "reg", "M");
  if (notif) out.push((L ? "Eligibility notified by the authority: " : "Éligibilité notifiée par l'autorité : ") + notif);
  /* la liste des informations exigees, colonnes O a AC */
  const cols = "O P Q R S T U V W X Y Z AA AB AC".split(" ");
  const asked = cols.filter(col => rptYes(rptCell(iso, "reg", col)))
    .map(col => typeof ficheLabel === "function" ? ficheLabel("reg", col) : col);
  if (asked.length) out.push((L ? "Information required: " : "Informations demandées : ")
    + asked.join(", "));
  return out;
}

/* La recommandation Wavestone attend sa colonne dans le classeur. Tant qu'elle
   n'existe pas, la slide porte le bloc mais pas de texte invente : une
   recommandation fabriquee par le generateur engagerait le cabinet. */
function rptReco(c, iso, lang){
  const v = rptCell(iso, "id", "M") || rptCell(iso, "id", "N");
  if (v) return v.split(/\n+/).filter(Boolean);
  return [lang === "en"
    ? "To be completed by the NIS 2 team before sharing."
    : "À compléter par l'équipe NIS 2 avant diffusion."];
}

function rptOther(c, lang){
  const P = rptProse(c.iso, "other");
  if (P) return P;
  const out = (c.sections && c.sections.other) ? c.sections.other.slice(0, 4) : [];
  return out.length ? out
    : [lang === "en" ? "No additional information recorded."
                     : "Aucune information complémentaire enregistrée."];
}

function rptFwSummary(c, iso, lang){
  const L = lang === "en";
  const deck = (typeof FW_THEMES !== "undefined") ? FW_THEMES[iso] : null;
  /* Les compteurs du support priment sur ceux du classeur : ce sont eux qui
     comptent les themes que la slide affiche juste en dessous. Melanger les
     deux donnait « 6 themes » au-dessus de quinze cartes. */
  const th = deck && deck.themes ? deck.themes : rptCell(iso, "fw", "J");
  const ee = deck && deck.ee ? deck.ee : rptCell(iso, "fw", "L");
  const ie = deck && deck.ie ? deck.ie : rptCell(iso, "fw", "M");
  const name = (deck && deck.fw) || rptCell(iso, "fw", "F") || c.fwName || "";
  if (L) return "NIS 2 requirements are summarized in <b>" + (th || "?") + " themes</b> and <b>"
    + (ee || "?") + " security measures</b> applicable to <b>Essential Entities (EE)</b>"
    + (ie ? ", while <b>Important Entities (IE)</b> must comply with <b>" + ie + " security measures</b>" : "") + ".";
  return "Les exigences de NIS 2 sont déclinées dans <b>" + name + "</b> en <b>"
    + (th || "?") + " thèmes</b> et <b>" + (ee || "?") + " mesures de sécurité</b> pour les "
    + "<b>entités essentielles</b>"
    + (ie ? ", les <b>entités importantes</b> devant en respecter <b>" + ie + "</b>" : "") + ".";
}

/* Les familles et les themes du referentiel national viennent de
   data_fwthemes.js, extrait des supports CYBER WATCH 2 : leurs intitules, leur
   numerotation et le nombre d'exigences par theme n'existent nulle part
   ailleurs, le classeur ne portant que des compteurs globaux.

   Quand un pays n'a pas de slide dans le support - il en manque quinze - on se
   rabat sur la grille de couverture de data_themes.js. C'est moins fidele, et
   la slide le dit plutot que de laisser croire au contraire. */
function rptFamilies(c, iso){
  const src = (typeof FW_THEMES !== "undefined") ? FW_THEMES[iso] : null;
  if (src && src.families && src.families.length) {
    return src.families.map(f => ({
      name: f.name || "—",
      themes: f.themes.map(th => ({
        title: th.n + " – " + th.name, n: th.req, desc: th.desc || ""
      }))
    }));
  }
  const cov = (typeof CYBER_THEMES !== "undefined" && CYBER_THEMES.countries)
    ? CYBER_THEMES.countries[iso] : null;
  if (!cov) return [];
  const groups = [
    { name: "Govern & assess risk",
      keys: ["Governance", "Risk management", "Audits", "Evaluation of the effectiveness of measures"] },
    { name: "Know your assets",
      keys: ["IS inventory", "Asset Management", "Dedicated IS administration", "MCO/MCS"] },
    { name: "Protect & harden",
      keys: ["Hardening", "IAM", "Cryptography", "Data security", "Physical security",
             "DevSecOps", "Third-party management", "HR security", "Industrial asset security"] },
    { name: "Detect, respond & recover",
      keys: ["Detection", "Incident management", "Cyber crisis management", "Resilience"] }
  ];
  let n = 0;
  return groups.map(g => ({
    name: g.name,
    themes: (cov.families || [])
      .filter(f => g.keys.indexOf(f.family) >= 0 && f.covered)
      .map(f => ({ title: (++n) + " – " + f.family, n: null,
                   desc: (f.themes || []).join(", ") }))
  })).filter(g => g.themes.length);
}

/* Vrai quand la slide s'appuie sur le referentiel du support, faux quand elle
   se rabat sur la grille de couverture. La slide l'indique en pied. */
function rptFwFromDeck(iso){
  return typeof FW_THEMES !== "undefined" && !!FW_THEMES[iso];
}

/* ================= assemblage du .pptx ================= */

const RPT_SLIDE_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

function rptSlideXml(slide){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<p:sld ${RPT_SLIDE_NS}><p:cSld><p:spTree>`
    + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
    + '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + slide.shapes.join("")
    + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}

/* ---------- le paquet .pptx ----------
 * Les slides de la fiche pays et celles du generateur de rapports partagent le
 * meme gabarit et le meme assemblage. Une seule fonction les emballe : la
 * seconde copie aurait vieilli a son rythme, et c'est cette partie-la que
 * PowerPoint refuse le plus volontiers quand elle derive.
 */
async function rptPackage(wanted){
  if (typeof DECK_TEMPLATE_B64 === "undefined") throw new Error(t("rpt.noTemplate"));
  const bin = atob(DECK_TEMPLATE_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const entries = readZip(bytes);

  /* Les relations de nos slides sont construites, pas recopiees.
     Recopier celles de la slide modele paraissait economique et produisait un
     fichier que PowerPoint refuse d'ouvrir : elles portent une relation vers
     une note de slide et vers un fil de commentaires, tous deux rattaches a une
     slide precise. Nos quatre slides pointaient donc vers la meme note, qui
     elle-meme designe une seule slide. LibreOffice l'ignore, PowerPoint non.
     Une slide generee n'a besoin que de sa disposition. */
  const model = entries.find(e => e.name === "ppt/slides/_rels/slide2.xml.rels");
  const relsRaw = model.method === 0 ? model.data : await inflateRaw(model.data);
  const layout = (new TextDecoder().decode(relsRaw)
    .match(/Target="(\.\.\/slideLayouts\/[^"]+)"/) || [])[1] || "../slideLayouts/slideLayout1.xml";
  const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
    + 'relationships/slideLayout" Target="' + layout + '"/></Relationships>';

  /* Les notes et les commentaires appartenaient aux slides du gabarit. Les
     laisser en place laisserait des parties orphelines qui designent des slides
     devenues autres. */
  const drop = /^ppt\/(slides|notesSlides|comments)\//;
  const kept = entries.filter(e => !drop.test(e.name));
  const enc = new TextEncoder();
  /* `time` et `flags` sont lus par writeZip, qui a ete ecrit pour reecrire des
     entrees existantes. Sans eux, l'horodatage MS-DOS vaut zero, c'est-a-dire
     un mois et un jour zero : une date impossible que les lecteurs stricts
     refusent. On date au 1er janvier 2020. */
  const ZIP_TIME = ((2020 - 1980) << 25) | (1 << 21) | (1 << 16);
  async function put(name, text){
    const out = enc.encode(text);
    kept.push({ name: name, method: 8, flags: 0, time: ZIP_TIME,
                crc: crc32(out), rawSize: out.length, data: await deflateRaw(out) });
  }
  for (let i = 0; i < wanted.length; i++) {
    const xml = rptSlideXml(wanted[i]);
    /* Un identifiant de forme absent ou non numerique produit un fichier que
       PowerPoint propose de reparer, et dont la reparation echoue - une slide
       construite sans compteur d'identifiants ecrivait id="NaN". LibreOffice
       l'ouvrait sans rien dire, donc la relecture des rendus ne le voyait pas.
       On echoue ici, a la generation, plutot que chez le lecteur. */
    if (/(?:\bid)="(?:NaN|undefined|)"/.test(xml))
      throw new Error("slide " + (i + 1) + " : identifiant de forme invalide");
    await put("ppt/slides/slide" + (i + 1) + ".xml", xml);
    await put("ppt/slides/_rels/slide" + (i + 1) + ".xml.rels", relsXml);
  }

  /* presentation.xml, ses relations et les types de contenu doivent decrire
     exactement les slides presentes, sinon PowerPoint refuse le fichier. */
  async function patch(name, fn){
    const e = kept.find(x => x.name === name);
    const raw = e.method === 0 ? e.data : await inflateRaw(e.data);
    const txt = fn(new TextDecoder().decode(raw));
    const out = enc.encode(txt);
    e.crc = crc32(out); e.rawSize = out.length; e.data = await deflateRaw(out); e.method = 8;
  }
  const rid = i => "rIdSlide" + (i + 1);
  await patch("ppt/_rels/presentation.xml.rels", x =>
    x.replace(/<Relationship [^>]*slides\/slide\d+\.xml"\/>/g, "")
     .replace("</Relationships>", wanted.map((_, i) =>
       `<Relationship Id="${rid(i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
     ).join("") + "</Relationships>"));
  await patch("ppt/presentation.xml", x =>
    x.replace(/<p:sldIdLst>.*?<\/p:sldIdLst>/, "<p:sldIdLst>" + wanted.map((_, i) =>
      `<p:sldId id="${256 + i}" r:id="${rid(i)}"/>`).join("") + "</p:sldIdLst>"));
  await patch("[Content_Types].xml", x =>
    x.replace(/<Override PartName="\/ppt\/(slides\/slide|notesSlides\/|comments\/)[^"]*"[^>]*\/>/g, "")
     .replace("</Types>", wanted.map((_, i) =>
       `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
     ).join("") + "</Types>"));

  /* app.xml annonce le nombre de slides et leurs titres. Le gabarit en declarait
     trois ; un fichier qui en contient quatre et en annonce trois est refuse.
     Plutot que de rafistoler un inventaire dont chaque ligne devrait suivre, on
     le reecrit au minimum valide. */
  await patch("docProps/app.xml", () =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"'
    + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + "<Application>RegWatch</Application><PresentationFormat>Widescreen</PresentationFormat>"
    + "<Slides>" + wanted.length + "</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides>"
    + "<MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate>"
    + "<SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>"
    + "<AppVersion>16.0000</AppVersion></Properties>");

  return writeZip(kept);
}

async function generateCountryReport(iso, opts){
  const c = byIso[iso];
  if (!c) throw new Error("pays inconnu");
  if (typeof DECK_TEMPLATE_B64 === "undefined")
    throw new Error(t("rpt.noTemplate"));
  const lang = opts.lang || "fr";
  rptDraftUsed = false;
  /* Le contenu redige (fiches, themes) suit la langue des slides le temps de la
     generation, puis revient a celle de l'interface. */
  rptLang = lang;
  if (typeof applyContentLang === "function") applyContentLang(lang);
  const wanted = [];
  try {
    if (opts.what !== "fw") wanted.push(rptSlide1(c, lang), rptSlide2(c, lang), rptSlide3(c, lang));
    if (opts.what !== "country") wanted.push(rptSlide4(c, lang));
  } finally {
    if (typeof applyContentLang === "function") applyContentLang();
  }

  /* La mention de brouillon est posee ici, avant que les slides ne soient
     serialisees : ajoutee plus bas, elle modifiait des objets deja ecrits dans
     le zip et n'apparaissait nulle part. Elle se signale sur chaque slide et
     pas seulement dans la conversation qui l'a produite, car le fichier circule
     sans elle. */
  if (rptDraftUsed) {
    const note = lang === "en"
      ? "Draft — sentences drawn from the legal texts, not yet reviewed"
      : "Brouillon — phrases tirées des textes légaux, non encore relues";
    wanted.forEach(sl => sl.shapes.push(
      rptTextBox(9000, rptEmu(0.45), RPT_H - rptEmu(0.32), rptEmu(7.5), rptH(1, 7, 0),
        [{ runs: [{ t: note, sz: 700, b: true, color: "FF2A49" }] }])));
  }

  const blob = await rptPackage(wanted);

  const suffix = opts.what === "fw" ? " - framework" : opts.what === "country" ? " - transposition" : "";
  return { blob: blob,
           filename: "RegWatch - " + rptCountryName(c, lang) + suffix + ".pptx" };
}

/* ================= le dialogue ================= */
/* Trois choix : ce qu'on genere, dans quelle langue, sous quel format. Le PDF
   n'est pas propose : l'outil n'a ni serveur ni bibliotheque PDF embarquee, et
   PowerPoint exporte en PDF en deux clics. Mieux vaut un choix absent qu'un
   choix grise dont personne ne sait quand il s'activera. */
function reportDialog(iso){
  const c = byIso[iso];
  const old = document.getElementById("rptDlg");
  if (old) old.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "rptDlg";
  dlg.innerHTML = `
    <div class="rpt-box">
      <div class="rpt-h"><h2>${t("rpt.title", { country: esc(c.name) })}</h2>
        <button class="x" type="button" id="rptX" aria-label="${t("fiche.close")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button></div>
      <div class="rpt-b">
        <div class="rpt-set" data-k="what">
          <span class="rpt-lab">${t("rpt.what")}</span>
          <div class="rpt-opts">
            <button class="rpt-opt" type="button" data-v="country">${t("rpt.country")}</button>
            <button class="rpt-opt" type="button" data-v="fw">${t("rpt.fw")}</button>
            <button class="rpt-opt" type="button" data-v="all" aria-pressed="true">${t("rpt.all")}</button>
          </div></div>
        <div class="rpt-set" data-k="lang">
          <span class="rpt-lab">${t("rpt.lang")}</span>
          <div class="rpt-opts">
            <button class="rpt-opt" type="button" data-v="fr"${lang === "fr" ? ' aria-pressed="true"' : ""}>Français</button>
            <button class="rpt-opt" type="button" data-v="en"${lang === "en" ? ' aria-pressed="true"' : ""}>English</button>
          </div></div>
        <div class="rpt-note">${t("rpt.note")}</div>
      </div>
      <div class="rpt-f"><span class="rpt-msg" id="rptMsg"></span>
        <button class="btn primary" type="button" id="rptGo">${t("rpt.go")}</button></div>
    </div>`;
  document.body.appendChild(dlg);

  const pick = { what: "all", lang: lang };
  dlg.querySelectorAll(".rpt-set").forEach(set => {
    set.addEventListener("click", e => {
      const b = e.target.closest(".rpt-opt");
      if (!b) return;
      pick[set.dataset.k] = b.dataset.v;
      set.querySelectorAll(".rpt-opt").forEach(o =>
        o.setAttribute("aria-pressed", String(o === b)));
    });
  });
  const close = () => dlg.close();
  dlg.querySelector("#rptX").addEventListener("click", close);
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });

  const go = dlg.querySelector("#rptGo"), msg = dlg.querySelector("#rptMsg");
  go.addEventListener("click", async () => {
    go.disabled = true;
    msg.textContent = t("rpt.working");
    try {
      const { blob, filename } = await generateCountryReport(iso, pick);
      const url = URL.createObjectURL(blob);
      /* Un vrai lien a toucher plutot qu'un telechargement declenche : sur iOS,
         le geste de l'utilisateur a expire pendant les `await`, et l'attribut
         `download` d'une URL blob y est ignore. Le meme choix qu'app_deck.js. */
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.className = "btn primary"; a.textContent = t("rpt.ready");
      go.replaceWith(a);
      msg.textContent = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      msg.textContent = t("rpt.failed") + " " + err.message;
      go.disabled = false;
      console.error(err);
    }
  });
  if (dlg.showModal) dlg.showModal();
}
