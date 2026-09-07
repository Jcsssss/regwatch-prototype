/* ---------- rôle Développeur ----------
 *
 * Deux vues qui n'intéressent que celui qui maintient l'outil : ce que dit le
 * navigateur qui l'ouvre, et un assistant qui répond sur l'architecture.
 *
 * Sur le diagnostic, une décision qui mérite d'être écrite : rien n'est
 * transmis. La demande d'origine était de journaliser les visiteurs -
 * localisation, navigateur, système. C'est de la donnée personnelle au sens du
 * RGPD, et l'outil est distribué comme un fichier : la moitié de ses usages
 * sont un double-clic sur un poste, qu'aucun serveur ne verra jamais. Un
 * dispositif de collecte aurait donc à la fois un coût juridique et un angle
 * mort structurel. Ce panneau montre l'environnement courant à celui qui l'a
 * sous les yeux, pour qu'il puisse le joindre à un signalement. C'est tout, et
 * c'est déjà ce dont le support a besoin.
 */

function devUA(){
  const ua = navigator.userAgent || "";
  /* Lu sur la chaîne d'agent, qui est déclarative : un navigateur peut mentir,
     et plusieurs le font pour compatibilité. Affiché comme un indice. */
  const browser =
    /Edg\//.test(ua) ? ["Edge", /Edg\/([\d.]+)/] :
    /OPR\//.test(ua) ? ["Opera", /OPR\/([\d.]+)/] :
    /Firefox\//.test(ua) ? ["Firefox", /Firefox\/([\d.]+)/] :
    /Chrome\//.test(ua) ? ["Chrome", /Chrome\/([\d.]+)/] :
    /Safari\//.test(ua) ? ["Safari", /Version\/([\d.]+)/] : ["?", null];
  const m = browser[1] ? ua.match(browser[1]) : null;

  let os = "?";
  if (/Windows NT 10/.test(ua)) os = "Windows 10 ou 11";
  else if (/Windows NT ([\d.]+)/.test(ua)) os = "Windows " + RegExp.$1;
  else if (/Mac OS X ([\d_]+)/.test(ua)) os = "macOS " + RegExp.$1.replace(/_/g, ".");
  else if (/Android ([\d.]+)/.test(ua)) os = "Android " + RegExp.$1;
  else if (/(iPhone|iPad).*OS ([\d_]+)/.test(ua)) os = "iOS " + RegExp.$2.replace(/_/g, ".");
  else if (/Linux/.test(ua)) os = "Linux";
  return { browser: browser[0], version: m ? m[1] : "?", os, ua };
}

function devStoreSize(){
  try {
    const raw = localStorage.getItem("regwatch-proto-v1") || "";
    return raw.length;
  } catch (e) { return -1; }
}

function renderDev(){
  const el = $("#v-dev");
  const u = devUA();
  const online = navigator.onLine ? t("dev.yes") : t("dev.no");
  const rows = [
    [t("dev.kBrowser"), `${u.browser} ${u.version}`],
    [t("dev.kOs"), u.os],
    [t("dev.kScreen"), `${window.screen.width} × ${window.screen.height}` +
      (window.devicePixelRatio !== 1 ? ` (×${window.devicePixelRatio})` : "")],
    [t("dev.kWindow"), `${window.innerWidth} × ${window.innerHeight}`],
    [t("dev.kLang"), (navigator.languages || [navigator.language]).join(", ")],
    [t("dev.kUi"), lang === "fr" ? "français" : "English"],
    [t("dev.kTheme"), document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark (système)" : "light (système)")],
    [t("dev.kTz"), Intl.DateTimeFormat().resolvedOptions().timeZone || "?"],
    [t("dev.kOnline"), online],
    /* Un fichier ouvert depuis le disque : ni serveur, ni journal, ni mise à
       jour automatique. C'est la première chose à savoir quand un utilisateur
       signale que « l'outil est en retard ». */
    [t("dev.kOrigin"), location.protocol === "file:" ? t("dev.originFile") : location.origin],
    /* Sous le kilo-octet, « 0.0 Ko » se lit comme une panne alors que la
       valeur est juste : on affiche des octets. */
    [t("dev.kStore"), devStoreSize() < 0 ? t("dev.storeBlocked")
      : devStoreSize() < 1024 ? `${devStoreSize()} o`
      : `${(devStoreSize() / 1024).toFixed(1)} Ko`],
    [t("dev.kReg"), regId().toUpperCase()],
    [t("dev.kRole"), role],
  ];

  const stats = [
    [t("dev.sCountries"), COUNTRIES.length],
    [t("dev.sWatch"), typeof WATCH_SOURCE !== "undefined" ? WATCH_SOURCE.length : 0],
    [t("dev.sDocs"), typeof DEV_DOCS !== "undefined" ? DEV_DOCS.length : 0],
    [t("dev.sCands"), typeof SOURCE_CANDIDATES !== "undefined"
      ? (SOURCE_CANDIDATES.candidates || []).length : 0],
  ];

  el.innerHTML = `
  <h1 class="pg">${t("dev.title")}</h1>
  <p class="pg-sub">${t("dev.sub")}</p>
  <div class="rolenote"><b>${t("dev.noticeTitle")}</b> ${t("dev.notice")}</div>

  <div class="card"><div class="cap"><h2>${t("dev.envTitle")}</h2>
    <button class="btn" id="devCopy">${t("dev.copy")}</button></div><div class="bd">
    <div class="tbl-wrap"><table class="tbl"><tbody>${rows.map(([k, v]) =>
      `<tr><td style="white-space:nowrap;color:var(--muted)">${esc(k)}</td>
           <td><b>${esc(String(v))}</b></td></tr>`).join("")}</tbody></table></div>
    <details class="q-orig" style="margin-top:10px">
      <summary>${t("dev.rawUa")}</summary>
      <div style="font-family:var(--font-mono);font-size:11.5px;word-break:break-all">${esc(u.ua)}</div>
    </details>
  </div></div>

  <div class="card"><div class="cap"><h2>${t("dev.dataTitle")}</h2></div><div class="bd">
    <div class="figs4">${stats.map(([k, v]) =>
      `<div class="fig4"><span class="v">${v}</span><span class="k">${esc(k)}</span></div>`).join("")}</div>
  </div></div>`;

  $("#devCopy").addEventListener("click", () => {
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nUser-Agent: " + u.ua;
    navigator.clipboard.writeText(text).then(() => {
      $("#devCopy").textContent = t("dev.copied");
      setTimeout(() => { const b = $("#devCopy"); if (b) b.textContent = t("dev.copy"); }, 1800);
    }, () => { $("#devCopy").textContent = t("dev.copyFail"); });
  });
}

/* ---------- assistant technique ----------
 *
 * Même transport que l'assistant métier - il passe par le proxy du cabinet et
 * hérite de ses réglages - mais un autre corpus et d'autres outils. Il ne voit
 * aucune donnée pays : ses questions portent sur la machine, pas sur le droit.
 *
 * Ancré comme l'autre : il ne répond qu'avec ce que les outils rendent, et cite
 * le fichier d'où vient chaque affirmation. Un assistant technique qui invente
 * une commande fait perdre plus de temps qu'il n'en gagne.
 */

const DEV_TOOLS = [
  { name: "search_docs",
    description: "Cherche dans la documentation de l'outil : README, cahier des "
      + "charges, en-têtes de modules. Rend les sections les plus proches, avec "
      + "leur fichier d'origine.",
    parameters: { type: "object", properties: {
      query: { type: "string", description: "mots-clés, en français ou en anglais" },
      limit: { type: "integer", description: "nombre de sections, 1 à 8" } },
      required: ["query"] } },
  { name: "get_doc",
    description: "Rend une section entière par son identifiant, tel que search_docs le donne.",
    parameters: { type: "object", properties: {
      id: { type: "string" } }, required: ["id"] } },
  { name: "list_files",
    description: "La liste des fichiers documentés, avec le nombre de sections de chacun.",
    parameters: { type: "object", properties: {} } },
  { name: "runtime_facts",
    description: "L'état courant de l'outil dans ce navigateur : version des données, "
      + "volumes, environnement. À utiliser pour toute question sur ce qui est chargé ici.",
    parameters: { type: "object", properties: {} } },
];

function devSearchDocs(a){
  const q = String(a.query || "").toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!q.length) return { error: "requête vide" };
  const scored = DEV_DOCS.map(d => {
    const hay = (d.title + " " + d.src + " " + (d.keys || "") + " " + d.text).toLowerCase();
    /* Le titre, le chemin et les mots-clés pèsent plus que le corps : chercher
       « proxy » doit rendre le README du proxy avant un paragraphe qui le
       mentionne. Les mots-clés sont là parce que les en-têtes de modules sont
       en anglais et les questions arrivent en français. */
    const head = (d.title + " " + d.src + " " + (d.keys || "")).toLowerCase();
    let n = 0;
    q.forEach(w => {
      if (hay.includes(w)) n += 1;
      if (head.includes(w)) n += 3;
    });
    return { d, n };
  }).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const limit = Math.min(Math.max(a.limit || 4, 1), 8);
  if (!scored.length) return { found: 0, note: "aucune section ne contient ces mots" };
  return { found: scored.length, sections: scored.slice(0, limit).map(x => ({
    id: x.d.id, title: x.d.title, file: x.d.src,
    extract: x.d.text.slice(0, 900) })) };
}

function devGetDoc(a){
  const d = DEV_DOCS.find(x => x.id === a.id);
  return d ? { id: d.id, title: d.title, file: d.src, text: d.text }
           : { error: "identifiant inconnu" };
}

function devListFiles(){
  const by = {};
  DEV_DOCS.forEach(d => { by[d.src] = (by[d.src] || 0) + 1; });
  return { files: Object.keys(by).sort().map(f => ({ file: f, sections: by[f] })) };
}

function devRuntimeFacts(){
  const u = devUA();
  return {
    regulationActive: regId(),
    countriesLoaded: COUNTRIES.length,
    watchItems: typeof WATCH_SOURCE !== "undefined" ? WATCH_SOURCE.length : 0,
    sourceCandidates: typeof SOURCE_CANDIDATES !== "undefined"
      ? (SOURCE_CANDIDATES.candidates || []).length : 0,
    docSections: DEV_DOCS.length,
    servedFrom: location.protocol === "file:" ? "fichier local" : location.origin,
    browser: u.browser + " " + u.version, os: u.os,
    interfaceLanguage: lang,
    note: "L'outil ne transmet aucune donnée d'usage. Ces valeurs décrivent "
        + "uniquement la session en cours, dans ce navigateur.",
  };
}

const DEV_CALL = { search_docs: devSearchDocs, get_doc: devGetDoc,
                   list_files: devListFiles, runtime_facts: devRuntimeFacts };

function devSystemPrompt(){
  return [
    "Tu es l'assistant technique de RegWatch, un outil de veille réglementaire",
    "développé chez Wavestone. Tu réponds à celui qui le maintient : questions",
    "d'architecture, de chaîne de veille, d'exploitation, de déploiement.",
    "",
    "Règles :",
    "- Réponds uniquement à partir de ce que rendent tes outils. Tu ne connais",
    "  pas cet outil par ailleurs, et deux outils qui se ressemblent n'ont pas",
    "  la même architecture.",
    "- Cite le fichier d'où vient chaque affirmation, entre parenthèses.",
    "- Si la documentation ne dit pas, dis-le et propose où regarder dans le",
    "  dépôt. Ne devine jamais une commande, un chemin ou un nom de fonction.",
    "- Les en-têtes de modules expliquent souvent le pourquoi d'une décision,",
    "  pas seulement le quoi : quand la question est « pourquoi », cherche là.",
    "- Réponds en " + (lang === "fr" ? "français" : "anglais") + ", brièvement,",
    "  en texte courant. Du code seulement s'il est demandé ou s'il est la",
    "  réponse la plus courte.",
  ].join("\n");
}

let devLog = [];
let devWire = [];
let devBusy = false;

const DEV_SUGGESTIONS = [
  "dev.q1", "dev.q2", "dev.q3", "dev.q4",
];

async function devAsk(question){
  if (devBusy) return;
  devBusy = true;
  devLog.push({ role: "user", text: question });
  devWire.push({ role: "user", content: question });
  renderDevChat();

  try {
    for (let round = 0; round < 6; round++) {
      const data = await chatPost(
        [{ role: "system", content: devSystemPrompt() }, ...devWire],
        { tools: DEV_TOOLS.map(t => ({ type: "function", function: t })),
          tool_choice: "auto" });
      const msg = data.choices[0].message;
      devWire.push(msg);
      const calls = msg.tool_calls || [];
      if (!calls.length) {
        devLog.push({ role: "assistant", text: msg.content || "" });
        break;
      }
      const used = [];
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch (e) { /* laissé vide */ }
        const fn = DEV_CALL[call.function.name];
        const out = fn ? fn(args) : { error: "outil inconnu" };
        used.push(call.function.name);
        devWire.push({ role: "tool", tool_call_id: call.id,
                       content: JSON.stringify(out).slice(0, 12000) });
      }
      devLog.push({ role: "tools", tools: used });
    }
  } catch (err) {
    devLog.push({ role: "assistant", error: chatExplainError(err) });
  }
  devBusy = false;
  renderDevChat();
}

function renderDevChat(){
  const el = $("#v-devchat");
  const cfg = chatCfg();
  const ready = cfg.key || cfg.mode === CHAT_DEFAULT_MODE;

  const bubbles = devLog.map(m => {
    if (m.role === "tools") {
      return `<div class="q-note" style="margin:2px 0 8px">${t("dev.consulted")} ${
        m.tools.map(x => `<code>${esc(x)}</code>`).join(", ")}</div>`;
    }
    if (m.error) return `<div class="chat-b bot err">${esc(m.error)}</div>`;
    return `<div class="chat-b ${m.role === "user" ? "me" : "bot"}">${
      m.role === "user" ? esc(m.text) : chatMarkdown(m.text)}</div>`;
  }).join("");

  el.innerHTML = `
  <h1 class="pg">${t("dev.chatTitle")}</h1>
  <p class="pg-sub">${t("dev.chatSub")}</p>
  ${!ready ? `<div class="rolenote">${t("dev.noKey")}</div>` : ""}
  <div class="card"><div class="bd">
    <div class="chat-log" id="devLog">${bubbles || `<div class="chat-empty">
      <p>${t("dev.empty")}</p>
      <div class="chat-sugg">${DEV_SUGGESTIONS.map(k =>
        `<button class="btn" data-q="${esc(t(k))}">${esc(t(k))}</button>`).join("")}</div>
    </div>`}</div>
    ${devBusy ? `<div class="q-note">${t("dev.thinking")}</div>` : ""}
    <div class="chat-ask">
      <input id="devIn" placeholder="${t("dev.ask")}" autocomplete="off" ${devBusy ? "disabled" : ""}>
      <button class="btn primary" id="devSend" ${devBusy ? "disabled" : ""}>${t("dev.send")}</button>
      ${devLog.length ? `<button class="btn" id="devClear">${t("dev.clear")}</button>` : ""}
    </div>
  </div></div>`;

  const input = $("#devIn");
  const send = () => {
    const q = input.value.trim();
    if (q) { input.value = ""; devAsk(q); }
  };
  $("#devSend").addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  el.querySelectorAll("[data-q]").forEach(b =>
    b.addEventListener("click", () => devAsk(b.dataset.q)));
  const clear = $("#devClear");
  if (clear) clear.addEventListener("click", () => { devLog = []; devWire = []; renderDevChat(); });
  const log = $("#devLog");
  if (log) log.scrollTop = log.scrollHeight;
  if (!devBusy && input) input.focus();
}
