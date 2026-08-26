#!/usr/bin/env python3
"""Measure whether publication dates can be read from the page instead of guessed.

The agent sets a web page's publication date to *today* and lets the model
override it with a guess. That is why an article actually published in 2024 can
show up dated 2026. This probe answers the prior question: do these pages
actually expose a real date in their markup?

    python3 agent-veille/probe_dates.py [--limit N]

Reads the URLs already in data/excerpt-cache.json. Read-only, no AI, no writes
to the agent's workbook.
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    raise SystemExit("pip install requests beautifulsoup4")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "excerpt-cache.json"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Most to least trustworthy. Structured metadata beats visible text, which can be
# a "last reviewed" banner rather than the publication date.
META_KEYS = [
    ("article:published_time", "og"), ("og:article:published_time", "og"),
    ("article:modified_time", "og"), ("og:updated_time", "og"),
    ("datePublished", "itemprop"), ("dateModified", "itemprop"),
    ("date", "name"), ("DC.date", "name"), ("DC.Date.issued", "name"),
    ("pubdate", "name"), ("publish-date", "name"), ("dcterms.created", "name"),
]
TEXT_PATTERNS = [
    r"publi[ée]\s+le\s+(\d{1,2}[/\s.-]\w+[/\s.-]\d{4})",
    r"mis\s+à\s+jour\s+le\s+(\d{1,2}[/\s.-]\w+[/\s.-]\d{4})",
    r"(?:published|last updated|updated)\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})",
    r"(\d{4}-\d{2}-\d{2})",
]


def norm(value):
    """Any of the common shapes -> YYYY-MM-DD, or '' when it is not a date."""
    v = str(value or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", v)
    if m:
        return "%s-%s-%s" % m.groups()
    m = re.match(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", v)
    if m:
        d, mo, y = m.groups()
        return "%s-%02d-%02d" % (y, int(mo), int(d))
    return ""


def extract_date(html):
    """Return (date, how) — how says where it came from, for triage."""
    soup = BeautifulSoup(html, "html.parser")

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            blob = json.loads(script.string or "{}")
        except Exception:
            continue
        for node in (blob if isinstance(blob, list) else [blob]):
            if not isinstance(node, dict):
                continue
            for field in ("datePublished", "dateModified"):
                got = norm(node.get(field))
                if got:
                    return got, "json-ld/" + field

    for key, kind in META_KEYS:
        tag = soup.find("meta", attrs={"property": key}) if kind == "og" else \
              soup.find("meta", attrs={"itemprop": key}) if kind == "itemprop" else \
              soup.find("meta", attrs={"name": key})
        if tag:
            got = norm(tag.get("content"))
            if got:
                return got, "meta/" + key

    tag = soup.find("time")
    if tag:
        got = norm(tag.get("datetime") or tag.get_text(" ", strip=True))
        if got:
            return got, "time-tag"

    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:4000]
    for pattern in TEXT_PATTERNS:
        m = re.search(pattern, text, re.I)
        if m:
            got = norm(m.group(1))
            if got:
                return got, "text"
    return "", "none"


def probe(url):
    try:
        r = requests.get(url, timeout=12, headers={"User-Agent": UA})
        if r.status_code != 200 or "html" not in r.headers.get("Content-Type", "").lower():
            return url, "", "http %s" % r.status_code
        return (url,) + extract_date(r.text)
    except Exception as error:
        return url, "", type(error).__name__


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=60)
    args = ap.parse_args()

    cache = json.loads(CACHE.read_text(encoding="utf-8"))
    urls = [u for u, v in cache.items() if v.get("ok")][:args.limit]
    print("sonde %d URL(s) réellement suivies par l'agent\n" % len(urls))

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(probe, urls))

    found = [r for r in results if r[1]]
    by_how = {}
    for _, date, how in results:
        key = how.split("/")[0]
        by_how[key] = by_how.get(key, 0) + 1

    for url, date, how in results[:18]:
        print("  %-10s %-11s %s" % (date or "—", how[:11], url[:62]))

    print("\ndate trouvée : %d / %d (%d%%)" % (len(found), len(results),
                                               round(100 * len(found) / max(1, len(results)))))
    print("par méthode  : %s" % ", ".join("%s=%d" % kv for kv in sorted(by_how.items())))
    old = [r for r in found if r[1] < "2025-01-01"]
    print("antérieures à 2025 : %d — autant d'articles que l'agent daterait d'aujourd'hui" % len(old))
    return 0


if __name__ == "__main__":
    sys.exit(main())
