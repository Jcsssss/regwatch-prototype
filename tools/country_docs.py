#!/usr/bin/env python3
"""Build the per-country links to the official-document folders on SharePoint.

    python3 tools/country_docs.py                 # links from the known naming
    python3 tools/country_docs.py --verify        # resolve exact names via Graph

Layout of a country folder under "02 - Transposition per country":

    Approved legislation (last update - <date>)   the transposition text as adopted
    Framework (last update - <date>)              the national cybersecurity framework
    Other documents relating to NIS 2             annexes, guidance, consultations
    _old (last update - <date>)                   superseded versions

Three of the four names carry a per-country "last update" date, so they cannot
be constructed from the country name alone: guessing one date and applying it to
29 countries would produce dozens of links that 404 on click.

So, until Graph can enumerate the real names:

  - the country folder link is always built and always resolves;
  - "Other documents relating to NIS 2" carries no date, so it is exact;
  - the three dated folders fall back to the country folder and are marked
    `approx`, which the interface shows. One extra click, never a dead link.

`--verify` replaces all of that with the truth: it lists each country folder's
children, matches them by prefix, and writes the exact URLs plus a document
count. Run it once Graph access exists and the approximation disappears.

Output: data/country-docs.json, src/reg/nis2/data_docs.js
"""

import argparse
import json
import os
import sys
import urllib.parse as up
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "country-docs.json"
OUT_JS = ROOT / "src" / "reg" / "nis2" / "data_docs.js"
COUNTRIES = ROOT / "data" / "countries.json"

HOST = "https://digiplace.sharepoint.com"
SITE = "/sites/WICCYB-DIGITALCOMPLIANCE"
LIBRARY = "Documents partages"
BASE = (SITE + "/" + LIBRARY +
        "/03 - Critical infrastructure protection - LPM & NIS compliance"
        "/02 - KM & Accelerators/03 - NIS 2 in Europe/02 - Transposition per country")
VIEW_ID = "e125da37-0863-453d-9d78-4087d050d3a3"

# key, label, folder-name prefix, whether the name carries a date suffix
FOLDERS = [
    ("legislation", "Approved legislation", "Approved legislation", True),
    ("framework", "Framework", "Framework", True),
    ("other", "Other documents relating to NIS 2", "Other documents relating to NIS 2", False),
    ("old", "Old", "_old", True),
]

# Folder names confirmed from real links. Anything here is exact; everything else
# is approximated until --verify runs.
KNOWN = {
    "Austria": {
        "legislation": "Approved legislation (last update - 19 August 2026)",
        "framework": "Framework (last update - 19 August 2026)",
        "other": "Other documents relating to NIS 2",
        "old": "_old (last update - 19 August 2026)",
    },
}


def view_url(server_path):
    """SharePoint's folder view, which is where a person should land."""
    return "%s%s/%s/Forms/AllItems.aspx?id=%s&viewid=%s" % (
        HOST, SITE, up.quote(LIBRARY), up.quote(server_path, safe=""), VIEW_ID)


def build(countries):
    out = {}
    for c in countries:
        name = c["name"]
        country_path = "%s/%s" % (BASE, name)
        known = KNOWN.get(name, {})
        folders = []
        for key, label, prefix, dated in FOLDERS:
            exact = known.get(key)
            if exact is None and not dated:
                exact = prefix          # no date suffix: the name is stable
            if exact:
                folders.append({"key": key, "label": label, "approx": False,
                                "url": view_url("%s/%s" % (country_path, exact))})
            else:
                # Land in the country folder rather than on a guessed date.
                folders.append({"key": key, "label": label, "approx": True,
                                "url": view_url(country_path)})
        out[c["iso"]] = {"country": name, "folderUrl": view_url(country_path),
                         "folders": folders}
    return out


def verify(records, env_path):
    """List each country folder's children and write the exact names.

    Advisory on failure: a country that cannot be read is left approximate
    rather than marked missing.
    """
    sys.path.insert(0, str(ROOT / "tools"))
    from sharepoint_fetch import (load_env_file, token_device_code,
                                  token_client_credentials, GRAPH)
    import requests

    if env_path and os.path.exists(env_path):
        load_env_file(env_path)
    if (ROOT / ".env").exists():
        load_env_file(ROOT / ".env")

    tenant = os.getenv("GRAPH_TENANT_ID", "").strip()
    client = os.getenv("GRAPH_CLIENT_ID", "").strip()
    secret = os.getenv("GRAPH_CLIENT_SECRET", "").strip()
    if not tenant:
        raise SystemExit("GRAPH_TENANT_ID manquant - voir tools/README-sync.md")
    token = (token_client_credentials(tenant, client, secret) if secret
             else token_device_code(tenant, client or "04b07795-8ddb-461a-bbee-02f9e1bf7b46"))
    headers = {"Authorization": "Bearer " + token}

    r = requests.get("%s/sites/digiplace.sharepoint.com:%s" % (GRAPH, SITE),
                     headers=headers, timeout=60)
    r.raise_for_status()
    site_id = r.json()["id"]
    rel = BASE[len(SITE) + 1 + len(LIBRARY) + 1:]   # path inside the default drive

    exact = approx = 0
    for iso, rec in sorted(records.items()):
        path = "%s/%s" % (rel, rec["country"])
        url = "%s/sites/%s/drive/root:/%s:/children" % (GRAPH, site_id, requests.utils.quote(path))
        resp = requests.get(url, headers=headers, timeout=45)
        if resp.status_code != 200:
            print("  %s %-16s dossier illisible (HTTP %d)" % (iso, rec["country"][:16], resp.status_code))
            continue
        children = {c["name"]: c for c in resp.json().get("value", []) if "folder" in c}
        for folder in rec["folders"]:
            prefix = next(p for k, _, p, _ in FOLDERS if k == folder["key"])
            hit = next((n for n in children if n.lower().startswith(prefix.lower())), None)
            if hit:
                folder["url"] = view_url("%s/%s/%s" % (BASE, rec["country"], hit))
                folder["approx"] = False
                folder["name"] = hit
                folder["items"] = children[hit]["folder"].get("childCount")
                exact += 1
            else:
                approx += 1
        print("  %s %-16s %s" % (iso, rec["country"][:16],
                                 " ".join(("%d" % (f.get("items") or 0)) if not f["approx"] else "--"
                                          for f in rec["folders"])))
    print("\n%d dossiers résolus exactement, %d restés approximatifs" % (exact, approx))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", metavar="ENV", nargs="?", const="", help="resolve names via Graph")
    args = ap.parse_args()

    countries = json.loads(COUNTRIES.read_text(encoding="utf-8"))["countries"]
    records = build(countries)

    if args.verify is not None:
        print("résolution des noms de dossiers via Graph :\n")
        verify(records, args.verify)

    OUT_JSON.write_text(json.dumps(
        {"base": BASE, "verified": args.verify is not None, "records": records},
        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_JS.write_text(
        "/* ---- Links to each country's official-document folders on SharePoint.\n"
        "   Generated by tools/country_docs.py - do not edit by hand.\n"
        "   Folder links, not copied files: a folder always resolves to what is\n"
        "   current, and access control stays in SharePoint. ---- */\n"
        "const COUNTRY_DOCS = %s;\n" % json.dumps(records, ensure_ascii=False, indent=1),
        encoding="utf-8")

    approx = sum(1 for r in records.values() for f in r["folders"] if f["approx"])
    total = sum(len(r["folders"]) for r in records.values())
    print("\n%d pays, %d liens dont %d exacts et %d approximatifs"
          % (len(records), total, total - approx, approx))
    if approx and args.verify is None:
        print("les approximatifs ouvrent le dossier du pays - lance --verify avec l'accès Graph.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
