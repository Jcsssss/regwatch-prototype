/* ================= One tool, several regulations =================
 *
 * RegWatch started as a NIS 2 tool and the data model was generic from the
 * start; this is where that promise gets cashed in. Each regulation brings its
 * own data files (src/reg/<id>/) and its own spec, and the app reads whichever
 * one is active.
 *
 * The spec is what keeps REC from being either a clone or a fork. Three things
 * differ between regulations and nothing else does:
 *
 *   which tabs exist    REC has no watch agent yet, so it has no inbox and no
 *                       sources tab. Showing empty ones would be worse than
 *                       not showing them.
 *   which fields matter NIS 2 counts cyber requirements and audit frequencies;
 *                       REC turns on whether the state designated its critical
 *                       entities. Forcing one shape on both would leave a dozen
 *                       empty columns on each side.
 *   what a level means  The 1-4 maturity scale is shared - which is lucky and
 *                       not accidental, both workbooks use it - but the wording
 *                       of each level is per regulation.
 *
 * Everything else - the map, the country list, the level chips, the ordering,
 * the charts, the slide generator - is written against the core fields and
 * needs no branch.
 *
 * Adding DORA later means: a src/reg/dora/ folder, one entry here, and nothing
 * else. If that stops being true, this file is where the leak is.
 */
"use strict";

/* The core every regulation fills: iso, name, flag, region, eu, maturity,
   lastUpdate, summary, transposed, lawInForce, law, authorities, sections,
   timeline, sources. Anything beyond that belongs in the regulation's own
   block and is declared in `facts` below. */

const REG_SPECS = {
  nis2: {
    id: "nis2",
    label: "NIS 2",
    full: "Directive (EU) 2022/2555 - transposition deadline 17 Oct 2024",
    titleKey: "ov.title", subKey: "ov.sub", footKey: "foot.nis2",
    countries: () => [...COUNTRIES_1, ...COUNTRIES_2, ...COUNTRIES_3, ...COUNTRIES_4],
    tabs: ["overview", "countries", "inbox", "insights", "sources"],
    levels: {
      1: "lvl.1", 2: "lvl.2", 3: "lvl.3", 4: "lvl.4"
    },
    /* The country page's fact grid, in order. `v` reads the record. */
    facts: [
      { k: "reg.f.law", v: c => c.law },
      { k: "reg.f.inForce", v: c => c.lawInForce, date: true },
      { k: "reg.f.framework", v: c => c.fwName },
      { k: "reg.f.reqEE", v: c => c.reqEE },
      { k: "reg.f.reqIE", v: c => c.reqIE },
      { k: "reg.f.auditBody", v: c => c.auditBody },
      { k: "reg.f.regTool", v: c => c.regTool },
      { k: "reg.f.incident", v: c => c.incidentMethod }
    ],
    sections: ["fw", "reg", "inc", "aud", "scope", "other", "reco"]
  },

  rec: {
    id: "rec",
    label: "REC",
    full: "Directive (EU) 2022/2557 - resilience of critical entities",
    titleKey: "ov.recTitle", subKey: "reg.recSub", footKey: "foot.rec",
    countries: () => (typeof REC_COUNTRIES === "undefined" ? [] : REC_COUNTRIES),
    /* No watch agent for REC yet, so no inbox: a validation queue with nothing
       to validate is a dead end. Sources and the assistant do earn their place -
       Sources shows the authorities the workbook already names, which is the
       seed of the future REC registry, and the assistant's country tools read
       whichever records are active, so they work here unchanged. */
    tabs: ["overview", "countries", "insights", "sources"],
    levels: {
      1: "recLvl.1", 2: "recLvl.2", 3: "recLvl.3", 4: "recLvl.4"
    },
    facts: [
      { k: "reg.f.law", v: c => c.law },
      { k: "reg.f.inForce", v: c => c.lawInForce || (c.rec || {}).inForceNote, date: true },
      { k: "reg.f.progress", v: c => (c.rec || {}).progress },
      { k: "reg.f.criticality", v: c => (c.rec || {}).criticality },
      { k: "reg.f.recRegistration", v: c => (c.rec || {}).registration },
      { k: "reg.f.alignment", v: c => (c.rec || {}).alignment }
    ],
    sections: ["reg", "prog", "other"],
    /* Said once on the REC pages rather than in every answer: the module is a
       first pass over a younger workbook, and a reader should know that before
       quoting a blank as a fact. */
    caveat: "reg.recCaveat"
  }
};

const REG_ORDER = ["nis2", "rec"];
const REG_PLANNED = [
  { label: "DORA", full: "Regulation (EU) 2022/2554 - planned module" },
  { label: "CRA", full: "Cyber Resilience Act - planned module" }
];

/* The active regulation. Kept in the store so a reload lands where you left,
   and read before the first render. */
function regId(){
  const id = (store.reg || "nis2");
  return REG_SPECS[id] ? id : "nis2";
}
function regSpec(){ return REG_SPECS[regId()]; }
/* Les onglets techniques n'appartiennent à aucune réglementation : ils
   décrivent l'outil lui-même. Le dire ici plutôt que chez chaque appelant évite
   que la barre d'onglets et le routage divergent - ce qu'ils faisaient : la
   barre les montrait, le routage les refusait au chargement, et recharger la
   page depuis l'onglet Diagnostic ramenait à l'accueil.

   Les deux ne suivent pas la même règle. L'assistant technique parle
   d'architecture et de code : il reste le métier du Développeur. Le diagnostic,
   lui, ne dit que ce que le navigateur courant déclare de lui-même - c'est ce
   qu'on demande à quelqu'un qui signale un problème, quel que soit son rôle.
   Le réserver au Développeur obligeait un lecteur à changer de rôle pour lire
   une information qui le concerne. Il suit donc la roue crantée (diagOn), pas
   le rôle - y compris pour le Développeur, pour qu'il n'y ait qu'une règle à
   connaître et un seul endroit où l'onglet apparaît et disparaît. */
function regHasTab(v){
  if (v === "dev") return diagOn();
  if (v === "devchat") return role === "developer";
  /* La file de veille est le poste de travail du validateur : elle ne contient
     que des elements incertains, et ceux qui sont tranches sont deja lisibles
     dans la chronologie de la fiche pays concernee. Un lecteur y voyait une
     liste plate d'items traites, sans le geste qui lui donne son sens, et
     pouvait en conclure qu'un element rejete faisait partie du suivi. On ne
     montre rien d'incertain a un lecteur : c'est la regle que la documentation
     enoncait deja, et que le code ne tenait pas.

     Les deux conditions se cumulent : REC n'a pas encore d'agent, donc pas de
     file, et un validateur ne doit pas y trouver un onglet vide. */
  if (v === "inbox") return role !== "reader" && regSpec().tabs.includes(v);
  return regSpec().tabs.includes(v);
}

/* `COUNTRIES` and `byIso` are what every view reads; switching regulation
   swaps them rather than threading a parameter through the whole app. */
function regApply(){
  const spec = regSpec();
  COUNTRIES = spec.countries();
  byIso = Object.fromEntries(COUNTRIES.map(c => [c.iso, c]));
  /* Chaque réglementation apporte ses propres enregistrements : ceux de REC
     n'ont pas encore été renommés dans la langue courante. */
  if (typeof applyCountryNames === "function") applyCountryNames();
}

function setRegulation(id){
  if (!REG_SPECS[id] || id === regId()) return;
  store.reg = id;
  saveStore();
  /* A transcript half about one directive and half about another invites the
     model to blend them. Switching starts a clean conversation. */
  if (typeof chatLog !== "undefined") { chatLog = []; chatWire = []; }
  regApply();
  regRenderPills();
  regSyncTabs();
  regFooter();
  /* Land somewhere that exists in the new regulation. */
  const here = parseHash();
  route(regHasTab(here.v) ? here.v : "overview",
        regHasTab(here.v) ? here.arg : null);
}

/* Tabs the active regulation does not have are hidden, not disabled: a greyed
   tab invites a click that cannot be honoured. */
function regSyncTabs(){
  document.querySelectorAll("nav.tabs a").forEach(a => {
    a.hidden = !regHasTab(a.dataset.v);
  });
}

function regRenderPills(){
  const host = $(".reg-pills");
  if (!host) return;
  const active = regId();
  host.innerHTML =
    REG_ORDER.map(id => {
      const s = REG_SPECS[id];
      return `<button class="reg-pill${id === active ? " active" : ""}" data-reg="${id}"
        title="${esc(s.full)}" aria-pressed="${id === active}">${esc(s.label)}</button>`;
    }).join("") +
    REG_PLANNED.map(p =>
      `<button class="reg-pill soon" title="${esc(p.full)}" disabled>${esc(p.label)}</button>`).join("");
  host.querySelectorAll("[data-reg]").forEach(b =>
    b.addEventListener("click", () => setRegulation(b.dataset.reg)));
}

/* The level wording is per regulation; everything that draws a level goes
   through here so a REC level 3 never reads as a NIS 2 level 3. */
function regLevelLabel(n){
  const key = regSpec().levels[n];
  return key ? t(key) : "";
}

/* The footer says where the data came from, which is not the same sentence for
   two regulations built from two different workbooks. */
function regFooter(){
  const el = $("#footSrc");
  if (el) el.textContent = t(regSpec().footKey);
}
