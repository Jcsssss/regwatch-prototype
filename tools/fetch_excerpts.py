#!/usr/bin/env python3
"""Fetch the opening lines of each watched article.

The agent stores an AI-written summary, never the source text. A validator wants
to read the article's own first lines before trusting anything generated, so we
fetch them here and cache them.

    python3 tools/fetch_excerpts.py            # fill the cache for pending items
    python3 tools/fetch_excerpts.py --refresh  # refetch even cached URLs

Reads data/watch-items.json, writes data/excerpt-cache.json keyed by URL.
`veille_to_watchitems.py` then reads that cache offline, so the conversion stays
fast and works with no network.

Failures are cached too, with their reason: a paywalled or WAF-blocked source
should not be retried on every run, and the card falls back to the AI summary.
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
ITEMS = ROOT / "data" / "watch-items.json"
CACHE = ROOT / "data" / "excerpt-cache.json"

MAX_CHARS = 600          # what the card shows: the opening lines
MAX_BODY = 20000         # what the router reads: the article, bounded
TIMEOUT = 12
WORKERS = 8
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Boilerplate that leads many institutional pages and tells a reader nothing.
NOISE = re.compile(
    r"^(accept|cookie|skip to|aller au contenu|this site uses|ce site utilise|"
    r"javascript|menu|navigation|search|rechercher|partager|share)\b", re.I)

# Aggregator links (Google News above all) resolve to a consent wall rather than
# the article: the real page needs JS. Serving that as "the article's first lines"
# would be worse than falling back to the agent's summary, so reject it outright.
CONSENT = re.compile(
    r"nous utilisons des cookies|we use cookies|utilisons des cookies et des données|"
    r"avant d'accéder à google|before you continue to google|"
    r"consent(ement)? (aux|to) cookies|gérer mes choix|manage your (privacy|choices)|"
    r"accepter tout|reject all|tout refuser|politique de confidentialité et (les )?conditions",
    re.I)


def extract(html):
    """The page's real paragraphs: the opening lines, and the whole body.

    Two consumers, two needs. The card shows the first sentences, so a validator
    reads the source before trusting a generated summary. The cell router needs
    everything: routing on a 338-character summary means an article that devotes
    three paragraphs to sanctions is never routed to the Sanctions sheet, because
    the summary happened not to use the word.

    The body was already being fetched and cleaned, then thrown away at 600
    characters. Keeping it costs nothing but disk.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form"]):
        tag.decompose()

    # Prefer an article container when the page marks one up.
    root = soup.find("article") or soup.find("main") or soup.body or soup
    parts = []
    for p in root.find_all(["p", "li"]):
        text = re.sub(r"\s+", " ", p.get_text(" ", strip=True)).strip()
        if len(text) < 40 or NOISE.match(text):
            continue
        parts.append(text)
        if sum(len(x) for x in parts) >= MAX_BODY:
            break

    if not parts:
        return "", ""
    body = " ".join(parts)[:MAX_BODY]
    out = " ".join(parts)
    if len(out) > MAX_CHARS:
        cut = out[:MAX_CHARS]
        # end on a sentence when we can, rather than mid-word
        stop = max(cut.rfind(". "), cut.rfind(" ! "), cut.rfind(" ? "))
        out = (cut[:stop + 1] if stop > MAX_CHARS * 0.5 else cut.rstrip()) + " […]"
    return out, body


def fetch(url):
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": UA,
                                                        "Accept-Language": "fr,en;q=0.8"})
        if r.status_code != 200:
            return {"ok": False, "reason": "HTTP %d" % r.status_code}
        ctype = r.headers.get("Content-Type", "")
        if "html" not in ctype.lower():
            return {"ok": False, "reason": "type %s" % (ctype.split(";")[0] or "inconnu")}
        text, body = extract(r.text)
        if not text:
            return {"ok": False, "reason": "aucun texte exploitable"}
        if CONSENT.search(text):
            return {"ok": False, "reason": "mur de consentement (agrégateur)"}
        # `body` is kept apart from `text`: only the first is shown to a reader,
        # and only the second is trusted for routing - and only when long enough
        # to be an article rather than a language switcher or a stub.
        return {"ok": True, "text": text, "body": body, "bodyChars": len(body)}
    except Exception as error:
        return {"ok": False, "reason": type(error).__name__}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="refetch cached URLs too")
    args = ap.parse_args()

    if not ITEMS.exists():
        raise SystemExit("%s absent — lance d'abord tools/veille_to_watchitems.py" % ITEMS)

    items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
    cache = {}
    if CACHE.exists() and not args.refresh:
        cache = json.loads(CACHE.read_text(encoding="utf-8"))

    urls = []
    for item in items:
        url = (item.get("source") or {}).get("url") or ""
        if url and url not in cache and url not in urls:
            urls.append(url)

    print("%d URL(s) uniques à récupérer (%d déjà en cache)" % (len(urls), len(cache)))
    if urls:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for url, result in zip(urls, pool.map(fetch, urls)):
                # A refresh must never trade a success for a failure: sites
                # rate-limit, block a user agent for a day, or go down. Six
                # working excerpts were lost to a single --refresh before this.
                if not result.get("ok") and cache.get(url, {}).get("ok"):
                    result = cache[url]
                cache[url] = result
                flag = "OK  " if result["ok"] else "----"
                detail = ("%d car." % len(result["text"])) if result["ok"] else result["reason"]
                print("  %s %-58s %s" % (flag, url[:58], detail))

    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ok = sum(1 for v in cache.values() if v.get("ok"))
    print("\n%d/%d extraits récupérés -> %s" % (ok, len(cache), CACHE.relative_to(ROOT)))
    print("Relance ensuite tools/veille_to_watchitems.py pour les intégrer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
