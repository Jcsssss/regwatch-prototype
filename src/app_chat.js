/* ================= The assistant =================
 *
 * A consultant asks a question in their own words; the model answers using the
 * tools in app_corpus.js and nothing else.
 *
 * Three decisions shape this file.
 *
 * 1. The key belongs to the person, not to the page. RegWatch is a static file
 *    served publicly, so a shared key baked into it would be a published key.
 *    Each consultant pastes their own; it lives in this browser's localStorage
 *    and is never sent anywhere but their own model endpoint. When the team
 *    moves to a proxy, only the endpoint field changes - `compat` mode already
 *    speaks to one (tools/chat_proxy.py).
 *
 * 2. The model reads the corpus through tools, never through the prompt. So an
 *    answer can only repeat what a tool returned, every item carries its
 *    source, and the transcript shows which tools ran. That is what makes the
 *    answer checkable, which is the whole point for regulatory content.
 *
 * 3. The conversation stays in memory. A consultant will paste client detail
 *    into it ("our sites in Italy and Spain"); that has no business being
 *    written to disk by a prototype, so a reload starts clean.
 *
 * Failures are reported as what they are. Called straight from a browser, the
 * three ways this breaks - CORS, a bad key, a wrong deployment name - look
 * identical from the outside and need completely different fixes, which is the
 * same reason agent-veille/check_azure.py exists.
 */
"use strict";

const CHAT_MAX_ROUNDS = 6;    /* tool round-trips before we stop and answer */
const CHAT_API_VERSION = "2024-10-21";

/* ---------- configuration ---------- */

/* The team's proxy, pre-filled so a consultant has one field to fill instead of
   three. This URL is not a secret: without the proxy's key it answers 401, and
   it is only ever reached from an origin the Function App allows. The key is
   the thing that must never be in this file - the published page is
   downloadable by anyone, so a key written here would be a published key.
   Empty this constant if the proxy moves or the team goes back to per-person
   Azure keys; an existing configuration in a browser is never overwritten. */
const CHAT_DEFAULT_MODE = "compat";
const CHAT_DEFAULT_ENDPOINT = "https://regwatch-proxy.azurewebsites.net/api/v1";

function chatCfg(){
  const c = store.ai || (store.ai = {});
  c.mode = c.mode || CHAT_DEFAULT_MODE;
  c.endpoint = c.endpoint || (c.mode === CHAT_DEFAULT_MODE ? CHAT_DEFAULT_ENDPOINT : "");
  c.deployment = c.deployment || "";
  c.model = c.model || "gpt-4o";
  c.key = c.key || "";
  return c;
}

/* Is the configuration the shipped one, needing only a key? The setup card asks
   for less when so, because asking for an endpoint that is already filled in
   reads as "this is broken". */
const chatUsingDefaults = () => {
  const c = chatCfg();
  return c.mode === CHAT_DEFAULT_MODE && c.endpoint === CHAT_DEFAULT_ENDPOINT;
};
const chatReady = () => {
  const c = chatCfg();
  return !!c.key && !!c.endpoint && (c.mode !== "azure" || !!c.deployment);
};

/* ---------- the conversation, in memory only ---------- */

let chatLog = [];        /* {role, text, charts?, tools?, error?} shown on screen */
let chatWire = [];       /* the message array actually sent to the model */
let chatBusy = false;

function chatSystemPrompt(){
  const today = new Date().toISOString().slice(0, 10);
  const spec = regSpec();
  const scope = regId() === "nis2"
    ? ["You are answering about NIS 2, directive (EU) 2022/2555 - cybersecurity of network",
       "and information systems - across 29 European countries."]
    : ["You are answering about REC, directive (EU) 2022/2557 - resilience of critical",
       "entities - across the 27 EU countries. REC is about all-hazards physical resilience",
       "and the designation of critical entities by the state, NOT about cybersecurity;",
       "do not answer a REC question with what you know about NIS 2.",
       "The REC records are a first pass over a younger workbook: many fields are simply",
       "not recorded yet. Say 'not recorded in RegWatch yet' - never read a blank as 'none'.",
       "You have no KPI table, no watch items, no charts and no document folders for REC;",
       "if one of those is asked for, say the REC module does not carry it yet."];
  return [
    "You are the RegWatch assistant. You help Wavestone consultants working on the",
    "transposition of European regulations.",
    ...scope,
    "Today is " + today + ".",
    "",
    "GROUNDING - this is the rule that matters most:",
    "- Answer only from what the tools return. You have no reliable memory of any",
    "  national transposition; the records are more recent and more specific than",
    "  anything you recall, and they are what the client is paying for.",
    "- Call a tool before answering any factual question. If you are unsure of the",
    "  exact indicator or country wording, call query_kpi or list_countries with no",
    "  arguments first to see what exists.",
    "- Cite what you used: name the country record, the workbook indicator or the",
    "  watch item behind each claim.",
    "- If the tools do not cover something, say so plainly and say what RegWatch",
    "  would need in order to answer. Never fill the gap from general knowledge of",
    "  the directive, and never guess a number.",
    "- A watch item is dated news, not settled law. Label it as such.",
    "- Dates on watch items: `publishedOn` is when the source published the item and is",
    "  the only date to report as its date; `detectedByAgentOn` is when the agent saw it,",
    "  which is not the same thing and must never be presented as a publication date. If",
    "  `publishedOn` is null the publication date could not be established - say so; do",
    "  not substitute the detection date. Carry the provenance when it says a date was",
    "  inferred rather than read.",
    "",
    "SCOPE QUESTIONS about a client's own sites or entities:",
    "- RegWatch holds no company or site inventory. You can set out the national",
    "  scoping rules and walk through them, but any conclusion about a specific",
    "  site is a hypothesis for the consultant to confirm - say that, once, plainly.",
    "- Ask for the sites' country, sector and size when they have not been given;",
    "  that is what the rules turn on.",
    "",
    "STYLE:",
    "- Reply in the language of the question.",
    "- Lead with the answer, then the detail. Short paragraphs, no preamble.",
    "- Give figures with their unit and their country.",
    "- When a comparison across countries would read better as a chart, call",
    "  draw_chart. It renders under your reply; refer to it, do not describe it.",
    "- Plain markdown only: paragraphs, - bullets, **bold**. No headings, no tables."
  ].join("\n");
}

/* ---------- what the model may call ---------- */

const CHAT_TOOLS = [
  { name: "list_countries",
    description: "One line per country: maturity level, whether NIS 2 is transposed, "
      + "date the law entered into force, months late, framework status, audit body. "
      + "Use for overviews, rankings and 'which countries...' questions.",
    parameters: { type: "object", properties: {} },
    run: () => corpusListCountries() },

  { name: "get_country",
    description: "The full RegWatch record for up to 8 countries: national law, framework, "
      + "requirement counts, audit and self-assessment frequencies, registration, incident "
      + "reporting, authorities, timeline, and the written sections a consultant can quote. "
      + "This is the main tool - prefer it whenever a question names a country.",
    parameters: { type: "object", properties: {
      countries: { type: "array", items: { type: "string" },
        description: "Country names or ISO codes, e.g. ['Croatia'] or ['FR','IT','ES']" },
      sections: { type: "array", items: { type: "string", enum: ["fw", "reg", "inc", "aud", "scope", "other", "reco"] },
        description: "Optional: restrict to some sections. fw=framework, reg=registration, "
          + "inc=incident reporting, aud=audit, scope=scope, reco=recommendations" }
    }, required: ["countries"] },
    run: a => corpusGetCountry(a) },

  { name: "query_kpi", regs: ["nis2"],
    description: "The comparative workbook's indicator table (33 indicators x 29 countries). "
      + "Call with no arguments to list the exact indicator names, then call again with one.",
    parameters: { type: "object", properties: {
      indicator: { type: "string", description: "Exact indicator name from the catalogue" },
      countries: { type: "array", items: { type: "string" }, description: "Optional country filter" }
    } },
    run: a => corpusQueryKpi(a) },

  { name: "search_corpus",
    description: "Keyword search across every country's written sections and the watch items. "
      + "Use when the question is about a topic rather than a country - 'penalties', "
      + "'presumption of conformity', 'OT systems'.",
    parameters: { type: "object", properties: {
      query: { type: "string" },
      countries: { type: "array", items: { type: "string" }, description: "Optional country filter" },
      includeWatch: { type: "boolean", description: "Include watch items (default true)" }
    }, required: ["query"] },
    run: a => corpusSearch(a) },

  { name: "watch_items", regs: ["nis2"],
    description: "Recent watch items (regulatory news picked up by the watch agent) for a "
      + "country or for all of them, newest first. Use for 'what is new in...' questions. "
      + "Each item carries publishedOn (when the source published it, with its provenance) "
      + "and detectedByAgentOn (when the agent saw it) - these are different dates.",
    parameters: { type: "object", properties: {
      countries: { type: "array", items: { type: "string" }, description: "Optional country filter" },
      since: { type: "string", description: "Optional ISO date, e.g. 2026-06-01" },
      limit: { type: "number", description: "Default 15, max 30" }
    } },
    run: a => corpusWatchItems(a) },

  { name: "scope_rules",
    description: "The national scoping rules for up to 8 countries: which entities are caught, "
      + "designation and registration. Use for 'is my site concerned' questions.",
    parameters: { type: "object", properties: {
      countries: { type: "array", items: { type: "string" } }
    }, required: ["countries"] },
    run: a => corpusScopeRules(a) },

  { name: "official_documents", regs: ["nis2"],
    description: "Links to each country's official-document folders (law, framework, other).",
    parameters: { type: "object", properties: {
      countries: { type: "array", items: { type: "string" } }
    }, required: ["countries"] },
    run: a => corpusOfficialDocs(a) },

  { name: "draw_chart", regs: ["nis2"],
    description: "Render a chart from the workbook indicators and show it to the user under "
      + "your reply. One indicator draws it on its own; several are crossed into one table. "
      + "Call query_kpi with no arguments first if unsure of the exact indicator names.",
    parameters: { type: "object", properties: {
      indicators: { type: "array", items: { type: "string" },
        description: "Exact indicator names, e.g. ['Exceeded time from EU deadline (month)']" },
      countries: { type: "array", items: { type: "string" }, description: "Optional: limit to these countries" },
      groupBy: { type: "string", enum: ["", "region", "maturity"], description: "Optional grouping" },
      form: { type: "string", enum: ["bars", "stack", "donut", "grid", "matrix", "grouped"],
        description: "Optional. bars=ranked bars, stack=share bar, donut, grid=one square per "
          + "country, matrix=crossed table, grouped=grouped bars. Leave empty to let RegWatch pick." },
      title: { type: "string", description: "Short title for the chart" }
    }, required: ["indicators"] },
    run: a => chatDrawChart(a) }
];

/* A tool is offered only where it can answer. The country tools read whichever
   records are active, so they serve any regulation; the KPI board, the watch
   items and the folder registry are built from the NIS 2 workbook and would
   quietly answer a REC question with NIS 2 data - worse than not answering. */
function chatTools(){
  const id = regId();
  return CHAT_TOOLS.filter(t => !t.regs || t.regs.includes(id));
}
const chatToolByName = name => chatTools().find(t => t.name === name);

/* Charts produced during the turn currently being answered. */
let chatPendingCharts = [];

function chatDrawChart(a){
  const names = (a.indicators || []).map(n =>
    (KPI_CATALOGUE.find(k => k.kpi.toLowerCase() === String(n).toLowerCase())
      || KPI_CATALOGUE.find(k => k.kpi.toLowerCase().includes(String(n).toLowerCase())) || {}).kpi
  ).filter(Boolean);
  if (!names.length) {
    return { error: "no matching indicator", knownIndicators: KPI_CATALOGUE.map(k => k.kpi) };
  }
  const sel = {
    kpis: names,
    group: a.groupBy || "",
    form: a.form || "",
    all: true,
    scope: { isos: a.countries && a.countries.length ? corpusIsos(a.countries) : null }
  };
  chatPendingCharts.push({ sel, title: a.title || names.join(" · ") });
  return { rendered: true, indicators: names,
           form: kpiResolveForm(names, sel.group, sel.form, sel.scope),
           note: "The chart is displayed to the user under your reply. Refer to it; do not "
               + "repeat its numbers row by row." };
}

/* ---------- talking to the model ---------- */

function chatEndpointUrl(){
  const c = chatCfg();
  const base = c.endpoint.replace(/\/+$/, "");
  return c.mode === "azure"
    ? `${base}/openai/deployments/${encodeURIComponent(c.deployment)}/chat/completions?api-version=${CHAT_API_VERSION}`
    : `${base}/chat/completions`;
}

/* Deployments disagree about two parameters and there is no way to ask in
   advance which family a deployment name points at: the reasoning models want
   `max_completion_tokens` and refuse a temperature, the older chat models want
   `max_tokens`. So the first 400 that names a parameter is read, remembered
   against this configuration, and the call is retried once. After that the
   right shape is sent from the start. */
function chatQuirks(){
  const c = chatCfg();
  return c.quirks || (c.quirks = {});
}

function chatAdapt(detail){
  const d = String(detail || "").toLowerCase();
  const q = chatQuirks();
  let changed = false;
  if (d.includes("max_tokens") && d.includes("max_completion_tokens") && q.tokenParam !== "max_completion_tokens") {
    q.tokenParam = "max_completion_tokens"; changed = true;
  } else if (d.includes("'max_completion_tokens'") && q.tokenParam !== "max_tokens") {
    q.tokenParam = "max_tokens"; changed = true;
  }
  if (d.includes("temperature") && !q.noTemperature) { q.noTemperature = true; changed = true; }
  if (changed) saveStore();
  return changed;
}

/* One place that speaks to the endpoint. `extra` carries whatever the caller
   wants on top of the messages; `cap` is a token limit if it wants one. */
async function chatPost(messages, extra, cap){
  const c = chatCfg(), q = chatQuirks();
  const headers = { "Content-Type": "application/json" };
  if (c.mode === "azure") headers["api-key"] = c.key;
  else headers["Authorization"] = "Bearer " + c.key;

  const build = () => {
    const body = Object.assign({ messages }, extra || {});
    if (c.mode !== "azure") body.model = c.model;
    if (!q.noTemperature) body.temperature = 0.2;
    if (cap) body[q.tokenParam || "max_completion_tokens"] = cap;
    return JSON.stringify(body);
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(chatEndpointUrl(), { method: "POST", headers, body: build() });
    } catch (e) {
      /* fetch rejects without a status for exactly one reason worth naming: the
         browser blocked the request before it left. */
      throw new Error("NETWORK:" + (e && e.message ? e.message : "failed"));
    }
    if (res.ok) return res.json();

    let detail = "";
    try { const j = await res.json(); detail = (j.error && (j.error.message || j.error.code)) || JSON.stringify(j).slice(0, 300); }
    catch (e) { detail = await res.text().catch(() => ""); }
    if (res.status === 400 && chatAdapt(detail)) continue;   /* learned something, try again */
    throw new Error("HTTP:" + res.status + ":" + detail);
  }
  throw new Error("HTTP:400:the endpoint kept rejecting the request parameters");
}

async function chatCall(messages){
  const data = await chatPost(messages, {
    tools: chatTools().map(t => ({ type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: "auto"
  });
  const choice = (data.choices || [])[0];
  if (!choice) throw new Error("HTTP:200:the endpoint returned no choices");
  return choice.message;
}

/* Explain the failure rather than showing its stack. The three failure modes
   look alike from the browser and need different fixes. */
function chatExplainError(err){
  const msg = String(err && err.message || err);
  const c = chatCfg();
  if (msg.startsWith("NETWORK:")) {
    return t("chat.errNetwork", { endpoint: c.endpoint });
  }
  const m = /^HTTP:(\d+):([\s\S]*)$/.exec(msg);
  if (m) {
    const code = +m[1], detail = m[2].trim();
    if (code === 401 || code === 403) return t("chat.err401") + (detail ? " (" + detail + ")" : "");
    if (code === 404) return t("chat.err404", { deployment: c.deployment }) + (detail ? " (" + detail + ")" : "");
    if (code === 429) return t("chat.err429") + (detail ? " (" + detail + ")" : "");
    return t("chat.errHttp", { code: code }) + (detail ? " " + detail : "");
  }
  return msg;
}

/* ---------- the turn ---------- */

async function chatAsk(question){
  if (chatBusy || !question.trim()) return;
  if (!chatReady()) { chatOpenSettings(); return; }
  chatBusy = true;
  chatPendingCharts = [];

  chatLog.push({ role: "user", text: question });
  chatLog.push({ role: "pending", text: t("chat.thinking"), tools: [] });
  chatRender();

  if (!chatWire.length) chatWire.push({ role: "system", content: chatSystemPrompt() });
  chatWire.push({ role: "user", content: question });
  const pending = chatLog[chatLog.length - 1];

  try {
    for (let round = 0; round < CHAT_MAX_ROUNDS; round++) {
      const msg = await chatCall(chatWire);
      const calls = msg.tool_calls || [];
      chatWire.push({ role: "assistant", content: msg.content || null,
                      tool_calls: calls.length ? calls : undefined });

      if (!calls.length) {
        chatLog.pop();
        chatLog.push({ role: "assistant", text: msg.content || t("chat.empty"),
                       charts: chatPendingCharts.slice(), tools: pending.tools });
        break;
      }

      for (const call of calls) {
        const tool = chatToolByName(call.function.name);
        let result;
        if (!tool) result = { error: "unknown tool " + call.function.name };
        else {
          let args = {};
          try { args = JSON.parse(call.function.arguments || "{}"); }
          catch (e) { args = {}; }
          pending.tools.push({ name: tool.name, args });
          chatRender();
          try { result = tool.run(args); }
          catch (e) { result = { error: String(e && e.message || e) }; }
        }
        chatWire.push({ role: "tool", tool_call_id: call.id,
                        content: JSON.stringify(result).slice(0, 60000) });
      }

      if (round === CHAT_MAX_ROUNDS - 1) {
        chatLog.pop();
        chatLog.push({ role: "assistant", text: t("chat.tooManyRounds"),
                       charts: chatPendingCharts.slice(), tools: pending.tools });
      }
    }
  } catch (err) {
    chatLog.pop();
    chatLog.push({ role: "error", text: chatExplainError(err) });
    /* A failed round leaves a dangling assistant turn; drop back to the last
       clean user message so the next attempt is not sent a broken transcript. */
    while (chatWire.length && chatWire[chatWire.length - 1].role !== "user") chatWire.pop();
    chatWire.pop();
  }
  chatBusy = false;
  chatRender();
}

/* ---------- rendering ---------- */

/* A deliberately small markdown subset - paragraphs, bullets, bold, code - both
   because the prompt asks for no more, and because anything the model emits is
   escaped first and only these shapes are then turned back into markup. */
function chatMarkdown(text){
  const esc = kpiEsc(text);
  const lines = esc.split("\n");
  let html = "", list = false;
  const inline = s => s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  lines.forEach(raw => {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) {
      if (!list) { html += "<ul>"; list = true; }
      html += "<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>";
      return;
    }
    if (list) { html += "</ul>"; list = false; }
    if (line) html += "<p>" + inline(line) + "</p>";
  });
  if (list) html += "</ul>";
  return html || "<p></p>";
}

function chatChartHTML(entry, i){
  const d = kpiChart(entry.sel, "wide");
  return `<figure class="chat-chart" data-chart="${i}">
    <figcaption>${kpiEsc(entry.title)}</figcaption>
    ${d.note ? `<p class="q-note">${d.note}</p>` : ""}
    ${d.legend}
    <div class="kpi-wrap">${d.chart}</div>
    <button type="button" class="btn lnk chat-xlsx" data-chart="${i}">${t("kpi.xlsx")}</button>
  </figure>`;
}

function chatBubble(m, idx){
  if (m.role === "user") return `<div class="chat-m user"><div class="chat-b">${chatMarkdown(m.text)}</div></div>`;
  if (m.role === "error") return `<div class="chat-m bot"><div class="chat-b err">${chatMarkdown(m.text)}</div></div>`;
  const steps = (m.tools || []).length
    ? `<div class="chat-steps">${m.tools.map(s => `<span class="chat-step">${kpiEsc(s.name)}${
        s.args && s.args.countries ? " · " + kpiEsc([].concat(s.args.countries).join(", ")) : ""}</span>`).join("")}</div>`
    : "";
  if (m.role === "pending") {
    return `<div class="chat-m bot"><div class="chat-b"><span class="chat-dots"><i></i><i></i><i></i></span>
      ${steps}</div></div>`;
  }
  const charts = (m.charts || []).map((c, i) => chatChartHTML(c, idx + "-" + i)).join("");
  return `<div class="chat-m bot"><div class="chat-b">${steps}${chatMarkdown(m.text)}${charts}</div></div>`;
}

const CHAT_SUGGESTIONS_BY_REG = {
  nis2: ["chat.s1", "chat.s2", "chat.s3", "chat.s4"],
  rec:  ["chat.r1", "chat.r2", "chat.r3", "chat.r4"]
};
const chatSuggestions = () => CHAT_SUGGESTIONS_BY_REG[regId()] || CHAT_SUGGESTIONS_BY_REG.nis2;

function chatRender(){
  const el = $("#v-insights");
  const cfg = chatCfg();
  const body = chatLog.length
    ? chatLog.map(chatBubble).join("")
    : `<div class="chat-empty">
        <p class="chat-hello">${t("chat.hello")}</p>
        <div class="chat-sugs">${chatSuggestions().map(k =>
          `<button type="button" class="chat-sug">${kpiEsc(t(k))}</button>`).join("")}</div>
      </div>`;

  el.innerHTML = `
  <h1 class="pg">${t("chat.title")}</h1>
  <p class="pg-sub">${t(regId() === "nis2" ? "chat.sub" : "chat.recSub")}</p>

  ${chatReady() ? "" : `<div class="card chat-setup"><div class="bd">
    <p class="chat-setup-t">${t(chatUsingDefaults() ? "chat.setupKeyOnly" : "chat.setupTitle")}</p>
    <p class="q-note">${t(chatUsingDefaults() ? "chat.setupKeyHelp" : "chat.setupHelp")}</p>
    <button class="btn primary" id="chatSetup" type="button">${t("chat.settings")}</button>
  </div></div>`}

  <div class="card chat-card">
    <div class="cap"><h2>${t("chat.assistant")}</h2>
      <div class="kpi-cap-btns">
        <button class="btn" id="chatClear" type="button" ${chatLog.length ? "" : "disabled"}>${t("chat.clear")}</button>
        <button class="btn icon" id="chatGear" type="button" aria-label="${t("chat.settings")}" title="${t("chat.settings")}">⚙</button>
      </div></div>
    <div class="bd">
      <div class="chat-log" id="chatLog">${body}</div>
      <form class="chat-compose" id="chatForm">
        <textarea id="chatIn" rows="2" placeholder="${kpiEsc(t("chat.placeholder"))}"
          aria-label="${t("chat.placeholder")}" ${chatBusy ? "disabled" : ""}></textarea>
        <button class="btn primary" type="submit" ${chatBusy ? "disabled" : ""}>${t("chat.send")}</button>
      </form>
      <p class="q-note chat-foot">${t("chat.foot", { model: cfg.mode === "azure" ? (cfg.deployment || "-") : (cfg.model || "-") })}</p>
    </div>
  </div>

  <div class="chat-modal" id="chatModal" hidden>
    <div class="chat-modal-b" role="dialog" aria-modal="true" aria-label="${t("chat.settings")}">
      <h2>${t("chat.settings")}</h2>
      <p class="q-note">${t("chat.keyNote")}</p>
      <label class="chat-f"><span>${t("chat.mode")}</span>
        <select id="cfMode">${[["azure", "Azure OpenAI"], ["compat", t("chat.modeCompat")]]
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([v, label]) => `<option value="${v}" ${cfg.mode === v ? "selected" : ""}>${kpiEsc(label)}</option>`).join("")}
        </select></label>
      <label class="chat-f"><span>${t("chat.endpoint")}</span>
        <input id="cfEndpoint" type="text" spellcheck="false" value="${kpiEsc(cfg.endpoint)}"
          placeholder="${cfg.mode === "azure" ? "https://xxx.openai.azure.com" : "http://localhost:8787/v1"}"></label>
      ${cfg.mode === "azure"
        ? `<label class="chat-f"><span>${t("chat.deployment")}</span>
             <input id="cfDeployment" type="text" spellcheck="false" value="${kpiEsc(cfg.deployment)}" placeholder="gpt-4o"></label>`
        : `<label class="chat-f"><span>${t("chat.model")}</span>
             <input id="cfModel" type="text" spellcheck="false" value="${kpiEsc(cfg.model)}" placeholder="gpt-4o"></label>`}
      <label class="chat-f"><span>${t("chat.key")}</span>
        <input id="cfKey" type="password" spellcheck="false" value="${kpiEsc(cfg.key)}" placeholder="..."></label>
      <p class="q-note" id="cfStatus"></p>
      <div class="chat-modal-btns">
        <button class="btn" id="cfTest" type="button">${t("chat.test")}</button>
        <button class="btn" id="cfForget" type="button">${t("chat.forget")}</button>
        <button class="btn primary" id="cfSave" type="button">${t("chat.save")}</button>
      </div>
    </div>
  </div>`;

  chatWire2();
}

function chatWire2(){
  const log = $("#chatLog");
  if (log) log.scrollTop = log.scrollHeight;

  $("#chatForm").addEventListener("submit", e => {
    e.preventDefault();
    const input = $("#chatIn");
    const q = input.value;
    input.value = "";
    chatAsk(q);
  });
  $("#chatIn").addEventListener("keydown", e => {
    /* Enter sends, Shift+Enter breaks the line - what a chat box is expected to do. */
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); }
  });
  $("#chatClear").addEventListener("click", () => { chatLog = []; chatWire = []; chatRender(); });
  $("#chatGear").addEventListener("click", chatOpenSettings);
  const setup = $("#chatSetup");
  if (setup) setup.addEventListener("click", chatOpenSettings);
  document.querySelectorAll(".chat-sug").forEach(b =>
    b.addEventListener("click", () => chatAsk(b.textContent)));
  document.querySelectorAll(".chat-xlsx").forEach(b => b.addEventListener("click", () => {
    const [mi, ci] = b.dataset.chart.split("-").map(Number);
    const m = chatLog[mi];
    if (m && m.charts && m.charts[ci]) kpiExportXlsx(m.charts[ci].sel);
  }));
  kpiWireTips($("#v-insights"));
  chatWireSettings();
  if (!chatBusy) { const i = $("#chatIn"); if (i && chatLog.length) i.focus(); }
}

/* ---------- settings ---------- */

function chatOpenSettings(){
  const m = $("#chatModal");
  if (m) m.hidden = false;
}

function chatWireSettings(){
  const modal = $("#chatModal");
  const cfg = chatCfg();
  modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });

  $("#cfMode").addEventListener("change", e => { cfg.mode = e.target.value; saveStore(); chatRender(); chatOpenSettings(); });
  const read = () => {
    cfg.endpoint = $("#cfEndpoint").value.trim();
    if ($("#cfDeployment")) cfg.deployment = $("#cfDeployment").value.trim();
    if ($("#cfModel")) cfg.model = $("#cfModel").value.trim();
    cfg.key = $("#cfKey").value.trim();
  };
  $("#cfSave").addEventListener("click", () => {
    const before = cfg.endpoint + "|" + cfg.deployment + "|" + cfg.model;
    read();
    /* A different deployment is a different model family: what was learned
       about the previous one does not carry over. */
    if (before !== cfg.endpoint + "|" + cfg.deployment + "|" + cfg.model) delete cfg.quirks;
    saveStore(); modal.hidden = true; chatRender();
  });
  $("#cfForget").addEventListener("click", () => {
    /* Forget the key, not the address: the endpoint is shipped configuration,
       and clearing it would leave the next person hunting for a URL. */
    delete store.ai; saveStore(); chatCfg(); chatRender(); chatOpenSettings();
  });
  $("#cfTest").addEventListener("click", async () => {
    read(); saveStore();
    const status = $("#cfStatus");
    status.textContent = t("chat.testing");
    status.className = "q-note";
    try {
      /* One tiny completion, no tools: enough to separate "cannot reach" from
         "reached and refused" - and it goes through chatPost, so whatever it
         learns about this deployment's parameters is already known by the time
         a real question is asked. */
      await chatPost([{ role: "user", content: "ping" }], {}, 16);
      const q = chatQuirks();
      const learned = [q.tokenParam ? "token limit: " + q.tokenParam : "",
                       q.noTemperature ? "fixed temperature" : ""].filter(Boolean).join(", ");
      status.textContent = t("chat.testOk") + (learned ? " (" + learned + ")" : "");
      status.className = "q-note chat-ok";
    } catch (err) {
      status.textContent = chatExplainError(err);
      status.className = "q-note chat-bad";
    }
  });
}

/* The router calls this for the assistant tab. */
function renderInsights(){ chatRender(); }
