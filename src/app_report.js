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
  return rptEmu((lines * sizePt * 1.32 + (spaceBefPt || 0)) / 72);
}

/* ---------- un empileur de blocs dans une colonne ---------- */
function rptColumn(x, y, wIn, idStart){
  return {
    x: x, y: y, w: rptEmu(wIn), wIn: wIn, id: idStart, sp: [],
    /* titre de rubrique : pastille de couleur, libelle noir, filet pointille */
    rub: function(label){
      const sz = 1300;
      this.sp.push(rptRect(this.id++, this.x, this.y + rptEmu(0.02),
        rptEmu(0.1), rptEmu(0.20), RPT_VIOLET));
      this.sp.push(rptTextBox(this.id++, this.x + rptEmu(0.18), this.y,
        this.w - rptEmu(0.18), rptH(1, 13, 0),
        [{ runs: [{ t: label, sz: sz, b: true, color: "000000" }] }]));
      this.y += rptH(1, 13, 0) + rptEmu(0.04);
      this.sp.push(rptDots(this.id++, this.x, this.y, this.w));
      this.y += rptEmu(0.09);
      return this;
    },
    /* sous-titre violet souligne */
    sub: function(label){
      const h = rptH(1, 9, 2);
      this.sp.push(rptTextBox(this.id++, this.x, this.y, this.w, h,
        [{ runs: [{ t: label, sz: 900, b: true, u: true, color: RPT_VIOLET }], space: 20 }]));
      this.y += h + rptEmu(0.02);
      return this;
    },
    /* une liste a puces */
    bullets: function(items, sizePt){
      if (!items || !items.length) return this;
      const sz = (sizePt || 8.5);
      const paras = items.map(it => ({
        runs: rptRuns(it, { sz: Math.round(sz * 100), b: false, i: false, color: "000000" }),
        align: "just", bullet: true, space: 20
      }));
      const lines = items.reduce((n, it) =>
        n + rptLines(it, this.wIn - 0.18, sz), 0);
      const h = rptH(lines, sz, items.length * 2);
      this.sp.push(rptTextBox(this.id++, this.x, this.y, this.w, h, paras));
      this.y += h + rptEmu(0.04);
      return this;
    },
    /* un intertitre simple, sans filet */
    line: function(label, sizePt, bold, color){
      const sz = sizePt || 8.8;
      const h = rptH(1, sz, 4);
      this.sp.push(rptTextBox(this.id++, this.x, this.y, this.w, h,
        [{ runs: [{ t: label, sz: Math.round(sz * 100), b: bold !== false,
                    color: color || "000000" }], space: 40 }]));
      this.y += h;
      return this;
    }
  };
}

/* ---------- l'en-tete commun aux trois slides de transposition ---------- */
function rptHead(col, c, lang){
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
  col.y += rptEmu(1.02);
}

function rptCountryName(c, lang){
  if (lang === "fr" && typeof DECK_FR_NAME !== "undefined" && DECK_FR_NAME[c.iso])
    return DECK_FR_NAME[c.iso];
  return c.nameEn || c.name;
}
function rptMaturity(n, lang){
  if (lang === "fr" && typeof DECK_MATURITY_CAPTION !== "undefined")
    return DECK_MATURITY_CAPTION[n] || "";
  return t("lvl." + n);
}

/* ================= le contenu des slides ================= */

/* Une valeur du classeur, prete a etre ecrite. Les cases vides et les « NC »
   ne sont pas ecrites du tout : une slide client n'a pas a afficher les trous
   de notre veille. Elles remontent en revanche dans le compte rendu. */
function rptCell(iso, key, col){
  const v = typeof ficheCell === "function" ? ficheCell(iso, key, col) : null;
  if (v == null || v === "NC") return null;
  return String(v);
}
function rptYes(v){ return v != null && /^(yes|oui|y)$/i.test(v); }

function rptSlide1(c, lang){
  const iso = c.iso, L = lang === "en";
  const left = rptColumn(rptEmu(0.45), rptEmu(0.32), 5.4, 100);
  rptHead(left, c, lang);

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

  const right = rptColumn(rptEmu(6.75), rptEmu(0.32), 5.9, 300);
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

  return { shapes: [rptRect(99, rptEmu(6.33), 0, RPT_W - rptEmu(6.33), RPT_H, RPT_GREY)]
    .concat(left.sp, right.sp) };
}

function rptSlide2(c, lang){
  const iso = c.iso, L = lang === "en";
  const left = rptColumn(rptEmu(0.45), rptEmu(0.32), 5.4, 100);
  rptHead(left, c, lang);
  left.rub(L ? "Additional sectors" : "Secteurs additionnels");
  left.bullets(rptSectors(iso, lang, "private"));
  left.rub(L ? "Public sectors" : "Secteurs publics");
  left.bullets(rptSectors(iso, lang, "public"));

  const right = rptColumn(rptEmu(6.75), rptEmu(0.32), 5.9, 300);
  right.rub(L ? "Correspondence with other regulations"
              : "Correspondance à d'autres réglementations");
  right.bullets(rptCorrespondence(c, iso, lang));
  right.rub(L ? "Registration process" : "Processus d'enregistrement");
  right.bullets(rptRegProcess(iso, lang));
  right.rub(L ? "Wavestone recommendations" : "Recommandations Wavestone");
  right.bullets(rptReco(c, iso, lang));

  return { shapes: [rptRect(99, rptEmu(6.33), 0, RPT_W - rptEmu(6.33), RPT_H, RPT_GREY)]
    .concat(left.sp, right.sp) };
}

function rptSlide3(c, lang){
  const L = lang === "en";
  const top = rptColumn(rptEmu(0.45), rptEmu(0.32), 12.4, 100);
  rptHead(top, c, lang);
  top.rub(L ? "Calendar of recent events" : "Calendrier des derniers événements");
  top.bullets(rptEvents(c, lang, 10), 8);

  const ySplit = Math.max(top.y + rptEmu(0.1), rptEmu(4.6));
  const bl = rptColumn(rptEmu(0.45), ySplit, 4.6, 500);
  bl.rub(L ? "Next steps" : "Prochaines étapes");
  bl.bullets((c.next || []).slice(0, 3));
  const br = rptColumn(rptEmu(5.6), ySplit + rptEmu(0.1), 6.2, 700);
  br.rub(L ? "Other important information" : "Autres informations importantes");
  br.bullets(rptOther(c, lang));

  return { shapes: [rptRect(99, rptEmu(5.35), ySplit - rptEmu(0.1),
      RPT_W - rptEmu(5.75), RPT_H - ySplit, RPT_GREY)]
    .concat(top.sp, bl.sp, br.sp) };
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
    "<b>" + (typeof fmtDateL === "function" ? fmtDateL(ev.date) : ev.date) + "</b> : "
    + (typeof evText === "function" ? evText(ev) : ev.text));
}

function rptFwLines(c, iso, lang){
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
  const L = lang === "en";
  const c = byIso[iso];
  const sec = (c.sections && c.sections.scope) || [];
  if (sec.length) return sec.slice(0, 4);
  return [L ? "No additional sector declared beyond Annexes I and II"
            : "Aucun secteur additionnel déclaré au-delà des annexes I et II"];
}

function rptCorrespondence(c, iso, lang){
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

async function generateCountryReport(iso, opts){
  const c = byIso[iso];
  if (!c) throw new Error("pays inconnu");
  if (typeof DECK_TEMPLATE_B64 === "undefined")
    throw new Error(t("rpt.noTemplate"));
  const lang = opts.lang || "fr";

  const wanted = [];
  if (opts.what !== "fw") wanted.push(rptSlide1(c, lang), rptSlide2(c, lang), rptSlide3(c, lang));
  if (opts.what !== "country") wanted.push(rptSlide4(c, lang));

  const bin = atob(DECK_TEMPLATE_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const entries = readZip(bytes);

  /* Les relations de la slide modele servent a toutes : elles pointent vers la
     disposition et les etiquettes, qui ne changent pas d'une slide a l'autre. */
  const model = entries.find(e => e.name === "ppt/slides/_rels/slide2.xml.rels");
  const relsRaw = model.method === 0 ? model.data : await inflateRaw(model.data);
  const relsXml = new TextDecoder().decode(relsRaw);

  const kept = entries.filter(e => !/^ppt\/slides\//.test(e.name));
  const enc = new TextEncoder();
  async function put(name, text){
    const out = enc.encode(text);
    kept.push({ name: name, method: 8, crc: crc32(out), rawSize: out.length,
                data: await deflateRaw(out) });
  }
  for (let i = 0; i < wanted.length; i++) {
    await put("ppt/slides/slide" + (i + 1) + ".xml", rptSlideXml(wanted[i]));
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
    x.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, "")
     .replace("</Types>", wanted.map((_, i) =>
       `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
     ).join("") + "</Types>"));

  const suffix = opts.what === "fw" ? " - framework" : opts.what === "country" ? " - transposition" : "";
  return { blob: writeZip(kept),
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
