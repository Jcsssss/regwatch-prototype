#!/usr/bin/env python3
"""Propose new watch sources, for a human to accept or reject.

    python3 agent-veille/discover_sources.py             # crawl and propose
    python3 agent-veille/discover_sources.py --limit 20  # fewer seeds, quicker

discover_feeds.py answers "does this authority publish a feed" for a list we
already have. This answers the other question: what else is out there.

It never adds anything. It writes candidates; the Watch inbox shows them to a
validator, and only an accepted candidate reaches the source registry. That is
the same rule the watch items follow, for the same reason: an automated pipeline
that can widen its own inputs without a human in the loop will eventually widen
them somewhere nobody wanted to go.

How a candidate is found
  Seeds are the pages we already trust: the authority sites, the official links
  on the country records, the sources of the current watch items. Their outbound
  links are read, and a link survives three filters:

    unknown      its domain is not already watched, and was not rejected before
    plausible    the host names itself a cyber authority (cert, csirt, ncsc,
                 cyber, nukib...), or the link text says it is about NIS 2. A
                 bare government suffix is NOT enough: six Latvian ministry
                 portals came through on ".gov.lv" alone, linked from a shared
                 template and unrelated to the subject.
    reachable    it answers, and if it announces a feed the feed parses

How a candidate is classified
  On the domain, not on the model's opinion: a European or national government
  domain is `Officielle`, everything else is `Non officielle - à vérifier`.
  That is the classification the registry already uses, applied mechanically so
  it cannot drift.

Output: data/source-candidates.json, src/reg/nis2/data_candidates.js
"""

import argparse
import json
import re
import sys
import urllib.parse as up
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

try:
    import feedparser
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    raise SystemExit("pip install requests beautifulsoup4 feedparser")

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "source-candidates.json"
OUT_JS = ROOT / "src" / "reg" / "nis2" / "data_candidates.js"

UA = {"User-Agent": "Mozilla/5.0 (compatible; RegWatch source discovery; +internal)"}
TIMEOUT = 12
WORKERS = 8
MAX_CANDIDATES = 40

# A domain that belongs to a government or an EU institution. Deliberately a
# list of suffixes and not a guess: this decides the Officielle label.
OFFICIAL_SUFFIXES = (
    ".europa.eu", ".gouv.fr", ".bund.de", ".gv.at", ".belgium.be", ".gov.pl",
    ".gov.cz", ".gov.hu", ".gov.ie", ".gov.uk", ".gov.mt", ".gov.sk", ".gov.si",
    ".gov.it", ".gob.es", ".gov.pt", ".gov.ro", ".gov.gr", ".gov.cy", ".gov.lv",
    ".gov.lt", ".riik.ee", ".gov.hr", ".overheid.nl", ".regeringen.se",
    ".regeringen.dk", ".valtioneuvosto.fi", ".regjeringen.no", ".etat.lu",
)
OFFICIAL_HINTS = ("cert", "csirt", "ncsc", "cyber", "anssi", "bsi", "nukib",
                  "incibe", "govcert", "ria.ee", "traficom", "msb.se", "dnsc.ro")

# The link has to be about the subject if the domain is not obviously official.
TOPIC = re.compile(
    r"nis\s*-?2|nis2|cyber ?s[ée]curit|cybersecurity|cyberbeveiliging|"
    r"kyberturvallisuus|kybernetick|siguran[cč]|bezpe[cč]nost|sicurezza|"
    r"seguridad|seguran[cç]a|sicherheit|bezpiecze[nń]stw|kiberbiztons|"
    r"küberturvalisus|kiberdrošīb|kibernetin", re.I)

# Never propose these: aggregators, social platforms, and the plumbing of the
# web. An aggregator is already over-represented in the registry.
BLOCKED = re.compile(
    r"google\.|youtube\.|facebook\.|twitter\.|x\.com|linkedin\.|instagram\.|"
    r"t\.co|bit\.ly|doubleclick|gstatic|googleapis|cookiebot|onetrust|"
    r"addthis|sharethis|w3\.org|creativecommons\.org|adobe\.com|microsoft\.com/"
    r"|apple\.com|wikipedia\.org", re.I)

FEED_PATHS = ["/rss", "/rss.xml", "/feed", "/feed/", "/atom.xml", "/index.xml", "/en/rss"]


def host_of(url):
    return up.urlparse(url).netloc.lower().removeprefix("www.")


# Le pays d'une source, lu sur son domaine national. Ce n'est pas une
# supposition : un ccTLD est attribué à un pays, et l'autorité de
# cybersécurité d'un État publie sur le domaine de cet État. Les rares
# exceptions (un .com hébergeant une autorité) ressortent sans pays plutôt que
# rattachées au mauvais - le validateur les voit et tranche.
TLD_ISO = {"uk": "GB", "el": "GR"}          # ccTLD qui diffère du code ISO
SUPRANATIONAL = (".europa.eu", ".eu")


def host_iso(host):
    """Le code ISO du pays de ce domaine, 'EU' pour l'Union, '' si indécidable."""
    host = (host or "").lower().rstrip(".")
    if host.endswith(SUPRANATIONAL):
        return "EU"
    tld = host.rsplit(".", 1)[-1]
    if len(tld) != 2:
        return ""
    return TLD_ISO.get(tld, tld.upper())


def is_official(host):
    """Decides the Officielle label: a government or EU domain, full stop."""
    return host.endswith(OFFICIAL_SUFFIXES) or any(h in host for h in OFFICIAL_HINTS)


def cyber_host(host):
    """Does the domain itself announce a cyber authority?"""
    return any(h in host for h in OFFICIAL_HINTS)


def seeds(limit):
    """Pages we already trust. Their outbound links are the search space."""
    out, seen = [], set()

    def add(url):
        if url and url.startswith("http") and url not in seen:
            seen.add(url)
            out.append(url)

    feeds_js = ROOT / "src" / "reg" / "nis2" / "data_authorities.js"
    if feeds_js.exists():
        text = feeds_js.read_text(encoding="utf-8")
        for f in json.loads(text[text.index("["):text.rindex("]") + 1]):
            add(f.get("site"))

    countries = ROOT / "data" / "countries.json"
    if countries.exists():
        for c in json.loads(countries.read_text(encoding="utf-8"))["countries"]:
            for s in c.get("sources") or []:
                add(s.get("url"))

    items = ROOT / "data" / "watch-items.json"
    if items.exists():
        for i in json.loads(items.read_text(encoding="utf-8"))["items"]:
            url = (i.get("source") or {}).get("url") or ""
            if "news.google" not in url:
                add(url)

    return out[:limit]


def known_hosts():
    """Domains already watched, plus those a validator has already turned down."""
    hosts = set()
    feeds_js = ROOT / "src" / "reg" / "nis2" / "data_authorities.js"
    if feeds_js.exists():
        text = feeds_js.read_text(encoding="utf-8")
        for f in json.loads(text[text.index("["):text.rindex("]") + 1]):
            hosts.add(host_of(f.get("site") or ""))
            hosts.add(host_of(f.get("url") or ""))
    items = ROOT / "data" / "watch-items.json"
    if items.exists():
        for i in json.loads(items.read_text(encoding="utf-8"))["items"]:
            hosts.add(host_of((i.get("source") or {}).get("url") or ""))
    prev = OUT_JSON
    if prev.exists():
        old = json.loads(prev.read_text(encoding="utf-8"))
        hosts |= set(old.get("rejected") or [])
    return {h for h in hosts if h}


def outbound(url):
    """Links leaving a trusted page, with the words that introduced them."""
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
        if r.status_code != 200 or "html" not in r.headers.get("Content-Type", "").lower():
            return []
        # Without this, requests falls back to latin-1 whenever the header omits
        # a charset, and Czech or Latvian link text comes back as mojibake.
        r.encoding = r.apparent_encoding or r.encoding
        soup = BeautifulSoup(r.text, "html.parser")
    except Exception:                                    # noqa: BLE001
        return []
    found = []
    for a in soup.find_all("a", href=True):
        link = up.urljoin(url, a["href"])
        if link.startswith("http"):
            found.append((link, " ".join(a.get_text(" ", strip=True).split())[:120]))
    return found


def probe(host):
    """Does it answer, and does it publish a feed? Measured, never assumed."""
    base = "https://" + host
    try:
        r = requests.get(base, headers=UA, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code >= 400:
            return None
        r.encoding = r.apparent_encoding or r.encoding
        title = ""
        soup = BeautifulSoup(r.text, "html.parser")
        if soup.title and soup.title.string:
            title = " ".join(soup.title.string.split())[:90]
        # A declared feed first, then the usual paths.
        cands = [up.urljoin(base, l.get("href"))
                 for l in soup.find_all("link", rel=lambda v: v and "alternate" in v)
                 if l.get("type", "").endswith(("rss+xml", "atom+xml")) and l.get("href")]
        cands += [base + p for p in FEED_PATHS]
        for c in dict.fromkeys(cands):
            try:
                fr = requests.get(c, headers=UA, timeout=TIMEOUT)
                if fr.status_code != 200 or len(fr.content) < 200:
                    continue
                d = feedparser.parse(fr.content)
                dated = [e for e in d.entries if e.get("published_parsed") or e.get("updated_parsed")]
                if d.entries and dated:
                    return {"title": title, "kind": "rss", "feed": c, "entries": len(d.entries)}
            except Exception:                            # noqa: BLE001
                continue
        return {"title": title, "kind": "page", "feed": base, "entries": 0}
    except Exception:                                    # noqa: BLE001
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=45, help="nombre de pages de départ")
    args = ap.parse_args()

    known = known_hosts()
    start = seeds(args.limit)
    print("%d page(s) de départ, %d domaine(s) déjà connus" % (len(start), len(known)))

    proposals = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for links in pool.map(outbound, start):
            for link, label in links:
                host = host_of(link)
                if not host or host in known or BLOCKED.search(host):
                    continue
                # Two ways in, and a bare government suffix is not one of them:
                # a host that names itself a cyber authority (cert, csirt, ncsc,
                # cyber, nukib...), or a link that says it is about the subject.
                if not cyber_host(host) and not TOPIC.search(label + " " + link):
                    continue
                entry = proposals.setdefault(host, {"host": host, "hits": 0, "labels": []})
                entry["hits"] += 1
                if label and label not in entry["labels"]:
                    entry["labels"] = (entry["labels"] + [label])[:3]

    ranked = sorted(proposals.values(), key=lambda e: -e["hits"])[:MAX_CANDIDATES]
    print("%d domaine(s) à sonder" % len(ranked))

    out = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for entry, got in zip(ranked, pool.map(probe, [e["host"] for e in ranked])):
            if not got:
                continue
            official = is_official(entry["host"])
            out.append({
                "host": entry["host"],
                "name": got["title"] or entry["host"],
                "url": got["feed"],
                "kind": got["kind"],
                "entries": got["entries"],
                "iso": host_iso(entry["host"]),
                "type": "official" if official else "unofficial",
                "reliability": "Officielle" if official else "Non officielle - à vérifier",
                "seenFrom": entry["hits"],
                "context": entry["labels"],
                "discovered": date.today().isoformat(),
            })

    out.sort(key=lambda c: (not c["iso"], c["iso"], c["kind"] != "rss",
                            c["type"] != "official", -c["seenFrom"]))
    previous = json.loads(OUT_JSON.read_text(encoding="utf-8")) if OUT_JSON.exists() else {}
    payload = {"generated": date.today().isoformat(),
               "candidates": out,
               # Domains a validator turned down, so they are never proposed twice.
               "rejected": previous.get("rejected") or []}
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text(
        "/* ---- Source candidates found by agent-veille/discover_sources.py.\n"
        "   Proposals only: nothing here is watched until a validator accepts it\n"
        "   in the Watch inbox. Do not edit by hand. ---- */\n"
        "const SOURCE_CANDIDATES = %s;\n" % json.dumps(payload, ensure_ascii=False, indent=1),
        encoding="utf-8")

    rss = sum(1 for c in out if c["kind"] == "rss")
    official = sum(1 for c in out if c["type"] == "official")
    print("\n%d candidat(s) : %d avec flux, %d officiels" % (len(out), rss, official))
    for c in out[:12]:
        print("  %-34s %-5s %-12s vu %dx" % (c["host"][:34], c["kind"],
                                             c["type"], c["seenFrom"]))
    print("\n-> %s" % OUT_JSON.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
