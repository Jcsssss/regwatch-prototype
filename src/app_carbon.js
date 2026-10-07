/* ================= l'impact carbone de l'outil =================
 *
 * Un bouton a cote de « Vos retours » ouvre une estimation de ce que RegWatch a
 * emis : sa fabrication (le developpement assiste par IA, le poste de travail,
 * l'agent de veille, les traductions, la video) et son utilisation dans ce
 * navigateur, qui s'ajoute en temps reel tant que la page est ouverte.
 *
 * Une valeur, pas une fourchette
 *   Un premier essai affichait des intervalles (« 4 a 15 kg »). Personne ne
 *   retient un intervalle ; on retient « deux allers-retours Paris - Marseille
 *   en TGV ». Le panneau donne donc une valeur centrale, arrondie, et des
 *   reperes du quotidien.
 *
 * Des sources officielles seulement
 *   Chaque facteur vient d'une publication nommee dans « Comment est-ce
 *   estime ? » : l'analyse de cycle de vie de Mistral AI (2025, avec Carbone 4
 *   et l'ADEME) pour l'IA, la Base Empreinte de l'ADEME pour l'electricite et
 *   pour les equivalences. Ce qui n'a pas de source officielle (la puissance
 *   d'un ordinateur portable) est ecrit comme une hypothese, avec sa valeur.
 *   Les facteurs sont en tete de fichier : une source mise a jour se reporte
 *   ici en une ligne.
 *
 * Les compteurs sont reels (CARBON_DATA, tools/carbon_to_js.py, et pour
 * l'utilisation le temps passe sur la page et les jetons renvoyes par l'IA).
 * L'utilisation des autres consultants n'est pas comptee : la page n'a pas de
 * serveur ou la deposer. Le panneau le dit.
 */
"use strict";

/* --- les facteurs, avec leur source (repris dans co2.how) --- */
/* IA : Mistral AI, analyse de cycle de vie de Mistral Large 2 (juillet 2025,
   realisee avec Carbone 4 et l'ADEME) : 1,14 g CO2e pour une reponse de 400
   jetons. Applique a tout texte genere par une IA, quel que soit le modele. */
const CO2_AI_G_PER_TOKEN = 1.14 / 400;
/* Electricite : ADEME, Base Empreinte, France, mix moyen 2024, usages
   residentiels et tertiaires. */
const CO2_ELEC_G_PER_KWH = 60;
/* Equivalences : donnees ADEME publiees sur impactco2.fr, relevees le
   7 octobre 2026. Transport : par personne. Alimentation et boissons :
   Agribalyse 3.2 (mise a jour du 15 janvier 2025). */
const CO2_TGV_G_PER_KM = 2.9;         /* TGV : 0,29 kg pour 100 km */
const CO2_CAR_G_PER_KM = 142;         /* voiture thermique : 14,2 kg pour 100 km */
const CO2_BEEF_MEAL_G = 4970;         /* repas avec du boeuf */
const CO2_COFFEE_G_PER_L = 635;       /* cafe, par litre */
const CO2_CUP_L = 0.2;                /* une tasse de 20 cl */
const CO2_TGV_PM_KM = 750;            /* Paris - Marseille par le rail */
/* --- les hypotheses, sans source officielle --- */
const CO2_LAPTOP_W = 30;              /* ordinateur portable en usage */
const CO2_DESK_H = 7;                 /* heures de developpement par jour actif */
const CO2_RENDER_KWH = 0.0025;        /* un rendu video, environ 2,5 min a 60 W */
const CO2_AUDIO_KWH = 0.06;           /* generation locale de la voix et de la musique */

function co2Store(){
  const c = store.carbon || (store.carbon = {});
  if (!c.since) c.since = new Date().toISOString().slice(0, 10);
  c.seconds = c.seconds || 0;
  c.loads = c.loads || 0;
  c.ai = c.ai || {};
  c.ai.calls = c.ai.calls || 0;
  c.ai.tokOut = c.ai.tokOut || 0;
  return c;
}

/* Une reponse de l'IA vient d'arriver : ses jetons reels. Appele par chatPost
   (app_chat.js). Le modele n'est pas utilise : la source officielle ne donne
   qu'un facteur, celui d'un grand modele. */
function carbonCount(model, usage){
  if (!usage || !usage.completion_tokens) return;
  const c = co2Store();
  c.ai.calls += 1;
  c.ai.tokOut += usage.completion_tokens;
  saveStore();
}

/* ---------- les postes, en grammes ---------- */
const co2Elec = kwh => kwh * CO2_ELEC_G_PER_KWH;
const co2Ai = tokens => tokens * CO2_AI_G_PER_TOKEN;

function co2Build(){
  const D = typeof CARBON_DATA !== "undefined" ? CARBON_DATA : {};
  const dev = D.dev || {}, ag = D.agent || {}, tr = D.i18n || {}, vid = D.video || {};
  const rows = [];
  if (dev.out) {
    rows.push({ k: "dev", g: co2Ai(dev.out), color: "#451DC7",
      detail: t("co2.devD", { out: co2Int(dev.out), from: fmtDateL(dev.from), to: fmtDateL(dev.to) }) });
    rows.push({ k: "desk", g: co2Elec(dev.days * CO2_DESK_H * CO2_LAPTOP_W / 1000), color: "#4682B4",
      detail: t("co2.deskD", { d: dev.days, h: CO2_DESK_H }) });
  }
  /* L'agent : ses jetons mesures quand il les a enregistres, sinon une
     estimation par appel (un jugement, 150 jetons ; une redaction, 500). */
  const agOut = ag.measuredOut || ((ag.judged || 0) * 150 + (ag.written || 0) * 500);
  rows.push({ k: "agent", g: co2Ai(agOut), color: "#FFCA4A",
    detail: t("co2.agentD", { j: ag.judged || 0, w: ag.written || 0 }) });
  rows.push({ k: "i18n", g: co2Ai((tr.texts || 0) * 60), color: "#8F00FF",
    detail: t("co2.i18nD", { n: tr.texts || 0 }) });
  if (vid.renders) rows.push({ k: "video", g: co2Elec(vid.renders * CO2_RENDER_KWH + CO2_AUDIO_KWH), color: "#FF2A49",
    detail: t("co2.videoD", { n: vid.renders }) });
  /* L'utilisation, dans ce navigateur : elle grandit pendant qu'on regarde. */
  const c = co2Store();
  rows.push({ k: "use", g: co2Elec(c.seconds / 3600 * CO2_LAPTOP_W / 1000) + co2Ai(c.ai.tokOut), color: "#04F06A", live: true,
    detail: t("co2.useD", { since: fmtDateL(c.since), time: co2Dur(c.seconds), loads: c.loads, calls: c.ai.calls }) });
  return { rows: rows, total: rows.reduce((n, r) => n + r.g, 0), built: D.built };
}

/* ---------- les nombres, arrondis pour etre retenus ---------- */
const co2Loc = () => lang === "fr" ? "fr-FR" : "en-GB";
function co2Int(n){ return Math.round(n).toLocaleString(co2Loc()); }
/* Deux chiffres significatifs, au plus. */
function co2Sig(v){
  if (!v) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.round(v / p) * p;
}
function co2Mass(g){
  return g >= 1000 ? t("co2.kg", { v: co2Sig(g / 1000).toLocaleString(co2Loc(), { maximumFractionDigits: 1 }) })
                   : t("co2.g", { v: co2Sig(g).toLocaleString(co2Loc(), { maximumFractionDigits: 3 }) });
}
/* Un nombre de trajets ou de repas : au demi pres sous dix, a l'unite au-dela,
   a deux chiffres significatifs au-dessus de cent. */
function co2Count(v){
  const n = v >= 100 ? co2Sig(v) : v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10;
  return n.toLocaleString(co2Loc());
}
function co2Pct(p){
  if (p > 0 && p < 0.1) return "< " + (0.1).toLocaleString(co2Loc()) + " %";
  return (p >= 1 ? Math.round(p) : Math.round(p * 10) / 10).toLocaleString(co2Loc()) + " %";
}
function co2Dur(s){
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60);
  return (h ? h + " h " : "") + (h || m ? m + " min " : "") + x + " s";
}

/* ---------- les reperes du quotidien ---------- */
const CO2_ICONS = {
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-5a2 2 0 0 1 2-1.3h10A2 2 0 0 1 19 8l2 5v4H3z"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/></svg>',
  beef: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16a8 8 0 0 1-16 0zM9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4"/></svg>',
  coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3"/></svg>'
};
function co2Equiv(g){
  return [
    { icon: CO2_ICONS.train, v: co2Count(g / (CO2_TGV_G_PER_KM * CO2_TGV_PM_KM * 2)), label: t("co2.eqTgv") },
    { icon: CO2_ICONS.car, v: co2Count(g / CO2_CAR_G_PER_KM), label: t("co2.eqCar") },
    { icon: CO2_ICONS.coffee, v: co2Count(g / (CO2_COFFEE_G_PER_L * CO2_CUP_L)), label: t("co2.eqCoffee") },
    { icon: CO2_ICONS.beef, v: co2Count(g / CO2_BEEF_MEAL_G), label: t("co2.eqBeef") }
  ];
}

/* ---------- le panneau ---------- */
const CO2_SOURCES = [
  { what: "co2.sAi", factor: "co2.fAi", src: "co2.srcAi", url: "https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai" },
  { what: "co2.sElec", factor: "co2.fElec", src: "co2.srcAdeme", url: "https://base-empreinte.ademe.fr" },
  { what: "co2.sTgv", factor: "co2.fTgv", src: "co2.srcImpact", url: "https://impactco2.fr/outils/transport" },
  { what: "co2.sCar", factor: "co2.fCar", src: "co2.srcImpact", url: "https://impactco2.fr/outils/transport" },
  { what: "co2.sCoffee", factor: "co2.fCoffee", src: "co2.srcAgri", url: "https://impactco2.fr/outils/boisson" },
  { what: "co2.sMeal", factor: "co2.fMeal", src: "co2.srcAgri", url: "https://impactco2.fr/outils/alimentation" }
];
function carbonHTML(){
  const b = co2Build();
  const pct = r => b.total ? 100 * r.g / b.total : 0;
  return `
    <div class="co2-head">
      <div class="co2-kick">${t("co2.kicker")}</div>
      <div class="co2-bigrow">
        <div class="co2-big" id="co2Big">${t("co2.approx")} ${co2Mass(b.total)}</div>
        <button type="button" class="co2-info" id="co2Info" aria-expanded="false" aria-controls="co2Tip"
          title="${esc(t("co2.infoL1") + " " + t("co2.infoL2"))}" aria-label="${esc(t("co2.infoBtn"))}">i</button>
      </div>
      <div class="co2-tip" id="co2Tip" hidden><p>${t("co2.infoL1")}</p><p>${t("co2.infoL2")}</p></div>
    </div>
    <div class="co2-eqs">${co2Equiv(b.total).map(e => `
      <div class="co2-eqc"><span class="co2-ico">${e.icon}</span>
        <b>${e.v}</b><span>${e.label}</span></div>`).join("")}</div>
    <div class="co2-bar" aria-hidden="true">${b.rows.map(r =>
      `<span style="width:${pct(r).toFixed(2)}%;background:${r.color}"></span>`).join("")}</div>
    <div class="co2-rows">${b.rows.map(r => `
      <div class="co2-row${r.live ? " live" : ""}">
        <i style="background:${r.color}"></i>
        <div><b>${t("co2.r." + r.k)}${r.live ? ` <em class="co2-live">${t("co2.live")}</em>` : ""}</b>
          <span>${r.detail}</span></div>
        <div class="co2-v"><b>${co2Mass(r.g)}</b><span>${co2Pct(pct(r))}</span></div>
      </div>`).join("")}</div>
    <details class="co2-how"><summary>${t("co2.howT")}</summary>
      <div class="co2-how-b">
        <p>${t("co2.howIntro", { built: b.built ? fmtDateL(b.built) : "-" })}</p>
        <table class="co2-src">
          <thead><tr><th>${t("co2.hWhat")}</th><th>${t("co2.hFactor")}</th><th>${t("co2.hSource")}</th></tr></thead>
          <tbody>${CO2_SOURCES.map(s => `<tr><td>${t(s.what)}</td><td>${t(s.factor)}</td>
            <td>${t(s.src)}<br><a href="${s.url}" target="_blank" rel="noopener">${esc(s.url.replace(/^https:\/\//, ""))}</a></td></tr>`).join("")}
          </tbody></table>
        <p>${t("co2.howHyp", { w: CO2_LAPTOP_W, h: CO2_DESK_H })}</p>
        <p>${t("co2.howLimits")}</p>
      </div></details>`;
}

let co2Tick = null;
function carbonOpen(){
  let dlg = document.getElementById("co2Dlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "co2Dlg";
    document.body.appendChild(dlg);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { clearInterval(co2Tick); co2Tick = null; });
  }
  dlg.innerHTML = `<div class="rpt-box co2-box">
    <div class="rpt-h"><h2>${t("co2.title")}</h2>
      <button class="x" type="button" id="co2X" aria-label="${t("fiche.close")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="rpt-b">${carbonHTML()}</div></div>`;
  dlg.querySelector("#co2X").addEventListener("click", () => dlg.close());
  /* Le bouton d'information : deux lignes sur ce que le chiffre couvre et sur
     le « e » de CO2e, ouvertes a la demande pour garder le chiffre en avant. */
  const info = dlg.querySelector("#co2Info"), tip = dlg.querySelector("#co2Tip");
  info.addEventListener("click", () => {
    tip.hidden = !tip.hidden;
    info.setAttribute("aria-expanded", String(!tip.hidden));
  });
  if (!dlg.open) dlg.showModal();
  /* Le temps reel : on ne redessine que les chiffres, pour ne pas refermer le
     detail ouvert ni faire sauter la page. */
  clearInterval(co2Tick);
  co2Tick = setInterval(() => {
    if (!dlg.open) return;
    const b = co2Build(), live = b.rows.find(r => r.live);
    const big = dlg.querySelector("#co2Big"); if (big) big.textContent = t("co2.approx") + " " + co2Mass(b.total);
    const eq = co2Equiv(b.total);
    dlg.querySelectorAll(".co2-eqc b").forEach((x, i) => { x.textContent = eq[i].v; });
    const row = dlg.querySelector(".co2-row.live");
    if (row && live) {
      row.querySelector("div > span").innerHTML = live.detail;
      row.querySelector(".co2-v b").textContent = co2Mass(live.g);
    }
  }, 1000);
}

/* Le compteur d'utilisation : une visite de plus, et chaque seconde ou la page
   est visible. Enregistre toutes les quinze secondes et en quittant. */
function carbonWire(){
  const c = co2Store();
  c.loads += 1;
  saveStore();
  let n = 0;
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    c.seconds += 1;
    if (++n % 15 === 0) saveStore();
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveStore(); });
  const b = document.getElementById("co2Open");
  if (b) b.addEventListener("click", carbonOpen);
}
carbonWire();
