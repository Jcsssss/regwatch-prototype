#!/usr/bin/env python3
"""Recompute the publication date of every existing watch item.

    python3 agent-veille/refresh_dates.py            # refresh what is missing
    python3 agent-veille/refresh_dates.py --all      # refetch everything

The date fixes only ever applied to NEW detections: rows written before the
patch keep whatever the agent had asserted at the time, which for a web page was
the date of the run or the model's guess. That is why an article stamped
"Mis à jour le : 24/10/2024" still showed as published in June 2026.

This pass refetches each item's URL and re-resolves the date with the current
rules - feed date, then a date read from the page markup or its body text in any
of the 24 EU languages, and nothing invented. An item whose date cannot be
established loses it rather than keeping a false one.

Output: data/date-cache.json, keyed by URL. veille_to_watchitems.py reads it
offline, so the conversion stays runnable with no network.
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import requests
    from regwatch_fields import resolve_publish_date, classify_page
except ImportError as error:
    raise SystemExit("dépendance manquante : %s" % error)

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "data" / "watch-items.json"
CACHE = ROOT / "data" / "date-cache.json"

UA = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
      "Accept-Language": "fr,en;q=0.9,de;q=0.8,nl;q=0.7,it;q=0.7,es;q=0.7,pl;q=0.6"}


def probe(url):
    try:
        r = requests.get(url, headers=UA, timeout=20)
        if r.status_code != 200:
            return url, {"ok": False, "reason": "HTTP %d" % r.status_code}
        if "html" not in r.headers.get("Content-Type", "").lower():
            return url, {"ok": False, "reason": "non-HTML"}
        html = r.text
        date, origin = resolve_publish_date("Page web", None, html, None)
        kind, why = classify_page(url, html)
        return url, {"ok": True, "date": date, "origin": origin,
                     "kind": kind, "why": why[:3]}
    except Exception as error:
        return url, {"ok": False, "reason": type(error).__name__}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="refetch even cached URLs")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
    cache = {} if args.all or not CACHE.exists() else json.loads(CACHE.read_text(encoding="utf-8"))

    urls, seen = [], set()
    for item in items:
        u = (item.get("source") or {}).get("url") or ""
        if u and u not in cache and u not in seen:
            seen.add(u)
            urls.append(u)

    print("%d URL(s) à sonder (%d déjà en cache)" % (len(urls), len(cache)))
    if urls:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for i, (url, res) in enumerate(pool.map(probe, urls), 1):
                cache[url] = res
                if res["ok"]:
                    print("  %3d %-9s %-11s %s" % (i, res["origin"], res["date"] or "-", url[:56]))
                else:
                    print("  %3d %-9s %-11s %s" % (i, "echec", res["reason"][:11], url[:56]))
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    ok = [v for v in cache.values() if v.get("ok")]
    dated = [v for v in ok if v.get("date")]
    origins = {}
    for v in dated:
        origins[v["origin"]] = origins.get(v["origin"], 0) + 1
    kinds = {}
    for v in ok:
        kinds[v.get("kind", "?")] = kinds.get(v.get("kind", "?"), 0) + 1

    print("\n%d URL sondées, %d joignables, %d avec une date établie"
          % (len(cache), len(ok), len(dated)))
    print("  origine des dates : %s" % ", ".join("%s=%d" % kv for kv in sorted(origins.items())))
    print("  type de page      : %s" % ", ".join("%s=%d" % kv for kv in sorted(kinds.items())))
    print("\n-> %s\nRelance tools/veille_to_watchitems.py pour l'appliquer." % CACHE.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
