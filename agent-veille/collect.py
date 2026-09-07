#!/usr/bin/env python3
"""Une passe de collecte sur le registre de l'agent, depuis une date donnée.

    python3 agent-veille/collect.py                     # depuis le dernier run
    python3 agent-veille/collect.py --since 2026-08-14
    python3 agent-veille/collect.py --score             # note la pertinence (Azure)

Ce n'est pas l'agent du stagiaire et cela ne le remplace pas : son code vit dans
son dépôt, avec sa logique de sélecteurs CSS, ses invites et son écriture dans
tblVeille. Ce fichier lit le même registre `tblSources` et interroge les mêmes
flux, pour répondre à une question précise que son agent ne peut pas répondre
tant qu'il ne tourne pas : qu'y avait-il à prendre pendant la fenêtre non
couverte.

La collecte ne coûte rien et ne touche pas à la clé : le tri est lexical, donc
grossier et vérifiable à l'oeil - il écarte d'abord les avis de vulnérabilité,
qui forment l'essentiel des flux de CERT, puis retient ce qui parle de
transposition, d'enregistrement, de sanction ou d'autorité.

`--score` appelle le modèle du cabinet, et seulement sur ce que le filtre a déjà
retenu : le lexical fait le gros du tri pour rien, le modèle ne juge que la
courte liste. Le coût réel en jetons est affiché à la fin de chaque exécution,
parce qu'une dépense qu'on ne voit pas est une dépense qu'on ne contrôle pas.

Rien n'est écrit dans le classeur de l'agent, jamais. Sortie : un rapport, et
data/collect-<date>.json si --write.
"""

import argparse
import json
import os
import re
import sys
import urllib.parse as up
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

try:
    import feedparser
    import requests
except ImportError:
    raise SystemExit("pip install feedparser requests")

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "ressources" / "agent_veille_NIS2.xlsx"
ITEMS = ROOT / "data" / "watch-items.json"

UA = {"User-Agent": "Mozilla/5.0 (compatible; RegWatch collection; +internal)"}
TIMEOUT = 15
WORKERS = 8

# Le premier filtre est lexical et volontairement large : il sert à écarter les
# avis de vulnérabilité, qui forment l'essentiel des flux de CERT et n'ont rien
# à voir avec la transposition. Ce qui passe est ensuite jugé, pas avant.
KEEP = re.compile(
    r"nis\s?-?2|nis2|sri\s?2|directive|transpo|loi|zákon|ustaw|gesetz|wet\b|lag\b|laki"
    r"|seadus|likum|įstatym|zakon|törvény|lege|νόμ|закон|dlí"
    r"|registr|enregistr|rejestr|reģistr|registreer|nyilvántart"
    r"|sanction|sankc|bußgeld|pokut|bírság|amend|kazna|глоб"
    r"|autorit|behörde|úřad|urząd|iestād|asutus|hatóság|arch|орган"
    r"|obligation|verplicht|povinnost|kötelez|vaatimu|nõue|prasīb"
    r"|entités essentielles|essential entit|wesentliche|podmiot kluczow"
    r"|cer\b|résilience|resilien|kritisch|kritick|kritis", re.I)

# Ce qui ressemble à un avis technique : présent dans tous les flux de CERT,
# absent du sujet. Écarté avant le filtre ci-dessus, qui matcherait sinon sur
# « vulnérabilité critique ».
DROP = re.compile(
    r"cve-\d{4}|vulnerab|kwetsbaarhe|haavoittuv|sårbarhet|zranitel|luka w"
    r"|patch|update your|voer updates|advisory|advies|hotfix|zero-day|0-day"
    r"|phishing|õngitsus|ransomware|lunavara|malware|ddos", re.I)


def sources(workbook):
    """Les sources actives du registre de l'agent, telles qu'il les lit."""
    try:
        import openpyxl
    except ImportError:
        raise SystemExit("pip install openpyxl")
    wb = openpyxl.load_workbook(workbook, data_only=True)
    ws = wb["Sources"]
    head = [c.value for c in ws[1]]
    col = {str(h).strip(): i for i, h in enumerate(head) if h}

    def cell(row, name):
        i = col.get(name)
        return row[i] if i is not None and i < len(row) else None

    out = []
    for r in range(2, ws.max_row + 1):
        row = [c.value for c in ws[r]]
        if not any(row):
            continue
        if str(cell(row, "Actif")).strip().lower() != "oui":
            continue
        url = cell(row, "URL / Endpoint")
        if not url:
            continue
        out.append({
            "name": str(cell(row, "Source") or "").strip(),
            "url": str(url).strip(),
            "type": str(cell(row, "Type") or "").strip(),
            "iso": str(cell(row, "Pays / zone") or "").strip(),
        })
    return out


def entry_date(entry):
    """La date d'une entrée, ou None. Jamais aujourd'hui par défaut : une date
    inventée vaut moins que pas de date, et fausserait la fenêtre."""
    for key in ("published_parsed", "updated_parsed"):
        t = entry.get(key)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc).date().isoformat()
            except (TypeError, ValueError):
                pass
    return None


def pull(src):
    """Les entrées d'un flux. Un échec est une donnée, pas une exception."""
    try:
        r = requests.get(src["url"], timeout=TIMEOUT, headers=UA)
        if r.status_code != 200:
            return src, [], "HTTP %d" % r.status_code
        d = feedparser.parse(r.content)
        if not d.entries:
            return src, [], "aucune entrée"
        out = []
        for e in d.entries:
            # Un agrégateur masque l'article derrière un jeton opaque, mais il
            # nomme l'éditeur. C'est la seule prise sur la source réelle, et
            # elle est gratuite : elle est déjà dans le flux.
            origin = getattr(e, "source", None) or {}
            out.append({
                "title": (e.get("title") or "").strip(),
                "url": e.get("link") or "",
                "publisher": up.urlparse(origin.get("href") or "").netloc.lower()
                             .removeprefix("www.") or None,
                "date": entry_date(e),
                "summary": re.sub(r"<[^>]+>", " ", e.get("summary") or "")[:400].strip(),
            })
        return src, out, None
    except Exception as error:
        return src, [], type(error).__name__


AGGREGATORS = ("news.google.com", "news.yahoo.", "flipboard.", "msn.com")
MAX_BODY = 6000          # ce que le modèle lit : l'article, borné
MIN_BODY = 500           # en dessous, c'est une amorce, pas un article


def body_of(item):
    """Le texte de l'article, quand il est atteignable.

    Noter sur un titre revient à noter une couverture de livre. Le corps change
    le jugement, et l'absence de corps doit se voir dans le résultat plutôt que
    se confondre avec un article sans intérêt.

    Un lien d'agrégateur n'est pas tenté : il mène au mur de consentement, ce
    qui a été mesuré. On enregistre l'éditeur à la place, pour que le registre
    puisse un jour le prendre en direct.
    """
    url = item.get("url") or ""
    host = up.urlparse(url).netloc.lower()
    if any(a in host for a in AGGREGATORS):
        return None, "agrégateur : article inatteignable"
    try:
        from bs4 import BeautifulSoup
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
        if r.status_code != 200:
            return None, "HTTP %d" % r.status_code
        r.encoding = r.apparent_encoding or r.encoding
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form"]):
            tag.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
        if len(text) < MIN_BODY:
            return None, "page trop courte (%d car.)" % len(text)
        return text[:MAX_BODY], None
    except Exception as error:
        return None, type(error).__name__


def fetch_bodies(items):
    """Le corps de chaque élément, en parallèle. Les échecs sont comptés."""
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for item, (body, why) in zip(items, pool.map(body_of, items)):
            item["body"] = body
            item["bodyFail"] = why
    got = sum(1 for i in items if i.get("body"))
    reasons = {}
    for i in items:
        if not i.get("body"):
            reasons[i["bodyFail"]] = reasons.get(i["bodyFail"], 0) + 1
    print("article récupéré pour %d / %d éléments" % (got, len(items)))
    for why, n in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print("   %-42s %d" % (why[:42], n))
    return got


SCORE_BATCH = 8
JUDGE = (
    "Tu tries une veille réglementaire européenne pour un cabinet de conseil qui "
    "tient un classeur comparatif de la transposition de NIS 2 et de REC dans "
    "29 pays. Pour chaque élément, dis s'il apporte un fait exploitable pour ce "
    "classeur.\n"
    "Note de 0 à 10 : 9-10 un texte national, une décision d'autorité, une "
    "échéance ou une sanction ; 6-8 une obligation, un chiffre d'application, "
    "une position d'autorité ; 3-5 du commentaire de marché ou de cabinet ; "
    "0-2 hors sujet, publicité, avis technique.\n"
    "Indique la feuille visée parmi : Registration, Incident reporting, "
    "Sanctions, Audit & Controls, Cybersecurity frameworks, Authority, ID - ou "
    "\"aucune\".\n"
    "Le champ texteComplet dit si tu lis l'article entier ou seulement une "
    "amorce de flux. S'il est faux, juge sur ce que tu as sans pénaliser "
    "l'élément pour ce qui te manque, et dis-le dans why.\n"
    "Réponds par un tableau JSON, un objet par élément, dans le même ordre, "
    "avec les clés score (entier), sheet (chaîne), why (une phrase en français, "
    "factuelle, sans formule d'introduction). Rien d'autre que le JSON."
)


def load_env():
    """Les identifiants Azure du cabinet, lus dans le .env du dépôt."""
    for candidate in (ROOT / ".env", ROOT / "agent-veille" / ".env"):
        if candidate.exists():
            for line in candidate.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            return
    raise SystemExit("aucun .env trouvé")


def score(items):
    """Fait juger la courte liste par le modèle, et rend le coût visible."""
    load_env()
    key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    if not (key and endpoint and deployment):
        raise SystemExit("AZURE_OPENAI_API_KEY / ENDPOINT / DEPLOYMENT manquants")
    print("modèle : %s" % deployment)

    from openai import AzureOpenAI
    client = AzureOpenAI(api_key=key, azure_endpoint=endpoint,
                         api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
                         timeout=90, max_retries=3)

    used_in = used_out = 0
    for start in range(0, len(items), SCORE_BATCH):
        chunk = items[start:start + SCORE_BATCH]
        payload = json.dumps([{
            "titre": c["title"], "pays": c["iso"], "source": c["source"],
            "editeur": c.get("publisher") or "",
            # L'article quand on l'a, le teaser sinon - et le modèle est prévenu
            # de ce qu'il lit, pour qu'une note basse faute de texte ne se
            # confonde pas avec une note basse sur le fond.
            "texte": c.get("body") or c["summary"][:280],
            "texteComplet": bool(c.get("body")),
        } for c in chunk], ensure_ascii=False)
        try:
            r = client.chat.completions.create(
                model=deployment,
                messages=[{"role": "system", "content": JUDGE},
                          {"role": "user", "content": payload}])
            raw = re.sub(r"^```(?:json)?|```$", "", (r.choices[0].message.content or ""),
                         flags=re.M).strip()
            out = json.loads(raw)
            if not isinstance(out, list) or len(out) != len(chunk):
                raise ValueError("réponse de longueur inattendue")
            for item, verdict in zip(chunk, out):
                item["score"] = int(verdict.get("score", 0))
                item["sheet"] = str(verdict.get("sheet", "aucune"))
                item["why"] = str(verdict.get("why", "")).strip()
            if r.usage:
                used_in += r.usage.prompt_tokens
                used_out += r.usage.completion_tokens
        except Exception as error:
            # Un lot qui échoue laisse ses éléments non notés plutôt que notés
            # à zéro : l'absence de jugement n'est pas un jugement négatif.
            print("  lot %d-%d : %s" % (start + 1, start + len(chunk), type(error).__name__))
    return used_in, used_out


def relevant(item):
    text = item["title"] + " " + item["summary"]
    if DROP.search(text):
        return False
    return bool(KEEP.search(text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="date ISO ; par défaut la dernière détection connue")
    ap.add_argument("--all", action="store_true", help="ne pas filtrer sur le sujet")
    ap.add_argument("--score", action="store_true",
                    help="faire noter la pertinence par le modèle du cabinet (coût réel affiché)")
    ap.add_argument("--write", action="store_true", help="écrire le résultat en JSON")
    ap.add_argument("--workbook", default=str(WORKBOOK))
    args = ap.parse_args()

    since = args.since
    if not since and ITEMS.exists():
        items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
        since = max(i.get("detected", "") for i in items)
    since = since or "1970-01-01"

    srcs = sources(args.workbook)
    feeds = [s for s in srcs if s["type"].upper() == "RSS"]
    print("registre : %d sources actives, dont %d flux" % (len(srcs), len(feeds)))
    print("fenêtre  : à partir du %s\n" % since)

    got, failed, undated = [], [], 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for src, entries, err in pool.map(pull, feeds):
            if err:
                failed.append((src, err))
                continue
            fresh = []
            for e in entries:
                if not e["date"]:
                    undated += 1
                    continue
                if e["date"] >= since:
                    e["source"] = src["name"]
                    e["iso"] = src["iso"]
                    fresh.append(e)
            got.extend(fresh)

    keep = got if args.all else [e for e in got if relevant(e)]
    keep.sort(key=lambda e: (e["date"], e["source"]), reverse=True)

    print("%d entrées datées depuis le %s, sur %d flux joignables"
          % (len(got), since, len(feeds) - len(failed)))
    print("%d retenues par le filtre lexical, %d écartées (avis techniques, hors sujet)"
          % (len(keep), len(got) - len(keep)))
    if undated:
        print("%d entrées sans date : non comptées, la fenêtre serait fausse" % undated)
    if failed:
        print("\nflux en échec :")
        for src, err in failed:
            print("  %-38s %s" % (src["name"][:38], err))

    if args.score and keep:
        print("\nRÉCUPÉRATION DES ARTICLES")
        fetch_bodies(keep)
        print()
        used_in, used_out = score(keep)
        keep.sort(key=lambda e: (-(e.get("score") or -1), e["date"]), reverse=False)

    print("\nCE QUE L'AGENT AURAIT REMONTÉ")
    for e in keep:
        if args.score:
            print("  %2s/10  %-11s %-4s %-22s %s"
                  % (e.get("score", "?"), e["date"], e["iso"][:4],
                     (e.get("sheet") or "")[:22], e["title"][:52]))
            if e.get("why"):
                print("         %s" % e["why"][:96])
        else:
            print("  %-11s %-4s %-26s %s"
                  % (e["date"], e["iso"][:4], e["source"][:26], e["title"][:64]))

    if args.score and keep:
        print("\ncoût : %d jetons en entrée, %d en sortie (%s)"
              % (used_in, used_out, os.getenv("AZURE_OPENAI_DEPLOYMENT")))

    if args.write:
        out = ROOT / "data" / ("collect-%s.json" % date.today().isoformat())
        out.write_text(json.dumps({"since": since, "generated": date.today().isoformat(),
                                   "items": keep}, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        print("\nécrit : %s" % out.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
