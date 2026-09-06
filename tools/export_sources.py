#!/usr/bin/env python3
"""Emit the authority feeds as tblSources rows, ready to paste into the agent.

    python3 tools/export_sources.py            # a table to read
    python3 tools/export_sources.py --csv      # data/tblSources-autorites.csv

Why this exists. The watch agent collects 53% of its items from Google News and
21% from the national authorities, while the registry holds 22 authority feeds
that were probed and found to work. The imbalance is not a scraping problem - it
is a source-list problem, and it has three consequences:

  unreadable   a Google News link resolves to a consent wall. Its article text
               can never be fetched, so those items carry no excerpt, no
               publication date read off the page, and nothing for the router to
               read beyond the agent's own summary.
  second-hand  the aggregator reports on the authority. The authority is the
               source, and it publishes first.
  unstable     the aggregator's URL is an opaque token that neither decodes nor
               redirects; the authority's URL is permanent.

This does not say "drop Google News". It says put the authorities in front of
it: an aggregator is good at telling you a subject exists in a country whose
authority publishes nothing, which is exactly the 7 countries whose feed is
page-only or down.

Columns match what the Sources tab already exports, which is the shape the
agent's tblSources uses.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEEDS_JS = ROOT / "src" / "reg" / "nis2" / "data_authorities.js"
OUT_CSV = ROOT / "data" / "tblSources-autorites.csv"

COLUMNS = ["Source", "Type", "URL / Endpoint", "Actif", "Pays / zone",
           "Fiabilité", "Priorité", "Note"]

# `kind` is measured by agent-veille/discover_feeds.py, never assumed.
TYPE_OF = {"rss": "RSS", "harvest": "Page web", "page": "Page web", "down": "Page web"}
NOTE_OF = {
    "rss": "Flux vérifié : %d entrées, %d datées",
    "harvest": "Pas de flux ; page d'actualités dont les liens sont lisibles",
    "page": "Ni flux ni page d'actualités exploitable - à surveiller manuellement",
    "down": "Injoignable lors du dernier sondage - à revérifier avant activation",
}


def load_feeds():
    text = FEEDS_JS.read_text(encoding="utf-8")
    return json.loads(text[text.index("["):text.rindex("]") + 1])


def rows(feeds):
    out = []
    for f in sorted(feeds, key=lambda x: (x["kind"] != "rss", x["iso"])):
        kind = f["kind"]
        note = NOTE_OF[kind]
        if kind == "rss":
            note = note % (f.get("entries", 0), f.get("entries", 0))
        out.append({
            "Source": f["name"],
            "Type": TYPE_OF[kind],
            "URL / Endpoint": f["url"],
            # A source that cannot be reached is listed but not switched on:
            # the row documents the attempt instead of failing every run.
            "Actif": "Oui" if kind in ("rss", "harvest") else "Non",
            "Pays / zone": f["iso"],
            # These are the national authorities themselves. Nothing here is
            # second-hand, so nothing here needs a validator's doubt.
            "Fiabilité": "Officielle",
            "Priorité": "1" if kind == "rss" else "2",
            "Note": note,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true", help="écrire le CSV plutôt que d'afficher")
    args = ap.parse_args()

    feeds = load_feeds()
    table = rows(feeds)

    if args.csv:
        OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
        with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=COLUMNS, delimiter=";")
            writer.writeheader()
            writer.writerows(table)
        print("%d lignes -> %s" % (len(table), OUT_CSV.relative_to(ROOT)))
        print("À coller dans tblSources du classeur de l'agent (séparateur ;).")
        return 0

    active = sum(1 for r in table if r["Actif"] == "Oui")
    print("%d autorités, %d à activer\n" % (len(table), active))
    print("%-4s %-34s %-9s %-6s %s" % ("Pays", "Source", "Type", "Actif", "URL"))
    for r in table:
        print("%-4s %-34s %-9s %-6s %s"
              % (r["Pays / zone"], r["Source"][:34], r["Type"], r["Actif"],
                 r["URL / Endpoint"][:44]))
    print("\n--csv pour écrire %s" % OUT_CSV.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
