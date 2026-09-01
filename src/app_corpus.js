/* ================= What the assistant is allowed to know =================
 *
 * The model never sees the corpus in its prompt. It calls these functions and
 * reads what comes back - which is the whole safety story: an answer can only
 * repeat something a tool returned, and every returned item carries where it
 * came from, so a claim about Croatian audit frequency can be traced to the
 * Croatian record rather than to the model's memory of the directive.
 *
 * The corpus is small enough that none of this needs embeddings or a vector
 * store: 29 country records (~27k tokens all told), 957 KPI rows, 118 watch
 * items. A question naming one country pulls about a thousand tokens.
 *
 * Every function returns a plain object. app_chat.js serialises it to JSON and
 * hands it back to the model as a tool result.
 */
"use strict";

/* Returned lists are capped: a tool result that fills the context window
   crowds out the conversation and costs more than it explains. */
const CORPUS_MAX_HITS = 24;

const SECTION_NAMES = {
  fw: "Cybersecurity framework", reg: "Registration", inc: "Incident reporting",
  aud: "Audit and controls", scope: "Scope", other: "Other", reco: "Recommendations"
};

const CORPUS_LEVELS = {
  1: "Transposition not finalised, no cyber framework available",
  2: "Transposition under way, framework still partial",
  3: "Law adopted, cyber framework being finalised",
  4: "Law approved and cyber framework available in its latest version"
};

/* Country names, ISO codes and the spellings a consultant actually types.
   "Czech Republic" and "Tchéquie" have to reach the same record. */
const CORPUS_ALIASES = {
  FR: ["france"], DE: ["germany", "allemagne", "deutschland"], IT: ["italy", "italie", "italia"],
  ES: ["spain", "espagne", "españa"], BE: ["belgium", "belgique"], NL: ["netherlands", "pays-bas", "holland"],
  PT: ["portugal"], PL: ["poland", "pologne"], CZ: ["czechia", "czech republic", "tchequie", "tchéquie"],
  AT: ["austria", "autriche"], HR: ["croatia", "croatie", "hrvatska"], GR: ["greece", "grece", "grèce"],
  HU: ["hungary", "hongrie"], IE: ["ireland", "irlande"], SE: ["sweden", "suede", "suède"],
  DK: ["denmark", "danemark"], FI: ["finland", "finlande"], NO: ["norway", "norvege", "norvège"],
  EE: ["estonia", "estonie"], LV: ["latvia", "lettonie"], LT: ["lithuania", "lituanie"],
  LU: ["luxembourg"], MT: ["malta", "malte"], CY: ["cyprus", "chypre"], BG: ["bulgaria", "bulgarie"],
  RO: ["romania", "roumanie"], SK: ["slovakia", "slovaquie"], SI: ["slovenia", "slovenie", "slovénie"],
  GB: ["united kingdom", "uk", "royaume-uni", "great britain"]
};

function corpusResolveIso(term){
  const q = String(term || "").trim().toLowerCase();
  if (!q) return null;
  if (byIso[q.toUpperCase()]) return q.toUpperCase();
  for (const iso in CORPUS_ALIASES) {
    if (CORPUS_ALIASES[iso].some(a => a === q)) return iso;
  }
  const c = COUNTRIES.find(x => x.name.toLowerCase() === q);
  if (c) return c.iso;
  /* Last resort, a prefix match: "Neth" should still find the Netherlands. */
  const p = COUNTRIES.find(x => x.name.toLowerCase().startsWith(q))
    || Object.keys(CORPUS_ALIASES).find(iso => CORPUS_ALIASES[iso].some(a => a.startsWith(q)));
  return p ? (p.iso || p) : null;
}

function corpusIsos(list){
  if (!list || !list.length) return COUNTRIES.map(c => c.iso);
  return [...new Set(list.map(corpusResolveIso).filter(Boolean))];
}

/* ---------- the tools ---------- */

/* One line per country: enough to answer "who is late" or "which countries use
   an accredited body" without pulling 29 full records. */
function corpusListCountries(){
  return {
    note: "One line per country. Call get_country for the detail behind any of these.",
    countries: COUNTRIES.map(c => ({
      iso: c.iso, country: c.name, region: c.region, inEU: c.eu,
      maturity: c.maturity, maturityMeans: CORPUS_LEVELS[c.maturity],
      transposed: c.transposed, lawInForce: c.lawInForce || null,
      monthsLate: c.delayMonths ?? null,
      frameworkStatus: c.fw, auditBody: c.auditBody || null,
      lastUpdate: c.lastUpdate
    }))
  };
}

/* The full record. This is where the real answers live - the sections carry the
   sentences a consultant needs to quote. */
function corpusGetCountry(args){
  const isos = corpusIsos(args && args.countries);
  const want = (args && args.sections && args.sections.length) ? args.sections : null;
  const out = isos.slice(0, 8).map(iso => {
    const c = byIso[iso];
    if (!c) return { iso, error: "unknown country" };
    const sections = {};
    Object.keys(c.sections || {}).forEach(k => {
      if (want && !want.includes(k)) return;
      sections[SECTION_NAMES[k] || k] = c.sections[k];
    });
    return {
      iso: c.iso, country: c.name, region: c.region,
      source: "RegWatch country record - " + c.name + " (last update " + c.lastUpdate + ")",
      maturity: c.maturity, maturityMeans: CORPUS_LEVELS[c.maturity],
      summary: c.summary,
      transposed: c.transposed, lawInForce: c.lawInForce || null, monthsLate: c.delayMonths ?? null,
      nationalLaw: c.law || null,
      frameworkStatus: c.fw, frameworkName: c.fwName || null,
      requirementsEssential: c.reqEE ?? null, requirementsImportant: c.reqIE ?? null,
      complianceDeadlineEssentialMonths: c.complianceEE ?? null,
      complianceDeadlineImportantMonths: c.complianceIE ?? null,
      auditBody: c.auditBody || null,
      auditFrequencyEssentialMonths: c.auditFreqEE ?? null,
      auditFrequencyImportantMonths: c.auditFreqIE ?? null,
      selfAssessmentFrequencyMonths: c.selfAssessFreq ?? null,
      registrationTool: c.regTool || null, incidentMethod: c.incidentMethod || null,
      authorities: c.authorities || [],
      sections,
      timeline: c.timeline || [],
      nextSteps: c.next || null,
      officialSources: c.sources || []
    };
  });
  return { countries: out,
           truncated: isos.length > 8 ? isos.length - 8 : 0,
           note: "Quote these sections rather than general knowledge of the directive." };
}

/* The comparative workbook's indicator table. With no `indicator`, it lists
   what exists - the model needs the exact wording before it can ask for one. */
function corpusQueryKpi(args){
  const a = args || {};
  if (!a.indicator) {
    return { note: "Pass one of these exact `indicator` strings to get its values.",
             indicators: KPI_CATALOGUE.map(k => ({
               indicator: k.kpi, workbookTab: k.tab, type: k.type,
               countriesAnswered: k.known + "/" + k.total })) };
  }
  const meta = KPI_CATALOGUE.find(k => k.kpi.toLowerCase() === String(a.indicator).toLowerCase())
    || KPI_CATALOGUE.find(k => k.kpi.toLowerCase().includes(String(a.indicator).toLowerCase()));
  if (!meta) {
    return { error: "no such indicator",
             didYouMean: KPI_CATALOGUE.map(k => k.kpi).slice(0, 33) };
  }
  const isos = a.countries && a.countries.length ? new Set(corpusIsos(a.countries)) : null;
  const rows = KPI_ROWS.filter(r => r.kpi === meta.kpi)
    .filter(r => !isos || isos.has(kpiIso(r.country)))
    .map(r => ({ country: r.country, region: r.region, maturity: r.maturity,
                 value: r.value || null }));
  return { indicator: meta.kpi, workbookTab: meta.tab, type: meta.type,
           source: 'Comparative workbook, sheet "KPIs - WID"',
           values: rows };
}

/* Keyword search across the country sections and the watch items. Plain word
   matching, not semantics: with a corpus this size the failure mode that
   matters is inventing an answer, not missing a synonym, and a hit that quotes
   its own sentence can be checked by the reader. */
function corpusSearch(args){
  const a = args || {};
  const terms = String(a.query || "").toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
  if (!terms.length) return { error: "query too short" };
  const isos = a.countries && a.countries.length ? new Set(corpusIsos(a.countries)) : null;
  const score = text => {
    const low = String(text).toLowerCase();
    return terms.reduce((n, w) => n + (low.includes(w) ? 1 : 0), 0);
  };

  const hits = [];
  COUNTRIES.forEach(c => {
    if (isos && !isos.has(c.iso)) return;
    Object.keys(c.sections || {}).forEach(k => {
      c.sections[k].forEach(line => {
        const n = score(line);
        if (n) hits.push({ score: n, country: c.name, iso: c.iso,
                           section: SECTION_NAMES[k] || k, text: line,
                           source: "RegWatch country record - " + c.name });
      });
    });
    [["summary", c.summary], ["national law", c.law], ["framework", c.fwName],
     ["registration tool", c.regTool], ["incident method", c.incidentMethod]].forEach(([f, v]) => {
      if (!v) return;
      const n = score(v);
      if (n) hits.push({ score: n, country: c.name, iso: c.iso, section: f, text: v,
                         source: "RegWatch country record - " + c.name });
    });
    (c.authorities || []).forEach(au => {
      const n = score(au.name + " " + au.role);
      if (n) hits.push({ score: n, country: c.name, iso: c.iso, section: "authority",
                         text: au.name + " - " + au.role,
                         source: "RegWatch country record - " + c.name });
    });
  });

  /* Watch items are dated news, not settled fact - they are labelled as such so
     the model does not present a press item as the state of the law. */
  if (a.includeWatch !== false && typeof WATCH_SOURCE !== "undefined") {
    WATCH_SOURCE.forEach(w => {
      if (isos && !isos.has(w.iso)) return;
      const text = [w.title, w.titleEn, w.summary, w.summaryEn].filter(Boolean).join(" ");
      const n = score(text);
      if (n) hits.push({ score: n, country: (byIso[w.iso] || {}).name || w.iso, iso: w.iso,
                         section: "watch item (news, not settled law)",
                         date: w.detected, text: (w.titleEn || w.title),
                         source: w.source || "watch agent" });
    });
  }

  hits.sort((a2, b2) => b2.score - a2.score);
  return { query: a.query, matches: hits.length,
           hits: hits.slice(0, Math.min(a.limit || CORPUS_MAX_HITS, CORPUS_MAX_HITS))
                     .map(h => { const { score: _s, ...rest } = h; return rest; }) };
}

/* Which sectors and thresholds each country put in scope. Split out from
   get_country because it is the question behind "is my site concerned", and
   because it deserves its own warning: the records carry the national scoping
   rules, never a list of companies. */
function corpusScopeRules(args){
  const isos = corpusIsos(args && args.countries).slice(0, 8);
  return {
    warning: "These are the national scoping rules. RegWatch holds no company or "
           + "site inventory, so an in-scope conclusion about a specific site is a "
           + "hypothesis for the consultant to confirm, never a determination.",
    countries: isos.map(iso => {
      const c = byIso[iso];
      if (!c) return { iso, error: "unknown country" };
      return { iso: c.iso, country: c.name,
               source: "RegWatch country record - " + c.name,
               transposed: c.transposed, lawInForce: c.lawInForce || null,
               nationalLaw: c.law || null,
               scopeRules: (c.sections || {}).scope || [],
               registration: (c.sections || {}).reg || [],
               registrationTool: c.regTool || null,
               authorities: c.authorities || [] };
    })
  };
}

/* The document folders, so an answer can point at the source text. */
function corpusOfficialDocs(args){
  const isos = corpusIsos(args && args.countries).slice(0, 8);
  return { countries: isos.map(iso => {
    const d = typeof COUNTRY_DOCS !== "undefined" ? COUNTRY_DOCS[iso] : null;
    const c = byIso[iso];
    if (!d) return { iso, country: c ? c.name : iso, folders: [], note: "no folder recorded" };
    return { iso, country: d.country, folderUrl: d.folderUrl || null, folders: d.folders || [] };
  }) };
}
