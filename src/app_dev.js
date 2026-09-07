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
    [t("dev.sCode"), typeof DEV_CODE_INDEX !== "undefined" ? DEV_CODE_INDEX.length : 0],
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

/* ---------- le code source, embarqué et compressé ----------
 *
 * La documentation dit ce qu'un module fait et pourquoi ; elle ne dit pas ce
 * que fait la ligne 240. Sans le code, l'assistant répond juste jusqu'au moment
 * où la question devient précise - c'est-à-dire jusqu'au moment où il servirait.
 *
 * 654 Ko de source pèseraient +37 % sur le fichier livré. Compressés, 277 Ko,
 * soit +16 %, et la page les décompresse au premier usage seulement : celui qui
 * n'ouvre jamais l'onglet Développeur ne paie que le téléchargement.
 */
let devCodeCache = null;

async function devCode(){
  if (devCodeCache) return devCodeCache;
  if (typeof DEV_CODE_GZ === "undefined") {
    devCodeCache = { __error: "Le code source n'est pas embarqué dans cette version." };
    return devCodeCache;
  }
  /* Sans DecompressionStream, on le dit plutôt que de répondre à côté en
     silence : l'assistant se rabattra sur la documentation. */
  if (typeof DecompressionStream !== "function") {
    devCodeCache = { __error: "Ce navigateur ne sait pas décompresser le code embarqué "
      + "(DecompressionStream absent). La documentation reste consultable." };
    return devCodeCache;
  }
  try {
    const bin = atob(DEV_CODE_GZ);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    const map = {};
    text.split(DEV_CODE_SEP).forEach(chunk => {
      const nl = chunk.indexOf("\n");
      if (nl > 0) map[chunk.slice(0, nl).trim()] = chunk.slice(nl + 1);
    });
    devCodeCache = map;
  } catch (e) {
    devCodeCache = { __error: "Décompression du code impossible : " + e.message };
  }
  return devCodeCache;
}

async function devSearchCode(a){
  const files = await devCode();
  if (files.__error) return { error: files.__error };
  const needle = String(a.query || "").trim();
  if (needle.length < 2) return { error: "requête trop courte" };
  const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const limit = Math.min(Math.max(a.limit || 12, 1), 30);
  const only = a.path ? String(a.path) : null;
  const hits = [];
  for (const path of Object.keys(files)) {
    if (only && !path.includes(only)) continue;
    const lines = files[path].split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!rx.test(lines[i])) continue;
      hits.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 200) });
      if (hits.length >= limit) break;
    }
    if (hits.length >= limit) break;
  }
  return { matches: hits.length, truncated: hits.length >= limit, hits };
}

async function devReadFile(a){
  const files = await devCode();
  if (files.__error) return { error: files.__error };
  const path = Object.keys(files).find(p => p === a.path)
            || Object.keys(files).find(p => p.endsWith(a.path || "\u0000"));
  if (!path) return { error: "fichier inconnu", known: Object.keys(files).slice(0, 40) };
  const lines = files[path].split("\n");
  const from = Math.max(1, a.from || 1);
  /* Borné : un fichier entier remplirait la fenêtre du modèle sans rien
     apporter de plus qu'une lecture ciblée. */
  const to = Math.min(lines.length, a.to ? a.to : from + 159, from + 199);
  return { file: path, lines: lines.length, from, to,
           text: lines.slice(from - 1, to)
                      .map((l, i) => (from + i) + ": " + l).join("\n") };
}

function devListCode(){
  if (typeof DEV_CODE_INDEX === "undefined") return { error: "code non embarqué" };
  return { files: DEV_CODE_INDEX.length,
           totalLines: DEV_CODE_INDEX.reduce((n, f) => n + f.lines, 0),
           list: DEV_CODE_INDEX.map(f => ({ path: f.path, lines: f.lines })) };
}

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
  { name: "search_code",
    description: "Cherche une chaîne dans le code source embarqué (JS de l'application, "
      + "CSS, script de construction, chaîne Python de veille, proxy). Rend fichier et "
      + "numéro de ligne. À préférer dès que la question porte sur ce que fait le code.",
    parameters: { type: "object", properties: {
      query: { type: "string", description: "nom de fonction, variable, chaîne littérale" },
      path: { type: "string", description: "restreindre à un chemin, ex. tools/ ou app_chat" },
      limit: { type: "integer", description: "nombre de correspondances, 1 à 30" } },
      required: ["query"] } },
  { name: "read_file",
    description: "Lit le code d'un fichier, par tranche de lignes. Utiliser après "
      + "search_code pour voir le contexte d'une correspondance.",
    parameters: { type: "object", properties: {
      path: { type: "string", description: "chemin, ex. tools/reliability.py" },
      from: { type: "integer", description: "première ligne, 1 par défaut" },
      to: { type: "integer", description: "dernière ligne, 160 lignes au plus par appel" } },
      required: ["path"] } },
  { name: "list_code",
    description: "La liste des fichiers de code embarqués, avec leur nombre de lignes.",
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
    codeFilesEmbedded: typeof DEV_CODE_INDEX !== "undefined" ? DEV_CODE_INDEX.length : 0,
    servedFrom: location.protocol === "file:" ? "fichier local" : location.origin,
    browser: u.browser + " " + u.version, os: u.os,
    interfaceLanguage: lang,
    note: "L'outil ne transmet aucune donnée d'usage. Ces valeurs décrivent "
        + "uniquement la session en cours, dans ce navigateur.",
  };
}

const DEV_CALL = { search_docs: devSearchDocs, get_doc: devGetDoc,
                   list_files: devListFiles, runtime_facts: devRuntimeFacts,
                   search_code: devSearchCode, read_file: devReadFile,
                   list_code: devListCode };

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
    "- Le code source est lisible : search_code puis read_file. Dès que la",
    "  question porte sur ce que le code fait réellement, lis-le plutôt que de",
    "  déduire de la documentation, et cite fichier et ligne.",
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
        /* Les outils de code décompressent au premier appel : le résultat peut
           être une promesse, et l'attendre ici évite d'envoyer « [object
           Promise] » au modèle. */
        const out = fn ? await fn(args) : { error: "outil inconnu" };
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
