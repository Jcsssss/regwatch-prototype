#!/usr/bin/env python3
"""L'agent de veille NIS 2 de RegWatch.

    python3 agent-veille/regwatch_agent.py import "<agent_veille_NIS2.xlsx>" [--state state.json]
    python3 agent-veille/regwatch_agent.py run [--dry] [--limit N] [--only "nom de source"]
    python3 agent-veille/regwatch_agent.py pipeline      # run, puis extraits, traductions, file, build

Pourquoi cet agent
  La veille reposait sur un agent tenu dans un autre depot, qui ecrivait dans
  un classeur Excel copie ensuite a la main dans ressources/. Le 28 aout, cet
  agent a trouve 33 nouveautes qui ne sont jamais arrivees dans l'outil : elles
  etaient restees dans sa copie du classeur. Ici, tout le circuit vit dans le
  depot RegWatch, et l'agent ecrit directement ce que l'outil lit.

Ce qui est garde a l'identique
  Chaque detection porte exactement les colonnes de l'ancien tblVeille (ID,
  Date detection, Titre, Resume, Pays / Zone, Obligations principales, Score
  impact, Decision IA, URL source...). tools/veille_to_watchitems.py les lit
  depuis data/veille/records.json comme il les lisait dans le classeur : la file
  de veille de l'interface ne perd aucun champ.

Le deroule, pour chaque source active du registre (data/veille/sources.json)
  1. lecture : flux RSS/Atom, page web (avec selecteur CSS, et recolte des liens
     quand la page est un index), ou API JSON ;
  2. filtre : URL deja connue, deja jugee, sans date ou trop ancienne ;
  3. tri par le modele : pertinence NIS 2, nouveaute, date reelle du contenu ;
  4. doublons : meme fait deja present dans la veille recente ;
  5. fiche : titre, resume, pays, obligations, impact, actions, echeances ;
  6. ecriture dans data/veille/records.json, statut « A valider ».

Donnees (versionnees, sauf mention)
  data/veille/sources.json   le registre des sources, modifiable a la main
  data/veille/records.json   toutes les detections, anciennes et nouvelles
  data/veille/state.json     memoire des pages deja vues et des URL deja jugees
  .env                       AZURE_OPENAI_ENDPOINT / _API_KEY / _DEPLOYMENT (jamais versionne)

Rien ne contourne une protection de site : une source qui refuse les robots
est signalee par health.py --probe, pas forcee.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

try:
    import feedparser
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    raise SystemExit("pip install feedparser requests beautifulsoup4 openpyxl")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regwatch_fields import (classify_page, harvest_links, iso_codes, iso_date,  # noqa: E402
                             resolve_publish_date, source_excerpt)

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "veille"
SOURCES = DIR / "sources.json"
RECORDS = DIR / "records.json"
STATE = DIR / "state.json"

UA = {"User-Agent": "RegWatch-veille/1.0 (Wavestone; veille reglementaire NIS 2)"}
TIMEOUT = 45
MAX_ITEMS_PER_FEED = 20
MAX_WEB_CHARS = 12000
HARVEST_MAX = 8
MIN_SCORE = 6                  # pertinence minimale pour rediger une fiche
KEEP_UNCERTAIN = True          # un contenu « incertain » est garde : le validateur tranche
MAX_CONTENT_AGE_DAYS = 120     # au-dela, un contenu n'est plus une nouveaute
DEDUP_DAYS, DEDUP_MAX = 45, 80
# La fenetre part de la derniere detection, moins une marge : un agent qui n'a
# pas tourne pendant un mois ne doit pas perdre ce mois-la. L'ancien agent
# regardait toujours 14 jours en arriere, quelle que soit sa derniere passe.
WINDOW_MARGIN_DAYS, WINDOW_MAX_DAYS, WINDOW_DEFAULT_DAYS = 3, 60, 14

# Les colonnes de l'ancien tblVeille, dans leur ordre. Le convertisseur les lit
# par leur nom : les garder a l'identique, c'est garder la file de veille.
COLUMNS = ["ID", "Date détection", "Date publication", "Origine date", "Type de page",
           "Extrait source", "Date entrée en vigueur", "Titre", "Type de texte",
           "Autorité émettrice", "Pays / Zone", "ISO", "Thématique", "Résumé",
           "Entités concernées", "Obligations principales", "Niveau impact", "Score impact",
           "Actions recommandées", "Échéance action", "Responsable", "Score pertinence IA",
           "Décision IA", "Règlementation IA", "Raison pertinence IA", "Type contenu IA",
           "Source d'origine", "Type de source", "Fiabilité source", "Statut", "URL source"]


# ---------- stockage ----------

def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)          # jamais de fichier a moitie ecrit si la passe est interrompue


def fold(text):
    t = unicodedata.normalize("NFD", str(text or "").strip().lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in t if unicodedata.category(c) != "Mn"))


def canonical(record):
    """Les cles d'une detection ramenees aux noms de COLUMNS (casse, accents,
    espaces finaux : « Pays / zone » et « Raison pertinence IA  » comptent)."""
    by = {fold(c): c for c in COLUMNS}
    out = {}
    for k, v in record.items():
        out[by.get(fold(k), str(k).strip())] = v
    return out


# ---------- import depuis le classeur de l'ancien agent ----------

def cmd_import(args):
    from openpyxl import load_workbook
    xlsx = Path(args.workbook).expanduser()
    wb = load_workbook(xlsx, data_only=True, read_only=True)

    def table(sheet, key):
        rows = list(wb[sheet].iter_rows(values_only=True))
        head = next(i for i, r in enumerate(rows) if r and key in [str(x or "").strip() for x in r])
        cols = [str(x or "").strip() for x in rows[head]]
        out = []
        for r in rows[head + 1:]:
            if not r or not any(v not in (None, "") for v in r):
                continue
            out.append({c: v for c, v in zip(cols, r) if c})
        return out

    def plain(v):
        if isinstance(v, (datetime, date)):
            return iso_date(v)
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return "" if v is None else v

    # Le registre : toutes ses colonnes, pour ne rien perdre de ce qui a ete
    # renseigne (selecteurs CSS, champs d'API, fiabilite, dates de test).
    sources = [{k: plain(v) for k, v in s.items()} for s in table("Sources", "URL / Endpoint")]
    save(SOURCES, {"imported": date.today().isoformat(), "from": xlsx.name, "sources": sources})

    # Les detections : fusion par ID, sans jamais ecraser une detection deja la.
    store = load(RECORDS, {"records": []})
    known = {r.get("ID") for r in store["records"]}
    added = 0
    for r in table("Veille", "Titre"):
        rec = canonical({k: plain(v) for k, v in r.items()})
        for c in ("Date détection", "Date publication", "Date entrée en vigueur"):
            if rec.get(c) not in (None, ""):
                rec[c] = iso_date(rec[c]) or rec[c]
        if not rec.get("ID") or rec["ID"] in known:
            continue
        store["records"].append(rec)
        known.add(rec["ID"])
        added += 1
    save(RECORDS, store)

    if args.state:
        st = load(Path(args.state).expanduser(), {})
        mine = load(STATE, {})
        for k in ("web_pages", "web_texts", "classified_urls", "harvested_urls"):
            mine.setdefault(k, {}).update(st.get(k, {}))
        save(STATE, mine)

    print("registre : %d sources (%d actives)" % (
        len(sources), sum(1 for s in sources if fold(s.get("Actif")) in ("oui", "yes", "true", "1"))))
    print("détections : %d ajoutées, %d au total -> %s" % (added, len(store["records"]), RECORDS.relative_to(ROOT)))
    if args.state:
        print("mémoire : pages et URL déjà vues reprises -> %s" % STATE.relative_to(ROOT))


# ---------- lecture des sources ----------

def clean(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def page_content(html, css=None):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    title = (soup.title.string.strip() if soup.title and soup.title.string else "") \
        or (soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "") or "Page web surveillée"
    blocks = soup.select(str(css)) if css else []
    if blocks:
        text = "\n".join(b.get_text(" ", strip=True) for b in blocks)
    else:
        root = soup.find("main") or soup
        text = root.get_text(" ", strip=True)
    return title, clean(text)[:MAX_WEB_CHARS]


def new_sentences(old, new):
    """Ce qui est apparu sur la page depuis la derniere visite : c'est la nouveaute."""
    split = lambda t: [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n+", t or "") if len(p.strip()) >= 30]
    seen = {fold(s) for s in split(old)}
    return "\n".join(s for s in split(new) if fold(s) not in seen)


def feed_date(entry):
    for k in ("published_parsed", "updated_parsed"):
        t = entry.get(k)
        if t:
            try:
                return date(*t[:3]).isoformat()
            except (TypeError, ValueError):
                pass
    return ""


def read_rss(src):
    r = requests.get(src["url"], headers=dict(UA, Accept="application/rss+xml, application/atom+xml, */*"),
                     timeout=TIMEOUT)
    r.raise_for_status()
    return [{"source_type": "RSS", "title": e.get("title", ""),
             "summary": clean(BeautifulSoup(e.get("summary", "") or e.get("description", ""), "html.parser").get_text(" ")),
             "url": e.get("link", ""), "date": feed_date(e)}
            for e in feedparser.parse(r.content).entries[:MAX_ITEMS_PER_FEED]]


def read_page(src, state):
    """Une page surveillee : analysee seulement quand son contenu a change, et
    seulement sur ce qui a ete ajoute. Une page d'index donne ses liens."""
    url = src["url"]
    r = requests.get(url, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    pages, texts = state.setdefault("web_pages", {}), state.setdefault("web_texts", {})
    is_pdf = "pdf" in r.headers.get("Content-Type", "").lower() or url.lower().endswith(".pdf")
    if is_pdf:
        title = url.rstrip("/").split("/")[-1] or "Document PDF"
        digest, text = hashlib.sha256(r.content).hexdigest(), ""
        summary = "Document PDF officiel nouveau ou mis à jour : %s." % title
    else:
        title, text = page_content(r.content, src.get("css"))
        if not text:
            return []
        digest, summary = hashlib.sha256(text.encode("utf-8")).hexdigest(), text
    before = pages.get(url)
    if before is None:
        # Premiere visite : on memorise, on n'analyse pas - une page n'est pas
        # une nouveaute parce qu'on la decouvre.
        pages[url], texts[url] = digest, text
        return []
    if before == digest:
        return []
    if not is_pdf and texts.get(url):
        added = new_sentences(texts[url], text)
        if not added:
            pages[url], texts[url] = digest, text
            return []
        summary = "CONTENU AJOUTÉ DEPUIS LA DERNIÈRE VISITE :\n" + added[:8000] \
            + "\n\nEXTRAIT DE LA PAGE (contexte) :\n" + text[:3000]
    kind, _why = classify_page(url, r.text) if not is_pdf else ("article", [])
    if kind == "index":
        pages[url], texts[url] = digest, text
        seen = state.setdefault("harvested_urls", {})
        out = []
        for cand in [l for l in harvest_links(url, r.text) if l["url"] not in seen][:HARVEST_MAX]:
            seen[cand["url"]] = date.today().isoformat()
            try:
                sub = requests.get(cand["url"], headers=UA, timeout=TIMEOUT)
                if sub.status_code != 200 or "html" not in sub.headers.get("Content-Type", "").lower():
                    continue
            except requests.RequestException:
                continue
            if classify_page(cand["url"], sub.text)[0] == "index":
                continue
            _t, sub_text = page_content(sub.text, src.get("css"))
            out.append({"source_type": "Page web", "title": cand["title"] or _t, "summary": sub_text,
                        "url": cand["url"], "date": "", "html": sub.text, "text": sub_text})
        return out
    return [{"source_type": "Page web", "title": title, "summary": summary, "url": url, "date": "",
             "html": r.text, "text": text, "pending": (digest, text)}]


def nested(data, path):
    for part in str(path or "").split("."):
        if not part:
            continue
        if isinstance(data, dict):
            data = data.get(part)
        elif isinstance(data, list) and part.isdigit() and int(part) < len(data):
            data = data[int(part)]
        else:
            return None
    return data


def read_api(src):
    r = requests.get(src["url"], headers=dict(UA, Accept="application/json"), timeout=TIMEOUT)
    r.raise_for_status()
    if "json" not in r.headers.get("Content-Type", "").lower():
        return []
    data = r.json()
    items = nested(data, src.get("api_items")) if src.get("api_items") else data
    if isinstance(items, dict):
        items = next((items[k] for k in ("items", "results", "data", "value", "documents")
                      if isinstance(items.get(k), list)), [items])
    out = []
    for it in (items or [])[:MAX_ITEMS_PER_FEED]:
        if not isinstance(it, dict):
            continue
        get = lambda field, *keys: nested(it, field) if field else next((it.get(k) for k in keys if it.get(k)), None)
        link = get(src.get("api_url"), "url", "link", "href") or src["url"]
        out.append({"source_type": "API", "title": str(get(src.get("api_title"), "title", "name", "label") or ""),
                    "summary": str(get(src.get("api_summary"), "summary", "description", "content") or ""),
                    "url": urljoin(src["url"], str(link)),
                    "date": iso_date(get(src.get("api_date"), "date", "published", "published_at", "updated_at"))})
    return out


def registry():
    """Les sources actives, sous une forme stable quels que soient les
    libelles exacts des colonnes du registre."""
    rows = load(SOURCES, {"sources": []})["sources"]
    col = lambda r, *names: next((r[k] for k in r if fold(k) in [fold(n) for n in names] and r[k] not in (None, "")), "")
    out = []
    for r in rows:
        if fold(col(r, "Actif", "Active")) not in ("oui", "yes", "true", "1"):
            continue
        url = str(col(r, "URL / Endpoint", "URL")).strip()
        if not url:
            continue
        out.append({"name": str(col(r, "Source", "Nom")).strip() or url, "url": url,
                    "type": str(col(r, "Type")).strip() or "RSS",
                    "css": col(r, "CSS selector"), "api_items": col(r, "API items path"),
                    "api_title": col(r, "API title field"), "api_date": col(r, "API date field"),
                    "api_url": col(r, "API url field"), "api_summary": col(r, "API summary field"),
                    "reliability": col(r, "Fiabilité", "Fiabilite") or "Officielle",
                    "iso": str(col(r, "Pays / zone")).strip()})
    return out


def read_source(src, state):
    t = fold(src["type"])
    if t in ("rss", "atom", "xml"):
        return read_rss(src)
    if t in ("pageweb", "web", "html", "page"):
        return read_page(src, state)
    if t in ("api", "json"):
        return read_api(src)
    return []                   # Websearch, reseaux sociaux : abandonnes, comme dans l'ancien agent


# ---------- le modele ----------

def env():
    e = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
            if m:
                e[m.group(1)] = m.group(2).strip().strip('"')
    import os  # noqa: E402
    e.update({k: v for k, v in os.environ.items() if k.startswith("AZURE_OPENAI")})
    return e


class Model:
    def __init__(self):
        E = env()
        need = ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT")
        if not all(E.get(k) for k in need):
            raise SystemExit("configuration Azure incomplète dans .env : %s" % ", ".join(need))
        self.url = "%s/openai/deployments/%s/chat/completions?api-version=2024-10-21" % (
            E["AZURE_OPENAI_ENDPOINT"].rstrip("/"), E["AZURE_OPENAI_DEPLOYMENT"])
        self.key = E["AZURE_OPENAI_API_KEY"]
        self.tokens = [0, 0]

    def ask(self, system, user):
        for attempt in range(6):
            r = requests.post(self.url, headers={"api-key": self.key, "content-type": "application/json"},
                              json={"messages": [{"role": "system", "content": system},
                                                 {"role": "user", "content": user}],
                                    "response_format": {"type": "json_object"},
                                    "max_completion_tokens": 4000}, timeout=90)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(float(r.headers.get("retry-after") or 5 * (attempt + 1)))
                continue
            r.raise_for_status()
            j = r.json()
            u = j.get("usage") or {}
            self.tokens[0] += u.get("prompt_tokens", 0)
            self.tokens[1] += u.get("completion_tokens", 0)
            return json.loads(j["choices"][0]["message"]["content"])
        raise RuntimeError("Azure OpenAI indisponible après plusieurs essais")


JUDGE = """Tu tries les contenus d'une veille réglementaire NIS 2 (directive (UE) 2022/2555) pour des consultants.
Garde : textes de transposition nationaux (lois, décrets, arrêtés, consultations), actes d'exécution européens,
enregistrement des entités, notification d'incident, autorités compétentes, supervision, audits et sanctions,
référentiels et guides d'autorités (ANSSI, BSI, CCB, NCSC, NÚKIB, ENISA...), normes liées à NIS 2.
Garde aussi un contenu incertain mais potentiellement important.
Écarte : marketing, événements, alertes de vulnérabilité ou de menace, rapports sans obligation, sujets
uniquement RGPD, AI Act ou DSA.
C'est une veille : seule une NOUVEAUTÉ datée compte (nouveau texte, nouvelle version, nouvelle échéance, nouvelle
décision). Une page qui présente un texte ancien ou une page institutionnelle générale n'en est pas une.
Ne confonds pas la date d'un texte cité (la directive de 2022) avec celle de l'événement décrit.
Réponds en JSON : {"est_pertinent": bool, "decision": "garder"|"incertain"|"ignorer",
"score_pertinence": 1-10, "reglementation": "NIS2"|"NIS2+CRA"|"Autre", "raison": "une phrase",
"type_contenu": "texte réglementaire"|"consultation"|"guide"|"norme"|"actualité"|"rapport"|"page institutionnelle"|"API"|"autre",
"nouveaute_recente": bool, "date_contenu_estimee": "AAAA-MM-JJ" ou null}"""

# Les mots qui nomment une etape de procedure. Le prompt de deduplication dit
# deja qu'une etape franchie n'est pas un doublon ; le modele l'oubliait, et
# repondait « doublon » sur un air de famille - meme pays, meme directive. Le
# code le verifie donc lui-meme, sur les mots, ce qui ne depend pas de l'humeur
# du modele et se relit dans le journal.
STEP_WORDS = [
    "ordre du jour", "première lecture", "premiere lecture", "deuxième lecture", "deuxieme lecture",
    "commission", "séance publique", "seance publique", "voté", "vote", "adopté", "adoptee", "adoptée",
    "promulgu", "publié au journal officiel", "publie au journal officiel", "journal officiel",
    "entrée en vigueur", "entree en vigueur", "enregistrement ouvert", "ouverture de l'enregistrement",
    "décret", "decret", "arrêté", "arrete", "consultation publique", "saisine", "amendement",
    "agenda", "first reading", "second reading", "adopted", "enacted", "published in the official journal",
    "entry into force", "registration opens", "decree", "public consultation"
]


def step_words(text):
    low = fold(text or "")
    return {w for w in STEP_WORDS if fold(w) in low}


DUPLICATE = """Tu repères les doublons d'une veille NIS 2. Deux contenus sont doublons s'ils rapportent LE MÊME
ÉVÉNEMENT : la même décision, le même texte publié, la même échéance, quelle que soit la langue, la source ou l'angle.
Le même pays et le même sujet ne suffisent pas : deux articles sur la transposition d'un pays rapportent souvent deux
étapes différentes. Un contenu qui nomme une étape de procédure - dépôt, inscription à l'ordre du jour, examen en
commission, vote, adoption, promulgation, publication, entrée en vigueur, ouverture d'un enregistrement, nouvelle
échéance - n'est jamais un doublon d'un contenu qui n'annonce pas cette même étape.
Nomme l'événement partagé dans "fait_commun". Si tu ne peux pas le nommer en une phrase précise, ce n'est pas un
doublon. En cas d'hésitation, ce n'est pas un doublon : un élément en trop se rejette d'un clic dans la file, un
élément manquant ne se voit pas.
Réponds en JSON : {"est_doublon": bool, "doublon_de": "ID existant" ou null, "fait_commun": "une phrase" ou null,
"raison": "une phrase"}"""

ANALYSE = """Tu rédiges la fiche d'une nouveauté réglementaire NIS 2 pour un tableau de veille de consultants. Le contenu
a déjà été jugé pertinent. Écris en français. Dates au format AAAA-MM-JJ. Aucune liste : sépare les éléments par des
points-virgules. Le titre nomme LA nouveauté (le fait, le texte, l'échéance, le pays), jamais un nom de page ou de
site. Si le contenu comporte une section CONTENU AJOUTÉ, c'est elle qui porte la nouveauté.
Réponds en JSON : {"titre", "type_texte", "autorite", "pays_zone" (noms de pays en français séparés par ;),
"thematique", "resume", "entites_concernees", "obligations_principales", "niveau_impact": "Fort"|"Moyen"|"Faible",
"score_impact": 1-10 (9-10 obligation critique, sanction lourde ou délai court ; 6-8 obligation nouvelle ou impact
opérationnel significatif ; 3-5 ajustement ou suivi ; 1-2 simple information), "actions_recommandees",
"echeance_action", "responsable": "RSSI"|"DPO"|"DAF"|"Direction Conformité", "date_entree_vigueur"}"""


def as_int(v, default=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


# ---------- une passe ----------

def cmd_run(args):
    store = load(RECORDS, {"records": []})
    records = store["records"]
    state = load(STATE, {})
    sources = registry()
    if args.only:
        sources = [s for s in sources if args.only.lower() in s["name"].lower()]
    if not sources:
        raise SystemExit("aucune source active : lancer d'abord « import »")
    model = None if args.dry else Model()

    known = {str(r.get("URL source") or "").rstrip("/") for r in records}
    judged = state.setdefault("classified_urls", {})
    # Une URL ecartee ne se represente jamais : c'est ce qui rend les passes
    # rapides, et ce qui fige une erreur de jugement le jour ou la regle change.
    # --recheck rouvre ces dossiers-la sans toucher aux elements deja retenus.
    recheck = getattr(args, "recheck", False)
    if recheck:
        print("  (--recheck : %d URL déjà écartées seront rejugées)" % len(judged))
    # La fenetre part de la derniere passe COMPLETE (toutes les sources, sans
    # limite), memorisee dans l'etat. Partir de la derniere detection etait
    # faux : une passe de test limitee a deux ajouts datait la veille
    # d'aujourd'hui, et la passe suivante sautait trois semaines.
    last = state.get("last_full_run") or max((r.get("Date détection") or "" for r in records), default="")
    today = date.today()
    if getattr(args, "since", None):
        # Un rattrapage part de la date demandee, sans la borne des soixante
        # jours : c'est un geste explicite, pas la fenetre ordinaire.
        start = date.fromisoformat(args.since)
    elif last:
        start = date.fromisoformat(last) - timedelta(days=WINDOW_MARGIN_DAYS)
        start = max(start, today - timedelta(days=WINDOW_MAX_DAYS))
    else:
        start = today - timedelta(days=WINDOW_DEFAULT_DAYS)
    # Les identifiants montres au modele : un doublon ne peut renvoyer qu'a l'un
    # d'eux.
    recent = [{"id": r.get("ID"), "titre": str(r.get("Titre") or "")[:120], "resume": str(r.get("Résumé") or "")[:180]}
              for r in sorted(records, key=lambda r: r.get("Date détection") or "", reverse=True)
              if (r.get("Date détection") or "") >= (today - timedelta(days=DEDUP_DAYS)).isoformat()][:DEDUP_MAX]

    known_ids = {str(r["id"]) for r in recent if r.get("id")}
    recent_text = {str(r["id"]): (r.get("titre") or "") + " " + (r.get("resume") or "")
                   for r in recent if r.get("id")}
    print("registre : %d sources actives — fenêtre depuis le %s (dernière passe complète : %s)"
          % (len(sources), start, last or "aucune"))
    n = {"lus": 0, "connus": 0, "sans date": 0, "anciens": 0, "écartés IA": 0, "doublons": 0,
         "ajoutés": 0, "erreurs source": 0, "erreurs IA": 0}
    added = []
    for src in sources:
        try:
            items = read_source(src, state)
        except Exception as error:                     # noqa: BLE001
            n["erreurs source"] += 1
            print("  ✗ %-40s %s" % (src["name"][:40], str(error)[:70]))
            continue
        for it in items:
            if args.limit and n["ajoutés"] >= args.limit:
                break
            n["lus"] += 1
            url = str(it.get("url") or "").strip()
            pending = it.get("pending")
            if not url:
                continue
            key = url.rstrip("/")
            # Sous --recheck, la memoire des rejets ne filtre plus, mais elle
            # continue d'etre tenue : la vider aurait fait rejuger tout le
            # registre a la passe suivante, pour rien.
            if pending is None and (key in known or (not recheck and key in judged)):
                n["connus"] += 1
                continue

            def remember(decision, score=0):
                if pending is not None:
                    state["web_pages"][url], state["web_texts"][url] = pending
                else:
                    judged[key] = {"decision": decision, "score": score, "date": today.isoformat()}

            d = it.get("date") or ""
            if pending is None and not d:
                n["sans date"] += 1
                continue
            if d and d < start.isoformat():
                n["anciens"] += 1
                continue
            if args.dry:
                print("  · %-10s %-26s %s" % (d or "page", src["name"][:26], clean(it["title"])[:70]))
                continue
            try:
                rel = model.ask(JUDGE, "SOURCE : %s (%s)\nTITRE : %s\nCONTENU : %s\nURL : %s\nDATE : %s" % (
                    src["name"], it["source_type"], it["title"], clean(it["summary"])[:6000], url, d or "inconnue"))
                score = as_int(rel.get("score_pertinence"))
                decision = fold(rel.get("decision"))
                keep = (rel.get("est_pertinent") is True and score >= MIN_SCORE) \
                    or (decision == "garder" and score >= MIN_SCORE) or (decision == "incertain" and KEEP_UNCERTAIN)
                if not keep:
                    n["écartés IA"] += 1
                    remember(decision or "ignorer", score)
                    continue
                real = iso_date(rel.get("date_contenu_estimee"))
                too_old = real and real < (today - timedelta(days=MAX_CONTENT_AGE_DAYS)).isoformat()
                if (pending is not None and rel.get("nouveaute_recente") is False) or too_old:
                    n["anciens"] += 1
                    remember("ignore_ancien", score)
                    continue
                if recent:
                    dup = model.ask(DUPLICATE, "NOUVEL ARTICLE\nTITRE : %s\nEXTRAIT : %s\n\nDÉJÀ DANS LA VEILLE :\n%s" % (
                        it["title"], clean(it["summary"])[:600], json.dumps(recent, ensure_ascii=False)))
                    # Un doublon doit nommer l'evenement partage et l'element
                    # dont il double. Sans cela, le modele repondait « doublon »
                    # sur un simple air de famille : l'article annoncant
                    # l'inscription de la transposition francaise a l'ordre du
                    # jour de l'Assemblee a ete rejete comme doublon d'un
                    # article du mois precedent sur une reflexion d'organisation.
                    fait = str(dup.get("fait_commun") or "").strip()
                    # L'identifiant designe doit exister dans la liste qu'on
                    # vient de montrer au modele. Il a repondu « doublon de
                    # REG-202609301409??-001 » : un identifiant qui n'existe
                    # pas, et un fait commun qui etait justement le fait
                    # nouveau. Un renvoi invente ne peut pas etre un doublon.
                    cible = str(dup.get("doublon_de") or "").strip()
                    if cible and cible not in known_ids:
                        print("  ! renvoi inconnu (%s) : l'élément est gardé, pas un doublon" % cible[:30])
                        cible = ""
                    # Une etape que l'element designe ne nomme pas : le fait est
                    # nouveau, quoi qu'en dise le modele. C'est ce cas qui avait
                    # fait disparaitre l'inscription de la transposition
                    # francaise a l'ordre du jour de l'Assemblee, rangee comme
                    # doublon d'un article du mois precedent.
                    if cible:
                        neuf = step_words(it["title"] + " " + clean(it["summary"])[:600]) \
                            - step_words(recent_text.get(cible, ""))
                        if neuf:
                            print("  ! étape non rapportée par %s (%s) : gardé"
                                  % (cible, ", ".join(sorted(neuf))[:60]))
                            cible = ""
                    if dup.get("est_doublon") is True and cible and fait:
                        n["doublons"] += 1
                        remember("doublon", score)
                        # La raison est ecrite : sans elle, un rejet a tort ne se
                        # relit pas, et c'est le seul ecart que personne ne voit.
                        print("  = doublon de %s : %s\n      fait commun : %s"
                              % (cible, clean(it["title"])[:60], fait[:110]))
                        continue
                fiche = model.ask(ANALYSE, "CLASSIFICATION : %s\nTITRE : %s\nCONTENU : %s\nURL : %s\nDATE : %s" % (
                    json.dumps(rel, ensure_ascii=False), it["title"], clean(it["summary"])[:8000], url, d or "inconnue"))
            except Exception as error:                 # noqa: BLE001
                n["erreurs IA"] += 1
                print("  ! IA indisponible pour : %s (%s)" % (clean(it["title"])[:60], str(error)[:60]))
                continue

            now = datetime.now()
            published, origin = resolve_publish_date(it["source_type"], None if pending else d,
                                                     it.get("html"), rel.get("date_contenu_estimee"))
            rec = {
                "ID": "REG-%s-%03d" % (now.strftime("%Y%m%d%H%M%S"), n["ajoutés"] + 1),
                "Date détection": today.isoformat(),
                "Date publication": published,
                "Origine date": origin,
                "Type de page": "article",
                "Extrait source": source_excerpt(it.get("text") or it.get("summary")),
                "Date entrée en vigueur": iso_date(fiche.get("date_entree_vigueur")),
                "Titre": fiche.get("titre") or clean(it["title"]),
                "Type de texte": fiche.get("type_texte"),
                "Autorité émettrice": fiche.get("autorite"),
                "Pays / Zone": fiche.get("pays_zone"),
                "ISO": iso_codes(fiche.get("pays_zone")),
                "Thématique": fiche.get("thematique"),
                "Résumé": fiche.get("resume"),
                "Entités concernées": fiche.get("entites_concernees"),
                "Obligations principales": fiche.get("obligations_principales"),
                "Niveau impact": fiche.get("niveau_impact"),
                "Score impact": fiche.get("score_impact"),
                "Actions recommandées": fiche.get("actions_recommandees"),
                "Échéance action": fiche.get("echeance_action"),
                "Responsable": fiche.get("responsable"),
                "Score pertinence IA": rel.get("score_pertinence"),
                "Décision IA": rel.get("decision"),
                "Règlementation IA": rel.get("reglementation"),
                "Raison pertinence IA": rel.get("raison"),
                "Type contenu IA": rel.get("type_contenu"),
                "Source d'origine": src["name"],
                "Type de source": it["source_type"],
                "Fiabilité source": src["reliability"],
                "Statut": "À valider",
                "URL source": url,
            }
            records.append(rec)
            added.append(rec)
            known.add(key)
            remember("garder", score)
            recent.append({"id": rec["ID"], "titre": str(rec["Titre"])[:120], "resume": str(rec["Résumé"] or "")[:180]})
            n["ajoutés"] += 1
            print("  + %s  %s" % (rec["Pays / Zone"] or "?", str(rec["Titre"])[:80]))
            # Ecrit a chaque ajout : une passe interrompue garde ce qu'elle a trouve.
            save(RECORDS, store)
            save(STATE, state)
            time.sleep(0.2)

    if not args.dry:
        if not args.only and not args.limit and not getattr(args, "since", None) \
                and n["erreurs IA"] == 0:
            state["last_full_run"] = today.isoformat()
        save(RECORDS, store)
        save(STATE, state)
    print("\n" + " · ".join("%s %d" % (k, v) for k, v in n.items()))
    if model:
        print("jetons : %d en entrée, %d en sortie" % tuple(model.tokens))
    return added


def cmd_pipeline(args):
    """Une passe complete, de la collecte au site reconstruit."""
    cmd_run(args)
    if args.dry:
        return
    py = sys.executable
    # La file de veille nomme les cellules du classeur comparatif a mettre a
    # jour : si le classeur a change de structure depuis la derniere carte, ces
    # cellules designent autre chose. On le dit ici, une fois, plutot que de
    # laisser un routage faux passer inapercu.
    wb = next((p for p in (ROOT / "ressources").glob("CYBER WATCH*.xlsx")), None) \
        if (ROOT / "ressources").exists() else None
    if wb:
        check = subprocess.run([py, "tools/excel_cellmap.py", str(wb), "--check"], cwd=ROOT)
        if check.returncode:
            print("\n!! La carte des cellules ne correspond plus au classeur (voir ci-dessus).")
            print("   Relancer : python3 tools/excel_cellmap.py \"%s\"\n" % wb.name)
    steps = [[py, "tools/fetch_excerpts.py"],
             [py, "agent-veille/translate_items.py", ".env"],
             [py, "tools/veille_to_watchitems.py"],
             [py, "tools/veille_to_watchitems.py"]]    # la seconde integre les traductions faites entre-temps
    # translate_items lit la file : elle doit exister avec les nouveaux elements.
    steps.insert(1, [py, "tools/veille_to_watchitems.py"])
    for s in steps:
        print("\n$ " + " ".join(s[1:]))
        subprocess.run(s, cwd=ROOT, check=True)
    print("\n$ zsh src/build.sh")
    subprocess.run(["zsh", "build.sh"], cwd=ROOT / "src", check=True)


def main():
    ap = argparse.ArgumentParser(description="Agent de veille NIS 2 de RegWatch")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("import", help="reprendre le classeur et la mémoire de l'ancien agent")
    p.add_argument("workbook")
    p.add_argument("--state", help="state.json de l'ancien agent (pages et URL déjà vues)")
    for name in ("run", "pipeline"):
        p = sub.add_parser(name, help="une passe de veille" + (" puis tout le circuit" if name == "pipeline" else ""))
        p.add_argument("--dry", action="store_true", help="lire les sources sans appeler le modèle ni rien écrire")
        p.add_argument("--limit", type=int, default=0, help="s'arrêter après N ajouts")
        p.add_argument("--only", help="ne traiter que les sources dont le nom contient ce texte")
        p.add_argument("--since", help="AAAA-MM-JJ : élargir la fenêtre, pour rattraper une passe")
        p.add_argument("--recheck", action="store_true",
                       help="reconsidérer les URL déjà écartées, après un changement de règle")
    args = ap.parse_args()
    {"import": cmd_import, "run": cmd_run, "pipeline": cmd_pipeline}[args.cmd](args)


if __name__ == "__main__":
    main()
