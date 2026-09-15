/* ---------- correspondances entre referentiels ----------
 *
 * Ce que couvre un referentiel quand on en applique un autre. Une entite deja
 * conforme a CyFun en Belgique qui s'installe en France veut savoir ce qu'il lui
 * reste a faire pour ReCyF : c'est la question a laquelle cette page repond,
 * exigence par exigence, avec l'ecart et le plan d'action.
 *
 * Les resultats viennent de l'agent de correspondance (tools/mapping_to_js.py) ;
 * seuls les classeurs valides sont embarques. Le moteur ne tourne pas ici.
 *
 * Le resume (MAPPING_INDEX) est en clair : la fiche pays le lit. Le detail
 * (MAPPING_GZ) est compresse et n'est decompresse qu'a l'ouverture de la page -
 * celui qui ne la visite jamais ne paie que le telechargement.
 */

const MAP_RELS = ["full", "large", "partial", "indirect", "none"];

let mapDetail = null;        /* le detail decompresse, une fois */
let mapState = { pid: null, dir: 0, rel: null, q: "", open: {} };

async function mapLoad(){
  if (mapDetail) return mapDetail;
  if (typeof MAPPING_GZ === "undefined") { mapDetail = {}; return mapDetail; }
  if (typeof DecompressionStream !== "function")
    throw new Error(t("map.noDecompress"));
  const bin = atob(MAPPING_GZ);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  mapDetail = JSON.parse(await new Response(stream).text());
  return mapDetail;
}

function mapPairs(){
  return typeof MAPPING_INDEX !== "undefined" ? MAPPING_INDEX : {};
}

/* « CyFun 2025 → ReCyF 2.5 » se lit mal : on dit ce que la direction mesure.
   Les lignes sont les exigences de la source ; le taux dit combien la cible en
   couvre. D'ou : « ce que CyFun 2025 couvre de ReCyF 2.5 » pour ReCyF → CyFun. */
function mapDirLabel(d){
  return t("map.dirCovers", { to: d.to.name, from: d.from.name });
}

function mapPct(v){
  return (lang === "fr" ? String(v).replace(".", ",") : String(v)) + " %";
}

/* La repartition des relations, en barre empilee : la forme du resultat se lit
   avant les chiffres. */
function mapStack(counts, n, clickable){
  return `<div class="mp-stack" role="img" aria-label="${esc(MAP_RELS.map(r =>
      t("map.rel." + r) + " " + counts[r]).join(", "))}">${MAP_RELS.map(r => counts[r]
      ? `<i class="rel-${r}" style="flex:${counts[r]}" title="${esc(t("map.rel." + r))} : ${counts[r]}"></i>` : "").join("")}</div>
    <div class="mp-legend">${MAP_RELS.map(r => `
      <${clickable ? "button type=\"button\"" : "span"} class="mp-lg${mapState.rel === r ? " on" : ""}" data-rel="${r}">
        <i class="rel-${r}"></i>${t("map.rel." + r)}<b>${counts[r]}</b>
        <span>${Math.round(counts[r] / Math.max(1, n) * 100)} %</span>
      </${clickable ? "button" : "span"}>`).join("")}</div>`;
}

function renderMapping(pidArg){
  const el = $("#v-mapping");
  const pairs = mapPairs();
  const ids = Object.keys(pairs);
  if (!ids.length) {
    el.innerHTML = `<h1 class="pg">${t("map.title")}</h1><p class="pg-sub">${t("map.none")}</p>`;
    return;
  }
  /* L'argument d'adresse porte la paire et, apres « ~ », le sens : un lien
     depuis la fiche France ouvre directement ce que CyFun couvre de ReCyF. */
  if (pidArg) {
    const [p, d] = String(pidArg).split("~");
    if (pairs[p]) { mapState.pid = p; if (d != null && !isNaN(+d)) mapState.dir = +d; }
  }
  if (!pairs[mapState.pid]) { mapState.pid = ids[0]; mapState.dir = 0; }
  const pair = pairs[mapState.pid];
  if (!pair.dirs[mapState.dir]) mapState.dir = 0;
  const d = pair.dirs[mapState.dir];

  el.innerHTML = `
  <h1 class="pg">${t("map.title")}</h1>
  <p class="pg-sub">${t(pair.actions ? "map.sub" : "map.subClient")}</p>

  ${ids.length > 1 ? `<div class="mp-pairs">${ids.map(id => `
    <button type="button" class="mp-pair${id === mapState.pid ? " on" : ""}" data-pid="${id}">
      ${esc(pairs[id].names.join(" ⇄ "))}</button>`).join("")}</div>` : ""}

  <div class="card mp-head">
    <div class="bd">
      <div class="mp-title">
        <h2>${esc(pair.names.join(" ⇄ "))}</h2>
        <span class="chip mp-valid">${t("map.validated")}</span>
      </div>
      <div class="mp-dirs" role="tablist">${pair.dirs.map((x, i) => `
        <button type="button" role="tab" class="mp-dir${i === mapState.dir ? " on" : ""}" data-dir="${i}"
          aria-selected="${i === mapState.dir}">
          <b>${esc(x.to.name)}</b> <span>${t("map.coversPart")}</span> <b>${esc(x.from.name)}</b>
        </button>`).join("")}</div>

      <div class="mp-sum">
        <div class="mp-big"><b>${mapPct(d.avg)}</b>
          <span>${t("map.avg", { from: esc(d.from.name) })}</span></div>
        <div class="mp-big"><b>${d.n}</b><span>${t("map.reqs", { from: esc(d.from.name) })}</span></div>
        <div class="mp-big"><b>${d.counts.none}</b><span>${t("map.gaps", { to: esc(d.to.name) })}</span></div>
      </div>
      ${mapStack(d.counts, d.n, true)}
      <p class="q-note mp-read">${t("map.read", { to: esc(d.to.name), from: esc(d.from.name) })}</p>
    </div>
  </div>

  <div class="mp-grid">
    <div class="card"><div class="cap"><h2>${t("map.byCat")}</h2></div><div class="bd">
      <div class="mp-cats">${d.cats.map(c => `
        <div class="mp-cat">
          <span class="k">${esc(c.cat.replace(/^\d+\.\s*/, ""))}</span>
          <span class="t"><i style="width:${Math.max(2, c.avg)}%"></i></span>
          <span class="v">${mapPct(Math.round(c.avg))}</span>
          <span class="n">${t("map.catN", { n: c.n })}${c.gaps ? ` · <em>${t("map.catGaps", { n: c.gaps })}</em>` : ""}</span>
        </div>`).join("")}</div>
    </div></div>

    <div class="card mp-list-card"><div class="cap"><h2>${t("map.detail")}</h2></div><div class="bd">
      <div class="mp-tools">
        <input type="search" id="mpQ" placeholder="${esc(t("map.search"))}" value="${esc(mapState.q)}"
          aria-label="${esc(t("map.search"))}">
        ${mapState.rel ? `<button type="button" class="btn" id="mpClear">${t("map.clearFilter")}</button>` : ""}
      </div>
      <div id="mpList"><p class="q-note">${t("map.loading")}</p></div>
    </div></div>
  </div>`;

  el.querySelectorAll(".mp-pair").forEach(b => b.addEventListener("click", () => {
    mapState = { pid: b.dataset.pid, dir: 0, rel: null, q: "", open: {} };
    renderMapping();
  }));
  el.querySelectorAll(".mp-dir").forEach(b => b.addEventListener("click", () => {
    mapState.dir = +b.dataset.dir; mapState.rel = null; mapState.open = {};
    renderMapping();
  }));
  el.querySelectorAll(".mp-lg[data-rel]").forEach(b => b.addEventListener("click", () => {
    mapState.rel = mapState.rel === b.dataset.rel ? null : b.dataset.rel;
    renderMapping();
  }));
  const clear = $("#mpClear", el);
  if (clear) clear.addEventListener("click", () => { mapState.rel = null; renderMapping(); });
  const q = $("#mpQ", el);
  let timer;
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { mapState.q = q.value; mapList(); }, 160);
  });

  mapList();
}

/* La liste des exigences, filtree. Rendue apart pour que la recherche ne
   reconstruise pas toute la page a chaque touche. */
async function mapList(){
  const host = $("#mpList");
  if (!host) return;
  let det;
  try { det = await mapLoad(); }
  catch (e) { host.innerHTML = `<p class="q-note">${esc(e.message)}</p>`; return; }
  const pair = mapPairs()[mapState.pid];
  const pd = det[mapState.pid];
  if (!pd) { host.innerHTML = `<p class="q-note">${t("map.none")}</p>`; return; }
  const d = pair.dirs[mapState.dir];
  const rows = pd.rows[mapState.dir] || [];
  const srcTexts = pd.texts[d.from.name] || {};
  const tgtTexts = pd.texts[d.to.name] || {};
  const needle = mapState.q.trim().toLowerCase();

  const shown = rows.filter(r => {
    if (mapState.rel && r.rel !== mapState.rel) return false;
    if (!needle) return true;
    return (r.id + " " + (srcTexts[r.id] || "") + " " + r.cat + " " + r.to.join(" ") + " " + r.gap)
      .toLowerCase().indexOf(needle) >= 0;
  });

  host.innerHTML = `
    <p class="q-note mp-count">${t("map.shown", { n: shown.length, total: rows.length })}</p>
    <div class="mp-rows">${shown.map(r => {
      const open = !!mapState.open[r.id];
      return `<div class="mp-row${open ? " open" : ""}">
        <button type="button" class="mp-rh" data-id="${esc(r.id)}" aria-expanded="${open}">
          <span class="mp-id">${esc(r.id)}</span>
          <span class="mp-txt">${esc(srcTexts[r.id] || "")}</span>
          <span class="mp-rel rel-${r.rel}">${t("map.rel." + r.rel)}<b>${r.lvl}</b></span>
        </button>
        ${open ? `<div class="mp-rb">
          <div class="mp-kv"><span>${t("map.cat")}</span><div>${esc(r.cat)}</div></div>
          <div class="mp-kv"><span>${t("map.target", { to: esc(d.to.name) })}</span><div>${r.to.length
            ? r.to.map(id => `<div class="mp-tgt"><b>${esc(id)}</b> ${esc(tgtTexts[id] || "")}</div>`).join("")
            : `<em>${t("map.noTarget")}</em>`}</div></div>
          ${r.gap ? `<div class="mp-kv"><span>${t("map.gap")}</span><div>${esc(r.gap)}</div></div>` : ""}
          ${r.det ? `<div class="mp-kv"><span>${t("map.detGap")}</span><div>${mapBullets(r.det)}</div></div>` : ""}
          ${r.act ? `<div class="mp-kv mp-act"><span>${t("map.action")}</span><div>${mapBullets(r.act)}</div></div>` : ""}
          ${r.pri ? `<div class="mp-kv"><span>${t("map.priority")}</span><div>${esc(r.pri)}</div></div>` : ""}
        </div>` : ""}
      </div>`;
    }).join("")}</div>`;

  host.querySelectorAll(".mp-rh").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.id;
    mapState.open[id] = !mapState.open[id];
    mapList();
  }));
}

/* Les ecarts et plans d'action arrivent en puces « • » dans une seule cellule. */
function mapBullets(text){
  const parts = String(text).split(/\s*(?:•|\n|\s\/\s)\s*/).map(s => s.trim()).filter(Boolean);
  return parts.length > 1
    ? `<ul>${parts.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`
    : esc(text);
}

/* ---------- le lien depuis la fiche pays ----------
   Les correspondances dont un referentiel concerne ce pays. On montre le sens
   utile a quelqu'un qui lit cette fiche : ce qu'un autre referentiel couvre du
   referentiel national. */
function mapForCountry(iso){
  const out = [];
  const pairs = mapPairs();
  Object.keys(pairs).forEach(pid => {
    pairs[pid].dirs.forEach((d, i) => {
      if (d.from.iso === iso) out.push({ pid: pid, dir: i, d: d });
    });
  });
  return out;
}
