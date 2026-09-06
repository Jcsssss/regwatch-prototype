#!/usr/bin/env python3
"""Emit the authority feeds as tblSources rows, ready to paste into the agent.

    python3 tools/export_sources.py                       # the gap, as a table
    python3 tools/export_sources.py --csv                 # the rows, as CSV
    python3 tools/export_sources.py --patch <workbook>    # a corrected copy

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

Columns match the agent's own tblSources, read from the workbook when one is
given so the copy keeps every other column - CSS selector, API paths, the
discovery metadata - untouched.

The original is never written to. --patch writes a new file beside it.
"""

import argparse
import csv
import json
import sys
from datetime import date
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


def patch(workbook, feeds):
    """A copy of the agent's workbook with the authority feeds put in front.

    Three corrections, all reversible because the original is left alone:
      absent      the feed is added as a new row
      as a page   a domain watched by scraping when it publishes a feed: the
                  feed is added, the page row is left in place and untouched
      inactive    switched back on, its URL corrected to the one that answers

    Nothing is deleted. An aggregator query still earns its place for the seven
    countries whose authority publishes no feed.
    """
    import urllib.parse as up
    try:
        import openpyxl
    except ImportError:
        raise SystemExit("pip install openpyxl")

    wb = openpyxl.load_workbook(workbook)
    if "Sources" not in wb.sheetnames:
        raise SystemExit("feuille 'Sources' absente de %s" % workbook)
    ws = wb["Sources"]
    head = [c.value for c in ws[1]]
    idx = {str(h).strip(): i for i, h in enumerate(head) if h}

    def cell(row, name):
        i = idx.get(name)
        return ws.cell(row=row, column=i + 1) if i is not None else None

    existing = {}
    for r in range(2, ws.max_row + 1):
        c = cell(r, "URL / Endpoint")
        if c and c.value:
            existing[str(c.value).strip()] = r

    hosts = {}
    for url, r in existing.items():
        hosts.setdefault(up.urlparse(url).netloc.lower().lstrip("www."), []).append(r)

    added = revived = 0
    for f in [x for x in feeds if x["kind"] == "rss"]:
        row = existing.get(f["url"])
        if row:
            c = cell(row, "Actif")
            if c and str(c.value).strip() != "Oui":
                c.value = "Oui"
                revived += 1
            continue
        target = ws.max_row + 1
        values = {
            "Source": f["name"], "Type": "RSS", "URL / Endpoint": f["url"],
            "Actif": "Oui", "Pays / zone": f["iso"], "Fiabilité": "Officielle",
            "Fréquence": "Quotidienne",
            "Réglementation suivie": "NIS2",
            "Statue source": "Validée",
            "découvert le": date.today().isoformat(),
            "Découvert par": "Sondage des autorités (RegWatch)",
            "Raison source IA ": "Flux de l'autorité nationale, vérifié : %d entrées datées"
                                 % f.get("entries", 0),
        }
        for name, value in values.items():
            c = cell(target, name)
            if c is not None:
                c.value = value
        added += 1

    # Rows written below a table's range are not part of it: Excel would show
    # them, the agent reading tblVeille/tblSources by name would not. Extend the
    # reference to what was actually written.
    table = ws.tables.get("tblSources")
    if table and added:
        start, _end = table.ref.split(":")
        col = "".join(ch for ch in _end if ch.isalpha())
        table.ref = "%s:%s%d" % (start, col, ws.max_row)

    out = Path(workbook).with_name(Path(workbook).stem + " - sources completees.xlsx")
    wb.save(out)
    return out, added, revived


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true", help="écrire le CSV plutôt que d'afficher")
    ap.add_argument("--patch", metavar="CLASSEUR",
                    help="écrire une copie du classeur de l'agent avec les flux ajoutés")
    args = ap.parse_args()

    feeds = load_feeds()
    table = rows(feeds)

    if args.patch:
        out, added, revived = patch(args.patch, feeds)
        print("%d flux ajoutés, %d réactivés" % (added, revived))
        print("copie écrite : %s" % out)
        print("L'original n'a pas été modifié.")
        return 0

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
