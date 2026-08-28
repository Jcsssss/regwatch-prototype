#!/usr/bin/env python3
"""Build the per-country links to the official-document folders on SharePoint.

    python3 tools/country_docs.py                      # convention-based links
    python3 tools/country_docs.py --verify <.env>      # check them against Graph

Each country folder on SharePoint follows the same four-way layout:

    Approved legislation                  the transposition text as adopted
    Framework                             the national cybersecurity framework
    Other documents relating to NIS 2     annexes, guidance, consultations
    Old                                   superseded versions, kept for history

Linking to the folder rather than mirroring the PDFs is the right call and was
the user's instinct too: a folder link always resolves to the current contents,
survives a file being replaced, and keeps access control where it belongs - in
SharePoint. A copied PDF starts going stale the moment it is copied, and would
put regulatory documents in a GitHub repository, which is a decision nobody
asked for.

Until Graph access exists the links are built by convention, which is why
--verify exists: it tells you which folders actually resolve, rather than
leaving 116 links to be discovered broken one click at a time.

Output: data/country-docs.json, src/data_docs.js
"""

import argparse
import json
import os
import sys
import urllib.parse as up
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "country-docs.json"
OUT_JS = ROOT / "src" / "data_docs.js"
COUNTRIES = ROOT / "data" / "countries.json"

# The four folders, in the order a reader wants them: what is in force first,
# history last.
FOLDERS = [
    ("legislation", "Approved legislation"),
    ("framework", "Framework"),
    ("other", "Other documents relating to NIS 2"),
    ("old", "Old"),
]

# Where the country folders live, relative to the site. Overridable, because
# this is a convention until someone confirms it against the real library.
DEFAULT_BASE = ("Documents partages/03 - Critical infrastructure protection - LPM & NIS compliance/"
                "02 - KM & Accelerators/03 - NIS 2 in Europe/01 - Cyber watch EU")
DEFAULT_SITE = "https://digiplace.sharepoint.com/sites/WICCYB-DIGITALCOMPLIANCE"


def folder_url(site, base, country, folder):
    """SharePoint's own folder-view URL, which is what a person should land on."""
    path = "%s/%s/%s" % (base, country, folder)
    return "%s/Forms/AllItems.aspx?id=%s" % (
        site.rstrip("/") + "/" + base.split("/")[0],
        up.quote("/sites/%s/%s" % (site.rstrip("/").split("/sites/")[-1], path), safe=""))


def build(site, base, countries):
    out = {}
    for c in countries:
        out[c["iso"]] = {
            "country": c["name"],
            "folders": [{"key": key, "label": label,
                         "url": folder_url(site, base, c["name"], label)}
                        for key, label in FOLDERS],
        }
    return out


def verify(records, env_path):
    """Ask Graph which of these folders exist. Advisory: a failure here means
    'could not check', never 'the folder is missing'."""
    sys.path.insert(0, str(ROOT / "tools"))
    from sharepoint_fetch import (load_env_file, token_device_code,
                                  token_client_credentials, GRAPH)
    import requests

    if env_path and os.path.exists(env_path):
        load_env_file(env_path)
    for cand in (ROOT / ".env",):
        if cand.exists():
            load_env_file(cand)

    tenant = os.getenv("GRAPH_TENANT_ID", "").strip()
    client = os.getenv("GRAPH_CLIENT_ID", "").strip()
    secret = os.getenv("GRAPH_CLIENT_SECRET", "").strip()
    if not tenant:
        raise SystemExit("GRAPH_TENANT_ID manquant - voir tools/README-sync.md")
    token = (token_client_credentials(tenant, client, secret) if secret
             else token_device_code(tenant, client or "04b07795-8ddb-461a-bbee-02f9e1bf7b46"))

    headers = {"Authorization": "Bearer " + token}
    site_ref = "digiplace.sharepoint.com:/sites/WICCYB-DIGITALCOMPLIANCE"
    r = requests.get("%s/sites/%s" % (GRAPH, site_ref), headers=headers, timeout=60)
    r.raise_for_status()
    site_id = r.json()["id"]

    ok = missing = 0
    for iso, rec in records.items():
        for folder in rec["folders"]:
            path = "%s/%s/%s" % (DEFAULT_BASE, rec["country"], folder["label"])
            url = "%s/sites/%s/drive/root:/%s" % (GRAPH, site_id, requests.utils.quote(path))
            resp = requests.get(url, headers=headers, timeout=30)
            folder["exists"] = resp.status_code == 200
            if folder["exists"]:
                ok += 1
                folder["items"] = resp.json().get("folder", {}).get("childCount")
            else:
                missing += 1
        print("  %s %-16s %s" % (iso, rec["country"][:16],
                                 "".join("OK " if f.get("exists") else "-- " for f in rec["folders"])))
    print("\n%d dossiers résolus, %d introuvables" % (ok, missing))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=DEFAULT_SITE)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--verify", metavar="ENV", nargs="?", const="", help="check folders via Graph")
    args = ap.parse_args()

    countries = json.loads(COUNTRIES.read_text(encoding="utf-8"))["countries"]
    records = build(args.site, args.base, countries)

    if args.verify is not None:
        print("vérification des dossiers via Graph :\n")
        verify(records, args.verify)

    payload = {"site": args.site, "base": args.base,
               "verified": args.verify is not None, "records": records}
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_JS.write_text(
        "/* ---- Links to each country's official-document folders on SharePoint.\n"
        "   Generated by tools/country_docs.py - do not edit by hand.\n"
        "   Folder links, not copied files: a folder always resolves to what is\n"
        "   current, and access control stays in SharePoint. ---- */\n"
        "const COUNTRY_DOCS = %s;\n" % json.dumps(records, ensure_ascii=False, indent=1),
        encoding="utf-8")

    print("\n%d pays x %d dossiers -> %s" % (len(records), len(FOLDERS), OUT_JS.relative_to(ROOT)))
    if args.verify is None:
        print("liens construits par convention - lance --verify quand tu auras l'accès Graph.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
