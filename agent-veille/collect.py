#!/usr/bin/env python3
"""Une passe de collecte sur le registre de l'agent, depuis une date donnée.

    python3 agent-veille/collect.py                     # depuis le dernier run
    python3 agent-veille/collect.py --since 2026-08-14

Ce n'est pas l'agent du stagiaire et cela ne le remplace pas : son code vit dans
son dépôt, avec sa logique de sélecteurs CSS, ses invites et son écriture dans
tblVeille. Ce fichier lit le même registre `tblSources` et interroge les mêmes
flux, pour répondre à une question précise que son agent ne peut pas répondre
tant qu'il ne tourne pas : qu'y avait-il à prendre pendant la fenêtre non
couverte.

Aucun appel au modèle, volontairement : ce fichier ne touche pas à la clé du
cabinet et ne coûte rien. Le tri est lexical, donc grossier et vérifiable à
l'oeil - il écarte d'abord les avis de vulnérabilité, qui forment l'essentiel
des flux de CERT, puis retient ce qui parle de transposition, d'enregistrement,
de sanction ou d'autorité. Noter la pertinence est le travail de l'agent, avec
ses invites ; le refaire ici en dépenserait les jetons deux fois.

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
            out.append({
                "title": (e.get("title") or "").strip(),
                "url": e.get("link") or "",
                "date": entry_date(e),
                "summary": re.sub(r"<[^>]+>", " ", e.get("summary") or "")[:400].strip(),
            })
        return src, out, None
    except Exception as error:
        return src, [], type(error).__name__


def relevant(item):
    text = item["title"] + " " + item["summary"]
    if DROP.search(text):
        return False
    return bool(KEEP.search(text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="date ISO ; par défaut la dernière détection connue")
    ap.add_argument("--all", action="store_true", help="ne pas filtrer sur le sujet")
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

    print("\nCE QUE L'AGENT AURAIT REMONTÉ")
    for e in keep:
        print("  %-11s %-4s %-26s %s"
              % (e["date"], e["iso"][:4], e["source"][:26], e["title"][:64]))

    if args.write:
        out = ROOT / "data" / ("collect-%s.json" % date.today().isoformat())
        out.write_text(json.dumps({"since": since, "generated": date.today().isoformat(),
                                   "items": keep}, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        print("\nécrit : %s" % out.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
