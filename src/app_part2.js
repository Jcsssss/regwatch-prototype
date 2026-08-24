/* ---------- Countries list ---------- */
let ctyFilter = { q: "", region: "", lvl: "" };
let inboxFilter = { q: "", iso: "", minScore: "", days: "", rel: "", group: true };
function renderCountries(){
  const el = $("#v-countries");
  el.innerHTML = `
  <h1 class="pg">${t("cty.title")}</h1>
  <p class="pg-sub">${t("cty.sub")}</p>
  <div class="card"><div class="bd">
    <div class="filters">
      <input type="search" id="fQ" placeholder="${t("cty.search")}" value="${esc(ctyFilter.q)}" aria-label="Search country">
      <select id="fR" aria-label="Filter by region"><option value="">${t("cty.allRegions")}</option>${["West","North","South","East"].map(r => `<option value="${r}" ${ctyFilter.region === r ? "selected" : ""}>${t("reg." + r)}</option>`).join("")}</select>
      <select id="fL" aria-label="Filter by level"><option value="">${t("cty.allLevels")}</option>${[4,3,2,1].map(l => `<option value="${l}" ${ctyFilter.lvl == l ? "selected" : ""}>${t("common.level")} ${l}</option>`).join("")}</select>
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
        <td><b>${c.flag} ${esc(c.name)}</b>${c.eu ? "" : ` <span class="chip eu">${t("cty.nonEu")}</span>`}</td>
        <td>${t("reg." + c.region)}</td>
        <td>${lvlChip(c)}</td>
        <td>${c.lawInForce ? fmtDate(c.lawInForce) : `<span style="color:var(--muted)">${t("common.notYet")}</span>`}</td>
        <td class="num">${c.onTime ? t("common.onTime") : (c.delayMonths != null ? "+" + c.delayMonths : "—")}</td>
        <td>${fwChip(c)}</td>
        <td class="num">${c.reqEE ?? "—"}</td><td class="num">${c.reqIE ?? "—"}</td>
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
const SEC_KEYS = ["fw", "reg", "inc", "aud", "scope", "other", "reco"];
function renderCountry(iso){
  const c = byIso[iso];
  const el = $("#v-country");
  if (!c) { el.innerHTML = `<p>${t("cp.unknown")}</p>`; return; }
  const facts = [
    [t("cp.law"), c.law],
    [t("cp.fw"), `<b>${esc(t("fw." + c.fw))}</b> — ${esc(c.fwName)}`],
    [t("cp.req"), c.reqEE ? `<b>${c.reqEE}</b> ${t("cp.forEE")} · <b>${c.reqIE ?? "—"}</b> ${t("cp.forIE")}` : t("cp.reqNone")],
    [t("cp.deadline"), c.complianceEE ? `<b>${c.complianceEE} ${t("common.months")}</b> (EE)${c.complianceIE && c.complianceIE !== c.complianceEE ? ` · ${c.complianceIE} ${t("common.months")} (IE)` : ""}` : t("cp.deadlineNone")],
    [t("cp.regChannel"), c.regTool],
    [t("cp.incChannel"), c.incidentMethod],
    [t("cp.auditBody"), `${esc(c.auditBody)}${c.auditFreqEE ? ` — EE ${t("cp.every")} <b>${c.auditFreqEE} ${t("common.mo")}</b>` : ""}${c.auditFreqIE ? ` · IE ${t("cp.every")} <b>${c.auditFreqIE} ${t("common.mo")}</b>` : ""}`]
  ];
  const secHtml = SEC_KEYS.filter(k => c.sections[k] && c.sections[k].length).map(k => `
    <div class="sec"><h3>${t("sec." + k)}</h3><ul>${c.sections[k].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
  el.innerHTML = `
  <a class="back" href="#/countries">${t("cp.back")}</a>
  <div class="cty-head">
    <span class="flag">${c.flag}</span>
    <div>
      <h1>${esc(c.name)}</h1>
      <div class="meta">
        ${lvlChip(c)} ${fwChip(c)}
        <span class="chip eu">${c.eu ? t("cp.euMember") : t("cp.nonEu")}</span>
        <span class="stepper" title="${esc(t("lvl." + c.maturity))}">${[1,2,3,4].map(l => `<span class="st ${l <= c.maturity ? "on" + l : ""}"></span>`).join("")}</span>
      </div>
      <p style="margin:9px 0 0;color:var(--ink2);max-width:78ch">${esc(t("lvl." + c.maturity))}. ${esc(c.summary)}</p>
    </div>
    <div class="upd">${t("cp.lastUpdate")}<br><b class="num" style="color:var(--ink)">${fmtDate(c.lastUpdate)}</b><br>${c.transposed ? (c.onTime ? t("cp.onTime") : t("cp.inForce", { date: fmtDateL(c.lawInForce), n: c.delayMonths })) : t("cp.notTransposed")}${role === "validator" ? `<br><button class="btn" id="deckBtn" style="margin-top:9px">${t("cp.genSlides")}</button>` : ""}</div>
  </div>
  <div class="facts">${facts.map(f => `<div class="fact"><div class="k">${f[0]}</div><div class="v">${f[1]}</div></div>`).join("")}</div>
  <div class="cty-grid">
    <div class="card"><div class="bd">${secHtml}
      ${c.next && c.next.length ? `<div class="sec"><h3>${t("cp.nextSteps")}</h3><ul>${c.next.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    </div></div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><div class="cap"><h2>${t("cp.timeline")}</h2></div><div class="bd">
        <ul class="tl">${[...c.timeline].sort((a, b) => b.date < a.date ? -1 : 1).map(t => `
          <li class="${t.added ? "added" : ""}"><span class="pt"></span><div class="d">${fmtDate(t.date)}${t.added ? ` · <span style="color:var(--ok)">${t("cp.addedVia")}</span>` : ""}</div><div class="x">${esc(t.text)}</div></li>`).join("")}
        </ul>
        ${c.timeline.some(t => t.added) ? `<div class="q-note" style="margin-top:8px">${t("cp.timelineNote")}</div>` : ""}
      </div></div>
      <div class="card"><div class="cap"><h2>${t("cp.authorities")}</h2></div><div class="bd auth">
        ${c.authorities.map(a => `<div class="a"><b>${esc(a.name)}</b><span>${esc(a.role)}</span></div>`).join("")}
      </div></div>
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
    db.disabled = true; db.textContent = "Generating…";
    try {
      await generateCountryDeck(iso);
      db.textContent = "✓ Downloaded";
    } catch (err) {
      db.textContent = "⚠ Failed";
      console.error(err);
      alert("Could not generate the deck: " + err.message);
    }
    setTimeout(() => { db.disabled = false; db.textContent = label; }, 2500);
  });
}

/* ---------- Watch inbox ---------- */
function renderInbox(){
  const el = $("#v-inbox");
  const pending = queue.filter(q => q.status === "pending").sort((a, b) => b.detected < a.detected ? -1 : 1);
  const done = queue.filter(q => q.status !== "pending").sort((a, b) => b.detected < a.detected ? -1 : 1);
  const isVal = role === "validator";
  el.innerHTML = `
  <h1 class="pg">${t("inbox.title")}</h1>
  <p class="pg-sub">${t("inbox.sub")}</p>
  ${isVal ? "" : `<div class="rolenote"><b>${t("role.reader")}.</b> ${t("inbox.sub")}</div>`}
  ${isVal ? `
  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>${t("inbox.pending")} (${pending.length})</h2></div><div class="bd">
    <div class="filters">
      <input type="search" id="qQ" placeholder="${t("inbox.search")}" value="${esc(inboxFilter.q)}" aria-label="Search pending items">
      <select id="qC" aria-label="Filter by country"><option value="">${t("inbox.allCountries")}</option>${inboxCountries(pending).map(o => `<option value="${o.iso}" ${inboxFilter.iso === o.iso ? "selected" : ""}>${esc(o.label)} (${o.n})</option>`).join("")}</select>
      <select id="qS" aria-label="Minimum AI relevance score"><option value="">${t("inbox.anyScore")}</option>${[9, 8, 7].map(s => `<option value="${s}" ${inboxFilter.minScore == s ? "selected" : ""}>${t("inbox.score")} ${s}</option>`).join("")}</select>
      <select id="qD" aria-label="Filter by detection window"><option value="">${t("inbox.anyDate")}</option>${[[7, t("inbox.last7")], [30, t("inbox.last30")], [90, t("inbox.last90")]].map(([d, l]) => `<option value="${d}" ${inboxFilter.days == d ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select id="qR" aria-label="Filter by source reliability"><option value="">${t("inbox.anySource")}</option><option value="official" ${inboxFilter.rel === "official" ? "selected" : ""}>${t("inbox.officialOnly")}</option><option value="unofficial" ${inboxFilter.rel === "unofficial" ? "selected" : ""}>${t("inbox.toVerify")}</option></select>
      <label class="q-toggle"><input type="checkbox" id="qG" ${inboxFilter.group ? "checked" : ""}> ${t("inbox.group")}</label>
      <span class="q-note" id="qCount"></span>
      <button class="btn" id="qReset" type="button">${t("inbox.reset")}</button>
    </div>
    <div id="pendList"></div>
  </div></div>
  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>${t("manual.title")}</h2></div><div class="bd">
    <p class="q-note" style="margin-top:0">${t("manual.sub")}</p>
    <div class="form-grid">
      <label>${t("manual.country")}<select id="mCty">${COUNTRIES.map(c => `<option value="${c.iso}">${esc(c.name)}</option>`).join("")}</select></label>
      <label>${t("manual.date")}<input type="date" id="mDate" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>${t("manual.srcType")}<select id="mType"><option value="official">${t("manual.optOfficial")}</option><option value="unofficial">${t("manual.optUnofficial")}</option><option value="manual" selected>${t("manual.optManual")}</option></select></label>
      <label>${t("manual.srcName")}<input id="mSrc" placeholder="${t("manual.phSrc")}"></label>
      <label class="full">${t("manual.itemTitle")}<input id="mTitle" placeholder="${t("manual.phTitle")}"></label>
      <label class="full">${t("manual.summary")}<input id="mSum" placeholder="${t("manual.phSum")}"></label>
    </div>
    <div class="q-actions"><button class="btn primary" id="mAdd">${t("manual.add")}</button><span class="q-note" id="mMsg"></span></div>
  </div></div>` : ""}
  <div class="card"><div class="cap"><h2>${t("inbox.processed")}</h2></div><div class="bd">
    ${done.length ? done.map(qCard).join("") : `<p style="color:var(--muted)">${t("inbox.none")}</p>`}
  </div></div>`;
  if (isVal) {
    paintPending(pending);
    const rerun = () => paintPending(pending);
    $("#qQ").addEventListener("input", e => { inboxFilter.q = e.target.value; rerun(); });
    [["#qC", "iso"], ["#qS", "minScore"], ["#qD", "days"], ["#qR", "rel"]].forEach(([sel, key]) => {
      $(sel).addEventListener("change", e => { inboxFilter[key] = e.target.value; rerun(); });
    });
    $("#qG").addEventListener("change", e => { inboxFilter.group = e.target.checked; rerun(); });
    $("#qReset").addEventListener("click", () => { inboxFilter = { q: "", iso: "", minScore: "", days: "", rel: "", group: true }; renderInbox(); });
    $("#mAdd").addEventListener("click", () => {
      const title = $("#mTitle").value.trim();
      if (!title) { $("#mMsg").textContent = t("manual.needTitle"); return; }
      const item = { id: "m" + Date.now(), detected: $("#mDate").value, iso: $("#mCty").value, title,
        summary: $("#mSum").value.trim() || "Manual entry.", source: { name: $("#mSrc").value.trim() || "Consultant input", url: "", type: $("#mType").value }, status: "pending", action: "Review then add to country timeline" };
      queue.push(item); store.manual.push(item); saveStore(); refreshBadge(); renderInbox();
    });
  }
}
/* Countries actually present in the queue, so the picker never offers an empty filter. */
function inboxCountries(items){
  const n = {};
  items.forEach(q => { n[q.iso] = (n[q.iso] || 0) + 1; });
  return Object.keys(n)
    .map(iso => ({ iso, n: n[iso], label: byIso[iso] ? byIso[iso].name : iso }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
/* Official first, then the strongest AI relevance, then the most recent. */
function rankItems(list){
  const rel = t => (t === "official" ? 0 : t === "manual" ? 1 : 2);
  return list.slice().sort((a, b) =>
    rel(a.source.type) - rel(b.source.type)
    || ((b.agent || {}).score || 0) - ((a.agent || {}).score || 0)
    || (a.detected < b.detected ? 1 : -1));
}
/* A weekly agent run can queue 100+ items; triage keeps the review session workable. */
function paintPending(pending){
  const f = inboxFilter;
  const q = f.q.trim().toLowerCase();
  const cutoff = f.days ? new Date(Date.now() - f.days * 864e5).toISOString().slice(0, 10) : "";
  const list = pending
    .filter(x => !q || (x.title + " " + x.summary).toLowerCase().includes(q))
    .filter(x => !f.iso || x.iso === f.iso)
    .filter(x => !f.minScore || ((x.agent || {}).score != null && x.agent.score >= +f.minScore))
    .filter(x => !cutoff || x.detected >= cutoff)
    .filter(x => !f.rel || x.source.type === f.rel);
  $("#qCount").textContent = t("inbox.count", { n: list.length, total: pending.length });

  let html;
  if (!list.length) {
    html = `<p style="color:var(--muted)">${t("inbox.noMatch")}</p>`;
  } else if (inboxFilter.group) {
    /* One section per country — the review is done country by country, and within
       a country official sources outrank press, then the AI relevance score. */
    const by = {};
    list.forEach(x => { (by[x.iso] = by[x.iso] || []).push(x); });
    html = Object.keys(by)
      /* Groups with no country record (EU-wide items) go last: they carry no
         workbook cells and cannot be published to a record, so leading with them
         buries the actionable countries below a wall of unactionable cards. */
      .sort((a, b) => (byIso[a] ? 0 : 1) - (byIso[b] ? 0 : 1)
        || by[b].length - by[a].length
        || (byIso[a] ? byIso[a].name : a).localeCompare(byIso[b] ? byIso[b].name : b))
      .map(iso => {
        const c = byIso[iso];
        const items = rankItems(by[iso]);
        const off = items.filter(x => x.source.type === "official").length;
        const cells = items.filter(x => (x.targetCells || []).length).length;
        return `<details class="q-group" ${c ? "open" : ""}>
          <summary><b>${c ? c.flag + " " + esc(c.name) : "🇪🇺 " + t("inbox.euGroup")}</b>
            <span class="q-note">${items.length} ${t("inbox.grpPending")} · ${off} ${t("inbox.grpOfficial")} · ${items.length - off} ${t("inbox.grpVerify")}${
              c ? ` · ${cells} ${t("inbox.grpCells")}`
                : ` · ${t("inbox.grpNoRecord")}`}</span></summary>
          ${items.map(qCard).join("")}
        </details>`;
      }).join("");
  } else {
    html = rankItems(list).map(qCard).join("");
  }
  $("#pendList").innerHTML = html;
  $("#pendList").querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => act(b.dataset.act, b.dataset.id)));
}
/* The cells of the comparative workbook this source would change — collapsed,
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
   Decision support for the validator — never a publication status. */
function agentPanel(q){
  const a = q.agent || {};
  /* The agent packs several obligations into one ";"-separated string. */
  const points = String(a.obligations || "")
    .split(/\s*;\s*/).map(s => s.trim()).filter(s => s.length > 3);

  const blocks = [];
  if (q.summary) blocks.push(`<div class="q-agent-row"><b>${t("card.aiSynthesis")}</b><span>${esc(q.summary)}</span></div>`);
  if (points.length) blocks.push(`<div class="q-agent-row"><b>${t("card.aiPoints")}</b>
    <span><ul class="q-points">${points.map(p => `<li>${esc(p)}</li>`).join("")}</ul></span></div>`);
  if (a.score != null) blocks.push(`<div class="q-agent-row"><b>${t("card.aiRelevance")}</b>
    <span>${a.score}/10${a.justification ? " — " + esc(a.justification) : ""}</span></div>`);
  if (a.impact) blocks.push(`<div class="q-agent-row"><b>${t("card.aiImpact")}</b><span>${esc(a.impact)}</span></div>`);
  if (a.entities) blocks.push(`<div class="q-agent-row"><b>${t("card.aiEntities")}</b><span>${esc(a.entities)}</span></div>`);
  if (q.clientAdvice) blocks.push(`<div class="q-agent-row"><b>${t("card.aiAdvice")}</b><span>${esc(q.clientAdvice)}</span></div>`);
  if (!blocks.length) return "";

  return `<details class="q-agent"><summary>${t("card.ai")}</summary>
    ${blocks.join("")}
    <div class="q-agent-row"><b></b><span class="q-note">${t("card.aiNote")}</span></div>
  </details>`;
}
function qCard(q){
  const c = byIso[q.iso];
  const isVal = role === "validator";
  const a = q.agent || {};
  /* Date and link first: they are what a validator reaches for to check a source. */
  const meta = [
    a.publishedOn ? `<span><span class="k">${t("card.published")}</span> <span class="num">${fmtDateL(a.publishedOn)}</span></span>` : "",
    `<span><span class="k">${t("card.detected")}</span> <span class="num">${fmtDateL(q.detected)}</span></span>`,
    a.inForceOn ? `<span><span class="k">${t("card.inForce")}</span> <span class="num">${fmtDateL(a.inForceOn)}</span></span>` : "",
    q.source.url
      ? `<a class="q-open" href="${esc(q.source.url)}" target="_blank" rel="noopener">${t("card.open")}</a>`
      : `<span class="q-note">${t("card.noLink")}</span>`
  ].filter(Boolean).join("");

  /* The source's own opening lines when we could fetch them; the agent's
     summary otherwise, labelled so the two are never confused. */
  const body = q.excerpt
    ? `<blockquote class="q-excerpt">${esc(q.excerpt)}</blockquote>`
    : `<blockquote class="q-excerpt">${esc(q.summary)}
         <span class="src-note">${t("card.excerptFallback")}</span></blockquote>`;

  return `<div class="q-card">
    <div class="q-top"><b>${c ? c.flag + " " + esc(c.name) : "🇪🇺 " + esc(q.iso)}</b>${stChip(q.status)}${srcChip(q.source.type)}
      <span class="q-note">${esc(q.source.name)}</span></div>
    <div class="q-title">${esc(q.title)}</div>
    <div class="q-meta">${meta}</div>
    ${body}
    ${cellsPanel(q)}
    ${agentPanel(q)}
    ${q.status === "pending" && isVal ? `<div class="q-actions">
      <button class="btn ok" data-act="validate" data-id="${q.id}">${t("card.validate")}</button>
      <button class="btn danger" data-act="reject" data-id="${q.id}">${t("card.reject")}</button>
      <span class="q-note">${t("card.validateNote", { country: c ? esc(c.name) : esc(q.iso) })}</span></div>` : ""}
    ${q.status !== "pending" ? `<div class="q-note" style="margin-top:8px">${q.status === "validated" ? t("card.validatedBy") : t("card.rejectedBy")} ${t("card.by")} ${esc(q.validatedBy || "NIS 2 core team")} ${t("card.on")} ${fmtDateL(q.validatedOn || q.detected)}${q.rejectReason ? " — " + esc(q.rejectReason) : ""}</div>` : ""}
  </div>`;
}
function act(action, id){
  const q = queue.find(x => x.id === id); if (!q) return;
  const today = new Date().toISOString().slice(0, 10);
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
function renderInsights(){
  const el = $("#v-insights");
  const k = kpis();
  el.innerHTML = `
  <h1 class="pg">${t("ins.title")}</h1>
  <p class="pg-sub">${t("ins.sub")}</p>
  <div class="grid-ov" style="margin-bottom:18px">
    <div class="card"><div class="cap"><h2>${t("ins.reqChart")}</h2></div><div class="bd">
      <div class="legend-row"><span class="leg-s"><span class="sw" style="background:var(--ee)"></span>${t("ins.ee")}</span><span class="leg-s"><span class="sw" style="background:var(--ie)"></span>${t("ins.ie")}</span></div>
      <p class="chart-note">${t("ins.reqNote")}</p>
      <div id="chReq"></div>
    </div></div>
    <div class="card"><div class="cap"><h2>${t("ins.delayChart")}</h2></div><div class="bd">
      <p class="chart-note">${t("ins.delayNote")}</p>
      <div id="chDelay"></div>
      <div class="q-note" style="margin-top:10px">${t("ins.notTransposed")} ${COUNTRIES.filter(c => !c.transposed).map(c => c.flag + " " + esc(c.name)).join(" · ")}</div>
    </div></div>
  </div>
  <div class="card"><div class="cap"><h2>${t("ins.matrix")}</h2>
    <div style="display:flex;gap:8px"><button class="btn" id="csvBtn">${t("ins.csv")}</button></div></div>
    <div class="bd">
    <div class="filters">
      <select id="kR" aria-label="Region filter"><option value="">${t("cty.allRegions")}</option>${["West","North","South","East"].map(r => `<option value="${r}">${t("reg." + r)}</option>`).join("")}</select>
      <select id="kL" aria-label="Level filter"><option value="">${t("cty.allLevels")}</option>${[4,3,2,1].map(l => `<option value="${l}">${t("common.level")} ${l}</option>`).join("")}</select>
      <span class="q-note">${t("ins.fwSummary", { final: k.fwFinal, temp: k.fwTemp, none: k.fwNone })}</span>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t("cty.thCountry")}</th><th>${t("cty.thRegion")}</th><th>${t("ins.thLvl")}</th><th>${t("ins.thTransposed")}</th><th class="num">${t("ins.thDelay")}</th><th>${t("cty.thFw")}</th><th class="num">${t("cty.thReqEE")}</th><th class="num">${t("cty.thReqIE")}</th><th class="num">${t("ins.thComplEE")}</th><th class="num">${t("ins.thComplIE")}</th><th class="num">${t("ins.thAuditEE")}</th><th class="num">${t("ins.thAuditIE")}</th><th class="num">${t("ins.thSelf")}</th><th>${t("ins.thAuditBody")}</th><th>${t("ins.thReg")}</th><th>${t("ins.thInc")}</th></tr></thead>
      <tbody id="kRows"></tbody></table></div>
  </div></div>`;
  drawReqChart($("#chReq"));
  drawDelayChart($("#chDelay"));
  const paint = () => {
    const r = $("#kR").value, l = $("#kL").value;
    const list = COUNTRIES.filter(c => (!r || c.region === r) && (!l || c.maturity == l)).sort((a, b) => a.name.localeCompare(b.name));
    $("#kRows").innerHTML = list.map(c => `<tr>
      <td><b>${c.flag} ${esc(c.name)}</b></td><td>${t("reg." + c.region)}</td><td>${lvlChip(c)}</td>
      <td>${c.transposed ? (c.onTime ? t("common.onTime") : fmtDateL(c.lawInForce)) : t("common.no")}</td>
      <td class="num">${c.onTime ? "0" : (c.delayMonths != null ? "+" + c.delayMonths : "—")}</td>
      <td>${fwChip(c)}</td>
      <td class="num">${c.reqEE ?? "—"}</td><td class="num">${c.reqIE ?? "—"}</td>
      <td class="num">${c.complianceEE ?? "—"}</td><td class="num">${c.complianceIE ?? "—"}</td>
      <td class="num">${c.auditFreqEE ?? "—"}</td><td class="num">${c.auditFreqIE ?? "—"}</td><td class="num">${c.selfAssessFreq ?? "—"}</td>
      <td>${esc(c.auditBody)}</td><td>${esc(c.regTool)}</td><td>${esc(c.incidentMethod)}</td></tr>`).join("");
  };
  paint();
  $("#kR").addEventListener("change", paint);
  $("#kL").addEventListener("change", paint);
  $("#csvBtn").addEventListener("click", exportCSV);
}
function chartTip(el){
  el.querySelectorAll("[data-tip]").forEach(n => {
    n.addEventListener("mousemove", e => showTip(n.dataset.tip, e.clientX, e.clientY));
    n.addEventListener("mouseleave", hideTip);
  });
}
function drawReqChart(host){
  const data = COUNTRIES.filter(c => c.reqEE != null).sort((a, b) => b.reqEE - a.reqEE);
  const W = 640, rowH = 30, padL = 118, padR = 24, padT = 8;
  const H = padT + data.length * rowH + 22;
  const max = Math.max(...data.map(d => d.reqEE)) * 1.05;
  const x = v => padL + (W - padL - padR) * v / max;
  const ee = cssVar("--ee"), ie = cssVar("--ie");
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Bar chart of security requirement counts per country">`;
  for (let g = 0; g <= max; g += 50) s += `<line class="grid-ln" x1="${x(g)}" y1="${padT}" x2="${x(g)}" y2="${H - 20}"/><text class="axis-lbl" x="${x(g)}" y="${H - 7}" text-anchor="middle">${g}</text>`;
  data.forEach((c, i) => {
    const y = padT + i * rowH;
    s += `<text class="bar-lbl" x="${padL - 8}" y="${y + 15}" text-anchor="end">${c.name}</text>`;
    s += `<rect x="${padL}" y="${y + 2}" width="${Math.max(2, x(c.reqEE) - padL)}" height="10" rx="3" fill="${ee}" data-tip="<b>${c.flag} ${esc(c.name)}</b>Essential entities: ${c.reqEE} requirements"/>`;
    s += `<rect x="${padL}" y="${y + 15}" width="${Math.max(2, x(c.reqIE ?? 0) - padL)}" height="10" rx="3" fill="${ie}" data-tip="<b>${c.flag} ${esc(c.name)}</b>Important entities: ${c.reqIE ?? "—"} requirements"/>`;
  });
  s += `</svg>`;
  host.innerHTML = s;
  chartTip(host);
}
function drawDelayChart(host){
  const data = COUNTRIES.filter(c => c.transposed && c.delayMonths != null).sort((a, b) => b.delayMonths - a.delayMonths);
  const W = 520, rowH = 21, padL = 118, padR = 40, padT = 8;
  const H = padT + data.length * rowH + 22;
  const max = Math.max(...data.map(d => d.delayMonths), 1) * 1.08;
  const x = v => padL + (W - padL - padR) * v / max;
  const fill = cssVar("--m3");
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Bar chart of transposition delay in months per country">`;
  for (let g = 0; g <= max; g += 6) s += `<line class="grid-ln" x1="${x(g)}" y1="${padT}" x2="${x(g)}" y2="${H - 20}"/><text class="axis-lbl" x="${x(g)}" y="${H - 7}" text-anchor="middle">${g}</text>`;
  data.forEach((c, i) => {
    const y = padT + i * rowH;
    s += `<text class="bar-lbl" x="${padL - 8}" y="${y + 13}" text-anchor="end">${c.name}</text>`;
    if (c.delayMonths === 0) s += `<circle cx="${x(0) + 4}" cy="${y + 9}" r="3.5" fill="${cssVar('--ok')}" data-tip="<b>${c.flag} ${esc(c.name)}</b>Transposed on time"/>`;
    else s += `<rect x="${padL}" y="${y + 3}" width="${Math.max(2, x(c.delayMonths) - padL)}" height="12" rx="3" fill="${fill}" data-tip="<b>${c.flag} ${esc(c.name)}</b>In force ${fmtDate(c.lawInForce)} — ${c.delayMonths} months late"/>`;
  });
  s += `</svg>`;
  host.innerHTML = s;
  chartTip(host);
}
function exportCSV(){
  /* Headers follow the interface language: a French user exports a French file. */
  const lines = [t("csv.head")];
  COUNTRIES.forEach(c => {
    const row = [c.name, c.iso, c.region, c.eu ? t("common.yes") : t("common.no"), c.maturity, c.transposed ? t("common.yes") : t("common.no"), c.onTime ? t("common.yes") : t("common.no"), c.lawInForce || "", c.delayMonths ?? "", t("fw." + c.fw), c.fwName, c.reqEE ?? "", c.reqIE ?? "", c.complianceEE ?? "", c.complianceIE ?? "", c.auditBody, c.auditFreqEE ?? "", c.auditFreqIE ?? "", c.selfAssessFreq ?? "", c.regTool, c.incidentMethod, c.lastUpdate];
    lines.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  });
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `regwatch-nis2-kpis-${lang}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Sources ---------- */
function renderSources(){
  const el = $("#v-sources");
  const rows = [];
  GLOBAL_SOURCES.forEach(s => rows.push({ scope: s.scope, name: s.name, url: s.url, type: s.type, note: s.note }));
  COUNTRIES.forEach(c => c.sources.forEach(s => rows.push({ scope: c.flag + " " + c.name, name: s.name, url: s.url, type: s.type, note: "" })));
  el.innerHTML = `
  <h1 class="pg">${t("src.title")}</h1>
  <p class="pg-sub">${t("src.sub")}</p>
  <div class="card"><div class="bd">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t("src.thScope")}</th><th>${t("src.thSource")}</th><th>${t("src.thTrust")}</th><th>${t("src.thNote")}</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td style="white-space:nowrap">${esc(r.scope)}</td>
        <td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</td>
        <td>${srcChip(r.type)}</td>
        <td style="color:var(--muted)">${esc(r.note)}</td></tr>`).join("")}
      </tbody></table></div>
  </div></div>`;
}

/* ---------- boot ---------- */
refreshBadge();
const r0 = parseHash();
route(r0.v, r0.arg);
