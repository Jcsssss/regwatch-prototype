/* ---------- Country record editing (validator role) ---------- */
var editingIso = null;

function startEdit(iso){ editingIso = iso; renderCountry(iso); window.scrollTo({ top: 0 }); }
function cancelEdit(iso){ editingIso = null; renderCountry(iso); }

function edtBullet(v){
  return `<div class="edit-row"><textarea rows="2" class="grow">${esc(v)}</textarea><button class="btn icon del" title="Remove" aria-label="Remove item">✕</button></div>`;
}
function edtEvent(t){
  const extra = esc(JSON.stringify({ _qid: t._qid, added: t.added }));
  return `<div class="edit-row" data-extra="${extra}"><input type="date" value="${esc(t.date || "")}"><textarea rows="2" class="grow">${esc(t.text || "")}</textarea><button class="btn icon del" title="Remove" aria-label="Remove event">✕</button></div>`;
}
function edtAuth(a){
  return `<div class="edit-row"><input value="${esc(a.name || "")}" placeholder="Name (e.g. ANSSI)" style="width:150px"><textarea rows="2" class="grow" placeholder="Role">${esc(a.role || "")}</textarea><button class="btn icon del" title="Remove" aria-label="Remove authority">✕</button></div>`;
}
function edtSource(s){
  return `<div class="edit-row"><input value="${esc(s.name || "")}" placeholder="Source name" class="grow"><input value="${esc(s.url || "")}" placeholder="https://…" class="grow"><select>${["official", "unofficial", "manual"].map(t => `<option value="${t}" ${s.type === t ? "selected" : ""}>${t === "official" ? "Official" : t === "unofficial" ? "Unofficial — verify" : "Manual — consultant"}</option>`).join("")}</select><button class="btn icon del" title="Remove" aria-label="Remove source">✕</button></div>`;
}
const EDT_ROW_TPL = {
  bullet: () => edtBullet(""),
  event: () => edtEvent({ date: new Date().toISOString().slice(0, 10), text: "" }),
  auth: () => edtAuth({}),
  source: () => edtSource({ type: "official" })
};

function renderCountryEdit(iso){
  const c = byIso[iso];
  const el = $("#v-country");
  const today = new Date().toISOString().slice(0, 10);
  const yn = (id, v, lbl) => `<label>${lbl}<select id="${id}"><option value="yes" ${v ? "selected" : ""}>Yes</option><option value="no" ${v ? "" : "selected"}>No</option></select></label>`;
  const txt = (id, v, lbl, ph) => `<label>${lbl}<input id="${id}" value="${esc(v ?? "")}" placeholder="${esc(ph || "")}"></label>`;
  const numI = (id, v, lbl) => `<label>${lbl}<input id="${id}" type="number" min="0" value="${v ?? ""}" placeholder="—"></label>`;
  const secBlock = (key, title, items) => `
    <div class="sec"><h3>${title}</h3>
      <div class="elist" data-list="sec:${key}">${(items || []).map(edtBullet).join("")}</div>
      <button class="btn" data-add="bullet" data-target="sec:${key}">+ Add item</button>
    </div>`;
  el.innerHTML = `
  <a class="back" href="#/countries">← All countries</a>
  <div class="cty-head">
    <span class="flag">${c.flag}</span>
    <div><h1>Editing — ${esc(c.name)}</h1>
      <p style="margin:7px 0 0;color:var(--ink2);max-width:80ch">Every field below can be changed, added to or removed — this record replaces the Excel row and country sheet. In this prototype changes are saved in your browser; in production they would be published to all readers with your name and a timestamp.</p>
    </div>
  </div>
  <div class="editbar">
    <button class="btn ok" id="saveEdit">Save &amp; publish</button>
    <button class="btn" id="cancelEdit">Cancel</button>
    ${store.edits[iso] ? `<button class="btn danger" id="resetEdit">Reset to imported data</button>` : ""}
    <span class="q-note">Saving updates the map, lists, KPI matrix and exports immediately.</span>
  </div>

  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Status</h2></div><div class="bd">
    <div class="form-grid">
      <label>Maturity level<select id="eMat">${[1, 2, 3, 4].map(l => `<option value="${l}" ${c.maturity === l ? "selected" : ""}>Level ${l} — ${esc(LEVELS[l].label)}</option>`).join("")}</select></label>
      <label>Framework status<select id="eFw">${Object.entries(FW_LABEL).map(([k, v]) => `<option value="${k}" ${c.fw === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${yn("eTr", c.transposed, "Transposed")}
      ${yn("eOT", c.onTime, "On time (17 Oct 2024)")}
      <label>Law in force since<input id="eLIF" type="date" value="${esc(c.lawInForce ?? "")}"></label>
      ${numI("eDelay", c.delayMonths, "Delay (months)")}
      <label>Record date (last update)<input id="eLU" type="date" value="${today}"></label>
      <label class="full">Transposition law${""}<input id="eLaw" value="${esc(c.law ?? "")}"></label>
      <label class="full">Framework name<input id="eFwName" value="${esc(c.fwName ?? "")}"></label>
      <label class="full">Summary (map tooltip &amp; header)<textarea id="eSum" rows="2">${esc(c.summary ?? "")}</textarea></label>
    </div>
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>KPI fields</h2></div><div class="bd">
    <div class="form-grid">
      ${numI("eReqEE", c.reqEE, "Requirements EE")}
      ${numI("eReqIE", c.reqIE, "Requirements IE")}
      ${numI("eCEE", c.complianceEE, "Compliance deadline EE (mo)")}
      ${numI("eCIE", c.complianceIE, "Compliance deadline IE (mo)")}
      ${numI("eAEE", c.auditFreqEE, "Audit frequency EE (mo)")}
      ${numI("eAIE", c.auditFreqIE, "Audit frequency IE (mo)")}
      ${numI("eSAF", c.selfAssessFreq, "Self-assessment freq (mo)")}
      ${txt("eAB", c.auditBody, "Audit body", "e.g. External accredited body")}
      ${txt("eRT", c.regTool, "Registration channel", "e.g. platform, authority-driven…")}
      ${txt("eIM", c.incidentMethod, "Incident channel", "e.g. web platform (CSIRT)")}
    </div>
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Record sections</h2></div><div class="bd">
    ${Object.keys(SEC_TITLES).map(k => secBlock(k, SEC_TITLES[k], c.sections[k])).join("")}
    ${secBlock("next", "Next steps", c.next)}
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Event timeline</h2></div><div class="bd">
    <div class="elist" data-list="timeline">${[...c.timeline].sort((a, b) => a.date < b.date ? -1 : 1).map(edtEvent).join("")}</div>
    <button class="btn" data-add="event" data-target="timeline">+ Add event</button>
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Authorities</h2></div><div class="bd">
    <div class="elist" data-list="authorities">${c.authorities.map(edtAuth).join("")}</div>
    <button class="btn" data-add="auth" data-target="authorities">+ Add authority</button>
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="cap"><h2>Sources</h2></div><div class="bd">
    <div class="elist" data-list="sources">${c.sources.map(edtSource).join("")}</div>
    <button class="btn" data-add="source" data-target="sources">+ Add source</button>
  </div></div>

  <div class="editbar">
    <button class="btn ok" id="saveEdit2">Save &amp; publish</button>
    <button class="btn" id="cancelEdit2">Cancel</button>
  </div>`;

  /* row add / delete — property assignment so re-entering edit mode never stacks listeners */
  el.onclick = e => {
    const del = e.target.closest(".del");
    if (del) { del.closest(".edit-row").remove(); return; }
    const add = e.target.closest("[data-add]");
    if (add) {
      const list = el.querySelector(`[data-list="${add.dataset.target}"]`);
      list.insertAdjacentHTML("beforeend", EDT_ROW_TPL[add.dataset.add]());
      const last = list.lastElementChild.querySelector("input,textarea");
      if (last) last.focus();
    }
  };
  ["saveEdit", "saveEdit2"].forEach(id => $("#" + id, el).addEventListener("click", () => saveEdit(iso)));
  ["cancelEdit", "cancelEdit2"].forEach(id => $("#" + id, el).addEventListener("click", () => cancelEdit(iso)));
  const rst = $("#resetEdit", el);
  if (rst) rst.addEventListener("click", () => {
    if (confirm(`Discard all manual edits for ${c.name} and restore the imported record?`)) {
      delete store.edits[iso]; saveStore(); location.reload();
    }
  });
}

function saveEdit(iso){
  const c = byIso[iso];
  const el = $("#v-country");
  const val = id => $("#" + id, el).value.trim();
  const num = id => { const v = val(id); return v === "" ? null : +v; };
  const rows = name => [...el.querySelectorAll(`[data-list="${name}"] .edit-row`)];
  const patch = {
    maturity: +val("eMat"), fw: val("eFw"),
    transposed: val("eTr") === "yes", onTime: val("eOT") === "yes",
    lawInForce: val("eLIF") || null, delayMonths: num("eDelay"),
    lastUpdate: val("eLU") || new Date().toISOString().slice(0, 10),
    law: val("eLaw"), fwName: val("eFwName"), summary: val("eSum"),
    reqEE: num("eReqEE"), reqIE: num("eReqIE"),
    complianceEE: num("eCEE"), complianceIE: num("eCIE"),
    auditFreqEE: num("eAEE"), auditFreqIE: num("eAIE"), selfAssessFreq: num("eSAF"),
    auditBody: val("eAB"), regTool: val("eRT"), incidentMethod: val("eIM"),
    sections: {}, next: [], timeline: [], authorities: [], sources: []
  };
  Object.keys(SEC_TITLES).forEach(k => {
    patch.sections[k] = rows("sec:" + k).map(r => r.querySelector("textarea").value.trim()).filter(Boolean);
  });
  patch.next = rows("sec:next").map(r => r.querySelector("textarea").value.trim()).filter(Boolean);
  patch.timeline = rows("timeline").map(r => {
    const extra = JSON.parse(r.dataset.extra || "{}");
    const t = { date: r.querySelector("input[type=date]").value, text: r.querySelector("textarea").value.trim() };
    if (extra._qid) t._qid = extra._qid;
    if (extra.added) t.added = extra.added;
    return t;
  }).filter(t => t.date && t.text).sort((a, b) => a.date < b.date ? -1 : 1);
  patch.authorities = rows("authorities").map(r => ({ name: r.querySelector("input").value.trim(), role: r.querySelector("textarea").value.trim() })).filter(a => a.name);
  patch.sources = rows("sources").map(r => { const [n, u] = r.querySelectorAll("input"); return { name: n.value.trim(), url: u.value.trim(), type: r.querySelector("select").value }; }).filter(s => s.name);
  /* pipeline-published events removed by hand must not be re-added on reload */
  const oldQ = c.timeline.filter(t => t._qid).map(t => t._qid);
  const newQ = patch.timeline.filter(t => t._qid).map(t => t._qid);
  patch.removedQids = [...new Set([...(store.edits[iso]?.removedQids || []), ...oldQ.filter(q => !newQ.includes(q))])];
  patch.editedOn = new Date().toISOString().slice(0, 10);
  store.edits[iso] = patch;
  saveStore();
  Object.entries(patch).forEach(([k, v]) => { if (k !== "removedQids" && k !== "editedOn") c[k] = v; });
  editingIso = null;
  renderCountry(iso);
}
