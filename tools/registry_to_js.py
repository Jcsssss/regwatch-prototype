#!/usr/bin/env python3
"""Le registre de l'agent de veille, rendu visible dans l'onglet Sources.

    python3 tools/registry_to_js.py

Sorties :
    data/watch-registry.json        le contrat d'echange, comme watch-items.json
    src/reg/nis2/data_registry.js   `const WATCH_REGISTRY = {...}`, pour le site

Pourquoi ce fichier existe. L'outil montrait les sources officielles ecrites a
la main, les flux d'autorites sondes et les sources proposees - mais pas ce que
l'agent lit reellement. Un consultant ne pouvait donc pas repondre a la question
qu'on lui pose le plus souvent devant la file de veille : « d'ou vient cette
information, et qu'est-ce que l'outil surveille ? ». Une source ajoutee au
registre restait invisible jusqu'a ce qu'elle rapporte quelque chose.

Le compte et la derniere detection de chaque source viennent des enregistrements
eux-memes : c'est ce qui rend une source muette reconnaissable. Une source
renommee garde ses detections grace a la colonne « Anciens noms » du registre -
sans elle, corriger une requete ferait passer la source corrigee pour morte.
"""

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "data" / "veille" / "sources.json"
RECORDS = ROOT / "data" / "veille" / "records.json"
OUT_JSON = ROOT / "data" / "watch-registry.json"
OUT_JS = ROOT / "src" / "reg" / "nis2" / "data_registry.js"

# La zone du registre est un texte libre (« France », « France / UE », « UE »).
# La fiche pays veut un code : on ne traduit que ce qui est sans ambiguite, et
# le reste reste affiche tel quel.
ZONE_ISO = {
    "france": "FR", "allemagne": "DE", "belgique": "BE", "italie": "IT", "espagne": "ES",
    "pays-bas": "NL", "luxembourg": "LU", "pologne": "PL", "portugal": "PT", "suede": "SE",
    "suède": "SE", "république tchèque": "CZ", "republique tcheque": "CZ", "tchequie": "CZ", "tchéquie": "CZ", "irlande": "IE", "autriche": "AT",
    "danemark": "DK", "finlande": "FI", "grece": "GR", "grèce": "GR", "hongrie": "HU",
    "roumanie": "RO", "slovaquie": "SK", "slovenie": "SI", "slovénie": "SI", "bulgarie": "BG",
    "croatie": "HR", "chypre": "CY", "estonie": "EE", "lettonie": "LV", "lituanie": "LT",
    "malte": "MT",
}

KIND = {"RSS": "rss", "Page web": "page", "API": "api", "API JSON": "api"}


def iso_of(zone):
    z = (zone or "").strip().lower()
    for name, iso in ZONE_ISO.items():
        if z.startswith(name):
            return iso
    return "EU" if z.startswith(("ue", "union", "europe")) else ""


def main():
    reg = json.loads(REGISTRY.read_text(encoding="utf-8"))["sources"]
    records = json.loads(RECORDS.read_text(encoding="utf-8"))["records"]

    seen = {}
    for r in records:
        name = str(r.get("Source d'origine") or "").strip()
        if not name:
            continue
        d = str(r.get("Date détection") or "")
        cur = seen.setdefault(name, {"n": 0, "last": ""})
        cur["n"] += 1
        cur["last"] = max(cur["last"], d)

    rows = []
    for s in reg:
        names = [s["Source"]] + [a.strip() for a in str(s.get("Anciens noms") or "").split(";") if a.strip()]
        n = sum(seen.get(x, {}).get("n", 0) for x in names)
        last = max([seen.get(x, {}).get("last", "") for x in names] or [""])
        rows.append({
            "name": s["Source"],
            "url": s.get("URL / Endpoint", ""),
            "kind": KIND.get(s.get("Type", ""), "page"),
            "zone": s.get("Pays / zone", ""),
            "iso": iso_of(s.get("Pays / zone", "")),
            "active": (s.get("Actif") or "").strip().lower().startswith(("oui", "yes")),
            "trust": s.get("Fiabilité", ""),
            "items": n,
            "last": last,
        })

    # Les sources actives d'abord, les plus productives en tete : c'est l'ordre
    # dans lequel on lit un registre quand on cherche d'ou vient une information.
    rows.sort(key=lambda r: (not r["active"], -r["items"], r["name"].lower()))
    out = {"generated": date.today().isoformat(),
           "active": sum(1 for r in rows if r["active"]),
           "sources": rows}

    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_JS.write_text(
        "/* ---- Le registre de l'agent de veille, pour l'onglet Sources.\n"
        "   Genere par tools/registry_to_js.py - ne pas editer a la main. ---- */\n"
        "const WATCH_REGISTRY = " + json.dumps(out, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    quiet = [r for r in rows if r["active"] and not r["items"]]
    print("%d sources (%d actives) -> %s" % (len(rows), out["active"], OUT_JS.name))
    print("  %d source(s) active(s) n'ont jamais rien rapporté" % len(quiet))
    for r in quiet[:8]:
        print("     %s" % r["name"][:70])


if __name__ == "__main__":
    main()
