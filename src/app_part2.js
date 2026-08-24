/* ---------- Countries list ---------- */
let ctyFilter = { q: "", region: "", lvl: "" };
let inboxFilter = { q: "", iso: "", minScore: "", days: "", rel: "", group: true };
function renderCountries(){
  const el = $("#v-countries");
  el.innerHTML = `
  <h1 class="pg">Country records</h1>
  <p class="pg-sub">One structured record per country: status, authorities, framework, registration, incident notification, audits, event timeline and verified sources.</p>
  <div class="card"><div class="bd">
    <div class="filters">
      <input type="search" id="fQ" placeholder="Search a country…" value="${esc(ctyFilter.q)}" aria-label="Search country">
      <select id="fR" aria-label="Filter by region"><option value="">All regions</option>${["West","North","South","East"].map(r => `<option ${ctyFilter.region === r ? "selected" : ""}>${r}</option>`).join("")}</select>
      <select id="fL" aria-label="Filter by level"><option value="">All levels</option>${[4,3,2,1].map(l => `<option value="${l}" ${ctyFilter.lvl == l ? "selected" : ""}>Level ${l}</option>`).join("")}</select>
      <span class="q-note" id="fCount"></span>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Country</th><th>Region</th><th>Maturity</th><th>Law in force</th><th class="num">Delay (mo)</th><th>Framework</th><th class="num">Req. EE</th><th class="num">Req. IE</th><th>Last update</th></tr></thead>
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
    $("#fCount").textContent = list.length + " of " + COUNTRIES.length + " countries";
    rows.innerHTML = list.map(c => `
      <tr class="rowlink" data-iso="${c.iso}" tabindex="0">
        <td><b>${c.flag} ${esc(c.name)}</b>${c.eu ? "" : ' <span class="chip eu">non-EU</span>'}</td>
        <td>${c.region}</td>
        <td>${lvlChip(c)}</td>
        <td>${c.lawInForce ? fmtDate(c.lawInForce) : "<span style='color:var(--muted)'>not yet</span>"}</td>
        <td class="num">${c.onTime ? "on time" : (c.delayMonths != null ? "+" + c.delayMonths : "—")}</td>
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
const SEC_TITLES = { fw: "Cybersecurity framework & requirements", reg: "Registration of entities", inc: "Incident notification", aud: "Audits & controls", scope: "Scope — sector & public-sector specifics", other: "Interplay with other regulations", reco: "Wavestone recommendations" };
function renderCountry(iso){
  const c = byIso[iso];
  const el = $("#v-country");
  if (!c) { el.innerHTML = "<p>Unknown country.</p>"; return; }
  const facts = [
    ["Transposition law", c.law],
    ["Cybersecurity framework", `<b>${esc(FW_LABEL[c.fw])}</b> — ${esc(c.fwName)}`],
    ["Requirements", c.reqEE ? `<b>${c.reqEE}</b> for EE · <b>${c.reqIE ?? "—"}</b> for IE` : "Not published / not analysed yet"],
    ["Compliance deadline", c.complianceEE ? `<b>${c.complianceEE} months</b> (EE)${c.complianceIE && c.complianceIE !== c.complianceEE ? ` · ${c.complianceIE} months (IE)` : ""}` : "Not set"],
    ["Registration channel", c.regTool],
    ["Incident channel", c.incidentMethod],
    ["Audit body", `${esc(c.auditBody)}${c.auditFreqEE ? ` — EE every <b>${c.auditFreqEE} mo</b>` : ""}${c.auditFreqIE ? ` · IE every <b>${c.auditFreqIE} mo</b>` : ""}`]
  ];
  const secHtml = Object.keys(SEC_TITLES).filter(k => c.sections[k] && c.sections[k].length).map(k => `
    <div class="sec"><h3>${SEC_TITLES[k]}</h3><ul>${c.sections[k].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
  el.innerHTML = `
  <a class="back" href="#/countries">← All countries</a>
  <div class="cty-head">
    <span class="flag">${c.flag}</span>
    <div>
      <h1>${esc(c.name)}</h1>
      <div class="meta">
        ${lvlChip(c)} ${fwChip(c)}
        <span class="chip eu">${c.eu ? "EU member" : "Non-EU — tracked"}</span>
        <span class="stepper" title="${esc(LEVELS[c.maturity].label)}">${[1,2,3,4].map(l => `<span class="st ${l <= c.maturity ? "on" + l : ""}"></span>`).join("")}</span>
      </div>
      <p style="margin:9px 0 0;color:var(--ink2);max-width:78ch">${esc(LEVELS[c.maturity].label)}. ${esc(c.summary)}</p>
    </div>
    <div class="upd">Last update<br><b class="num" style="color:var(--ink)">${fmtDate(c.lastUpdate)}</b><br>${c.transposed ? (c.onTime ? "Transposed on time" : `In force ${fmtDate(c.lawInForce)} (+${c.delayMonths} mo)`) : "Not transposed yet"}${role === "validator" ? `<br><button class="btn" id="deckBtn" style="margin-top:9px">⬇ Generate country slides</button>` : ""}</div>
  </div>
  <div class="facts">${facts.map(f => `<div class="fact"><div class="k">${f[0]}</div><div class="v">${f[1]}</div></div>`).join("")}</div>
  <div class="cty-grid">
    <div class="card"><div class="bd">${secHtml}
      ${c.next && c.next.length ? `<div class="sec"><h3>Next steps</h3><ul>${c.next.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    </div></div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><div class="cap"><h2>Event timeline</h2></div><div class="bd">
        <ul class="tl">${[...c.timeline].sort((a, b) => b.date < a.date ? -1 : 1).map(t => `
          <li class="${t.added ? "added" : ""}"><span class="pt"></span><div class="d">${fmtDate(t.date)}${t.added ? ' · <span style="color:var(--ok)">added via watch inbox</span>' : ""}</div><div class="x">${esc(t.text)}</div></li>`).join("")}
        </ul>
        ${c.timeline.some(t => t.added) ? `<div class="q-note" style="margin-top:8px">Green-dot entries were published automatically after validation in the watch inbox — the rest of the record is maintained by hand.</div>` : ""}
      </div></div>
      <div class="card"><div class="cap"><h2>Authorities</h2></div><div class="bd auth">
        ${c.authorities.map(a => `<div class="a"><b>${esc(a.name)}</b><span>${esc(a.role)}</span></div>`).join("")}
      </div></div>
      <div class="card"><div class="cap"><h2>Sources</h2></div><div class="bd srcs">
        ${c.sources.map(s => `<div class="s">${srcChip(s.type)}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</div>`).join("")}
        <div class="q-note" style="margin-top:4px">All country-record content is sourced from the documents above or validated by a Wavestone consultant.</div>
      </div></div>
    </div>
    <div class="rolenote" style="margin:16px 0 0">
      <b>Read-only record.</b> Country data mirrors the comparative workbook on SharePoint, which stays the single source of truth.
      To change a fact, edit the workbook — the next sync brings it back here. Validating a Watch inbox item tells you which cells to change.
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
  <h1 class="pg">Watch inbox</h1>
  <p class="pg-sub">Items detected by the automated collection pipeline (official sources, press, community) plus manual inputs from consultants. Nothing is published to country records until a validator approves it.</p>
  ${isVal ? "" : `<div class="rolenote"><b>Reader mode.</b> Pending items and validation actions are reserved for the NIS 2 core team (switch role to “Validator” in the header to demo the workflow). Below is the log of already-processed items.</div>`}
  ${isVal ? `
  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Pending validation (${pending.length})</h2></div><div class="bd">
    <div class="filters">
      <input type="search" id="qQ" placeholder="Search title or summary…" value="${esc(inboxFilter.q)}" aria-label="Search pending items">
      <select id="qC" aria-label="Filter by country"><option value="">All countries</option>${inboxCountries(pending).map(o => `<option value="${o.iso}" ${inboxFilter.iso === o.iso ? "selected" : ""}>${esc(o.label)} (${o.n})</option>`).join("")}</select>
      <select id="qS" aria-label="Minimum AI relevance score"><option value="">Any score</option>${[9, 8, 7].map(s => `<option value="${s}" ${inboxFilter.minScore == s ? "selected" : ""}>Score ≥ ${s}</option>`).join("")}</select>
      <select id="qD" aria-label="Filter by detection window"><option value="">Any date</option>${[[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"]].map(([d, l]) => `<option value="${d}" ${inboxFilter.days == d ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select id="qR" aria-label="Filter by source reliability"><option value="">Any source</option><option value="official" ${inboxFilter.rel === "official" ? "selected" : ""}>Official only</option><option value="unofficial" ${inboxFilter.rel === "unofficial" ? "selected" : ""}>To verify</option></select>
      <label class="q-toggle"><input type="checkbox" id="qG" ${inboxFilter.group ? "checked" : ""}> Group by country</label>
      <span class="q-note" id="qCount"></span>
      <button class="btn" id="qReset" type="button">Reset</button>
    </div>
    <div id="pendList"></div>
  </div></div>
  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Add an entry manually</h2></div><div class="bd">
    <p class="q-note" style="margin-top:0">For information gathered outside the pipeline (sector working groups, peer exchanges…). Manual entries join the pending queue with a “Manual” source flag.</p>
    <div class="form-grid">
      <label>Country<select id="mCty">${COUNTRIES.map(c => `<option value="${c.iso}">${esc(c.name)}</option>`).join("")}</select></label>
      <label>Date<input type="date" id="mDate" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Source type<select id="mType"><option value="official">Official</option><option value="unofficial">Unofficial — to verify</option><option value="manual" selected>Manual — consultant input</option></select></label>
      <label>Source name<input id="mSrc" placeholder="e.g. sector working group"></label>
      <label class="full">Title<input id="mTitle" placeholder="What happened?"></label>
      <label class="full">Summary / note<input id="mSum" placeholder="Context, implications, confidentiality flag…"></label>
    </div>
    <div class="q-actions"><button class="btn primary" id="mAdd">Add to pending queue</button><span class="q-note" id="mMsg"></span></div>
  </div></div>` : ""}
  <div class="card"><div class="cap"><h2>Processed items</h2></div><div class="bd">
    ${done.length ? done.map(qCard).join("") : `<p style="color:var(--muted)">No processed items yet.</p>`}
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
      if (!title) { $("#mMsg").textContent = "A title is required."; return; }
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
  $("#qCount").textContent = list.length + " of " + pending.length + " pending";

  let html;
  if (!list.length) {
    html = `<p style="color:var(--muted)">No pending item matches these filters.</p>`;
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
          <summary><b>${c ? c.flag + " " + esc(c.name) : "🇪🇺 EU-wide"}</b>
            <span class="q-note">${items.length} pending · ${off} official · ${items.length - off} to verify${
              c ? ` · ${cells} with workbook cells`
                : " · no country record — nothing to update in the workbook"}</span></summary>
          ${items.map(qCard).join("")}
        </details>`;
      }).join("");
  } else {
    html = rankItems(list).map(qCard).join("");
  }
  $("#pendList").innerHTML = html;
  $("#pendList").querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => act(b.dataset.act, b.dataset.id)));
}
/* The cells of the comparative workbook this source would change.
   This is the validator's actual worklist, so it sits open on the card. */
function cellsPanel(q){
  const t = q.targetCells;
  if (!t || !t.length) return "";
  const bySheet = {};
  t.forEach(x => { (bySheet[x.sheet] = bySheet[x.sheet] || []).push(x); });
  return `<div class="q-cells">
    <div class="q-cells-h">Cells to update in the comparative workbook <span>${t.length}</span></div>
    ${Object.keys(bySheet).map(sheet => `<div class="q-cells-row">
      <b>${esc(sheet)}</b>
      <span>${bySheet[sheet].map(x => `<code>${esc(x.cell)}</code> ${esc(x.field)}`).join(" · ")}</span>
    </div>`).join("")}
    <div class="q-note">Suggested targets — confirm against the source before editing the workbook.</div>
  </div>`;
}
/* Decision support from the watch agent — shown to the validator, never a publication status. */
function agentPanel(q){
  const a = q.agent; if (!a) return "";
  const rows = [
    ["Relevance", a.score != null ? `${a.score}/10${a.justification ? " — " + esc(a.justification) : ""}` : ""],
    ["Obligations", a.obligations ? esc(a.obligations) : ""],
    ["Impact", a.impact ? esc(a.impact) : ""],
    ["Entities", a.entities ? esc(a.entities) : ""],
    ["Published", a.publishedOn ? fmtDate(a.publishedOn) : ""],
    ["In force", a.inForceOn ? fmtDate(a.inForceOn) : ""],
    /* Advice aimed at a client company — not what the validator acts on, hence last. */
    ["Client advice", q.clientAdvice ? esc(q.clientAdvice) : ""]
  ].filter(r => r[1]);
  if (!rows.length) return "";
  return `<details class="q-agent"><summary>AI analysis — decision support, not a decision</summary>
    ${rows.map(r => `<div class="q-agent-row"><b>${r[0]}</b><span>${r[1]}</span></div>`).join("")}
  </details>`;
}
function qCard(q){
  const c = byIso[q.iso];
  const isVal = role === "validator";
  return `<div class="q-card">
    <div class="q-top"><span class="d num">${fmtDate(q.detected)}</span><b>${c ? c.flag + " " + esc(c.name) : esc(q.iso)}</b>${stChip(q.status)}${srcChip(q.source.type)}</div>
    <div class="q-title">${esc(q.title)}</div>
    <div class="q-sum">${esc(q.summary)}</div>
    ${cellsPanel(q)}
    ${agentPanel(q)}
    <div class="q-src">Source: ${q.source.url ? `<a href="${esc(q.source.url)}" target="_blank" rel="noopener">${esc(q.source.name)}</a>` : esc(q.source.name)}${q.action ? ` · <span>Suggested action: ${esc(q.action)}</span>` : ""}</div>
    ${q.status === "pending" && isVal ? `<div class="q-actions">
      <button class="btn ok" data-act="validate" data-id="${q.id}">Validate &amp; publish</button>
      <button class="btn danger" data-act="reject" data-id="${q.id}">Reject</button>
      <span class="q-note">Validating appends the event to the ${c ? esc(c.name) : ""} timeline and updates its record date.</span></div>` : ""}
    ${q.status !== "pending" ? `<div class="q-note" style="margin-top:8px">${q.status === "validated" ? "Validated" : "Rejected"} by ${esc(q.validatedBy || "NIS 2 core team")} on ${fmtDate(q.validatedOn || q.detected)}${q.rejectReason ? " — " + esc(q.rejectReason) : ""}</div>` : ""}
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
  <h1 class="pg">Insights &amp; KPIs</h1>
  <p class="pg-sub">Comparative indicators across the 29 tracked countries — the successor of the KPI workbook. Filter, chart, export.</p>
  <div class="grid-ov" style="margin-bottom:18px">
    <div class="card"><div class="cap"><h2>Cyber requirements per country — EE vs IE</h2></div><div class="bd">
      <div class="legend-row"><span class="leg-s"><span class="sw" style="background:var(--ee)"></span>Essential entities</span><span class="leg-s"><span class="sw" style="background:var(--ie)"></span>Important entities</span></div>
      <p class="chart-note">Number of security requirements in the national framework, where published / analysed. Hover a bar for the exact value.</p>
      <div id="chReq"></div>
    </div></div>
    <div class="card"><div class="cap"><h2>Transposition delay</h2></div><div class="bd">
      <p class="chart-note">Months after the EU deadline (17 Oct 2024). On-time countries shown at zero; non-transposed countries excluded.</p>
      <div id="chDelay"></div>
      <div class="q-note" style="margin-top:10px">Not transposed yet: ${COUNTRIES.filter(c => !c.transposed).map(c => c.flag + " " + esc(c.name)).join(" · ")}</div>
    </div></div>
  </div>
  <div class="card"><div class="cap"><h2>KPI matrix</h2>
    <div style="display:flex;gap:8px"><button class="btn" id="csvBtn">Export CSV (;)</button></div></div>
    <div class="bd">
    <div class="filters">
      <select id="kR" aria-label="Region filter"><option value="">All regions</option><option>West</option><option>North</option><option>South</option><option>East</option></select>
      <select id="kL" aria-label="Level filter"><option value="">All levels</option><option value="4">Level 4</option><option value="3">Level 3</option><option value="2">Level 2</option><option value="1">Level 1</option></select>
      <span class="q-note">Framework: ${k.fwFinal} final · ${k.fwTemp} temporary · ${k.fwNone} none (EU-27)</span>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Country</th><th>Region</th><th>Lvl</th><th>Transposed</th><th class="num">Delay</th><th>Framework</th><th class="num">Req EE</th><th class="num">Req IE</th><th class="num">Compl. EE (mo)</th><th class="num">Compl. IE (mo)</th><th class="num">Audit EE (mo)</th><th class="num">Audit IE (mo)</th><th class="num">Self-assess. (mo)</th><th>Audit body</th><th>Registration</th><th>Incident channel</th></tr></thead>
      <tbody id="kRows"></tbody></table></div>
  </div></div>`;
  drawReqChart($("#chReq"));
  drawDelayChart($("#chDelay"));
  const paint = () => {
    const r = $("#kR").value, l = $("#kL").value;
    const list = COUNTRIES.filter(c => (!r || c.region === r) && (!l || c.maturity == l)).sort((a, b) => a.name.localeCompare(b.name));
    $("#kRows").innerHTML = list.map(c => `<tr>
      <td><b>${c.flag} ${esc(c.name)}</b></td><td>${c.region}</td><td>${lvlChip(c)}</td>
      <td>${c.transposed ? (c.onTime ? "On time" : fmtDate(c.lawInForce)) : "No"}</td>
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
  const head = ["Country","ISO","Region","EU","Maturity level","Transposed","On time","Law in force","Delay (months)","Framework status","Framework","Req EE","Req IE","Compliance EE (months)","Compliance IE (months)","Audit body","Audit freq EE (months)","Audit freq IE (months)","Self-assessment freq (months)","Registration","Incident channel","Last update"];
  const lines = [head.join(";")];
  COUNTRIES.forEach(c => {
    const row = [c.name, c.iso, c.region, c.eu ? "Yes" : "No", c.maturity, c.transposed ? "Yes" : "No", c.onTime ? "Yes" : "No", c.lawInForce || "", c.delayMonths ?? "", FW_LABEL[c.fw], c.fwName, c.reqEE ?? "", c.reqIE ?? "", c.complianceEE ?? "", c.complianceIE ?? "", c.auditBody, c.auditFreqEE ?? "", c.auditFreqIE ?? "", c.selfAssessFreq ?? "", c.regTool, c.incidentMethod, c.lastUpdate];
    lines.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  });
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "regwatch-nis2-kpis.csv";
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
  <h1 class="pg">Source registry</h1>
  <p class="pg-sub">Every source monitored by the collection pipeline or cited in a country record. Official sources are trusted; unofficial ones are monitored but require validation by a Wavestone consultant; manual entries come from consultants (e.g. sector working groups) and can be flagged internal.</p>
  <div class="card"><div class="bd">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Scope</th><th>Source</th><th>Trust level</th><th>Note</th></tr></thead>
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
