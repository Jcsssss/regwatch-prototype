#!/usr/bin/env python3
"""An objective reliability score for a watch item, and duplicate detection.

    python3 tools/reliability.py            # score the current items, report
    python3 tools/reliability.py --write    # write scores back into the data

Why not use the agent's own score. It exists, and it sorts nothing: across 89
items it returns 8 for 37 of them and 9 for 38 more. Eighty-four percent of the
queue sits on two adjacent values, so a validator ordering by it works through
an essentially random list. It is a model's opinion of relevance, which is a
different question from "how far can this be trusted", and it cannot be audited.

Every component below is a fact about the item, computable without a model, and
reported alongside the total so a validator can see which one is missing rather
than being handed a number.

  Source          30   the domain. An authority is not an opinion.
  Own words       25   did we get the source's text, or only a paraphrase
  Date            20   how the publication date was established, if at all
  Actionability   15   does it point at cells of the comparative workbook
  Freshness       10   published recently, when we know when

  penalties       -10  a publication date later than the detection date, which
                       is impossible and means a page's "last updated" line was
                       read as a publication date
                  -15  a near-duplicate of an item already seen from the same
                       domain

What was measured and left out
  Corroboration - the same story from two independent sources - is the textbook
  objectivity test and does not work here: of twenty groups of near-identical
  titles, nineteen are the same domain repeating itself and one is a genuine
  cross-confirmation. Two percent of items. A component that fires on 2% ranks
  nothing, so it is not one; it is reported as a flag when it happens.
"""

import argparse
import difflib
import io
import json
import re
import sys
import urllib.parse as up
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "data" / "watch-items.json"
WATCH_JS = ROOT / "src" / "reg" / "nis2" / "data_watch.js"

AGGREGATORS = ("news.google.com", "news.yahoo.", "flipboard.", "msn.com")
FRESH_DAYS = 90
DUP_RATIO = 0.72
MIN_BODY = 500


def host_of(item):
    return up.urlparse((item.get("source") or {}).get("url") or "").netloc.lower().removeprefix("www.")


def _norm(text):
    return re.sub(r"[^a-z0-9 ]", " ", (text or "").lower())


def score_item(item, bodies, duplicate_of=None):
    """The score and its components, all of them facts about the item."""
    agent = item.get("agent") or {}
    src = item.get("source") or {}
    host = host_of(item)
    parts, notes = {}, []

    # --- source: what kind of publisher, decided on the domain
    if any(a in host for a in AGGREGATORS):
        parts["source"] = 0
        notes.append("aggregator")
    elif src.get("type") == "official":
        parts["source"] = 30
    elif src.get("type") == "manual":
        parts["source"] = 20
        notes.append("manual")
    else:
        parts["source"] = 12

    # --- own words: the source's text, or only the agent's paraphrase
    body = bodies.get(src.get("url") or "", "")
    excerpt = (item.get("excerpt") or "").strip()
    if len(body) >= MIN_BODY:
        parts["evidence"] = 25
    elif excerpt:
        parts["evidence"] = 15
        notes.append("openingOnly")
    else:
        parts["evidence"] = 0
        notes.append("noSourceText")

    # --- date: how it was established, not merely whether one is present
    origin = (agent.get("dateOrigin") or "").strip()
    published = (agent.get("publishedOn") or "").strip()
    parts["date"] = {"flux": 20, "page": 15, "ia": 5}.get(origin, 0)
    if not published:
        notes.append("noDate")

    # --- actionability: does it point somewhere in the comparative workbook
    parts["actionability"] = 15 if item.get("targetCells") else 0

    # --- freshness, only when the date is known
    parts["freshness"] = 0
    if published:
        try:
            age = (date.today() - date.fromisoformat(published)).days
            parts["freshness"] = 10 if age <= FRESH_DAYS else 0
            if age > FRESH_DAYS:
                notes.append("old")
        except ValueError:
            pass

    penalties = {}
    if published and published > item.get("detected", ""):
        penalties["impossibleDate"] = -10
        notes.append("impossibleDate")
    if duplicate_of:
        penalties["duplicate"] = -15
        notes.append("duplicate")

    total = max(0, min(100, sum(parts.values()) + sum(penalties.values())))
    return {
        "score": total,
        "parts": parts,
        "penalties": penalties,
        "notes": notes,
        "duplicateOf": duplicate_of,
    }


def find_duplicates(items):
    """Near-identical titles from the same domain: the second one adds nothing.

    Across domains the same story is a confirmation and is left alone - that is
    a different fact, and a rare one.
    """
    dupes, seen = {}, []
    for item in items:
        norm, host = _norm(item.get("title"))[:110], host_of(item)
        for other, ohost, oid in seen:
            if ohost == host and difflib.SequenceMatcher(None, norm, other).ratio() > DUP_RATIO:
                dupes[item["id"]] = oid
                break
        else:
            seen.append((norm, host, item["id"]))
    return dupes


def load_bodies():
    path = ROOT / "data" / "excerpt-cache.json"
    if not path.exists():
        return {}
    cache = json.loads(path.read_text(encoding="utf-8"))
    return {u: v.get("body") or "" for u, v in cache.items() if v.get("ok")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="écrire les scores dans les données")
    args = ap.parse_args()

    payload = json.loads(ITEMS.read_text(encoding="utf-8"))
    items = payload["items"]
    bodies = load_bodies()
    dupes = find_duplicates(items)

    for item in items:
        item["reliability"] = score_item(item, bodies, dupes.get(item["id"]))

    scores = sorted(i["reliability"]["score"] for i in items)
    buckets = {}
    for s in scores:
        buckets[s // 10 * 10] = buckets.get(s // 10 * 10, 0) + 1
    print("%d éléments notés" % len(items))
    print("  médiane %d, min %d, max %d" % (scores[len(scores) // 2], scores[0], scores[-1]))
    print("\n  répartition :")
    for low in sorted(buckets):
        print("    %3d-%3d  %s %d" % (low, low + 9, "#" * buckets[low], buckets[low]))
    print("\n  doublons détectés : %d" % len(dupes))
    print("  comparaison : le score de l'agent occupe %d valeurs distinctes, celui-ci %d"
          % (len({(i.get("agent") or {}).get("score") for i in items}), len(set(scores))))

    print("\n  les mieux notés :")
    for i in sorted(items, key=lambda x: -x["reliability"]["score"])[:4]:
        print("    %3d  %-4s %s" % (i["reliability"]["score"], i["iso"], i["title"][:56]))
    print("\n  les moins bien notés :")
    for i in sorted(items, key=lambda x: x["reliability"]["score"])[:4]:
        r = i["reliability"]
        print("    %3d  %-4s %s" % (r["score"], i["iso"], i["title"][:56]))
        print("         %s" % (", ".join(r["notes"]) if r["notes"] else "-"))

    if args.write:
        ITEMS.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        raw = WATCH_JS.read_text(encoding="utf-8")
        head = raw[:raw.index("[")]
        WATCH_JS.write_text(head + json.dumps(items, ensure_ascii=False, indent=2) + ";\n",
                            encoding="utf-8")
        print("\nécrit dans %s et %s" % (ITEMS.relative_to(ROOT), WATCH_JS.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
