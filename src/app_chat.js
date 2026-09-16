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
       "not communicated yet. Say 'not communicated' - never read a blank as 'none'.",
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
    ...(regId() === "nis2" ? [
    "",
    "VISUALS - when the user asks for a visual, graph, map or chart, prefer create_visual:",
    "- First call describe_columns to find the exact sheet and column: pick the sheet by the",
    "  topic of the request (a registration deadline is in reg, not in id), then pick the column",
    "  whose label matches the request word for word. Never invent a column.",
    "- Forms: map = categories across Europe; rings = 2 to 4 categories; share = several",
    "  categories, or several YES/NO columns counted together (pass `columns`); stairs =",
    "  ordered ranges (pass `buckets`); columns = dates or periods; pyramid = ordered",
    "  frequency levels; bars = one number per country.",
    "- Free-text columns (more than 8 distinct values): pass `groups` with keywords, and say",
    "  in your reply that the grouping is yours and must be checked.",
    "- Pass `countries` only when the user names countries; otherwise the visual follows",
    "  the European view filter. Title and unit in the user's language, short and factual.",
    "- After it renders, say in one sentence that the button under the visual adds it to the",
    "  My visuals section of the European view (use the names the tool result gives)."] : []),
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

  { name: "describe_columns", regs: ["nis2"],
    description: "The Cyber Watch workbook columns usable in a visual: for each sheet, each column's "
      + "letter, label, how many countries filled it, whether it is numeric and its most frequent values. "
      + "Call before create_visual.",
    parameters: { type: "object", properties: {
      sheets: { type: "array", items: { type: "string", enum: ["id", "inc", "reg", "fw", "aud", "san", "auth"] },
        description: "Optional: limit to these sheets. " + "id = transposition (law, entry into force, months of delay against the EU deadline); "
          + "inc = incident reporting; reg = registration of entities (registration deadlines, method, information requested); "
          + "fw = cybersecurity framework (requirements, compliance deadlines, inspiration standards); "
          + "aud = audits and self-assessment; san = sanctions; auth = authorities" }
    } },
    run: a => euDescribeColumns(a) },

  { name: "create_visual", regs: ["nis2"],
    description: "Build a European-view quality visual from the Cyber Watch workbook and show it under your "
      + "reply, with a button to add it to European view > My visuals. RegWatch counts the countries; you "
      + "only describe the visual.",
    parameters: { type: "object", properties: {
      title: { type: "string", description: "Short factual title, in the user's language" },
      form: { type: "string", enum: ["map", "rings", "share", "stairs", "columns", "pyramid", "bars"] },
      sheet: { type: "string", enum: ["id", "inc", "reg", "fw", "aud", "san", "auth"], description: "id = transposition (law, entry into force, months of delay against the EU deadline); "
          + "inc = incident reporting; reg = registration of entities (registration deadlines, method, information requested); "
          + "fw = cybersecurity framework (requirements, compliance deadlines, inspiration standards); "
          + "aud = audits and self-assessment; san = sanctions; auth = authorities" },
      column: { type: "string", description: "Column letter, e.g. 'J'" },
      columns: { type: "array", items: { type: "string" },
        description: "Several YES/NO column letters to count together (form share)" },
      groups: { type: "array", items: { type: "object", properties: {
        label: { type: "string" }, keywords: { type: "array", items: { type: "string" } } } },
        description: "Optional categories for free-text values: a country goes to the first group whose "
          + "keyword appears in its value ('yes' / 'no' match YES / NO answers). Order = display order." },
      buckets: { type: "array", items: { type: "object", properties: {
        label: { type: "string" }, min: { type: "number" }, max: { type: "number" } } },
        description: "Optional numeric ranges, inclusive, in display order (form stairs, pyramid, columns)" },
      countries: { type: "array", items: { type: "string" }, description: "Only if the user named countries" },
      unit: { type: "string", description: "Optional unit for bars, e.g. 'months'" }
    }, required: ["form", "sheet"] },
    run: a => chatCreateVisual(a) },

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
  if (typeof chatPendingVisuals !== "undefined") chatPendingVisuals = [];

  chatLog.push({ role: "user", text: question });
  chatLog.push({ role: "pending", text: t("chat.thinking"), tools: [] });
  chatRender();

  if (!chatWire.length) chatWire.push({ role: "system", content: chatSystemPrompt() });
  /* Le contexte de la page part avec la question, pas dans le message systeme :
     on change de fiche au fil d'une conversation, et un message systeme fige au
     premier tour ferait repondre sur la Belgique a une question posee depuis la
     fiche France. L'ecran, lui, n'affiche que la question telle que tapee. */
  const ctx = assistContext();
  chatWire.push({ role: "user", content: ctx.iso
    ? "[Contexte : l'utilisateur consulte la fiche pays " + ctx.label + " (" + ctx.iso
      + "). Si la question ne précise pas de pays, elle porte sur celui-ci.]\n" + question
    : question });
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
                       charts: chatPendingCharts.slice(), tools: pending.tools,
                       visuals: typeof chatPendingVisuals !== "undefined" ? chatPendingVisuals.slice() : [] });
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
                       charts: chatPendingCharts.slice(), tools: pending.tools,
                       visuals: typeof chatPendingVisuals !== "undefined" ? chatPendingVisuals.slice() : [] });
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
  /* Un visuel se lit mal a 430 pixels : le panneau s'elargit quand il en arrive un. */
  const last = chatLog[chatLog.length - 1];
  /* Une taille choisie a la main est respectee, sauf si elle est trop etroite pour un visuel. */
  if (last && last.visuals && last.visuals.length) {
    const p = $("#assistPanel");
    if (p && (!store.assistSize || store.assistSize.w < 700)) { assistClearSize(); p.classList.add("wide"); }
    assistSync();
  }
  chatRender();
  assistNotify();
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
  const visuals = typeof chatVisualHTML === "function"
    ? (m.visuals || []).map((v, i) => chatVisualHTML(v, idx + "-" + i)).join("") : "";
  return `<div class="chat-m bot"><div class="chat-b">${steps}${chatMarkdown(m.text)}${charts}${visuals}</div></div>`;
}

const CHAT_SUGGESTIONS_BY_REG = {
  nis2: ["chat.s1", "chat.s2", "chat.s3", "chat.s4"],
  rec:  ["chat.r1", "chat.r2", "chat.r3", "chat.r4"]
};
/* Sur une fiche pays, les suggestions portent sur ce pays : c'est la question
   que l'on se pose en la lisant, et c'est ce qui distingue un assistant present
   sur chaque page d'un onglet qu'on va ouvrir. */
function chatSuggestions(){
  const ctx = assistContext();
  if (ctx.iso && regId() === "nis2")
    return ["chat.c1", "chat.c2", "chat.c3", "chat.c4"].map(k => ({ k: k, v: { country: ctx.label } }));
  /* Depuis la vue europeenne, on vient chercher un visuel. */
  if (regId() === "nis2" && typeof currentRoute !== "undefined" && currentRoute.v === "europe")
    return ["chat.e1", "chat.e2", "chat.e3", "chat.e4"].map(k => ({ k: k }));
  return (CHAT_SUGGESTIONS_BY_REG[regId()] || CHAT_SUGGESTIONS_BY_REG.nis2).map(k => ({ k: k }));
}

function chatRender(){
  /* L'assistant vit dans le panneau flottant (#assistBody), plus dans un onglet.
     Le panneau est etroit : pas de titre de page, les commandes passent en pied. */
  const el = $("#assistBody");
  if (!el) return;
  const cfg = chatCfg();
  const body = chatLog.length
    ? chatLog.map(chatBubble).join("")
    : `<div class="chat-empty">
        <p class="chat-hello">${t("chat.hello")}</p>
        <div class="chat-sugs">${chatSuggestions().map(s =>
          `<button type="button" class="chat-sug">${kpiEsc(t(s.k, s.v))}</button>`).join("")}</div>
      </div>`;

  el.innerHTML = `
  ${chatReady() ? "" : `<div class="chat-setup assist-setup">
    <p class="chat-setup-t">${t(chatUsingDefaults() ? "chat.setupKeyOnly" : "chat.setupTitle")}</p>
    <p class="q-note">${t(chatUsingDefaults() ? "chat.setupKeyHelp" : "chat.setupHelp")}</p>
    <button class="btn primary" id="chatSetup" type="button">${t("chat.settings")}</button>
  </div>`}

  <div class="chat-log" id="chatLog">${body}</div>
  <form class="chat-compose" id="chatForm">
    <textarea id="chatIn" rows="2" placeholder="${kpiEsc(t("chat.placeholder"))}"
      aria-label="${t("chat.placeholder")}" ${chatBusy ? "disabled" : ""}></textarea>
    <button class="btn primary" type="submit" ${chatBusy ? "disabled" : ""}>${t("chat.send")}</button>
  </form>
  <div class="assist-foot">
    <span class="q-note">${t("chat.foot", { model: cfg.mode === "azure" ? (cfg.deployment || "-") : (cfg.model || "-") })}</span>
    <span class="assist-tools">
      <button class="btn" id="chatClear" type="button" ${chatLog.length ? "" : "disabled"}>${t("chat.clear")}</button>
      <button class="btn icon" id="chatGear" type="button" aria-label="${t("chat.settings")}" title="${t("chat.settings")}">⚙</button>
    </span>
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
  const visOf = key => { const [mi, vi] = key.split("-").map(Number); const m = chatLog[mi]; return m && m.visuals && m.visuals[vi]; };
  document.querySelectorAll(".chat-vis-add").forEach(b => b.addEventListener("click", () => {
    const v = visOf(b.dataset.vis);
    if (!v) return;
    v.addedId = euMineAdd(v.spec);
    chatRender();
    if (currentRoute.v === "europe") renderCurrent();
  }));
  document.querySelectorAll('.chat-vis-act a[href="#/europe/mine"]').forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    route("europe", "mine");
  }));
  document.querySelectorAll(".chat-vis-png").forEach(b => b.addEventListener("click", () =>
    euDownloadCard(b.closest(".chat-visual"), b)));
  kpiWireTips($("#assistBody"));
  chatWireSettings();
  if (!chatBusy && assistIsOpen()) { const i = $("#chatIn"); if (i && chatLog.length) i.focus(); }
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
/* ---------- le panneau flottant ----------
 *
 * L'assistant est une porte ouverte depuis chaque page, comme Copilot dans les
 * applications Office, et non plus une destination : on pose une question sur
 * la fiche qu'on lit sans la quitter. Le bouton est la baleine, en bas a droite.
 *
 * L'ancienne adresse #/insights reste valable - signets, liens partages - et
 * ouvre le panneau au lieu d'une page qui n'existe plus.
 */
function assistIsOpen(){
  const p = $("#assistPanel");
  return !!p && !p.hidden;
}

/* La page consultee, pour le panneau et pour la question envoyee. */
function assistContext(){
  const r = typeof currentRoute !== "undefined" ? currentRoute : { v: "overview" };
  if (r.v === "country" && r.arg && byIso[r.arg])
    return { iso: r.arg, label: byIso[r.arg].name };
  const labels = { overview: "nav.overview", europe: "nav.europe", countries: "nav.countries", inbox: "nav.inbox",
                   sources: "nav.sources", dev: "nav.dev", devchat: "nav.devchat" };
  return { iso: null, label: t(labels[r.v] || "nav.overview") };
}

function assistSync(){
  const c = $("#assistCtx");
  if (c) c.textContent = t("assist.ctx", { page: assistContext().label });
  const fab = $("#assistFab");
  if (fab) fab.setAttribute("aria-label", t("assist.open"));
  const x = $("#assistClose"); if (x) x.setAttribute("aria-label", t("assist.close"));
  const g = $("#assistGrow");
  if (g) g.setAttribute("aria-label", t($("#assistPanel").classList.contains("wide")
    ? "assist.shrink" : "assist.expand"));
  /* Sans conversation, les suggestions dependent de la page : on les refait. */
  if (assistIsOpen() && !chatLog.length) chatRender();
}

/* ---------- taille du panneau ----------
 * Trois poignees (bord gauche, bord haut, coin) pour la taille voulue, gardee
 * dans le navigateur. Le bouton agrandir / reduire reste le raccourci : il
 * efface la taille libre et bascule entre les deux tailles prevues. */
const ASSIST_MIN_W = 340, ASSIST_MIN_H = 320;
function assistClamp(w, h){
  const maxW = Math.max(ASSIST_MIN_W, window.innerWidth - 44);
  const maxH = Math.max(ASSIST_MIN_H, window.innerHeight - 110);
  return { w: Math.round(Math.min(Math.max(w, ASSIST_MIN_W), maxW)),
           h: Math.round(Math.min(Math.max(h, ASSIST_MIN_H), maxH)) };
}
function assistApplySize(){
  const p = $("#assistPanel");
  if (!p) return;
  const s = store.assistSize;
  if (!s) { p.style.width = ""; p.style.height = ""; return; }
  const c = assistClamp(s.w, s.h);
  p.style.width = c.w + "px";
  p.style.height = c.h + "px";
  /* Les suggestions passent en colonnes des que la place le permet, comme en mode large. */
  p.classList.toggle("wide", c.w >= 700);
}
function assistClearSize(){
  delete store.assistSize;
  saveStore();
  assistApplySize();
}
function assistWireResize(){
  const p = $("#assistPanel");
  if (!p || p.querySelector(".assist-rz")) return;
  ["l", "t", "tl"].forEach(k => {
    const h = document.createElement("div");
    h.className = "assist-rz " + k;
    h.setAttribute("aria-hidden", "true");
    h.title = t("assist.resize");
    p.appendChild(h);
    h.addEventListener("dblclick", assistClearSize);
    h.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r = p.getBoundingClientRect();
      const x0 = e.clientX, y0 = e.clientY;
      let size = { w: r.width, h: r.height };
      try { h.setPointerCapture(e.pointerId); } catch (err) { /* evenement synthetique */ }
      p.classList.add("resizing");
      document.body.classList.add("assist-resizing");
      document.body.style.cursor = getComputedStyle(h).cursor;
      const move = ev => {
        size = assistClamp(k === "t" ? r.width : r.width + (x0 - ev.clientX),
                           k === "l" ? r.height : r.height + (y0 - ev.clientY));
        p.style.width = size.w + "px";
        p.style.height = size.h + "px";
      };
      const up = () => {
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
        h.removeEventListener("pointercancel", up);
        p.classList.remove("resizing");
        document.body.classList.remove("assist-resizing");
        document.body.style.cursor = "";
        store.assistSize = size;
        saveStore();
        assistApplySize();
        assistSync();
      };
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
      h.addEventListener("pointercancel", up);
    });
  });
  window.addEventListener("resize", () => { if (store.assistSize) assistApplySize(); }, { passive: true });
}

function assistOpen(){
  const p = $("#assistPanel"), fab = $("#assistFab");
  if (!p) return;
  assistApplySize();
  p.hidden = false;
  fab.setAttribute("aria-expanded", "true");
  fab.classList.remove("has-new");
  document.body.classList.add("assist-on");
  chatRender();
  assistSync();
  const i = $("#chatIn"); if (i) i.focus();
}

function assistClose(){
  const p = $("#assistPanel"), fab = $("#assistFab");
  if (!p) return;
  p.hidden = true;
  fab.setAttribute("aria-expanded", "false");
  document.body.classList.remove("assist-on");
  fab.focus();
}

/* Une reponse arrivee pendant que le panneau est ferme se signale sur la
   baleine : sinon on ne saurait pas qu'elle attend. */
function assistNotify(){
  const fab = $("#assistFab");
  if (fab && !assistIsOpen()) fab.classList.add("has-new");
}

function assistWire(){
  const fab = $("#assistFab");
  if (!fab) return;
  fab.addEventListener("click", () => assistIsOpen() ? assistClose() : assistOpen());
  $("#assistClose").addEventListener("click", assistClose);
  $("#assistGrow").addEventListener("click", () => {
    const p = $("#assistPanel");
    const wasWide = p.classList.contains("wide");
    assistClearSize();
    p.classList.toggle("wide", !wasWide);
    assistSync();
  });
  assistWireResize();
  document.addEventListener("keydown", e => {
    const modal = $("#chatModal");
    if (e.key === "Escape" && assistIsOpen() && !(modal && !modal.hidden)) assistClose();
  });
  assistSync();
}

function renderInsights(){ assistOpen(); }
