/* ---------- Countries list ---------- */
let ctyFilter = { q: "", region: "", lvl: "" };
let inboxFilter = { q: "", iso: "", days: "", rel: "", procSort: "recent", hubDays: 7 };
function renderCountries(){
  const el = $("#v-countries");
  el.innerHTML = `
  <h1 class="pg">${t("cty.title")}</h1>
  <p class="pg-sub">${t("cty.sub")}</p>
  <div class="card"><div class="bd">
    <div class="filters">
      <input type="search" id="fQ" placeholder="${t("cty.search")}" value="${esc(ctyFilter.q)}" aria-label="Search country">
      <select id="fR" aria-label="Filter by region"><option value="">${t("cty.allRegions")}</option>${["West","North","South","East"].map(r => [r, t("reg." + r)]).sort((a, b) => a[1].localeCompare(b[1])).map(([r, label]) => `<option value="${r}" ${ctyFilter.region === r ? "selected" : ""}>${label}</option>`).join("")}</select>
      <select id="fL" aria-label="Filter by level"><option value="">${t("cty.allLevels")}</option>${[1,2,3,4].map(l => `<option value="${l}" ${ctyFilter.lvl == l ? "selected" : ""}>${t("common.level")} ${l}</option>`).join("")}</select>
      <span class="q-note" id="fCount"></span>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t("cty.thCountry")}</th><th>${t("cty.thRegion")}</th><th>${t("cty.thMaturity")}</th><th>${t("cty.thLaw")}</th><th class="num">${t("cty.thDelay")}</th><th>${t("cty.thFw")}</th><th class="num">${t("cty.thReqEE")}</th><th class="num">${t("cty.thReqIE")}</th><th>${t("cty.thUpd")}</th></tr></thead>
      <tbody id="ctyRows"></tbody>
    </table></div>
  </div></div>`;
  const rows = $("#ctyRows");
  function paint(){
    const list = COUNTRIES
      .filter(c => (!ctyFilter.q || c.name.toLowerCase().includes(ctyFilter.q.toLowerCase()) || c.iso.toLowerCase() === ctyFilter.q.toLowerCase()))
      .filter(c => !ctyFilter.region || c.region === ctyFilter.region)
      .filter(c => !ctyFilter.lvl || c.maturity == ctyFilter.lvl)
      .sort((a, b) => a.name.localeCompare(b.name));
    $("#fCount").textContent = t("cty.count", { n: list.length, total: COUNTRIES.length });
    rows.innerHTML = list.map(c => `
      <tr class="rowlink" data-iso="${c.iso}" tabindex="0">
        <td><b><i class="fi">${flagSvg(c.iso)}</i> ${esc(c.name)}</b>${c.eu ? "" : ` <span class="chip eu">${t("cty.nonEu")}</span>`}</td>
        <td>${t("reg." + c.region)}</td>
        <td>${lvlChip(c)}</td>
        <td>${c.lawInForce ? fmtDate(c.lawInForce) : `<span style="color:var(--muted)">${t("common.notYet")}</span>`}</td>
        <td class="num">${c.onTime ? t("common.onTime") : (c.delayMonths != null ? "+" + c.delayMonths : "-")}</td>
        <td>${fwChip(c)}</td>
        <td class="num">${c.reqEE ?? "-"}</td><td class="num">${c.reqIE ?? "-"}</td>
        <td><span class="num">${fmtDate(c.lastUpdate)}</span></td>
      </tr>`).join("");
    rows.querySelectorAll("tr").forEach(tr => {
      tr.addEventListener("click", () => location.hash = "#/country/" + tr.dataset.iso);
      tr.addEventListener("keydown", e => { if (e.key === "Enter") location.hash = "#/country/" + tr.dataset.iso; });
    });
  }
  paint();
  $("#fQ").addEventListener("input", e => { ctyFilter.q = e.target.value; paint(); });
  $("#fR").addEventListener("change", e => { ctyFilter.region = e.target.value; paint(); });
  $("#fL").addEventListener("change", e => { ctyFilter.lvl = e.target.value; paint(); });
}

/* ---------- Country page ---------- */
/* The comparative workbook is the source of truth for country data, but its
   values are terser than the record's hand-written prose - and the two disagree
   on 132 of 277 comparable values. So this layer only ADDS what the record
   lacks: seven typed fields and two whole sections. Reconciling the divergences
   is a consultant's call, not a silent overwrite. See tools/excel_to_countries.py. */
/* Links to the country's document folders on SharePoint - not copies of the
   PDFs. A folder link always resolves to what is current, survives a file being
   replaced, and leaves access control in SharePoint where it belongs. Mirroring
   the files here would start going stale immediately and would put regulatory
   documents in a git repository. */
const DOC_ICON = { legislation: "\u2696", framework: "\u1F6E1", other: "\u1F4CE", old: "\u1F5C4" };
function docsSection(c){
  /* The folder registry was built for NIS 2 and its labels say so ("the national
     cybersecurity framework"). Showing it on a REC record would point a reader
     at the wrong directive's documents. */
  if (regId() !== "nis2") return "";
  const rec = (typeof COUNTRY_DOCS !== "undefined" && COUNTRY_DOCS[c.iso]) || null;
  if (!rec) return "";
  const anyApprox = rec.folders.some(f => f.approx);
  return `<div class="card"><div class="cap"><h2>${t("docs.title")}</h2></div><div class="bd">
    <p class="q-note" style="margin-top:0">${t("docs.sub")}</p>
    <div class="docs">
      ${rec.folders.map(f => `<a class="doc${f.approx ? " approx" : ""}" href="${esc(f.url)}"
          target="_blank" rel="noopener"${f.approx ? ` title="${t("docs.approx")}"` : ""}>
        <span class="doc-t">${t("docs." + f.key)}${f.approx ? ' <span class="doc-a">\u2197</span>' : ""}</span>
        <span class="doc-d">${t("docs.d" + f.key.charAt(0).toUpperCase() + f.key.slice(1))}</span>
        ${f.items != null ? `<span class="doc-n">${t("docs.items", { n: f.items })}</span>` : ""}
      </a>`).join("")}
    </div>
    <a class="doc-root" href="${esc(rec.folderUrl)}" target="_blank" rel="noopener">${t("docs.folder")}</a>
    ${anyApprox ? `<div class="q-note" style="margin-top:8px">${t("docs.approxNote")}</div>` : ""}
  </div></div>`;
}
const WB_FLAT = ["regAuthority", "regDeadline", "regDeadlineMonths",
                 "incidentAuthority", "incidentMandatoryFrom", "sanctionMax",
                 "authorityCount"];
function wbData(iso){
  return (typeof EXCEL_DATA !== "undefined" && EXCEL_DATA[iso]) || { flat: {}, sections: {} };
}
function wbFacts(c){
  const flat = wbData(c.iso).flat || {};
  return WB_FLAT.filter(k => flat[k] !== undefined && flat[k] !== "")
    .map(k => [t("cp." + k), /Date|From|Deadline$/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(flat[k])
      ? fmtDateL(flat[k]) : esc(String(flat[k]))]);
}
/* Sections the record never had: sanctions, and the authority detail. */
function wbSections(c){
  const sections = wbData(c.iso).sections || {};
  const keys = ["sanctions", "authorities"].filter(k => (sections[k] || []).length);
  if (!keys.length) return "";
  return `<div class="wb-block">
    <div class="wb-head">${t("cp.fromWorkbook")}</div>
    ${keys.map(k => `<div class="sec"><h3>${t("sec." + k)}</h3>
      <ul>${sections[k].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
    <div class="q-note">${t("cp.wbNote")}</div>
  </div>`;
}
/* ---------- cyber-theme coverage ----------
 *
 * The workbook counts how many requirements a country imposes; this says WHICH
 * themes its framework actually covers. Two countries with 150 requirements
 * each can cover completely different ground, and that is the gap a consultant
 * is looking for.
 *
 * Nine countries of twenty-nine, last reviewed in July 2025 while the rest of
 * the record is a year newer. Both limits are stated on the card rather than
 * left for the reader to discover: an uncovered theme here may simply never
 * have been reviewed.
 */
function themesSection(c){
  if (regId() !== "nis2" || typeof CYBER_THEMES === "undefined") return "";
  const rec = (CYBER_THEMES.countries || {})[c.iso];
  if (!rec) return "";
  const pct = Math.round(rec.themesCovered / rec.themesTotal * 100);
  const rows = rec.families
    .slice()
    .sort((a, b) => (b.covered / b.of) - (a.covered / a.of) || a.family.localeCompare(b.family))
    .map(f => `<div class="thm" ${f.themes.length ? kpiTip(f.themes.join(" · ")) : ""}>
      <span class="thm-n">${esc(f.family)}</span>
      <span class="thm-bar"><i style="width:${Math.round(f.covered / f.of * 100)}%"></i></span>
      <span class="thm-v">${f.covered}<small>/${f.of}</small></span></div>`).join("");
  return `<div class="card"><div class="cap"><h2>${t("thm.title")}</h2>
      <span class="q-note">${t("thm.count", { n: rec.themesCovered, total: rec.themesTotal, pct: pct })}</span></div>
    <div class="bd">
      <p class="q-note" style="margin-top:0">${t("thm.sub", { date: fmtDateL(CYBER_THEMES.lastUpdate),
        n: Object.keys(CYBER_THEMES.countries).length })}</p>
      <div class="thms">${rows}</div>
    </div></div>`;
}

/* The NIS 2 fact grid, written out because it is the richest: several of these
   read two fields at once and none of them survive being generated. REC's is
   declared in its spec instead - see countryFacts(). */
function nis2Facts(c){
  return [
    [t("cp.law"), c.law],
    [t("cp.fw"), `<b>${esc(t("fw." + c.fw))}</b> - ${esc(c.fwName)}`],
    [t("cp.req"), c.reqEE ? `<b>${c.reqEE}</b> ${t("cp.forEE")} · <b>${c.reqIE ?? "-"}</b> ${t("cp.forIE")}` : t("cp.reqNone")],
    [t("cp.deadline"), c.complianceEE ? `<b>${c.complianceEE} ${t("common.months")}</b> (EE)${c.complianceIE && c.complianceIE !== c.complianceEE ? ` · ${c.complianceIE} ${t("common.months")} (IE)` : ""}` : t("cp.deadlineNone")],
    [t("cp.regChannel"), c.regTool],
    [t("cp.incChannel"), c.incidentMethod],
    ...wbFacts(c),
    [t("cp.auditBody"), `${esc(c.auditBody)}${c.auditFreqEE ? ` - EE ${t("cp.every")} <b>${c.auditFreqEE} ${t("common.mo")}</b>` : ""}${c.auditFreqIE ? ` · IE ${t("cp.every")} <b>${c.auditFreqIE} ${t("common.mo")}</b>` : ""}`]
  ];
}

/* A regulation whose spec lists `facts` drives the grid from it; a blank field
   is shown as blank rather than hidden, because on a young workbook "we do not
   know yet" is itself the finding. */
function countryFacts(c){
  if (regId() === "nis2") return nis2Facts(c);
  return regSpec().facts.map(f => {
    const raw = f.v(c);
    if (raw === undefined || raw === null || raw === "") return [t(f.k), `<span class="q-note">${t("cp.notStated")}</span>`];
    return [t(f.k), f.date && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `<b>${fmtDateL(raw)}</b>` : esc(String(raw))];
  });
}

function renderCountry(iso){
  const c = byIso[iso];
  const el = $("#v-country");
  if (!c) { el.innerHTML = `<p>${t("cp.unknown")}</p>`; return; }
  const spec = regSpec();
  const facts = countryFacts(c);
  const secHtml = spec.sections.filter(k => c.sections[k] && c.sections[k].length).map(k => `
    <div class="sec"><h3>${t("sec." + k)}</h3><ul>${c.sections[k].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
  el.innerHTML = `
  <a class="back" href="#/countries">${t("cp.back")}</a>
  <div class="cty-head">
    <span class="flag"><i class="fi fi-lg">${flagSvg(c.iso)}</i></span>
    <div>
      <h1>${esc(c.name)}</h1>
      <div class="meta">
        ${lvlChip(c)} ${regId() === "nis2" ? fwChip(c) : ""}
        <span class="chip eu">${c.eu ? t("cp.euMember") : t("cp.nonEu")}</span>
        <span class="stepper" title="${esc(regLevelLabel(c.maturity))}">${[1,2,3,4].map(l => `<span class="st ${l <= c.maturity ? "on" + l : ""}"></span>`).join("")}</span>
      </div>
      <p style="margin:9px 0 0;color:var(--ink2);max-width:78ch">${esc(regLevelLabel(c.maturity))}. ${esc(c.summary)}</p>
    </div>
    <div class="upd">${t("cp.lastUpdate")}<br><b class="num" style="color:var(--ink)">${fmtDate(c.lastUpdate)}</b><br>${regId() !== "nis2" ? (c.transposed ? t("cp.inForceOn", { date: fmtDateL(c.lawInForce) }) : t("cp.notTransposed"))
        : c.transposed ? (c.onTime ? t("cp.onTime") : t("cp.inForce", { date: fmtDateL(c.lawInForce), n: c.delayMonths })) : t("cp.notTransposed")}${role === "validator" ? `<br><button class="btn" id="deckBtn" style="margin-top:9px">${t("cp.genSlides")}</button>` : ""}</div>
  </div>
  <div class="facts">${facts.map(f => `<div class="fact"><div class="k">${f[0]}</div><div class="v">${f[1]}</div></div>`).join("")}</div>
  <div class="cty-grid">
    <div class="card"><div class="bd">${secHtml}
      ${regId() === "nis2" ? wbSections(c) : ""}
      ${c.next && c.next.length ? `<div class="sec"><h3>${t("cp.nextSteps")}</h3><ul>${c.next.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    </div></div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><div class="cap"><h2>${t("cp.timeline")}</h2></div><div class="bd">
        <ul class="tl">${[...c.timeline].sort((a, b) => b.date < a.date ? -1 : 1).map(ev => `
          <li class="${ev.added ? "added" : ""}"><span class="pt"></span><div class="d">${fmtDateL(ev.date)}${ev.added ? ` · <span style="color:var(--ok)">${t("cp.addedVia")}</span>` : ""}</div><div class="x">${esc(evText(ev))}</div></li>`).join("")}
        </ul>
        ${c.timeline.some(ev => ev.added) ? `<div class="q-note" style="margin-top:8px">${t("cp.timelineNote")}</div>` : ""}
      </div></div>
      <div class="card"><div class="cap"><h2>${t("cp.authorities")}</h2></div><div class="bd auth">
        ${c.authorities.map(a => `<div class="a"><b>${esc(a.name)}</b><span>${esc(a.role)}</span></div>`).join("")}
      </div></div>
      ${themesSection(c)}
      ${docsSection(c)}
      <div class="card"><div class="cap"><h2>${t("cp.sources")}</h2></div><div class="bd srcs">
        ${c.sources.map(s => `<div class="s">${srcChip(s.type)}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</div>`).join("")}
        <div class="q-note" style="margin-top:4px">${t("cp.sourcesNote")}</div>
      </div></div>
    </div>
    <div class="rolenote" style="margin:16px 0 0">
      <b>${t("cp.readOnlyT")}</b> ${t("cp.readOnly")}
    </div>
  </div>`;
  const db = $("#deckBtn", el);
  if (db) db.addEventListener("click", async () => {
    const label = db.textContent;
    db.disabled = true; db.textContent = t("cp.deckWorking");
    try {
      const { blob, filename } = await generateCountryDeck(iso);
      const url = URL.createObjectURL(blob);

      /* A real link the person can tap. On desktop the click below saves the
         file immediately; on iOS that click is ignored, and this link is what
         actually works. Either way it stays visible until the page changes. */
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.className = "btn primary deck-dl";
      link.textContent = t("cp.deckReady");
      db.replaceWith(link);
      const hint = document.createElement("div");
      hint.className = "q-note";
      hint.style.marginTop = "6px";
      hint.textContent = t("cp.deckHint");
      link.after(hint);

      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      db.textContent = t("cp.deckFailed");
      console.error(err);
      alert(err.message);
      setTimeout(() => { db.disabled = false; db.textContent = label; }, 2500);
    }
  });
}

/* ---------- Watch inbox ---------- */
/* The Watch inbox is two levels deep.
 *
 * Level 1 (hub) answers "where should I look?" - one tile per country with a
 * pending count, scoped to a detection window. Level 2 is the working view for
 * one country: filters, the queue, and that country's processed log.
 *
 * A single flat list of 160+ cards was the thing nobody could use.
 */
function renderInbox(){
  const el = $("#v-inbox");
  const isVal = role === "validator";
  const pending = queue.filter(q => q.status === "pending");
  const done = queue.filter(q => q.status !== "pending");

  if (!isVal) {
    el.innerHTML = `
    <h1 class="pg">${t("inbox.title")}</h1>
    <p class="pg-sub">${t("inbox.sub")}</p>
    <div class="rolenote"><b>${t("role.reader")}.</b> ${t("inbox.sub")}</div>
    <div class="card"><div class="cap"><h2>${t("proc.title")} (${done.length})</h2></div><div class="bd">
      <div id="procList"></div>
    </div></div>`;
    paintProcessed(done);
    return;
  }
  if (inboxFilter.iso) renderInboxCountry(el, pending, done);
  else renderInboxHub(el, pending, done);
}

/* Items detected within `days` (0 = no limit). */
function withinWindow(items, days){
  if (!days) return items;
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return items.filter(x => x.detected >= cutoff);
}

/* ---------- source candidates ----------
 *
 * agent-veille/discover_sources.py proposes; nobody watches anything until a
 * validator says so. The card sits in the watch inbox rather than in the source
 * registry because accepting a source is a validation act, and the inbox is
 * where validation happens - the same place, the same gesture, the same two
 * buttons as a watch item.
 *
 * An accepted candidate lands in the consultant-added sources, which is what
 * the Sources tab lists and what its export ships to the agent's tblSources.
 * A rejected one is remembered so the crawler never proposes it again.
 */
function rejectedSources(){ return store.rejectedSources || (store.rejectedSources = []); }

let candFilter = "";
let candSearch = "";

/* Les propositions encore en attente : ni déjà retenues, ni refusées. */
function candidatesOpen(){
  if (regId() !== "nis2" || typeof SOURCE_CANDIDATES === "undefined") return [];
  const taken = new Set(customSources().map(s => s.host || s.url));
  const refused = new Set(rejectedSources());
  return (SOURCE_CANDIDATES.candidates || [])
    .filter(c => !taken.has(c.host) && !refused.has(c.host));
}

const candName = iso => iso === "EU" ? t("hub.euTile")
  : byIso[iso] ? byIso[iso].name : iso;

/* Même tableau que l'onglet Sources, et pour la même raison : une proposition
   se juge sur les mêmes colonnes qu'une source déjà retenue - le pays, le
   domaine, le degré de confiance, ce qu'on sait d'elle. Deux présentations pour
   un même objet obligeaient à réapprendre à lire d'un onglet à l'autre.

   Le pays vient du domaine national, lu par discover_sources.py ; il n'est
   jamais deviné ici. */
function candRow(c){
  return `<tr data-host="${esc(c.host)}">
      <td style="white-space:nowrap">${c.iso
        ? `<i class="fi">${flagSvg(c.iso)}</i> ${esc(candName(c.iso))}`
        : `<span style="color:var(--muted)">${t("cand.noCountry")}</span>`}</td>
      <td><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>
        <div class="cand-u">${esc(c.host)}</div></td>
      <td>${srcChip(c.type)}</td>
      <td style="color:var(--muted)">${c.kind === "rss"
          ? esc(t("cand.feed", { n: c.entries })) : esc(t("cand.page"))}${
        c.context && c.context.length
          ? ` · ${esc(t("cand.seen", { n: c.seenFrom }))} · ${esc(c.context[0])}` : ""}</td>
      <td style="white-space:nowrap"><button class="btn ok cand-ok" data-host="${esc(c.host)}"
          type="button">${t("cand.accept")}</button>
        <button class="btn danger cand-no" data-host="${esc(c.host)}"
          type="button">${t("cand.reject")}</button></td>
    </tr>`;
}

function candidatesCard(){
  if (!candidatesOpen().length) return "";
  /* Fermé au départ : ce sont des propositions, pas des tâches du jour. La file
     de veille s'ouvre pour voir ce qui est arrivé ; arbitrer le registre est un
     autre geste, qu'on décide de faire.

     Le contenu est peint par wireCandidates : filtrer ne doit pas re-rendre la
     page, sinon l'encart se referme à chaque frappe. */
  return `<details class="card fold" id="candCard"><summary class="cap">
      <h2>${t("cand.title")}</h2>
      <span class="q-note" id="candCount"></span>
      <span class="fold-car" aria-hidden="true">▾</span></summary>
    <div class="bd">
      <p class="q-note" style="margin-top:0">${t("cand.sub", {
        date: fmtDateL(SOURCE_CANDIDATES.generated) })}</p>
      <div class="filters">
        <input id="candSearch" type="search" class="q-search" autocomplete="off"
          placeholder="${t("src.searchCountry")}" value="${esc(candSearch)}"
          aria-label="${t("src.searchCountry")}">
        <span class="q-note" id="candShown"></span>
      </div>
      <div class="sflags" id="candFlags"></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${t("src.thScope")}</th><th>${t("src.thSource")}</th>
          <th>${t("src.thTrust")}</th><th>${t("src.thNote")}</th><th></th></tr></thead>
        <tbody id="candRows"></tbody></table></div>
    </div></details>`;
}

function wireCandidates(el){
  const card = el.querySelector("#candCard");
  if (!card) return;
  const find = host => (SOURCE_CANDIDATES.candidates || []).find(c => c.host === host);

  function paint(){
    const open = candidatesOpen();
    /* Le dernier arbitrage rendu fait disparaître l'encart : il ne reste rien
       à décider, et une section vide se lit comme une panne. */
    if (!open.length) { card.remove(); return; }

    const countries = [...new Set(open.map(c => c.iso).filter(Boolean))]
      .sort((a, b) => candName(a).localeCompare(candName(b)));
    const needle = candSearch.trim().toLowerCase();
    const shown = needle
      ? countries.filter(iso => candName(iso).toLowerCase().includes(needle)
                             || iso.toLowerCase().startsWith(needle))
      : countries;
    /* Un filtre disparu de la liste resterait actif sans être visible. */
    if (candFilter && !shown.includes(candFilter)) candFilter = "";

    card.querySelector("#candCount").textContent =
      t("cand.count", { n: open.length }) + " · " + t("cand.inCountries", { n: countries.length });

    card.querySelector("#candFlags").innerHTML =
      `<button class="sflag ${candFilter ? "" : "on"}" data-iso="" type="button">${
        t("src.allCountries")}</button>` + shown.map(iso =>
      `<button class="sflag ${candFilter === iso ? "on" : ""}" data-iso="${esc(iso)}" type="button"
         title="${esc(candName(iso))}"><i class="fi">${flagSvg(iso)}</i>
         <span>${esc(candName(iso))}</span>
         <span class="sflag-n">${open.filter(c => c.iso === iso).length}</span></button>`).join("")
      + (shown.length ? "" : `<span class="q-note">${t("src.noCountry", { q: esc(candSearch) })}</span>`);
    card.querySelectorAll("#candFlags .sflag").forEach(b => b.addEventListener("click", () => {
      candFilter = b.dataset.iso === candFilter ? "" : b.dataset.iso;
      paint();
    }));

    /* La recherche filtre le tableau, pas seulement les drapeaux proposés :
       taper "esto" et voir les trente-cinq lignes ne servait à rien. Un pays
       explicitement cliqué l'emporte sur la recherche. */
    const keep = c => candFilter ? c.iso === candFilter
      : needle ? shown.includes(c.iso) : true;
    const list = open.filter(keep)
      .sort((a, b) => (a.iso ? 0 : 1) - (b.iso ? 0 : 1)
        || candName(a.iso).localeCompare(candName(b.iso))
        || a.name.localeCompare(b.name));
    card.querySelector("#candShown").textContent =
      t("src.count", { n: list.length, total: open.length });
    card.querySelector("#candRows").innerHTML = list.map(candRow).join("");

    card.querySelectorAll(".cand-ok").forEach(b => b.addEventListener("click", () => {
      const c = find(b.dataset.host);
      if (!c) return;
      customSources().push({
        name: c.name, url: c.url, host: c.host, iso: c.iso || "EU",
        kind: c.kind === "rss" ? "rss" : "page", type: c.type,
        note: t("cand.noteAccepted", { date: fmtDateL(c.discovered) }),
      });
      saveStore();
      paint();
    }));
    card.querySelectorAll(".cand-no").forEach(b => b.addEventListener("click", () => {
      /* Retenu par domaine : discover_sources.py relit cette liste et cesse de
         le proposer, si bien qu'un refus est une décision et non une corvée
         répétée chaque semaine. */
      if (!rejectedSources().includes(b.dataset.host)) rejectedSources().push(b.dataset.host);
      saveStore();
      paint();
    }));
  }

  paint();
  /* Repeindre plutôt que re-rendre : un re-render vide le champ et lui prend le
     focus, ce qui rend la frappe impossible. */
  card.querySelector("#candSearch").addEventListener("input", e => {
    candSearch = e.target.value;
    paint();
  });
}

function renderInboxHub(el, pending, done){
  /* The agent runs weekly and the workbook's own lookback is 21 days, so a
     7-day window goes empty whenever a run slips. Fall back rather than show
     an empty page that reads as a broken tool - and say that we did. */
  const WINDOWS = [[7, "hub.w7"], [30, "hub.w30"], [90, "hub.w90"], [0, "hub.wAll"]];
  let days = inboxFilter.hubDays;
  let inWindow = withinWindow(pending, days);
  let fallbackFrom = 0;
  if (!inWindow.length && pending.length) {
    fallbackFrom = days;
    for (const [d] of WINDOWS) {
      if (d && d <= days) continue;
      inWindow = withinWindow(pending, d);
      if (inWindow.length) { days = d; break; }
    }
  }

  const byCountry = {};
  inWindow.forEach(x => { (byCountry[x.iso] = byCountry[x.iso] || []).push(x); });
  const isos = Object.keys(byCountry).sort((a, b) =>
    (byIso[a] ? 0 : 1) - (byIso[b] ? 0 : 1)
    || byCountry[b].length - byCountry[a].length
    || (byIso[a] ? byIso[a].name : a).localeCompare(byIso[b] ? byIso[b].name : b));
  const quiet = COUNTRIES.filter(c => !byCountry[c.iso]);

  const tile = iso => {
    const c = byIso[iso];
    const items = byCountry[iso];
    const off = items.filter(x => x.source.type === "official").length;
    const cells = items.filter(x => (x.targetCells || []).length).length;
    return `<button class="ctile" data-iso="${esc(iso)}" type="button">
      <span class="ctile-flag">${flagSvg(c ? c.iso : "EU")}<span class="ctile-n">${items.length}</span></span>
      <span class="ctile-name">${c ? esc(c.name) : t("hub.euTile")}</span>
      <span class="ctile-sub">${off} ${t("hub.official")} · ${items.length - off} ${t("hub.verify")}</span>
      <span class="ctile-sub">${c ? `${cells} ${t("hub.cells")}` : t("hub.euNote")}</span>
    </button>`;
  };

  el.innerHTML = `
  <h1 class="pg">${t("inbox.title")}</h1>
  <p class="pg-sub">${t("hub.sub")}</p>
  <div class="card"><div class="bd">
    <div class="filters">
      <label class="q-toggle">${t("hub.window")}
        <select id="hubW">${WINDOWS.map(([d, k]) =>
          `<option value="${d}" ${days == d ? "selected" : ""}>${t(k)}</option>`).join("")}</select></label>
      <span class="q-note">${t("hub.countries", { n: isos.length })}</span>
      <button class="btn" id="hubAll" type="button">${t("hub.backlog", { n: pending.length })}</button>
    </div>
    ${fallbackFrom ? `<div class="rolenote">${t("hub.fallback", {
        n: fallbackFrom, m: t(WINDOWS.find(w => w[0] === days)[1]).toLowerCase() })}</div>` : ""}
    ${isos.length ? `<div class="ctiles">${isos.map(tile).join("")}</div>`
                  : `<p style="color:var(--muted)">${pending.length ? t("hub.empty") : t("hub.noneAtAll")}</p>`}
    ${quiet.length ? `<details class="q-proc" style="margin-top:14px">
      <summary>${t("hub.showOthers", { n: quiet.length })}</summary>
      <div class="ctiles quiet" style="padding:10px 6px">${quiet.map(c =>
        `<button class="ctile" data-iso="${c.iso}" type="button">
          <span class="ctile-flag">${flagSvg(c.iso)}<span class="ctile-n zero">0</span></span>
          <span class="ctile-name">${esc(c.name)}</span></button>`).join("")}</div>
    </details>` : ""}
  </div></div>
  ${candidatesCard()}
  <div class="card"><div class="cap"><h2>${t("proc.title")} (${done.length})</h2></div><div class="bd">
    ${done.length ? `<details class="q-proc">
      <summary>${t("proc.show")}<span class="n" id="procCount"></span></summary>
      <div class="filters" style="margin-top:10px">
        <label class="q-toggle">${t("proc.sort")}
          <select id="pSort">${[["recent", "proc.sortRecent"], ["country", "proc.sortCountry"], ["status", "proc.sortStatus"]]
            .map(([v, k]) => [v, t(k)]).sort((a, b) => a[1].localeCompare(b[1]))
            .map(([v, label]) => `<option value="${v}" ${inboxFilter.procSort === v ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      </div>
      <div id="procList"></div>
    </details>` : `<p style="color:var(--muted)">${t("proc.none")}</p>`}
  </div></div>`;

  el.querySelectorAll(".ctile").forEach(b => b.addEventListener("click", () => {
    inboxFilter.iso = b.dataset.iso;
    inboxFilter.days = "";
    renderInbox();
    window.scrollTo({ top: 0 });
  }));
  $("#hubW").addEventListener("change", e => { inboxFilter.hubDays = +e.target.value; renderInbox(); });
  wireCandidates(el);
  $("#hubAll").addEventListener("click", () => { inboxFilter.hubDays = 0; renderInbox(); });
  paintProcessed(done);
  const pSort = $("#pSort");
  if (pSort) pSort.addEventListener("change", e => { inboxFilter.procSort = e.target.value; paintProcessed(done); });
}

function renderInboxCountry(el, pending, done){
  const iso = inboxFilter.iso;
  const c = byIso[iso];
  const label = `<i class="fi">${flagSvg(c ? c.iso : "EU")}</i> ` + (c ? esc(c.name) : t("hub.euTile"));
  const mine = pending.filter(x => x.iso === iso);
  const mineDone = done.filter(x => x.iso === iso);

  el.innerHTML = `
  <button class="btn back-big" id="hubBack" type="button">${t("ctry.back")}</button>
  <h1 class="pg">${t("ctry.title", { country: label })}</h1>
  ${c ? "" : `<div class="rolenote">${t("hub.euNote")}</div>`}
  <div class="card"><div class="cap"><h2>${t("inbox.pending")} (${mine.length})</h2></div><div class="bd">
    <div class="filters">
      <input type="search" id="qQ" placeholder="${t("inbox.search")}" value="${esc(inboxFilter.q)}" aria-label="Search pending items">
      <select id="qD" aria-label="Filter by detection window"><option value="">${t("inbox.anyDate")}</option>${[[7, t("inbox.last7")], [30, t("inbox.last30")], [90, t("inbox.last90")]].map(([d, l]) => `<option value="${d}" ${inboxFilter.days == d ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select id="qR" aria-label="Filter by source reliability"><option value="">${t("inbox.anySource")}</option>${[["official", t("inbox.officialOnly")], ["unofficial", t("inbox.toVerify")]].sort((a, b) => a[1].localeCompare(b[1])).map(([v, label]) => `<option value="${v}" ${inboxFilter.rel === v ? "selected" : ""}>${label}</option>`).join("")}</select>
      <span class="q-note" id="qCount"></span>
      <button class="btn" id="qReset" type="button">${t("inbox.reset")}</button>
    </div>
    <div id="pendList"></div>
  </div></div>
  <div class="card"><div class="cap"><h2>${t("proc.title")} (${mineDone.length})</h2></div><div class="bd">
    ${mineDone.length ? `<details class="q-proc" open>
      <summary>${t("proc.show")}<span class="n" id="procCount"></span></summary>
      <div class="filters" style="margin-top:10px">
        <label class="q-toggle">${t("proc.sort")}
          <select id="pSort">${[["recent", "proc.sortRecent"], ["country", "proc.sortCountry"], ["status", "proc.sortStatus"]]
            .map(([v, k]) => [v, t(k)]).sort((a, b) => a[1].localeCompare(b[1]))
            .map(([v, label]) => `<option value="${v}" ${inboxFilter.procSort === v ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      </div>
      <div id="procList"></div>
    </details>` : `<p style="color:var(--muted)">${t("proc.none")}</p>`}
  </div></div>`;

  const rerun = () => { paintPending(mine); paintProcessed(mineDone); };
  rerun();
  $("#hubBack").addEventListener("click", e => {
    e.preventDefault();
    inboxFilter.iso = ""; inboxFilter.q = ""; inboxFilter.days = ""; inboxFilter.rel = "";
    renderInbox(); window.scrollTo({ top: 0 });
  });
  $("#qQ").addEventListener("input", e => { inboxFilter.q = e.target.value; rerun(); });
  [["#qD", "days"], ["#qR", "rel"]].forEach(([sel, key]) => {
    $(sel).addEventListener("change", e => { inboxFilter[key] = e.target.value; rerun(); });
  });
  $("#qReset").addEventListener("click", () => {
    inboxFilter.q = ""; inboxFilter.days = ""; inboxFilter.rel = "";
    renderInbox();
  });
  const pSort = $("#pSort");
  if (pSort) pSort.addEventListener("change", e => { inboxFilter.procSort = e.target.value; paintProcessed(mineDone); });
}


/* Official first, then the strongest AI relevance, then the most recent. */
function rankItems(list){
  const rel = t => (t === "official" ? 0 : t === "manual" ? 1 : 2);
  return list.slice().sort((a, b) =>
    rel(a.source.type) - rel(b.source.type)
    || ((b.agent || {}).score || 0) - ((a.agent || {}).score || 0)
    || (a.detected < b.detected ? 1 : -1));
}
/* One filter for both lists: picking "France" should narrow the processed log
   too, otherwise the two halves of the page disagree about what you're looking at. */
function applyInboxFilter(items){
  const f = inboxFilter;
  const q = f.q.trim().toLowerCase();
  const cutoff = f.days ? new Date(Date.now() - f.days * 864e5).toISOString().slice(0, 10) : "";
  return items
    .filter(x => !q || (x.title + " " + (x.titleEn || "") + " " + x.summary).toLowerCase().includes(q))
    .filter(x => !f.iso || x.iso === f.iso)
    .filter(x => !cutoff || x.detected >= cutoff)
    .filter(x => !f.rel || x.source.type === f.rel);
}
/* A weekly agent run can queue 100+ items; triage keeps the review session workable. */
function paintPending(pending){
  const list = applyInboxFilter(pending);
  $("#qCount").textContent = t("inbox.count", { n: list.length, total: pending.length });

  $("#pendList").innerHTML = list.length
    ? rankItems(list).map(qCard).join("")
    : `<p style="color:var(--muted)">${t("inbox.noMatch")}</p>`;
  $("#pendList").querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => act(b.dataset.act, b.dataset.id)));
}
/* The processed log grows every review session, so it gets the same filters as
   the queue plus its own sort - otherwise ten validations make it unreadable. */
function paintProcessed(done){
  const host = $("#procList");
  if (!host) return;
  const list = applyInboxFilter(done);
  const counter = $("#procCount");
  if (counter) counter.textContent = t("proc.count", { n: list.length, total: done.length });

  if (!list.length) {
    host.innerHTML = `<p style="color:var(--muted)">${t("proc.noMatch")}</p>`;
    return;
  }
  const when = x => x.validatedOn || x.detected;
  const name = x => (byIso[x.iso] ? byIso[x.iso].name : x.iso);
  const sorted = list.slice();
  if (inboxFilter.procSort === "country") {
    sorted.sort((a, b) => name(a).localeCompare(name(b)) || (when(a) < when(b) ? 1 : -1));
  } else if (inboxFilter.procSort === "status") {
    const rank = s => (s === "validated" ? 0 : 1);
    sorted.sort((a, b) => rank(a.status) - rank(b.status) || (when(a) < when(b) ? 1 : -1));
  } else {
    sorted.sort((a, b) => (when(a) < when(b) ? 1 : -1));
  }
  host.innerHTML = sorted.map(qCard).join("");
  host.querySelectorAll("[data-act]").forEach(b =>
    b.addEventListener("click", () => act(b.dataset.act, b.dataset.id)));
}
/* Item text follows the interface language when a translation exists.
   The original is never discarded - it is what the source actually published. */
function itemTitle(q){ return (lang === "en" && q.titleEn) ? q.titleEn : q.title; }
function itemSummary(q){ return (lang === "en" && q.summaryEn) ? q.summaryEn : q.summary; }

/* The cells of the comparative workbook this source would change - collapsed,
   like the AI panel, so a long queue stays scannable. */
function cellsPanel(q){
  const cells = q.targetCells;
  if (!cells || !cells.length) return "";
  const bySheet = {};
  cells.forEach(x => { (bySheet[x.sheet] = bySheet[x.sheet] || []).push(x); });
  return `<details class="q-cells">
    <summary>${t("card.cells")}<span class="n">${cells.length}</span></summary>
    <div class="q-cells-body">
      ${Object.keys(bySheet).map(sheet => `<div class="q-cells-row">
        <b>${esc(sheet)}</b>
        <span>${bySheet[sheet].map(x => `<code>${esc(x.cell)}</code> ${esc(x.field)}`).join(" · ")}</span>
      </div>`).join("")}
      <div class="q-note">${t("card.cellsNote")}</div>
    </div>
  </details>`;
}
/* The agent's reading of the article: a synthesis, then the points it pulled out.
   Decision support for the validator - never a publication status. */
function agentPanel(q){
  const a = q.agent || {};
  /* The agent packs several obligations into one ";"-separated string. */
  const points = String(a.obligations || "")
    .split(/\s*;\s*/).map(s => s.trim()).filter(s => s.length > 3);

  const blocks = [];
  if (q.summary) blocks.push(`<div class="q-agent-row"><b>${t("card.aiSynthesis")}</b><span>${esc(itemSummary(q))}</span></div>`);
  if (points.length) blocks.push(`<div class="q-agent-row"><b>${t("card.aiPoints")}</b>
    <span><ul class="q-points">${points.map(p => `<li>${esc(p)}</li>`).join("")}</ul></span></div>`);
  if (a.score != null) blocks.push(`<div class="q-agent-row"><b>${t("card.aiRelevance")}</b>
    <span>${a.score}/10${a.justification ? " - " + esc(a.justification) : ""}</span></div>`);
  if (a.impact) blocks.push(`<div class="q-agent-row"><b>${t("card.aiImpact")}</b><span>${esc(a.impact)}</span></div>`);
  if (a.entities) blocks.push(`<div class="q-agent-row"><b>${t("card.aiEntities")}</b><span>${esc(a.entities)}</span></div>`);
  if (q.clientAdvice) blocks.push(`<div class="q-agent-row"><b>${t("card.aiAdvice")}</b><span>${esc(q.clientAdvice)}</span></div>`);
  if (!blocks.length) return "";

  return `<details class="q-agent"><summary>${t("card.ai")}</summary>
    ${blocks.join("")}
    <div class="q-agent-row"><b></b><span class="q-note">${t("card.aiNote")}</span></div>
  </details>`;
}
/* ---------- reliability ----------
 *
 * The agent ships its own relevance score and it sorts nothing: 8 for 37 items
 * and 9 for 38 more, out of 89. This one is built from facts a validator can
 * check - what kind of publisher, whether we hold the source's own words, how
 * the date was established, whether it points at the workbook - so the number
 * is shown with its reasons rather than on its own.
 */
const relBand = n => n >= 70 ? "hi" : n >= 40 ? "mid" : "lo";

function relChip(q){
  const r = q.reliability;
  if (!r) return "";
  const why = (r.notes || []).map(n => t("rel.n." + n)).join(" ") || t("rel.allGood");
  return `<span class="rel rel-${relBand(r.score)}"${kpiTip(why)}>${
    t("rel.label")} <b>${r.score}</b></span>`;
}

function relDetail(q){
  const r = q.reliability;
  if (!r) return "";
  const LABEL = { source: "rel.pSource", evidence: "rel.pEvidence", date: "rel.pDate",
                  actionability: "rel.pAction", freshness: "rel.pFresh" };
  const MAX = { source: 30, evidence: 25, date: 20, actionability: 15, freshness: 10 };
  const bars = Object.keys(LABEL).map(k => `<div class="thm">
      <span class="thm-n">${t(LABEL[k])}</span>
      <span class="thm-bar"><i style="width:${Math.round((r.parts[k] || 0) / MAX[k] * 100)}%"></i></span>
      <span class="thm-v">${r.parts[k] || 0}<small>/${MAX[k]}</small></span></div>`).join("");
  const pen = Object.keys(r.penalties || {}).map(k =>
    `<div class="rel-pen">${t("rel.pen." + k)} <b>${r.penalties[k]}</b></div>`).join("");
  return `<details class="q-orig rel-why"><summary>${t("rel.why", { n: r.score })}</summary>
    <div class="thms" style="margin-top:6px">${bars}</div>${pen}
    ${(r.notes || []).length ? `<div class="q-note" style="margin-top:6px">${
      r.notes.map(n => esc(t("rel.n." + n))).join("<br>")}</div>` : ""}</details>`;
}

/* The sentences that put this item in a workbook cell, quoted from the source.

   The card used to show only the article's opening lines, and the router had
   often decided on a paragraph much further down: more than half the time the
   displayed text did not contain the theme it was filed under, leaving the
   validator to take the routing on trust. This shows the evidence instead, and
   the theme it argues for.

   Untranslated on purpose. This is the passage that has to be checked as
   published; the readable rendering of the opening lines stays below. */
function verbatimPanel(q){
  const rows = q.verbatim || [];
  if (!rows.length) return "";
  return `<div class="q-verb">
    <div class="q-verb-h">${t("card.verbatim")} <span class="q-note">${t("card.verbatimNote")}</span></div>
    ${rows.map(v => `<blockquote class="q-verb-q">
        <span class="q-verb-t">${esc(v.sheet.split(" - ")[0])}</span>
        ${markTerm(v.text, v.term)}</blockquote>`).join("")}
  </div>`;
}

/* Highlight the matched word without letting the source's text become markup. */
function markTerm(text, term){
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + term.length))
       + "</mark>" + esc(text.slice(i + term.length));
}

/* La provenance de la date ne s'affiche que lorsqu'elle demande de la prudence.
   "Lue dans la page" figurait sur presque toutes les cartes - une mention qui
   ne varie jamais n'informe pas, elle encombre. Une date déduite par le modèle
   ou introuvable reste signalée : c'est là que le validateur doit se méfier. */
const DATE_ORIGIN_SHOWN = new Set(["ia", "inconnue"]);

/* Le nom que l'agent se donne lui-même quand il n'a pas su nommer l'éditeur.
   Ce n'est pas une source, et l'afficher à côté du score de fiabilité laissait
   croire que la fiabilité portait sur l'agent. */
const SOURCE_PLACEHOLDERS = new Set(["Watch agent", "Agent de veille"]);

function qCard(q){
  const c = byIso[q.iso];
  const isVal = role === "validator";
  const a = q.agent || {};
  const srcName = SOURCE_PLACEHOLDERS.has((q.source.name || "").trim()) ? "" : q.source.name;
  /* Date and link first: they are what a validator reaches for to check a source. */
  const meta = [
    /* The date carries its provenance: an inferred date must not read like a fact. */
    a.publishedOn ? `<span><span class="k">${t("card.published")}</span> <span class="num">${fmtDateL(a.publishedOn)}</span>${
      DATE_ORIGIN_SHOWN.has(a.dateOrigin) ? `<span class="d-orig d-${esc(a.dateOrigin)}" title="${t("date.origin")}">${t("date." + a.dateOrigin)}</span>` : ""}</span>` : "",
    `<span><span class="k">${t("card.detected")}</span> <span class="num">${fmtDateL(q.detected)}</span></span>`,
    q.source.url
      ? `<a class="q-open" href="${esc(q.source.url)}" target="_blank" rel="noopener">${t("card.open")}</a>`
      : `<span class="q-note">${t("card.noLink")}</span>`
  ].filter(Boolean).join("");

  /* The source's own opening lines when we could fetch them; the agent's
     summary otherwise, labelled so the two are never confused.

     The excerpt arrives in the source's language - Polish, Czech, Dutch - which
     most readers cannot use, so the card shows the interface language's
     rendering when one exists. The published wording stays one click away:
     a validator checking a regulatory text has to be able to read it as
     published, and a translation is not that. */
  const excerptFor = lang === "fr" ? (q.excerptFr || "") : (q.excerptEn || "");
  const original = q.excerpt || "";
  const translatedShown = excerptFor && excerptFor !== original;
  const body = original
    ? `<blockquote class="q-excerpt">${esc(translatedShown ? excerptFor : original)}
        ${translatedShown ? `<span class="src-note">${t("card.excerptTranslated")}</span>
          <details class="q-orig"><summary>${t("card.excerptShowOriginal")}</summary>
            <div>${esc(original)}</div></details>` : ""}</blockquote>`
    : `<blockquote class="q-excerpt">${esc(itemSummary(q))}
         <span class="src-note">${t("card.excerptFallback")}</span></blockquote>`;

  return `<div class="q-card">
    <div class="q-top"><b><i class="fi">${flagSvg(c ? c.iso : "EU")}</i> ${c ? esc(c.name) : t("hub.euTile")}</b>${stChip(q.status)}${srcChip(q.source.type)}${relChip(q)}
      ${srcName ? `<span class="q-note">${esc(srcName)}</span>` : ""}</div>
    <div class="q-title">${esc(itemTitle(q))}</div>
    <div class="q-meta">${meta}</div>
    ${relDetail(q)}
    ${verbatimPanel(q)}
    ${(q.verbatim || []).length
      ? `<details class="q-open-lines"><summary>${t("card.verbatimOpening")}</summary>${body}</details>`
      : body}
    ${cellsPanel(q)}
    ${agentPanel(q)}
    ${q.status === "pending" && isVal ? `<div class="q-actions">
      <button class="btn ok" data-act="validate" data-id="${q.id}">${t("card.validate")}</button>
      <button class="btn danger" data-act="reject" data-id="${q.id}">${t("card.reject")}</button>
      <span class="q-note">${t("card.validateNote", { country: c ? esc(c.name) : esc(q.iso) })}</span></div>` : ""}
    ${q.status !== "pending" ? `<div class="q-actions">
      <span class="q-note">${q.status === "validated" ? t("card.validatedBy") : t("card.rejectedBy")} ${t("card.by")} ${esc(q.validatedBy || "NIS 2 core team")} ${t("card.on")} ${fmtDateL(q.validatedOn || q.detected)}${q.rejectReason ? " - " + esc(q.rejectReason) : ""}</span>
      ${isVal ? `<button class="btn" data-act="reopen" data-id="${q.id}" title="${t("card.reopenHint")}">${t("card.reopen")}</button>` : ""}
    </div>` : ""}
  </div>`;
}
function act(action, id){
  const q = queue.find(x => x.id === id); if (!q) return;
  const today = new Date().toISOString().slice(0, 10);

  /* Undo a decision: a validator who mis-clicks must be able to put an item
     back in the queue, including undoing what validation published. */
  if (action === "reopen") {
    q.status = "pending";
    delete q.validatedBy; delete q.validatedOn; delete q.rejectReason;
    const c = byIso[q.iso];
    if (c) {
      /* Remove only what this validation added - never a hand-maintained event. */
      const i = c.timeline.findIndex(t => t._qid === q.id && t.added);
      if (i >= 0) c.timeline.splice(i, 1);
    }
    delete store.overrides[id];
    const mm = store.manual.find(x => x.id === id);
    if (mm) { mm.status = "pending"; delete mm.validatedBy; delete mm.validatedOn; delete mm.rejectReason; }
    saveStore(); refreshBadge(); renderInbox();
    return;
  }

  q.status = action === "validate" ? "validated" : "rejected";
  q.validatedBy = "You (validator)"; q.validatedOn = today;
  if (action === "reject") q.rejectReason = "Marked as rejected in this demo";
  store.overrides[id] = { status: q.status, validatedBy: q.validatedBy, validatedOn: q.validatedOn, rejectReason: q.rejectReason };
  const m = store.manual.find(x => x.id === id); if (m) Object.assign(m, store.overrides[id]);
  saveStore();
  if (action === "validate") {
    const c = byIso[q.iso];
    if (c && !c.timeline.some(t => t._qid === q.id)) {
      c.timeline.push({ date: q.detected, text: q.title, _qid: q.id, added: true });
      if (today > c.lastUpdate) c.lastUpdate = today;
    }
  }
  refreshBadge(); renderInbox();
}

/* ---------- Insights ---------- */
function chartTip(el){
  el.querySelectorAll("[data-tip]").forEach(n => {
    n.addEventListener("mousemove", e => showTip(n.dataset.tip, e.clientX, e.clientY));
    n.addEventListener("mouseleave", hideTip);
  });
}

/* ---------- Sources ---------- */
let srcFilter = "";
let srcSearch = "";
/* The source registry is what the collection pipeline reads: every RSS feed,
   page and API the agent monitors. Making it editable here is the point - the
   quality of the watch is decided by this list, not by the model. Additions are
   held in this browser and exported to the agent's registry, since RegWatch has
   no backend yet. */
function customSources(){ return store.sources || (store.sources = []); }

/* What REC has instead of a feed registry: the authorities its workbook names,
   and an honest count of the ones it does not. This is not filler - it is the
   starting list for the day the REC agent gets built, and it shows at a glance
   how much of that list still has to be found. */
function recAuthorities(){
  const named = COUNTRIES.filter(c => (c.authorities || []).length);
  const missing = COUNTRIES.length - named.length;
  return `<div class="card"><div class="cap"><h2>${t("src.recAuthTitle")}</h2>
    <span class="q-note">${t("src.recAuthCount", { n: named.length, total: COUNTRIES.length })}</span></div>
    <div class="bd">
    <p class="q-note" style="margin-top:0">${t("src.recAuthSub")}</p>
    ${named.length ? `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t("src.thScope")}</th><th>${t("src.thAuth")}</th></tr></thead>
      <tbody>${named.map(c => `<tr>
        <td style="white-space:nowrap"><i class="fi">${flagSvg(c.iso)}</i> ${esc(c.name)}</td>
        <td>${esc(c.authorities[0].name)}</td></tr>`).join("")}</tbody>
    </table></div>` : ""}
    ${missing ? `<p class="q-note" style="margin-top:10px">${t("src.recAuthMissing", { n: missing })}</p>` : ""}
    </div></div>`;
}

function renderSources(){
  const el = $("#v-sources");
  const isVal = role === "validator";
  const rows = [];
  /* The global list was written for NIS 2 - ENISA's registry of digital
     entities is not a REC source - so REC shows only what its own workbook
     names. */
  if (regId() === "nis2") GLOBAL_SOURCES.forEach(x => rows.push({ scope: x.scope, name: x.name,
    url: x.url, type: x.type, note: x.note || "" }));
  COUNTRIES.forEach(c => c.sources.forEach(x => rows.push({ scope: c.name, iso: c.iso,
    name: x.name, url: x.url, type: x.type, note: "" })));
  customSources().forEach((x, n) => rows.push({ ...x, custom: true, idx: n,
    scope: x.iso === "EU" ? t("src.eu") : (byIso[x.iso] ? byIso[x.iso].name : x.iso) }));

  const scopeName = iso => byIso[iso] ? byIso[iso].name : iso;
  const scopes = [...new Set(rows.map(r => r.iso || "").filter(Boolean))]
    .sort((a, b) => scopeName(a).localeCompare(scopeName(b)));

  el.innerHTML = `
  <h1 class="pg">${t("src.title")}</h1>
  <p class="pg-sub">${regId() === "nis2" ? t("src.sub") : t("src.recSub")}</p>
  ${regId() === "nis2" ? "" : recAuthorities()}
  ${isVal ? `
  <div class="card"><div class="cap"><h2>${t("src.add")}</h2></div><div class="bd">
    <p class="q-note" style="margin-top:0">${t("src.addSub")}</p>
    <div class="form-grid">
      <label class="full">${t("src.fName")}<input id="sName" placeholder="${t("src.phName")}"></label>
      <label class="full">${t("src.fUrl")}<input id="sUrl" placeholder="${t("src.phUrl")}"></label>
      <label>${t("src.fCountry")}<select id="sIso"><option value="EU">${t("src.eu")}</option>${
        [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.iso}">${esc(c.name)}</option>`).join("")}</select></label>
      <label>${t("src.fType")}<select id="sKind">${[["rss", t("src.tFeed")], ["page", t("src.tPage")], ["api", t("src.tApi")]].sort((a, b) => a[1].localeCompare(b[1])).map(([v, label]) => `<option value="${v}">${label}</option>`).join("")}</select></label>
      <label>${t("src.fTrust")}<select id="sType">${[["official", t("manual.optOfficial")], ["unofficial", t("manual.optUnofficial")]].sort((a, b) => a[1].localeCompare(b[1])).map(([v, label]) => `<option value="${v}">${label}</option>`).join("")}</select></label>
      <label class="full">${t("src.fNote")}<input id="sNote" placeholder="${t("src.phNote")}"></label>
    </div>
    <div class="q-actions"><button class="btn primary" id="sAdd">${t("src.save")}</button>
      <span class="q-note" id="sMsg"></span></div>
  </div></div>
  ${customSources().length ? `<div class="card"><div class="cap"><h2>${t("src.pending")} (${customSources().length})</h2>
    <button class="btn" id="sExport">${t("src.export")}</button></div><div class="bd">
    <p class="q-note" style="margin-top:0">${t("src.pendingNote")}</p></div></div>` : ""}` : ""}
  ${regId() === "nis2" && typeof AUTHORITY_FEEDS !== "undefined" ? `
  <details class="card fold"><summary class="cap"><h2>${t("src.authTitle")}</h2>
    <span class="q-note">${t("src.authOk", {
      n: AUTHORITY_FEEDS.filter(a => a.kind === "rss").length, total: AUTHORITY_FEEDS.length })}</span>
    <span class="fold-car" aria-hidden="true">▾</span></summary>
    <div class="bd">
    <p class="q-note" style="margin-top:0">${t("src.authSub")}</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t("src.thScope")}</th><th>${t("src.thAuth")}</th><th>${t("src.thFeed")}</th><th>${t("src.thState")}</th><th class="num">${t("src.thEntries")}</th></tr></thead>
      <tbody>${AUTHORITY_FEEDS.map(a => `<tr>
        <td style="white-space:nowrap"><i class="fi">${flagSvg(a.iso)}</i> ${esc(byIso[a.iso] ? byIso[a.iso].name : a.iso)}</td>
        <td>${esc(a.name)}</td>
        <td><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url.replace(/^https?:\/\//, "").slice(0, 46))}</a></td>
        <td><span class="chip ${a.kind === "rss" ? "src-official" : a.kind === "down" ? "st-rejected" : "src-unofficial"}">${
          t({ rss: "src.kRss", harvest: "src.kHarvest", page: "src.kPage" }[a.kind] || "src.kDown")}</span></td>
        <td class="num">${a.entries || "-"}</td></tr>`).join("")}
      </tbody></table></div>
  </div></details>` : ""}
  <div class="card"><div class="bd">
    <div class="filters">
      <input id="sSearch" type="search" class="q-search" autocomplete="off"
        placeholder="${t("src.searchCountry")}" value="${esc(srcSearch)}"
        aria-label="${t("src.searchCountry")}">
      <span class="q-note" id="sCount"></span>
    </div>
    <!-- Le drapeau se reconnaît plus vite qu'un nom se lit, et la barre du
         dessus rattrape les pays que l'oeil ne trouve pas. Même geste que dans
         la file de veille, pour que les deux onglets se manipulent pareil. -->
    <div class="sflags" id="sFlags"></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t("src.thScope")}</th><th>${t("src.thSource")}</th><th>${t("src.thTrust")}</th><th>${t("src.thNote")}</th>${isVal ? "<th></th>" : ""}</tr></thead>
      <tbody id="srcRows"></tbody>
    </table></div>
  </div></div>`;

  function paint(){
    const needle = srcSearch.trim().toLowerCase();
    const shown = needle
      ? scopes.filter(iso => scopeName(iso).toLowerCase().includes(needle)
                          || iso.toLowerCase().startsWith(needle))
      : scopes;
    /* Un filtre qui ne figure plus dans la liste resterait actif sans être
       visible : la recherche le relâche plutôt que de mentir sur le décompte. */
    if (srcFilter && !shown.includes(srcFilter)) srcFilter = "";

    $("#sFlags").innerHTML = `<button class="sflag ${srcFilter ? "" : "on"}" data-iso=""
        type="button">${t("src.allCountries")}</button>` + shown.map(iso =>
      `<button class="sflag ${srcFilter === iso ? "on" : ""}" data-iso="${esc(iso)}" type="button"
         title="${esc(scopeName(iso))}"><i class="fi">${flagSvg(iso)}</i>
         <span>${esc(scopeName(iso))}</span>
         <span class="sflag-n">${rows.filter(r => r.iso === iso).length}</span></button>`).join("")
      + (shown.length ? "" : `<span class="q-note">${t("src.noCountry", { q: esc(srcSearch) })}</span>`);
    $("#sFlags").querySelectorAll(".sflag").forEach(b => b.addEventListener("click", () => {
      srcFilter = b.dataset.iso === srcFilter ? "" : b.dataset.iso;
      paint();
    }));

    /* Même règle que l'encart des propositions : la recherche restreint le
       tableau, un pays cliqué l'emporte sur elle. */
    const list = rows.filter(r => srcFilter ? r.iso === srcFilter
      : needle ? shown.includes(r.iso) : true);
    $("#sCount").textContent = t("src.count", { n: list.length, total: rows.length });
    $("#srcRows").innerHTML = list.map(r => `<tr>
      <td style="white-space:nowrap">${r.iso ? `<i class="fi">${flagSvg(r.iso)}</i> ` : ""}${esc(r.scope)}</td>
      <td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}${
        r.custom ? ` <span class="chip src-manual">${t("src.custom")}</span>` : ""}</td>
      <td>${srcChip(r.type)}</td>
      <td style="color:var(--muted)">${esc(r.note || "")}</td>
      ${isVal ? `<td>${r.custom ? `<button class="btn danger" data-rm="${r.idx}">${t("src.remove")}</button>` : ""}</td>` : ""}
    </tr>`).join("");
    $("#srcRows").querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
      customSources().splice(+b.dataset.rm, 1); saveStore(); renderSources();
    }));
  }
  paint();
  /* Repeindre plutôt que re-rendre : un re-render vide le champ et lui prend le
     focus, ce qui rend la frappe impossible. */
  $("#sSearch").addEventListener("input", e => { srcSearch = e.target.value; paint(); });

  if (!isVal) return;
  $("#sAdd").addEventListener("click", () => {
    const name = $("#sName").value.trim(), url = $("#sUrl").value.trim();
    if (!name || !url) { $("#sMsg").textContent = t("src.needName"); return; }
    customSources().push({ name, url, iso: $("#sIso").value, kind: $("#sKind").value,
                           type: $("#sType").value, note: $("#sNote").value.trim() });
    saveStore(); renderSources();
    const msg = $("#sMsg"); if (msg) msg.textContent = t("src.added");
  });
  const exp = $("#sExport");
  if (exp) exp.addEventListener("click", () => {
    /* Shaped like tblSources so the agent's registry can absorb it directly. */
    const payload = customSources().map(x => ({
      Source: x.name, Type: { rss: "RSS", page: "Page web", api: "API" }[x.kind] || "RSS",
      "URL / Endpoint": x.url, Actif: "Oui", "Pays / zone": x.iso,
      "Fiabilité": x.type === "official" ? "Officielle" : "Non officielle - à vérifier",
      Note: x.note }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "regwatch-sources.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
