#!/usr/bin/env python3
"""Find and verify the RSS feeds of every national cyber authority.

    python3 agent-veille/discover_feeds.py            # probe all
    python3 agent-veille/discover_feeds.py FR DE      # probe some

Why probe rather than list: a hand-written list of 29 feed URLs is stale the day
it is written, and a dead feed is invisible - the agent simply stops seeing that
country. This asks each authority site what feeds it advertises, then checks the
feed actually parses and carries dated entries.

For each candidate site it tries, in order:
  1. <link rel="alternate" type="application/rss+xml"> in the homepage head
  2. the usual paths (/feed, /rss, /rss.xml, /atom.xml, ...)
and keeps whatever returns a feed with at least one dated entry.

Output: data/authority-feeds.json - the registry the Sources tab reads and the
agent's tblSources can absorb.
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import requests
    import feedparser
    from regwatch_fields import harvest_links
except ImportError:
    raise SystemExit("pip install requests feedparser")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "authority-feeds.json"

UA = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
      "Accept-Language": "en,fr;q=0.8,de;q=0.7"}

COMMON = ["/feed", "/feed/", "/rss", "/rss/", "/rss.xml", "/feed.xml", "/atom.xml",
          "/index.xml", "/en/rss.xml", "/en/feed", "/en/rss",
          "/actualites/rss/", "/actualites/feed/", "/news/feed/", "/news/rss",
          "/nieuws.rss", "/nyheter/rss", "/uutiset/rss", "/aktuality/rss",
          "/rss/news", "/feeds/news.rss", "/DE/Service/Aktuell/RSS/rss.xml"]

# Feeds already proven in production by the agent's own source table, or
# confirmed by probing. Tried first: a URL known to work beats any convention.
PROVEN = {
    "FR": ["https://cyber.gouv.fr/actualites/rss/", "https://www.cert.ssi.gouv.fr/dur/feed/"],
    "NL": ["https://feeds.ncsc.nl/nieuws.rss"],
    "DE": ["https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_WID.xml",
           "https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_Presse.xml",
           "https://wid.cert-bund.de/content/public/securityAdvisory/rss",
           "https://www.bsi.bund.de/DE/Service-Navi/Abonnements/RSS-Feed/rss_feed.xml"],
    "GB": ["https://www.ncsc.gov.uk/api/1/services/v1/news-rss-feed.xml",
           "https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml",
           "https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml"],
    "IE": ["https://www.ncsc.gov.ie/rss/", "https://www.ncsc.gov.ie/feed/",
           "https://www.gov.ie/en/rss/"],
    "AT": ["https://cert.at/de/warnungen/feed/", "https://www.cert.at/de/aktuelles/feed.xml",
           "https://cert.at/feed/", "https://www.wko.at/rss"],
    "FI": ["https://www.kyberturvallisuuskeskus.fi/feed/rss/fi",
           "https://www.kyberturvallisuuskeskus.fi/en/feed/rss",
           "https://www.traficom.fi/en/rss.xml"],
    "EE": ["https://www.ria.ee/rss.xml", "https://www.ria.ee/en/rss.xml",
           "https://www.ria.ee/uudised/rss"],
    "IT": ["https://www.acn.gov.it/portale/rss", "https://www.acn.gov.it/portale/w/rss",
           "https://www.acn.gov.it/rss", "https://www.garanteprivacy.it/rss"],
    "SK": ["https://www.sk-cert.sk/feed/index.html", "https://www.sk-cert.sk/rss.xml",
           "https://www.nbu.gov.sk/rss/"],
    "PT": ["https://dyn.cncs.gov.pt/pt/rss", "https://www.cncs.gov.pt/feed/",
           "https://www.cncs.gov.pt/pt/rss/", "https://dyn.cncs.gov.pt/en/rss"],
    "HU": ["https://nki.gov.hu/feed/", "https://nki.gov.hu/rss",
           "https://nki.gov.hu/it-biztonsag/hirek/feed/"],
    "BE": ["https://cert.be/en/rss", "https://cert.be/fr/rss",
           "https://ccb.belgium.be/en/rss.xml"],
    "GR": ["https://mindigital.gr/feed", "https://www.ncsa.gov.gr/feed/",
           "https://mindigital.gr/archives/category/press-releases/feed"],
    "LT": ["https://www.nksc.lt/feed/", "https://www.cert.lt/feed/",
           "https://www.nksc.lt/naujienos/rss"],
    "BG": ["https://www.cybersecurity.bg/feed/", "https://e-gov.bg/rss",
           "https://www.govcert.bg/feed/"],
    "CY": ["https://dsa.cy/feed/", "https://dsa.cy/en/feed/",
           "https://www.cyprus.gov.cy/rss"],
}

# The national authority designated or acting under NIS 2, per country.
# Candidate sites only - what actually serves a feed is decided by probing.
AUTHORITIES = {
    "AT": ("nis.gv.at / CERT.at", ["https://www.cert.at", "https://www.nis.gv.at"]),
    "BE": ("CCB - Centre for Cybersecurity Belgium", ["https://ccb.belgium.be", "https://cert.be"]),
    "BG": ("Bulgarian cybersecurity authority", ["https://www.cybersecurity.bg", "https://e-gov.bg"]),
    "CY": ("DSA - Digital Security Authority", ["https://dsa.cy"]),
    "CZ": ("NUKIB", ["https://nukib.gov.cz", "https://www.nukib.cz"]),
    "DE": ("BSI", ["https://www.bsi.bund.de"]),
    "DK": ("CFCS - Center for Cybersikkerhed", ["https://www.cfcs.dk"]),
    "EE": ("RIA - Information System Authority", ["https://www.ria.ee"]),
    "ES": ("INCIBE", ["https://www.incibe.es", "https://www.ccn-cert.cni.es"]),
    "FI": ("Traficom / NCSC-FI", ["https://www.kyberturvallisuuskeskus.fi", "https://www.traficom.fi"]),
    "FR": ("ANSSI", ["https://cyber.gouv.fr", "https://www.cert.ssi.gouv.fr"]),
    "GB": ("NCSC UK", ["https://www.ncsc.gov.uk"]),
    "GR": ("National Cybersecurity Authority", ["https://mindigital.gr", "https://www.ncsa.gov.gr"]),
    "HR": ("ZSIS / CERT.hr", ["https://www.cert.hr", "https://www.zsis.hr"]),
    "HU": ("NBSZ NKI", ["https://nki.gov.hu"]),
    "IE": ("NCSC Ireland", ["https://www.ncsc.gov.ie"]),
    "IT": ("ACN", ["https://www.acn.gov.it"]),
    "LT": ("NKSC", ["https://www.nksc.lt", "https://www.cert.lt"]),
    "LU": ("ILR / GOVCERT.LU", ["https://www.govcert.lu", "https://www.ilr.lu"]),
    "LV": ("CERT.LV", ["https://cert.lv"]),
    "MT": ("MDIA / CIP", ["https://mdia.gov.mt", "https://cip.gov.mt"]),
    "NL": ("NCSC-NL", ["https://www.ncsc.nl"]),
    "NO": ("NSM", ["https://nsm.no"]),
    "PL": ("CSIRT NASK / CERT Polska", ["https://cert.pl", "https://www.gov.pl"]),
    "PT": ("CNCS", ["https://www.cncs.gov.pt", "https://dyn.cncs.gov.pt"]),
    "RO": ("DNSC", ["https://dnsc.ro"]),
    "SE": ("MSB / CERT-SE", ["https://www.cert.se", "https://www.msb.se"]),
    "SI": ("SI-CERT / URSIV", ["https://www.cert.si", "https://www.gov.si"]),
    "SK": ("NBU SK", ["https://www.nbu.gov.sk", "https://www.sk-cert.sk"]),
}


def candidate_feeds(site, iso=None):
    """Proven URLs first, then whatever the homepage advertises, then convention."""
    found = list(PROVEN.get(iso or "", []))
    try:
        r = requests.get(site, headers=UA, timeout=15)
        if r.status_code == 200 and "html" in r.headers.get("Content-Type", "").lower():
            for m in re.finditer(r"<link[^>]+>", r.text, re.I):
                tag = m.group(0)
                if not re.search(r'type=["\']application/(rss|atom)\+xml', tag, re.I):
                    continue
                href = re.search(r'href=["\']([^"\']+)', tag, re.I)
                if href:
                    found.append(requests.compat.urljoin(site, href.group(1)))
    except Exception:
        pass
    # Any href that looks like a feed, wherever it sits. NCSC Ireland publishes
    # /news/alerts.rss - a real feed that no conventional path would have found.
    try:
        for m in re.finditer(r'href=["\']([^"\'#]+\.(?:rss|atom|xml))["\']', r.text, re.I):
            found.append(requests.compat.urljoin(site, m.group(1)))
    except Exception:
        pass
    return found + [site.rstrip("/") + p for p in COMMON]


def check_feed(url):
    """A feed counts only if it parses and carries at least one dated entry."""
    try:
        r = requests.get(url, headers=UA, timeout=15)
        if r.status_code != 200 or len(r.content) < 200:
            return None
        d = feedparser.parse(r.content)
        if d.bozo and not d.entries:
            return None
        dated = [e for e in d.entries if e.get("published_parsed") or e.get("updated_parsed")]
        if not d.entries:
            return None
        return {"url": url, "title": (d.feed.get("title") or "").strip()[:80],
                "entries": len(d.entries), "dated": len(dated),
                "language": (d.feed.get("language") or "").strip()[:12]}
    except Exception:
        return None



# When an authority publishes no feed, its news page becomes the feed - provided
# we find the right one. These are the paths such a page usually sits at.
NEWS_PATHS = ["/news", "/news/", "/en/news", "/actualites", "/aktuelles", "/de/aktuelles",
              "/nieuws", "/noticias", "/notizie", "/notizie/", "/nyheter", "/nyheder",
              "/uutiset", "/aktuality", "/aktuality/", "/hirek", "/stiri", "/vijesti",
              "/novice", "/naujienos", "/jaunumi", "/uudised", "/wiadomosci",
              "/press", "/pressroom", "/media", "/blog",
              "/amet-uudised-ja-kontakt/uudised-pressikontakt",
              "/portale/notizie-e-media", "/portale/w/notizie",
              "/en/news-and-events", "/news-events", "/newsroom"]


def feeds_linked_from(url, html):
    """Feed URLs advertised anywhere on a page, not only in its head."""
    out = []
    for m in re.finditer(r'href=["\']([^"\'#]+\.(?:rss|atom|xml))["\']', html or "", re.I):
        out.append(requests.compat.urljoin(url, m.group(1)))
    return out


def find_news_page(site, iso=None):
    """The page whose links look most like articles - the stand-in for a feed.

    A news page is also the likeliest place to advertise a feed, so any feed it
    links to is tried first: a real feed always beats harvesting links.
    """
    best = None
    for path in NEWS_PATHS:
        url = site.rstrip("/") + path
        try:
            r = requests.get(url, headers=UA, timeout=12)
            if r.status_code != 200 or "html" not in r.headers.get("Content-Type", "").lower():
                continue
            for cand in feeds_linked_from(url, r.text):
                got = check_feed(cand)
                if got and got["dated"]:
                    return ("feed", cand, got)
            links = harvest_links(url, r.text)
            if len(links) >= 3 and (best is None or len(links) > best[2]):
                best = ("harvest", url, len(links))
        except Exception:
            continue
    return best


def probe(item):
    iso, (name, sites) = item
    for site in sites:
        seen = set()
        for cand in candidate_feeds(site, iso):
            if cand in seen:
                continue
            seen.add(cand)
            got = check_feed(cand)
            if got and got["dated"]:
                return iso, {"authority": name, "site": site, "status": "ok", **got}
        # No feed: look for the news page whose links the harvester can read.
        # That page becomes the feed this authority never published.
        found = find_news_page(site, iso)
        if found and found[0] == "feed":
            return iso, {"authority": name, "site": site, "status": "ok", **found[2]}
        if found:
            return iso, {"authority": name, "site": site, "status": "harvest",
                         "url": found[1], "entries": found[2], "dated": 0}
        try:
            if requests.get(site, headers=UA, timeout=12).status_code == 200:
                return iso, {"authority": name, "site": site, "status": "page-only",
                             "url": site, "entries": 0, "dated": 0}
        except Exception:
            continue
    return iso, {"authority": name, "site": sites[0], "status": "unreachable",
                 "url": sites[0], "entries": 0, "dated": 0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("isos", nargs="*", help="limit to these ISO codes")
    args = ap.parse_args()

    targets = [(k, v) for k, v in AUTHORITIES.items()
               if not args.isos or k in [x.upper() for x in args.isos]]
    print("sonde %d autorité(s)\n" % len(targets))

    # A partial probe must not wipe the countries it did not look at.
    out = {}
    if OUT.exists():
        out = json.loads(OUT.read_text(encoding="utf-8")).get("authorities", {})
    with ThreadPoolExecutor(max_workers=6) as pool:
        for iso, rec in pool.map(probe, targets):
            out[iso] = rec
            mark = {"ok": "FLUX", "harvest": "RECO", "page-only": "page", "unreachable": "----"}[rec["status"]]
            print("  %s %-4s %-30s %s" % (iso, mark, rec["authority"][:30],
                                          rec["url"][:56]))
            if rec["status"] == "ok":
                print("       %d entrées dont %d datées | %s" %
                      (rec["entries"], rec["dated"], rec.get("title") or "-"))

    ok = sum(1 for r in out.values() if r["status"] == "ok")
    harv = sum(1 for r in out.values() if r["status"] == "harvest")
    page = sum(1 for r in out.values() if r["status"] == "page-only")
    OUT.write_text(json.dumps({"authorities": out}, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")
    print("\n%d flux vérifiés, %d pages récoltables, %d sans rien, %d injoignables -> %s"
          % (ok, harv, page, len(out) - ok - harv - page, OUT.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
