#!/usr/bin/env python3
"""Les chiffres d'activite derriere l'estimation d'impact carbone de l'outil.

    python3 tools/carbon_to_js.py

Sorties :
    data/carbon.json        l'historique des compteurs (versionne)
    src/data_carbon.js      `const CARBON_DATA = {...}`, pour le site

Le bouton « Impact carbone » de l'outil convertit ces compteurs en energie et en
CO2e ; ce script ne fait que compter. Il ne publie aucun contenu : seulement des
totaux de jetons, des nombres de jours et d'elements.

Ce qui est compte, et d'ou cela vient :
  - le developpement assiste par IA : les journaux de session de l'assistant de
    developpement conserves sur le poste (un fichier JSONL par session, dont
    chaque reponse porte ses jetons). Variable REGWATCH_DEV_LOGS pour un autre
    dossier.
  - l'agent de veille : les jetons qu'il enregistre depuis le 7 octobre 2026
    (data/veille/usage.json), et avant cela le nombre d'URL jugees et
    d'elements rediges, a defaut de mieux.
  - les traductions : le nombre de textes du dictionnaire.
  - la video : le nombre de rendus produits sur le poste.

Les compteurs ne reculent jamais : un journal efface ou un autre poste ne fait
pas baisser l'historique, on garde le maximum de ce qui a deja ete vu.
"""

import glob
import json
import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / "data" / "carbon.json"
OUT = ROOT / "src" / "data_carbon.js"
LOGS = Path(os.environ.get("REGWATCH_DEV_LOGS")
            or Path.home() / ".claude" / "projects" / str(ROOT).replace("/", "-"))


def load(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def dev_counts():
    tot = {"out": 0, "fresh": 0, "cached": 0}
    seen, days = set(), set()
    for f in glob.glob(str(LOGS / "*.jsonl")):
        with open(f, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                m = d.get("message")
                u = m.get("usage") if isinstance(m, dict) else None
                if not u:
                    continue
                # une reponse diffusee en plusieurs morceaux porte le meme id
                key = m.get("id") or d.get("uuid")
                if key in seen:
                    continue
                seen.add(key)
                tot["out"] += u.get("output_tokens") or 0
                tot["fresh"] += (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
                tot["cached"] += u.get("cache_read_input_tokens") or 0
                if d.get("timestamp"):
                    days.add(d["timestamp"][:10])
    if not seen:
        return None
    tot["days"] = len(days)
    tot["from"], tot["to"] = min(days), max(days)
    return tot


def agent_counts():
    state = load(ROOT / "data" / "veille" / "state.json", {})
    recs = load(ROOT / "data" / "veille" / "records.json", {}).get("records", [])
    usage = load(ROOT / "data" / "veille" / "usage.json", [])
    return {
        "judged": len(state.get("classified_urls", {})) + len(recs),
        "written": len(recs),
        "measuredIn": sum(u.get("in", 0) for u in usage),
        "measuredOut": sum(u.get("out", 0) for u in usage),
        "passes": len(usage),
    }


def main():
    hist = load(HIST, {})
    cur = {
        "dev": dev_counts(),
        "agent": agent_counts(),
        "i18n": {"texts": len(load(ROOT / "data" / "content-i18n.json", {}))},
        "video": {"renders": len(glob.glob(str(ROOT / "ressources" / "video" / "*" / "renders" / "*.mp4")))},
    }
    out = {}
    for k, v in cur.items():
        old = hist.get(k) or {}
        if v is None:                       # pas de journaux sur ce poste
            out[k] = old
            continue
        merged = dict(old)
        for f, x in v.items():
            if isinstance(x, (int, float)):
                merged[f] = max(x, old.get(f, 0))
            elif f == "from":
                merged[f] = min(x, old.get(f, x))
            else:
                merged[f] = max(x, old.get(f, x))
        out[k] = merged
    out["built"] = date.today().isoformat()
    HIST.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    OUT.write_text("/* Genere par tools/carbon_to_js.py - ne pas modifier a la main. */\n"
                   "const CARBON_DATA = " + json.dumps(out, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("impact carbone : %s" % json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
