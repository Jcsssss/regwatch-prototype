#!/usr/bin/env node
/* Traduire le contenu embarque, pour que le site soit entierement en francais ou
 * entierement en anglais.
 *
 *   node tools/content_i18n.js            # traduit ce qui manque, ecrit src/data_content_i18n.js
 *   node tools/content_i18n.js --dry      # compte seulement, sans appeler le modele
 *
 * Pourquoi un dictionnaire, et pas des donnees en deux langues
 *   Le contenu vient de sources qui ne sont tenues que dans une langue : le
 *   classeur Cyber Watch (anglais, parfois une case en francais ou dans la
 *   langue du pays), les fiches redigees en juin, les exigences tcheques, les
 *   phrases generees pour la Belgique (francais). Doubler chaque source
 *   obligerait a doubler chaque extracteur. Ici, on releve tous les textes
 *   affichables, on les traduit une fois, et l'outil choisit a l'affichage
 *   (tc() dans app_i18n.js). Un texte change dans le classeur est simplement un
 *   texte nouveau : il sera traduit au prochain passage.
 *
 * Le cache
 *   data/content-i18n.json garde chaque traduction : une relance ne paie que les
 *   textes nouveaux, et une traduction corrigee a la main dans ce fichier est
 *   conservee. Il est versionne.
 *
 * Ce qui n'est pas traduit
 *   Les noms officiels (lois, autorites, plateformes, referentiels, normes), les
 *   URL, les nombres, les dates et les references d'articles : le modele a la
 *   consigne de les laisser tels quels, dans les deux langues.
 *
 * Configuration : AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY et
 * AZURE_OPENAI_DEPLOYMENT, lus dans .env (jamais versionne).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "data", "content-i18n.json");
const OUT = path.join(ROOT, "src", "data_content_i18n.js");
const DRY = process.argv.includes("--dry");

const SOURCES = [
  "src/reg/nis2/data_sheets.js", "src/reg/nis2/data_sectors.js",
  "src/reg/nis2/data_c1.js", "src/reg/nis2/data_c2.js", "src/reg/nis2/data_c3.js", "src/reg/nis2/data_c4.js",
  "src/reg/nis2/data_requirements.js", "src/reg/nis2/data_fwthemes.js", "src/reg/nis2/data_themes.js",
  "src/reg/nis2/data_prose.js", "src/reg/rec/data_countries.js", "src/data_meta.js"
];
/* Des cles qui portent des identifiants, pas du texte a lire. */
const SKIP_KEYS = new Set(["iso", "id", "url", "href", "flag", "region", "date", "detected", "lastUpdate",
  "updated", "c", "k", "type", "fw", "cell", "workbook", "sheet", "name_en", "nameFr", "icon", "folderUrl", "ref"]);

function collect(){
  const ctx = {};
  vm.createContext(ctx);
  for (const f of SOURCES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, "utf8").replace(/^(const|let) /gm, "var "), ctx, { filename: f });
  }
  const out = new Set();
  const keep = s => {
    const t = s.trim();
    if (t.length < 2 || t === "NC") return false;
    if (/^(yes|no|n\/a)$/i.test(t)) return false;
    if (/^https?:\/\/\S+$/.test(t)) return false;
    if (/^[\d\s.,:;%\/()+-]+$/.test(t)) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return false;
    if (!/[A-Za-zÀ-ÿ]{2}/.test(t)) return false;
    return true;
  };
  const walk = (o, key) => {
    if (typeof o === "string") { if (!SKIP_KEYS.has(key) && keep(o)) out.add(o); return; }
    if (Array.isArray(o)) { o.forEach(x => walk(x, key)); return; }
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, k);
  };
  const names = ["SHEET_DATA", "SECTOR_DATA", "COUNTRIES_1", "COUNTRIES_2", "COUNTRIES_3", "COUNTRIES_4",
    "FW_REQUIREMENTS", "FW_THEMES", "CYBER_THEMES", "PROSE", "REC_COUNTRIES", "FW_LABEL", "REGULATIONS", "GLOBAL_SOURCES"];
  for (const n of names) {
    const v = vm.runInContext("typeof " + n + " === 'undefined' ? null : " + n, ctx);
    if (!v) continue;
    /* Les pays : le nom et le drapeau ont leur propre traduction (COUNTRY_FR). */
    if (/^COUNTRIES_|^REC_COUNTRIES$/.test(n)) v.forEach(c => walk(Object.assign({}, c, { name: null, nameFr: null }), ""));
    else walk(v, "");
  }
  /* Les en-tetes du classeur sont des libelles : ils passent par le meme chemin. */
  return [...out];
}

function env(){
  const p = path.join(ROOT, ".env");
  const e = {};
  if (fs.existsSync(p)) fs.readFileSync(p, "utf8").split("\n").forEach(l => {
    const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
    if (m) e[m[1]] = m[2].trim();
  });
  return Object.assign(e, process.env);
}

/* Une langue cible par appel. Demander l'anglais et le francais dans la meme
   reponse melangeait les deux : textes a moitie traduits, voire inverses. */
const TARGET = { fr: "French", en: "English" };
const system = lang => [
  "You translate the content of RegWatch, a tool Wavestone consultants use to track the national",
  "transposition of EU cybersecurity law (NIS 2, CER/REC). Translate every item fully into "
    + TARGET[lang] + ".",
  "- The whole text must end up in " + TARGET[lang] + ", whatever its source language, including texts that",
  "  mix languages and multi-line texts: every line is translated. A text already fully in "
    + TARGET[lang] + " is returned unchanged.",
  "- Keep unchanged ONLY proper names: the official title of a law or decree, the name of an authority,",
  "  platform, framework or standard (ISO 27001, NIST CSF, CyFun, ReCyF, NISG 2026), acronyms (NIS 2, CSIRT,",
  "  CERT, DORA, NUKIB, ANSSI...), URLs, numbers, amounts, article or section references. A sentence that",
  "  contains a name is still translated around it. A text that is only a list of authority names stays as is.",
  "- Keep HTML tags such as <b>, bullets and line breaks exactly where they are.",
  lang === "fr"
    ? "- French terminology: essential entity = entité essentielle (EE); important entity = entité importante (EI),"
      + " so IE becomes EI; registration = enregistrement; framework = référentiel; incident reporting ="
      + " notification des incidents; self-assessment = auto-évaluation; \"Multiple\" = \"Plusieurs\"."
      + " Dates as \"8 avril 2025\"."
    : "- English terminology: entité essentielle = essential entity (EE); entité importante = important entity (IE),"
      + " so EI becomes IE; référentiel = framework; enregistrement = registration. Dates as \"8 Apr 2025\".",
  "- Short workbook values stay short. Precise, professional regulatory register. No additions, no omissions.",
  "Answer with JSON only: {\"items\":[{\"id\":<number>,\"t\":\"<translation>\"}]} with every id."
].join("\n");

async function translateBatch(E, batch, lang){
  const url = E.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "") + "/openai/deployments/"
    + encodeURIComponent(E.AZURE_OPENAI_DEPLOYMENT) + "/chat/completions?api-version=2024-10-21";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "api-key": E.AZURE_OPENAI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: system(lang) },
                   { role: "user", content: JSON.stringify({ items: batch.map((text, id) => ({ id, text })) }) }],
        response_format: { type: "json_object" },
        max_completion_tokens: 16000
      })
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); continue; }
    const j = await res.json();
    if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
    let items;
    try { items = JSON.parse(j.choices[0].message.content).items; } catch (e) { continue; }
    const got = {};
    (items || []).forEach(it => { if (batch[it.id] != null && typeof it.t === "string" && it.t.trim()) got[batch[it.id]] = it.t; });
    if (Object.keys(got).length >= batch.length * 0.9) return got;
  }
  throw new Error("batch failed after retries");
}

/* Un texte reste-t-il dans la mauvaise langue ? Compte grossier des mots outils :
   il ne sert qu'a designer les textes a repasser un par un. */
const EN_W = /\b(the|and|of|for|with|to|by|is|are|on|from|after|within|which|has|have|in)\b/gi;
const FR_W = /\b(le|la|les|des|du|dans|et|pour|avec|sur|une|est|sont|après|aux|au|en)\b/gi;
const nWords = (s, re) => (s.match(re) || []).length;
function wrongLang(text, lang){
  const en = nWords(text, EN_W), fr = nWords(text, FR_W);
  return lang === "fr" ? en >= 2 && en > fr : fr >= 2 && fr > en;
}

async function runPass(E, cache, strings, lang){
  const todo = strings.filter(s => !cache[s] || cache[s][lang] == null);
  if (!todo.length) return;
  const batches = [];
  let cur = [], size = 0;
  todo.forEach(s => {
    if (cur.length && (size + s.length > 5000 || cur.length >= 40)) { batches.push(cur); cur = []; size = 0; }
    cur.push(s); size += s.length;
  });
  if (cur.length) batches.push(cur);
  let done = 0, next = 0;
  const put = got => Object.entries(got).forEach(([src, tr]) => { (cache[src] = cache[src] || {})[lang] = tr; });
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      try { put(await translateBatch(E, b, lang)); }
      catch (e) {
        for (const s of b) {
          try { put(await translateBatch(E, [s], lang)); }
          catch (err) { console.error("non traduit :", s.slice(0, 80), "-", err.message); }
        }
      }
      done++;
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      process.stdout.write(`\r${lang} : lots ${done}/${batches.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  process.stdout.write("\n");
  /* Seconde chance, texte par texte, pour ceux restes dans la mauvaise langue. */
  const suspects = todo.filter(s => cache[s] && cache[s][lang] != null && wrongLang(cache[s][lang], lang));
  for (const s of suspects) {
    try { put(await translateBatch(E, [s], lang)); } catch (e) { /* on garde la premiere version */ }
  }
  if (suspects.length) {
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    const left = suspects.filter(s => wrongLang(cache[s][lang], lang)).length;
    console.log(`${lang} : ${suspects.length} textes repasses un par un, ${left} encore douteux (souvent des listes de noms)`);
  }
}

async function main(){
  const strings = collect();
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const todo = strings.filter(s => !cache[s] || cache[s].en == null || cache[s].fr == null);
  const chars = todo.reduce((n, s) => n + s.length, 0);
  console.log(`${strings.length} textes, ${strings.length - todo.length} deja traduits, ${todo.length} a traduire (${chars} caracteres)`);
  if (DRY) return;
  if (todo.length) {
    const E = env();
    if (!E.AZURE_OPENAI_ENDPOINT || !E.AZURE_OPENAI_API_KEY || !E.AZURE_OPENAI_DEPLOYMENT)
      throw new Error("AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY et AZURE_OPENAI_DEPLOYMENT sont requis (.env)");
    await runPass(E, cache, strings, "fr");
    await runPass(E, cache, strings, "en");
  }

  /* Le fichier embarque ne garde que les textes encore affiches, et ne repete pas
     l'original : 0 veut dire « identique au texte source ». */
  const table = {};
  strings.forEach(s => {
    const e = cache[s];
    if (!e || e.en == null || e.fr == null) return;
    const en = e.en === s ? 0 : e.en, fr = e.fr === s ? 0 : e.fr;
    if (en === 0 && fr === 0) return;
    table[s] = [en, fr];
  });
  fs.writeFileSync(OUT,
    "/* ---- Traductions du contenu embarque (classeur, fiches, exigences, secteurs).\n"
    + "   Genere par tools/content_i18n.js - ne pas editer a la main : corriger\n"
    + "   data/content-i18n.json puis relancer. [anglais, francais], 0 = texte source. ---- */\n"
    + "const CONTENT_I18N = " + JSON.stringify(table) + ";\n");
  const missing = strings.filter(s => !cache[s] || cache[s].en == null || cache[s].fr == null).length;
  console.log(`${Object.keys(table).length} entrees -> ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} Ko)`
    + (missing ? `, ${missing} textes sans traduction` : ""));
}

main().catch(e => { console.error(e.message); process.exit(1); });
