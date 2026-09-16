/* ---------- la fiche pays, refondue ----------
 *
 * La fiche precedente aplatissait le classeur : une quinzaine de champs types,
 * puis des puces de prose ou le reste finissait melange. Chercher le delai de
 * notification d'un incident demandait de lire toute la page.
 *
 * Celle-ci epouse la structure du Cyber Watch : une section par feuille, une
 * ligne par colonne. Ce n'est pas un choix esthetique, c'est ce qui rend la
 * mise a jour mecanique - une case ajoutee au classeur apparait sans qu'on
 * retouche une table de correspondance, et un validateur qui connait le
 * classeur sait ou regarder sans apprendre une seconde organisation.
 *
 * Les donnees viennent de SHEET_DATA (tools/sheets_to_countries.py), qui porte
 * les 133 colonnes telles quelles. Les champs types de EXCEL_DATA restent la
 * source des tris, de la carte et des graphiques : les deux ne se marchent pas
 * dessus, ils ne repondent pas a la meme question.
 */

/* Les libelles du classeur sont en anglais et le resteront : c'est la langue de
   la source, et un validateur passe de l'un a l'autre. On traduit les champs
   mis en avant, pas les 133 - une traduction partielle mais juste vaut mieux
   qu'un dictionnaire de 133 entrees que personne ne tiendra a jour. Le reste
   s'affiche avec le libelle du classeur, ce qui a l'avantage d'etre verifiable. */
const FICHE_FR = {
  "inc!E": "Type d'organisme", "inc!F": "Nom de l'organisme",
  "inc!G": "Obligatoire à partir du", "inc!H": "Méthode",
  "inc!I": "Plateforme", "inc!J": "Informations demandées",
  "inc!M": "Définition de l'incident majeur", "inc!N": "Critères d'incident significatif",
  "inc!P": "Écart avec la directive", "inc!Q": "Délais de notification",
  "reg!D": "Enregistrement disponible", "reg!E": "Outil",
  "reg!F": "Autorité en charge", "reg!G": "Type d'enregistrement",
  "reg!H": "Échéance", "reg!I": "Méthode",
  "reg!J": "Délai d'enregistrement (mois)", "reg!K": "Délai de mise à jour (mois)",
  "reg!L": "Date de référence", "reg!M": "Notification d'éligibilité",
  "fw!D": "Référentiel publié", "fw!E": "Référentiel dédié à NIS 2",
  "fw!F": "Nom et lien", "fw!G": "Date de publication",
  "fw!H": "Classification des SI", "fw!I": "Règle de classification",
  "fw!J": "Thèmes cyber (EE)", "fw!K": "Thèmes cyber (EI)",
  "fw!L": "Exigences cyber (EE)", "fw!M": "Exigences cyber (EI)",
  "aud!D": "Audit prévu par la transposition", "aud!E": "Organisme en charge",
  "aud!F": "Typologie d'auditeurs", "aud!G": "Détail de l'organisme",
  "aud!I": "Auto-évaluation", "aud!J": "Première échéance",
  "aud!K": "Fréquence (mois)", "aud!U": "Raison d'un audit inopiné",
  "san!D": "Conforme aux sanctions de la directive", "san!E": "Interdiction d'exercer",
  "san!F": "Sanctions financières", "san!G": "Suspension de certification",
  "san!H": "Peines hors directive", "san!I": "Types de peines additionnelles"
};

/* Ce que chaque section met en avant, et ce qu'elle replie. Les colonnes sont
   nommees explicitement plutot que deduites : l'ordre de lecture d'une fiche
   n'est pas l'ordre des colonnes d'un tableur. */
const FICHE_SECTIONS = [
  { key: "inc", tKey: "fiche.inc", icon: "alert",
    primary: ["E", "F", "G", "H", "I", "J", "M", "N"] },
  { key: "reg", tKey: "fiche.reg", icon: "card",
    primary: ["D", "I", "E", "F", "G", "H", "J", "K", "L"],
    listKey: "fiche.regList",
    list: ["O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC"] },
  { key: "fw", tKey: "fiche.fw", icon: "shield",
    primary: ["D", "E", "F", "G", "H", "I"],
    listKey: "fiche.fwList",
    list: ["P", "Q", "R", "S", "T", "U", "V"] },
  { key: "aud", tKey: "fiche.aud", icon: "search",
    primary: ["D", "E", "G", "F", "U"],
    listKey: "fiche.audList",
    list: ["P", "Q", "R", "S", "T"] },
  { key: "san", tKey: "fiche.san", icon: "scale",
    primary: ["D", "F", "E", "G", "H", "I"],
    listKey: "fiche.sanList",
    list: ["J", "K", "L", "M", "N", "O", "P", "Q", "R", "S"] }
];

const FICHE_ICONS = {
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h5M7 13h8"/>',
  shield: '<path d="M12 3l8 3.5v5c0 4.6-3.2 8.6-8 9.5-4.8-.9-8-4.9-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M8.5 11l1.8 1.8 3.2-3.4"/>',
  scale: '<path d="M12 3v18M5 7h14M7 7l-3 6a3.5 3.5 0 0 0 6 0zM17 7l3 6a3.5 3.5 0 0 1-6 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  bank: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h8"/>',
  folder: '<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  bulb: '<path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z"/><path d="M10 20h4"/>',
  /* quatre barres croissantes : l'echelle de 1 a 4, et non un panneau
     d'avertissement, qui laissait croire a une alerte sur le pays */
  levels: '<path d="M5 20v-3M10 20v-7M15 20v-11M20 20V4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'
};
function ficheIcon(name, cls){
  return `<svg class="${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FICHE_ICONS[name] || ""}</svg>`;
}

/* ---------- lecture des cases ---------- */
function ficheOn(){ return typeof SHEET_DATA !== "undefined" && regId() === "nis2"; }
function ficheCell(iso, key, col){
  const row = (SHEET_DATA.rows || {})[iso];
  const bag = row && row[key];
  return (bag && bag[col] != null) ? bag[col] : null;
}
function ficheLabel(key, col){
  const fr = lang === "fr" ? FICHE_FR[key + "!" + col] : null;
  if (fr) return fr;
  const sheet = (SHEET_DATA.sheets || {})[key];
  const f = sheet && sheet.fields.find(x => x.c === col);
  return f ? f.l : col;
}
function ficheCols(key){
  const sheet = (SHEET_DATA.sheets || {})[key];
  /* La colonne C repete le niveau de maturite sur chaque feuille : il est deja
     dans l'en-tete de la fiche, l'afficher cinq fois n'apprend rien. */
  return sheet ? sheet.fields.map(f => f.c).filter(c => c !== "C") : [];
}

const FICHE_YES = /^(yes|oui|y)$/i;
const FICHE_NO = /^(no|non|n)$/i;

/* Une valeur telle que la fiche la montre. Une case vide et une case « NC »
   s'affichent toutes deux « Non communique », a la demande de l'equipe : une
   seule mention pour le lecteur. Elles gardent leurs classes distinctes. */
function ficheValue(v){
  if (v == null) return `<span class="fv-none">${t("fiche.empty")}</span>`;
  if (v === "NC") return `<span class="fv-nc">${t("fiche.nc")}</span>`;
  if (FICHE_YES.test(v)) return `<span class="ftag y">${t("fiche.yes")}</span>`;
  if (FICHE_NO.test(v)) return `<span class="ftag n">${t("fiche.no")}</span>`;
  const safe = esc(v).replace(/\n/g, "<br>");
  /* Plusieurs cases portent une URL au milieu d'une phrase. */
  return safe.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function ficheRows(iso, key, cols){
  const html = cols.map(col => {
    const label = ficheLabel(key, col);
    if (!label) return "";
    return `<div class="frow"><dt>${esc(label)}<span class="fcell">${key}!${col}</span></dt>
      <dd>${ficheValue(ficheCell(iso, key, col))}</dd></div>`;
  }).join("");
  return html ? `<dl class="frows">${html}</dl>` : "";
}

/* Une liste de cases oui/non, montree comme une liste a cocher : sur quinze
   lignes, un tableau de « YES / NO » se lit moins vite qu'une grille ou l'oeil
   ne cherche que les coches. Une valeur qui n'est ni oui ni non garde son
   texte, sinon on la perdrait en la forcant dans un pictogramme. */
const FICHE_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';
const FICHE_CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M8 8l8 8M16 8l-8 8"/></svg>';
const FICHE_DOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/></svg>';

/* Quatre etats, et une legende qui ne montre que ceux presents : le bleu
   (une reponse autre que oui ou non, recopiee a cote du libelle) ne se
   devinait pas, et « non communique » se confondait avec « non » sous la meme
   croix grise. */
const FICHE_Q = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5h.01"/></svg>';
function ficheList(iso, key, cols, titleKey){
  const seen = new Set();
  const items = cols.map(col => {
    const label = ficheLabel(key, col);
    if (!label) return "";
    const v = ficheCell(iso, key, col);
    if (v == null || v === "NC") {
      seen.add("nc");
      return `<div class="fck nc">${FICHE_Q}<span>${esc(label)}</span></div>`;
    }
    if (FICHE_YES.test(v)) { seen.add("on"); return `<div class="fck on">${FICHE_TICK}<span>${esc(label)}</span></div>`; }
    if (FICHE_NO.test(v)) { seen.add("off"); return `<div class="fck off">${FICHE_CROSS}<span>${esc(label)}</span></div>`; }
    seen.add("other");
    return `<div class="fck other">${FICHE_DOT}<span>${esc(label)} <b>${esc(v)}</b></span></div>`;
  }).join("");
  if (!items) return "";
  const legend = [["on", FICHE_TICK], ["other", FICHE_DOT], ["off", FICHE_CROSS], ["nc", FICHE_Q]]
    .filter(([k]) => seen.has(k))
    .map(([k, ic]) => `<span class="fck ${k}">${ic}${t("fiche.lg." + k)}</span>`).join("");
  const yes = cols.filter(c => { const v = ficheCell(iso, key, c); return v && FICHE_YES.test(v); }).length;
  return `<div class="fblock">
    <div class="flab">${t(titleKey)}<span class="fcell">${key}!${cols[0]}:${cols[cols.length - 1]}</span></div>
    <div class="fcks">${items}</div>
    <div class="fcklg">${legend}<span class="n">${t("fiche.listCount", { n: yes, total: cols.length })}</span></div>
  </div>`;
}

/* Deux barres comparees. Le classeur donne des nombres bruts ; les mettre cote
   a cote est ce qui les rend lisibles - « 152 » ne dit rien, « le double de
   l'autre » dit quelque chose. */
function ficheBars(iso, key, pairs, titleKey, noteKey, zoom){
  const vals = pairs.map(p => {
    const raw = ficheCell(iso, key, p.col);
    const n = raw != null && /^\d+([.,]\d+)?$/.test(String(raw)) ? parseFloat(String(raw).replace(",", ".")) : null;
    return { label: t(p.tKey), n, color: p.color, col: p.col };
  });
  const max = Math.max.apply(null, vals.map(v => v.n || 0));
  const any = vals.some(v => v.n != null);
  return `<div class="fblock">
    <div class="flab">${t(titleKey)}<span class="fcell">${key}!${pairs.map(p => p.col).join(" ")}</span>
      ${zoom && typeof FW_REQUIREMENTS !== "undefined" && FW_REQUIREMENTS[iso]
        ? `<button type="button" class="fzoom" data-fz="${zoom}" title="${esc(t("req.zoom"))}"
             aria-label="${esc(t("req.zoom"))}">${ficheIcon("search")}<span>${t("req.detail")}</span></button>` : ""}</div>
    <div class="fbars">${vals.map(v => `
      <div class="fbar">
        <span class="k">${esc(v.label)}</span>
        <span class="t">${v.n != null && max > 0 ? `<i style="width:${Math.max(3, v.n / max * 100)}%;background:${v.color}"></i>` : ""}</span>
        <span class="v${v.n == null ? " na" : ""}">${v.n != null ? v.n : t("fiche.emptyShort")}</span>
      </div>`).join("")}</div>
    ${any ? "" : `<div class="fnote">${t(noteKey)}</div>`}
  </div>`;
}

/* ---------- les delais de notification ----------
 * La directive fixe 24 h / 72 h / 1 mois. Le classeur ne stocke pas trois
 * dates mais deux choses : un pays s'ecarte-t-il de ce rythme, et si oui,
 * comment. On dessine donc le rythme de reference, et on dit ce que le pays en
 * fait - ce qui est plus juste que de deviner une frise a partir d'une phrase.
 */
function ficheTimeline(iso){
  const spec = ficheCell(iso, "inc", "P");
  const detail = ficheCell(iso, "inc", "Q");
  const aligned = spec != null && FICHE_NO.test(spec);
  const stops = [
    { h: "24 h", d: t("fiche.tl24") },
    { h: "72 h", d: t("fiche.tl72") },
    { h: t("fiche.tl1m"), d: t("fiche.tlFinal") }
  ];
  return `<div class="fblock">
    <div class="flab">${t("fiche.timeline")}<span class="fcell">inc!P inc!Q</span></div>
    <div class="ftl">
      <div class="axis"></div>
      <div class="stops">${stops.map(s => `
        <div class="stop"><div class="dot"></div><div class="h">${s.h}</div><div class="d">${s.d}</div></div>`).join("")}</div>
    </div>
    <div class="fnote">${aligned ? t("fiche.tlAligned")
      : detail && detail !== "NC" ? esc(detail).replace(/\n/g, "<br>")
      : t("fiche.tlUnknown")}</div>
  </div>`;
}

/* ---------- les secteurs des annexes I et II ----------
 * Le classeur n'a pas de feuille Secteurs : ce qui suit est le perimetre de la
 * directive, identique pour tous les pays, pas une donnee nationale. C'est dit
 * dans la fenetre elle-meme, faute de quoi un lecteur y verrait le perimetre
 * retenu par le pays qu'il consulte.
 */
/* Une icone par secteur, pas une icone generique repetee dix-huit fois : avec
   la meme pour tous, l'oeil devait lire chaque libelle pour trouver le sien. */
const SECT_ICONS = {
  energy: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  transport: '<rect x="4" y="3" width="16" height="13" rx="3"/><path d="M4 10h16M8 16l-2 5M16 16l2 5M8 13h.01M16 13h.01"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
  fmi: '<path d="M3 20h18M6 16l4-5 3 3 5-7"/><path d="M15 7h3v3"/>',
  health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  waste: '<path d="M4 16a8 8 0 0 0 14.9 1M20 8A8 8 0 0 0 5.1 7"/><path d="M20 3v5h-5M4 21v-5h5"/>',
  digital: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  ict: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  public: '<path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6"/>',
  space: '<path d="m4 20 5-5M14 4l6 6-5 5-6-6zM9 9 5 5M15 15l4 4"/>',
  post: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  garbage: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  chem: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 15h9"/>',
  food: '<path d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18M17 3c-1.7 1.2-2.5 3.5-2.5 6.5V13H17v8"/>',
  manu: '<path d="M3 21V10l6 4V10l6 4V6l6 4v11z"/>',
  provider: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  research: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3M11 8v6M8 11h6"/>'
};
const FICHE_EE = [
  ["energy", "sect.energy", "sect.energyD"], ["transport", "sect.transport", "sect.transportD"],
  ["bank", "sect.bank", "sect.bankD"], ["fmi", "sect.fmi", "sect.fmiD"],
  ["health", "sect.health", "sect.healthD"], ["water", "sect.water", "sect.waterD"],
  ["waste", "sect.waste", "sect.wasteD"], ["digital", "sect.digital", "sect.digitalD"],
  ["ict", "sect.ict", "sect.ictD"], ["public", "sect.public", "sect.publicD"],
  ["space", "sect.space", "sect.spaceD"]
];
const FICHE_EI = [
  ["post", "sect.post", "sect.postD"], ["garbage", "sect.garbage", "sect.garbageD"],
  ["chem", "sect.chem", "sect.chemD"], ["food", "sect.food", "sect.foodD"],
  ["manu", "sect.manu", "sect.manuD"], ["provider", "sect.provider", "sect.providerD"],
  ["research", "sect.research", "sect.researchD"]
];
/* Des lignes compactes plutot que des cartes : les dix-huit secteurs tiennent
   sans defilement, alors que l'annexe II etait coupee en bas de la fenetre sans
   que rien ne signale qu'elle continuait. */
/* Le perimetre retenu par le pays, lu dans la feuille « Sectors - P3 ».
 *
 * Chaque secteur porte au plus trois signaux : un sous-secteur de la directive
 * que le pays ne reprend pas (ecart), des sous-secteurs ajoutes (elargi), des
 * precisions sans changement de perimetre (precise). Sans aucun des trois, le
 * secteur est repris tel quel. L'eau potable n'a pas de colonne dans la
 * feuille : elle est dite « non suivie » plutot que presentee comme conforme.
 *
 * Le texte des ajouts et precisions est liste sous la grille, pas dans les
 * tuiles : une tuile de trois lignes de texte juridique cassait l'alignement et
 * noyait les dix-sept autres. */
function sectorState(iso, key){
  const row = typeof SECTOR_DATA !== "undefined" && SECTOR_DATA.rows[iso];
  if (!row) return null;
  const x = row[key];
  if (!x) return { tracked: false };
  const spec = SECTOR_DATA.sectors.find(s => s.k === key);
  const gaps = x.cov.map((v, i) => v === "NO" ? (spec.subs[i] || spec.name) : null).filter(Boolean);
  const nc = x.cov.length && x.cov.every(v => v === "NC" || v == null);
  const txt = v => v && v !== "NC" ? v : null;
  return { tracked: true, gaps, nc, add: txt(x.add), other: txt(x.other) };
}
function sectorTags(st){
  if (!st) return "";
  if (!st.tracked) return `<span class="stag mute">${t("sect.st.none")}</span>`;
  if (st.nc) return `<span class="stag mute">${t("sect.st.nc")}</span>`;
  const tags = [];
  if (st.gaps.length) tags.push(`<span class="stag gap">${t("sect.st.gap")}</span>`);
  if (st.add) tags.push(`<span class="stag add">${t("sect.st.add")}</span>`);
  if (st.other) tags.push(`<span class="stag oth">${t("sect.st.other")}</span>`);
  return tags.join("") || `<span class="stag same">${t("sect.st.same")}</span>`;
}
function ficheSectorsHtml(iso){
  const has = iso && typeof SECTOR_DATA !== "undefined" && SECTOR_DATA.rows[iso];
  const c = iso && byIso[iso];
  const states = {};
  FICHE_EE.concat(FICHE_EI).forEach(r => { states[r[0]] = has ? sectorState(iso, r[0]) : null; });
  const row = (r, cls) => `<li class="fs ${cls}">
      <span class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">${SECT_ICONS[r[0]] || ""}</svg></span>
      <span class="st"><b>${t(r[1])}</b><span>${t(r[2])}</span>
        ${has ? `<span class="stags">${sectorTags(states[r[0]])}</span>` : ""}</span></li>`;
  const block = (label, list, cls) => `<section class="fann-b ${cls}">
      <h3 class="fann"><i></i>${label}<span>${t("fiche.sectorsCount", { n: list.length })}</span></h3>
      <ul class="fgrid">${list.map(r => row(r, cls)).join("")}</ul></section>`;

  let details = "", summary = "";
  if (has) {
    const all = FICHE_EE.concat(FICHE_EI);
    const n = { same: 0, add: 0, other: 0, gap: 0 };
    const lines = [];
    all.forEach(r => {
      const st = states[r[0]];
      if (!st || !st.tracked || st.nc) return;
      if (!st.gaps.length && !st.add && !st.other) n.same++;
      if (st.add) n.add++;
      if (st.other) n.other++;
      if (st.gaps.length) n.gap++;
      const parts = [];
      if (st.gaps.length) parts.push(`<p><span class="stag gap">${t("sect.st.gap")}</span>${esc(t("sect.gapL", { list: st.gaps.join(", ") }))}</p>`);
      if (st.add) parts.push(`<p><span class="stag add">${t("sect.st.add")}</span>${esc(st.add)}</p>`);
      if (st.other) parts.push(`<p><span class="stag oth">${t("sect.st.other")}</span>${esc(st.other)}</p>`);
      if (parts.length) lines.push(`<li><b>${t(r[1])}</b>${parts.join("")}</li>`);
    });
    const extra = SECTOR_DATA.rows[iso]._new;
    summary = `<div class="fsum">
      <span><b>${n.same}</b> ${t("sect.sumSame")}</span>
      <span><i class="stag add"></i><b>${n.add}</b> ${t("sect.sumAdd")}</span>
      <span><i class="stag oth"></i><b>${n.other}</b> ${t("sect.sumOther")}</span>
      <span><i class="stag gap"></i><b>${n.gap}</b> ${t("sect.sumGap")}</span></div>`;
    details = `${extra && extra !== "NC" ? `<section class="fsnew">
        <h3 class="fann"><i></i>${t("sect.newTitle")}</h3><p>${esc(extra)}</p></section>` : ""}
      ${lines.length ? `<section class="fsdet"><h3 class="fann"><i></i>${t("sect.detTitle")}</h3>
        <ul>${lines.join("")}</ul></section>` : ""}`;
  }
  return `<div class="fmodal">
    <div class="fmodal-h"><h2>${c && has ? t("sect.titleC", { c: esc(c.name) }) : t("fiche.sectorsTitle")}</h2>
      <button class="x" type="button" id="ficheSecClose" aria-label="${t("fiche.close")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button></div>
    <div class="fmodal-b">
      ${summary}
      ${block(t("fiche.annex1"), FICHE_EE, "ee")}
      ${block(t("fiche.annex2"), FICHE_EI, "ei")}
      ${details}
      <p class="fmlg">${has ? t("sect.noteC", { date: fmtDateL(SECTOR_DATA.updated) }) : t("fiche.sectorsNote")}</p>
    </div></div>`;
}

/* ---------- le detail derriere les compteurs du referentiel ----------
 *
 * Deux onglets pour les deux graphiques. « Themes » liste les mesures du
 * referentiel national : c'est exactement ce que le compteur compte. « Exigences
 * » explique le compteur d'exigences avec les textes du fichier source, sans
 * repartir les 293 exigences par mesure : le fichier ne donne pas cette
 * repartition, et une ventilation inventee se lirait comme une donnee.
 *
 * Filtre EE / EI : pour les entites importantes, les mesures qui ne s'appliquent
 * qu'en version reduite restent visibles, grisees, avec la mention du fichier -
 * les masquer ferait croire qu'elles n'existent pas pour elles. */
let reqState = { tab: "themes", who: "ee" };

/* Le fichier ecrit « Requirements: essential entities face... » ; sans le
   prefixe, la phrase commencerait par une minuscule. */
function reqSentence(text, prefix){
  const s = String(text || "").replace(prefix, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function reqDialog(iso, tab){
  const R = FW_REQUIREMENTS[iso];
  if (!R) return;
  reqState = { tab: tab === "req" ? "req" : "themes", who: "ee" };
  let dlg = document.getElementById("ficheReq");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "ficheReq";
    document.body.appendChild(dlg);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }
  const c = byIso[iso];
  const draw = () => {
    const n = R.counts || {};
    const ms = R.measures || [];
    const groups = {};
    ms.forEach(m => { (groups[m.type || "-"] = groups[m.type || "-"] || []).push(m); });
    const who = reqState.who;
    const row = m => {
      const applies = who === "ee" ? m.ee : m.ie;
      const partial = who === "ie" && !m.ie;
      return `<li class="rq${partial ? " off" : ""}">
        <span class="rq-ref">${esc(m.ref)}</span>
        <span class="rq-b"><b>${esc(m.name)}</b><span>${esc(m.scope)}</span>
          <span class="rq-tags">
            ${m.ee ? `<i class="rq-t ee">EE</i>` : ""}
            ${m.ie ? `<i class="rq-t ie">EI</i>` : `<i class="rq-t no">${esc(t("req.ieReduced"))}</i>`}
            ${m.itot ? `<i class="rq-t it">${esc(m.itot)}</i>` : ""}
          </span></span>
      </li>`;
    };
    const themes = Object.keys(groups).map(g => {
      const list = groups[g];
      const count = list.filter(m => who === "ee" ? m.ee : m.ie).length;
      const k = "req.type." + g.toLowerCase(), label = t(k) === k ? g : t(k);
      return `<section class="rq-g"><h3>${esc(label)}
        <span>${t("req.groupCount", { n: count, total: list.length })}</span></h3>
        <ul>${list.map(row).join("")}</ul></section>`;
    }).join("");
    const reqTab = `
      <div class="rq-figs">
        <div><b>${n.reqEE != null ? n.reqEE : "—"}</b><span>${t("req.reqEE")}</span></div>
        <div><b>${n.reqIE != null ? n.reqIE : "—"}</b><span>${t("req.reqIE")}</span></div>
        ${n.reqEE && n.reqIE ? `<div><b>×${(n.reqEE / n.reqIE).toFixed(1).replace(".", lang === "fr" ? "," : ".")}</b><span>${t("req.ratio")}</span></div>` : ""}
      </div>
      ${R.texts.req ? `<p class="rq-p">${esc(reqSentence(R.texts.req, /^Requirements:\s*/))}</p>` : ""}
      ${R.texts.intro ? `<p class="rq-p">${esc(R.texts.intro)}</p>` : ""}
      ${R.texts.caveat ? `<div class="rq-caveat"><b>${t("req.caveat")}</b> ${esc(R.texts.caveat)}</div>` : ""}
      <p class="rq-p rq-hint">${t("req.noSplit", { n: ms.length })}</p>`;
    const themeTab = `
      ${R.texts.themes ? `<p class="rq-p">${esc(reqSentence(R.texts.themes, /^Themes:\s*/))}</p>` : ""}
      <div class="rq-who" role="group">
        <button type="button" data-who="ee" class="${who === "ee" ? "on" : ""}">${t("req.whoEE", { n: n.themesEE != null ? n.themesEE : ms.filter(m => m.ee).length })}</button>
        <button type="button" data-who="ie" class="${who === "ie" ? "on" : ""}">${t("req.whoIE", { n: n.themesIE != null ? n.themesIE : ms.filter(m => m.ie).length })}</button>
      </div>
      ${themes}`;
    dlg.innerHTML = `<div class="fmodal rq-modal">
      <div class="fmodal-h"><h2>${t("req.title", { country: esc(c ? c.name : iso) })}</h2>
        <button class="x" type="button" id="reqClose" aria-label="${t("fiche.close")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button></div>
      <div class="rq-tabs" role="tablist">
        <button type="button" role="tab" data-tab="themes" aria-selected="${reqState.tab === "themes"}">
          ${t("fiche.themeTitle")} <span>${n.themesEE != null ? n.themesEE : "—"} · ${n.themesIE != null ? n.themesIE : "—"}</span></button>
        <button type="button" role="tab" data-tab="req" aria-selected="${reqState.tab === "req"}">
          ${t("fiche.reqTitle")} <span>${n.reqEE != null ? n.reqEE : "—"} · ${n.reqIE != null ? n.reqIE : "—"}</span></button>
      </div>
      <div class="fmodal-b rq-b-wrap">
        ${reqState.tab === "req" ? reqTab : themeTab}
        ${R.sources && R.sources.length ? `<div class="rq-src"><b>${t("req.sources")}</b>${R.sources.map(x =>
          `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("")}</div>` : ""}
      </div></div>`;
    dlg.querySelector("#reqClose").addEventListener("click", () => dlg.close());
    dlg.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
      reqState.tab = b.dataset.tab; draw(); }));
    dlg.querySelectorAll("[data-who]").forEach(b => b.addEventListener("click", () => {
      reqState.who = b.dataset.who; draw(); }));
  };
  draw();
  if (!dlg.open && dlg.showModal) dlg.showModal();
}

/* ---------- les cinq bulles ---------- */
function ficheFacts(c){
  const iso = c.iso;
  const mat = c.maturity;
  /* Survoler le niveau en donne la definition, et l'echelle entiere : « niveau
     2 » ne dit rien seul, « 2 sur 4, projet de loi en discussion » dit ou en est
     le pays et ce qui lui manque pour monter. Les libelles sont ceux de la
     reglementation affichee (regLevelLabel), les memes que la legende de la
     carte et que les supports CYBER WATCH. */
  const matTip = `<div class="tip-mat"><b>${t("fiche.matTip", { n: mat })}</b>`
    + `<div class="tip-def">${esc(regLevelLabel(mat))}</div>`
    + `<div class="tip-scale">${[1, 2, 3, 4].map(l =>
        `<div class="${l === mat ? "on" : ""}"><i style="background:var(--m${l})"></i>`
        + `<span>${l}</span>${esc(regLevelLabel(l))}</div>`).join("")}</div></div>`;
  const bubbles = [
    { icon: "levels", lab: t("fiche.f.maturity"), cell: "id!D", tip: matTip,
      html: `<div class="fmat" style="--mc:var(--m${mat})"><b>${mat}</b>
        <span class="dots">${[1, 2, 3, 4].map(l => `<i class="${l <= mat ? "on" : ""}"></i>`).join("")}</span></div>` },
    { icon: "clock", lab: t("fiche.f.inForce"), cell: "id!E",
      html: c.lawInForce ? `<b>${fmtDateL(c.lawInForce)}</b>` : ficheValue(ficheCell(iso, "id", "E")) },
    { icon: "card", lab: t("fiche.f.docType"), cell: "id!J",
      html: ficheValue(ficheCell(iso, "id", "J")) },
    { icon: "book", lab: t("fiche.f.mainText"), cell: "id!K", small: true,
      html: ficheValue(ficheCell(iso, "id", "K")) },
    { icon: "folder", lab: t("fiche.f.extraText"), cell: "id!L", small: true,
      html: ficheValue(ficheCell(iso, "id", "L")) }
  ];
  return `<div class="ffacts">${bubbles.map(b => `
    <div class="ffact${b.tip ? " has-tip" : ""}"${b.tip ? ` data-tip="${kpiEsc(b.tip)}" tabindex="0"` : ""}>
      <div class="ic">${ficheIcon(b.icon)}</div>
      <div class="lbl">${b.lab}<span class="fcell">${b.cell}</span></div>
      <div class="val${b.small ? " sm" : ""}">${b.html}</div>
    </div>`).join("")}</div>`;
}

/* ---------- la fiche ---------- */
function renderFiche(c, el){
  const iso = c.iso;
  const docs = (typeof COUNTRY_DOCS !== "undefined" && COUNTRY_DOCS[iso]) || null;

  const sections = FICHE_SECTIONS.map(s => {
    const shown = s.primary.concat(s.list || []);
    const rest = ficheCols(s.key).filter(col => shown.indexOf(col) < 0);
    const filled = s.primary.concat(s.list || []).concat(rest)
      .filter(col => ficheCell(iso, s.key, col) != null).length;
    const total = ficheCols(s.key).length;

    let extras = "";
    if (s.key === "inc") extras += ficheTimeline(iso);
    if (s.key === "fw") {
      extras += ficheBars(iso, "fw",
        [{ col: "L", tKey: "fiche.ee", color: "var(--ee)" },
         { col: "M", tKey: "fiche.ie", color: "var(--ie)" }],
        "fiche.reqTitle", "fiche.barsEmpty", "req");
      extras += ficheBars(iso, "fw",
        [{ col: "J", tKey: "fiche.ee", color: "var(--ee)" },
         { col: "K", tKey: "fiche.ie", color: "var(--ie)" }],
        "fiche.themeTitle", "fiche.barsEmpty", "themes");
    }
    if (s.key === "fw" && typeof mapForCountry === "function") {
      const maps = mapForCountry(iso);
      if (maps.length) extras += `<div class="fblock"><div class="flab">${t("map.onFiche")}</div>
        <div class="fmap">${maps.map(m => `<a href="#/mapping/${m.pid}~${m.dir}">
          <span class="l">${t("map.ficheLine", { to: "<b>" + esc(m.d.to.name) + "</b>",
            from: "<b>" + esc(m.d.from.name) + "</b>", pct: "<b>" + mapPct(m.d.avg) + "</b>" })}</span>
          ${mapStack(m.d.counts, m.d.n, false).split('<div class="mp-legend">')[0]}
          <span class="fnote" style="margin:0">${t("map.ficheGaps", { n: m.d.counts.none, total: m.d.n })}</span>
        </a>`).join("")}</div></div>`;
    }
    if (s.key === "aud")
      extras += `<div class="fblock"><div class="flab">${t("fiche.selfAssess")}<span class="fcell">aud!I:K</span></div>
        ${ficheRows(iso, "aud", ["I", "J", "K"])}</div>`;
    if (s.list) extras += ficheList(iso, s.key, s.list, s.listKey);

    return `<section class="fsec" id="fsec-${s.key}" data-fsec="${s.key}">
      <div class="fsec-h">
        <div class="ic">${ficheIcon(s.icon)}</div>
        <h2>${t(s.tKey)}</h2>
        <span class="cnt">${t("fiche.filled", { n: filled, total: total })}</span>
      </div>
      <div class="fsec-b">
        ${ficheRows(iso, s.key, s.primary)}
        ${extras}
        ${rest.length ? `<div class="fmore">
          <button type="button" class="fmore-t" aria-expanded="false">
            ${t("fiche.more", { n: rest.length })}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="finner" hidden>${ficheRows(iso, s.key, rest)}</div>
        </div>` : ""}
      </div>
    </section>`;
  }).join("");

  const statusPill = c.transposed
    ? `<span class="fpill ok">${t("fiche.transposed")}</span>`
    : `<span class="fpill no">${t("cp.notTransposed")}</span>`;
  /* Un retard nul n'est pas un retard : la Belgique, transposee a temps,
     affichait « 0 mois de retard » sur fond d'avertissement. */
  const delay = c.delayMonths > 0
    ? `<span class="fpill wip">${t("fiche.delay", { n: c.delayMonths })}</span>` : "";

  el.innerHTML = `
  <a class="back" href="#/countries">${t("cp.back")}</a>
  <div class="fhead">
    <span class="fflag">${flagSvg(iso)}</span>
    <div class="fhead-txt">
      <h1>${esc(c.name)}</h1>
      <div class="fpills">
        ${statusPill}${delay}
        <span class="fpill upd">${ficheIcon("clock")}${t("fiche.upd", { date: fmtDate(c.lastUpdate) })}</span>
        <label class="fcellsw"><input type="checkbox" id="ficheCells"> ${t("fiche.showCells")}</label>
        ${role === "validator" ? `<button class="btn fdeck" id="rptBtn">${t("rpt.go")}</button>` : ""}
      </div>
    </div>
  </div>

  ${ficheFacts(c)}

  <div class="fcols">
    <div>
      <div class="fnav" id="ficheNavWrap"><div class="fnav-in" id="ficheNav">
        <a class="fnav-back" href="#/countries" title="${t("cp.back")}" aria-label="${t("cp.back")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
        </a>
        <span class="fnav-id"><span class="fnav-flag">${flagSvg(iso)}</span><b>${esc(c.name)}</b></span>
        <span class="fnav-sep"></span>
        ${FICHE_SECTIONS.map(s => `<button type="button" data-fgo="${s.key}">
          ${ficheIcon(s.icon)}${t(s.tKey)}</button>`).join("")}
        ${role === "validator" ? `<button type="button" class="fnav-rpt" id="rptBtnNav"
          title="${esc(t("rpt.navTitle"))}">${ficheIcon("download")}<span>${t("rpt.go")}</span></button>` : ""}
      </div></div>
      ${sections}

      <div class="freco">
        <div class="freco-h">${ficheIcon("bulb")}<h2>${t("fiche.reco")}</h2>
          <span class="by">${t("fiche.recoBy")}</span></div>
        <div class="freco-b"><div class="none">${t("fiche.recoNone")}</div></div>
      </div>
    </div>

    <div class="fasidew" id="ficheAsideW">
      <div class="ffade up"></div>
      <button class="fhint up" type="button" id="ficheHintUp">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
        ${t("fiche.scrollUp")}
      </button>
      <aside class="faside" id="ficheAside">
        <div class="card"><div class="cap"><h2>${t("cp.timeline")}</h2></div><div class="bd">
          <ul class="ftl-list">${[...c.timeline].sort((a, b) => b.date < a.date ? -1 : 1).map(ev => `
            <li><span class="when">${fmtDateL(ev.date)}</span><span class="what">${esc(evText(ev))}</span></li>`).join("")}
          </ul>
        </div></div>

        <div class="card"><div class="cap"><h2>${t("cp.authorities")}</h2></div><div class="bd auth">
          ${c.authorities.map(a => `<div class="a"><b>${esc(a.name)}</b><span>${esc(a.role)}</span></div>`).join("")}
        </div></div>

        <div class="card"><div class="cap"><h2>${t("fiche.sectors")}</h2></div><div class="bd">
          <button class="fbtn" type="button" id="ficheSecOpen">${t("fiche.sectorsBtn")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7"/></svg>
          </button>
        </div></div>

        ${docs && docs.folderUrl ? `<div class="card"><div class="cap"><h2>${t("docs.title")}</h2></div><div class="bd">
          <a class="fbtn ghost" href="${esc(docs.folderUrl)}" target="_blank" rel="noopener">${t("fiche.folder")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
          </a>
        </div></div>` : ""}

        <div class="card"><div class="cap"><h2>${t("cp.sources")}</h2></div><div class="bd srcs">
          ${c.sources.map(s => `<div class="s">${srcChip(s.type)}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</div>`).join("")}
        </div></div>
      </aside>
      <div class="ffade down"></div>
      <button class="fhint down" type="button" id="ficheHint">${t("fiche.scrollDown")}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
      </button>
    </div>
  </div>

  <dialog id="ficheSectors">${ficheSectorsHtml(iso)}</dialog>`;

  ficheWire(el);
  /* La generation du rapport, reservee au validateur. app_report.js remplace
     l'ancien bouton a slide unique : quatre slides, un choix de contenu et de
     langue. L'ancien generateur reste en place pour la fiche d'origine (REC). */
  /* Le meme dialogue depuis la barre collante : une fois l'en-tete sorti de
     l'ecran, le bouton du haut n'est plus a portee, et c'est souvent apres avoir
     relu la fiche qu'on decide de generer les slides. */
  el.querySelectorAll(".fzoom").forEach(b =>
    b.addEventListener("click", () => reqDialog(iso, b.dataset.fz)));
  ["#rptBtn", "#rptBtnNav"].forEach(sel => {
    const rb = $(sel, el);
    if (rb && typeof reportDialog === "function")
      rb.addEventListener("click", () => reportDialog(iso));
  });
}

/* Etat du reperage, partage entre les rendus : voir le commentaire dans
   ficheWire() sur l'ecouteur unique. */
let ficheSpy = null;
let ficheScrollBound = false;

/* La hauteur de l'en-tete colle de l'application, mesuree et publiee en
   variable CSS. Elle commande trois choses qui doivent s'accorder : ou la barre
   d'ancres se colle, ou un lien d'ancre depose la page, et ou commence la
   colonne de droite. Les coder en dur les faisait diverger des que l'en-tete
   changeait de hauteur - ce qu'il fait a chaque palier responsive. */
let ficheHdrH = 96;
function ficheHeader(){
  const hdr = document.querySelector("header.app");
  const nav = document.querySelector(".fnav-in");
  const root = document.documentElement;
  const h = hdr ? Math.round(hdr.getBoundingClientRect().height) : 96;
  ficheHdrH = h;
  root.style.setProperty("--fhdr", h + "px");
  root.style.setProperty("--fnavh", (nav ? Math.round(nav.getBoundingClientRect().height) : 52) + "px");
  return h;
}

function ficheWire(el){
  /* --- infobulles : a la souris comme au clavier ---
     kpiWireTips suit le curseur ; au clavier il n'y en a pas, l'infobulle se
     place alors sous la bulle qui a le focus. */
  if (typeof kpiWireTips === "function") kpiWireTips(el);
  el.querySelectorAll(".ffact.has-tip").forEach(n => {
    n.addEventListener("focus", () => {
      const r = n.getBoundingClientRect();
      showTip(n.dataset.tip, r.left, r.bottom);
    });
    n.addEventListener("blur", hideTip);
  });

  /* --- cases source --- */
  const sw = $("#ficheCells", el);
  if (sw) {
    /* Le reglage survit au changement de pays : il est porte par le corps de la
       page, pas par la fiche, qui est reconstruite a chaque navigation. */
    sw.checked = document.body.classList.contains("fcells");
    sw.addEventListener("change", () => {
      document.body.classList.toggle("fcells", sw.checked);
    });
  }

  /* --- blocs replies --- */
  el.querySelectorAll(".fmore-t").forEach(b => b.addEventListener("click", () => {
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    b.parentNode.querySelector(".finner").hidden = open;
  }));

  /* --- secteurs --- */
  const dlg = $("#ficheSectors", el);
  const open = $("#ficheSecOpen", el);
  if (dlg && open) {
    open.addEventListener("click", () => { if (dlg.showModal) dlg.showModal(); });
    const x = $("#ficheSecClose", el);
    if (x) x.addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }

  /* --- reperage des sections ---
     La section courante est la derniere dont le haut est passe au-dessus de la
     ligne de lecture. Un calcul, pas un evenement : marquer sur « entre dans le
     champ de vision » laisse plusieurs sections se declarer au meme instant, et
     c'est la derniere traitee qui l'emporte - donc celle du bas, jamais celle
     qu'on vient d'atteindre. */
  const nav = $("#ficheNav", el);
  const secs = [...el.querySelectorAll(".fsec")];
  if (!nav || !secs.length) return;
  const btns = [...nav.querySelectorAll("button")];
  /* La ligne de lecture suit l'en-tete : sous lui, plus la barre d'ancres. */
  const lineOf = () => ficheHeader() +
    (nav.getBoundingClientRect().height || 52) + 12;

  const mark = k => btns.forEach(b =>
    b.setAttribute("aria-current", b.dataset.fgo === k ? "true" : "false"));

  function current(){
    let cur = secs[0];
    const line = lineOf();
    secs.forEach(s => { if (s.getBoundingClientRect().top <= line) cur = s; });
    /* Une derniere section plus courte que l'ecran ne franchit jamais la ligne. */
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)
      cur = secs[secs.length - 1];
    return cur;
  }

  /* L'etat de defilement vit au niveau du module, pas de la fiche : chaque
     navigation vers un pays reconstruit le DOM, et attacher un ecouteur de
     defilement a chaque rendu en accumulerait un par pays visite. Un seul
     ecouteur est pose (ficheScrollBound), et il lit ce que la fiche courante y
     a depose. */
  ficheHeader();
  /* Le nom du pays et le retour rejoignent la barre d'ancres des que l'en-tete
     sort de l'ecran. Les y mettre en permanence repeterait, a dix pixels
     d'intervalle, ce que le titre dit deja en plus gros ; une troisieme barre
     collante mangerait le tiers de la hauteur utile. */
  const navWrap = $("#ficheNavWrap", el);
  const head = el.querySelector(".fhead");
  const stick = () => {
    if (!navWrap || !head) return;
    /* ficheHdrH plutot que getComputedStyle : cette fonction tourne a chaque
       image de defilement, et lire une variable CSS y force un recalcul de
       style a chaque passage. */
    const passed = head.getBoundingClientRect().bottom <= ficheHdrH;
    navWrap.classList.toggle("stuck", passed);
  };
  stick();
  ficheSpy = { secs: secs, mark: mark, current: current, lock: 0, stick: stick };
  if (!ficheScrollBound) {
    ficheScrollBound = true;
    /* Pose une seule fois, comme l'ecouteur de defilement et pour la meme
       raison : ficheWire() s'execute a chaque pays consulte. */
    window.addEventListener("resize", ficheHeader, { passive: true });
    let tick = false;
    window.addEventListener("scroll", () => {
      if (tick || !ficheSpy) return;
      tick = true;
      requestAnimationFrame(() => {
        tick = false;
        const sp = ficheSpy;
        if (!sp || !document.body.contains(sp.secs[0])) return;
        /* L'identite suit le defilement meme pendant un saut d'ancre : c'est le
           marquage de la section active qui est gele, pas la barre elle-meme. */
        sp.stick();
        if (Date.now() < sp.lock) return;
        sp.mark(sp.current().dataset.fsec);
      });
    }, { passive: true });
  }
  mark(secs[0].dataset.fsec);

  nav.addEventListener("click", e => {
    const b = e.target.closest("button[data-fgo]");
    if (!b) return;
    const target = $("#fsec-" + b.dataset.fgo, el);
    if (ficheSpy) ficheSpy.lock = Date.now() + 800;
    mark(b.dataset.fgo);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* --- la colonne de droite defile, et le dit --- */
  const aside = $("#ficheAside", el), wrap = $("#ficheAsideW", el);
  if (aside && wrap) {
    /* Les deux bords se signalent, pas seulement le bas : arrive en bas de la
       colonne, rien n'indiquait que la chronologie etait restee au-dessus, et
       une colonne qui a son propre defilement ne remonte pas avec la page. */
    const state = () => {
      const fits = aside.scrollHeight <= aside.clientHeight + 4;
      const bottom = aside.scrollTop + aside.clientHeight >= aside.scrollHeight - 4;
      wrap.classList.toggle("at-end", fits || bottom);
      wrap.classList.toggle("at-start", fits || aside.scrollTop <= 4);
    };
    aside.addEventListener("scroll", state, { passive: true });
    window.addEventListener("resize", state, { passive: true });
    const step = dir => aside.scrollBy({
      top: dir * Math.round(aside.clientHeight * 0.72), behavior: "smooth" });
    const down = $("#ficheHint", el);
    if (down) down.addEventListener("click", () => step(1));
    const up = $("#ficheHintUp", el);
    if (up) up.addEventListener("click", () => step(-1));
    state();
  }
}
