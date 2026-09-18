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
import os
import subprocess
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
MIN_USEFUL = 500         # below this a body is a stub, not an article

# Pages that build themselves in the browser return a shell to `requests`.
# Honest note on this fallback: it earns nothing on the corpus as it stands.
# The pages that looked like it needed them turned out to be stale cache
# entries, and every current failure is a WAF (403), a PDF, or an index page
# with no article to read - none of which rendering fixes. It is kept, off by
# default, because a JavaScript-only authority site is a matter of time and the
# cost of carrying it is a flag. Do not assume it helps; measure.
CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
]
RENDER_BUDGET_MS = 8000
RENDER_TIMEOUT = 45
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


def chrome():
    """The headless browser, or None - the fallback is optional by design."""
    for path in CHROME_PATHS:
        if os.path.exists(path):
            return path
    return os.environ.get("REGWATCH_CHROME") or None


def render(url):
    """The DOM after the page's own JavaScript has run.

    Slow - eight seconds a page - so it is only ever a second attempt, on pages
    whose static HTML yielded nothing worth reading.
    """
    binary = chrome()
    if not binary:
        return ""
    try:
        out = subprocess.run(
            [binary, "--headless", "--disable-gpu", "--no-sandbox",
             "--virtual-time-budget=%d" % RENDER_BUDGET_MS, "--dump-dom", url],
            capture_output=True, timeout=RENDER_TIMEOUT)
        return out.stdout.decode("utf-8", "ignore")
    except Exception:                                   # noqa: BLE001
        return ""


def fetch(url, render_js=False):
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": UA,
                                                        "Accept-Language": "fr,en;q=0.8"})
        if r.status_code != 200:
            return {"ok": False, "reason": "HTTP %d" % r.status_code}
        ctype = r.headers.get("Content-Type", "")
        if "html" not in ctype.lower():
            return {"ok": False, "reason": "type %s" % (ctype.split(";")[0] or "inconnu")}
        text, body = extract(r.text)
        # A page that renders itself in the browser gives requests a shell.
        # Worth a second, slower attempt before calling it unreadable.
        if len(body) < MIN_USEFUL and render_js:
            html = render(url)
            if html:
                text2, body2 = extract(html)
                if len(body2) > len(body):
                    text, body = text2, body2
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


# ---------- retrouver l'article derriere l'agregateur ----------
#
# Un lien Google News mene a une page de consentement, jamais a l'article. On ne
# contourne pas cette page : on retrouve l'article chez son editeur, par des
# chemins publics et prevus pour etre lus par des programmes.
#   1. la recherche RSS de Google News sur le titre exact donne l'adresse du site
#      de l'editeur (balise <source url=...>) ;
#   2. le flux RSS de l'editeur, puis son plan de site (robots.txt -> sitemap),
#      donnent l'adresse de l'article dont le titre correspond ;
#   3. l'article est lu chez l'editeur, comme n'importe quelle source.
# Rien n'est retenu sous un seuil de ressemblance des titres : mieux vaut pas
# d'extrait qu'un extrait d'un autre article.
AGGREGATORS = ("news.google.com",)
RESOLVE_MIN = 0.82
FEED_PATHS = ("/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml")


def _norm(t):
    t = re.sub(r"\s+-\s+[^-]{2,60}$", "", t or "")          # « Titre - Editeur »
    t = re.sub(r"[^\w\s]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def _plain(t):
    """Sans accents ni apostrophes : « l'Anssi » et « lanssi » d'une adresse se rejoignent."""
    import unicodedata
    t = unicodedata.normalize("NFD", _norm(t))
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    return re.sub(r"\b([ldjmnst]|qu) (?=\w)", r"\1", t)


def _similar(a, b):
    from difflib import SequenceMatcher
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _get(url, timeout=TIMEOUT):
    return requests.get(url, timeout=timeout, headers={"User-Agent": UA, "Accept-Language": "fr,en;q=0.8"})


STOP = set("""le la les des du de d l un une et en au aux pour par sur dans avec sans sa son ses leur leurs
est sont qui que quoi dont plus the of and to in for on with by a an is are from at as""".split())


def _art_id(url):
    m = re.search(r"/articles/([^?/#]+)", url or "")
    return m.group(1) if m else None


def publisher_of(item):
    """Le titre d'origine et le site de l'editeur d'un element venu de l'agregateur.

    Le titre de la file est reecrit par l'agent : il ne se retrouve pas tel quel.
    On cherche donc avec ses mots-cles et le nom de l'editeur, et l'on ne retient
    que l'entree qui porte le MEME identifiant d'article que le lien enregistre :
    une correspondance exacte, pas une ressemblance."""
    import feedparser
    from urllib.parse import quote
    url = (item.get("source") or {}).get("url") or ""
    want = _art_id(url)
    if not want:
        return None, None
    pubs = [x.strip() for x in ((item.get("source") or {}).get("name") or "").split(";") if x.strip()][:2]
    kw = lambda t: [w for w in _norm(t or "").split() if w not in STOP and len(w) > 2]
    fr, en = kw(item.get("title")), kw(item.get("titleEn"))
    FR_L, EN_L = "hl=fr&gl=FR&ceid=FR:fr", "hl=en-US&gl=US&ceid=US:en"
    # Du plus precis au plus large ; on s'arrete au premier identifiant retrouve.
    queries = []
    for p in pubs:
        queries += [(" ".join(fr[:5]) + ' "%s"' % p, FR_L), (" ".join(en[:5]) + ' "%s"' % p, EN_L)]
    queries += [(" ".join(fr[:4]), FR_L), (" ".join(en[:4]), EN_L),
                (" ".join(fr[:7]), FR_L), (" ".join(en[:7]), EN_L)]
    for q, loc in queries:
        if not q.strip():
            continue
        try:
            d = feedparser.parse(_get("https://news.google.com/rss/search?q=%s&%s" % (quote(q), loc)).content)
        except Exception:                               # noqa: BLE001
            continue
        for e in d.entries:
            if _art_id(e.get("link")) == want:
                src = (getattr(e, "source", None) or {}).get("href")
                return e.get("title"), src
    return None, None


def article_on_site(site, title):
    """L'adresse de l'article chez l'editeur : dans son flux, sinon son plan de site."""
    import feedparser
    from urllib.parse import urljoin, urlparse
    root = "%s://%s" % (urlparse(site).scheme or "https", urlparse(site).netloc)
    candidates = []
    try:
        home = _get(root)
        soup = BeautifulSoup(home.text, "html.parser")
        candidates += [urljoin(home.url, l["href"]) for l in soup.find_all("link")
                       if l.get("href") and any(k in (l.get("type") or "").lower() for k in ("rss", "atom"))]
    except Exception:                                   # noqa: BLE001
        pass
    candidates += [root + p for p in FEED_PATHS]
    for u in candidates[:10]:
        try:
            r = _get(u)
            if r.status_code != 200:
                continue
            for e in feedparser.parse(r.content).entries:
                if _similar(e.get("title", ""), title) >= RESOLVE_MIN and e.get("link"):
                    return e["link"]
        except Exception:                               # noqa: BLE001
            pass
    # La recherche du site, par son interface publique quand il en a une
    # (WordPress : /wp-json/wp/v2/search), sinon par sa page de recherche (?s=).
    from urllib.parse import quote
    q = " ".join([w for w in _norm(title).split() if w not in STOP and len(w) > 2][:6])
    try:
        r = _get(root + "/wp-json/wp/v2/search?per_page=20&search=" + quote(q))
        if r.status_code == 200 and r.headers.get("Content-Type", "").startswith("application/json"):
            for hit in r.json():
                if _similar(BeautifulSoup(hit.get("title", ""), "html.parser").get_text(), title) >= RESOLVE_MIN and hit.get("url"):
                    return hit["url"]
    except Exception:                                   # noqa: BLE001
        pass
    try:
        r = _get(root + "/?s=" + quote(q))
        if r.status_code == 200:
            for a in BeautifulSoup(r.text, "html.parser").find_all("a", href=True):
                txt = a.get_text(" ", strip=True)
                if len(txt) > 20 and _similar(txt, title) >= RESOLVE_MIN:
                    return urljoin(r.url, a["href"])
    except Exception:                                   # noqa: BLE001
        pass

    # Le plan de site : les articles plus anciens que le flux y sont encore.
    try:
        robots = _get(root + "/robots.txt").text
        maps = re.findall(r"(?im)^sitemap:\s*(\S+)", robots) or [root + "/sitemap.xml"]
    except Exception:                                   # noqa: BLE001
        maps = [root + "/sitemap.xml"]
    want = [w for w in _plain(title).split() if len(w) > 2 and w not in STOP]

    def rank(u):
        """Les plans d'articles d'abord, les plus recents en tete ; jamais les
        plans de mots-cles, d'auteurs ou de categories."""
        low = u.lower()
        if re.search(r"tag|categor|author|auteur|page-sitemap|event|attachment|media|image|video", low):
            return None
        num = re.findall(r"(\d+)(?=\.xml)", low)
        good = 0 if re.search(r"post|article|news|actu", low) else 1
        return (good, -int(num[-1]) if num else 0)

    seen, queue = 0, list(maps)
    while queue and seen < 15:
        u = queue.pop(0)
        seen += 1
        try:
            xml = _get(u).text
        except Exception:                               # noqa: BLE001
            continue
        blocks = re.findall(r"<sitemap>(.*?)</sitemap>", xml, re.S)
        if blocks:
            subs = []
            for blk in blocks:
                loc = re.search(r"<loc>\s*([^<\s]+)\s*</loc>", blk)
                mod = re.search(r"<lastmod>\s*([^<\s]+)", blk)
                if loc and rank(loc.group(1)) is not None:
                    subs.append((loc.group(1), mod.group(1) if mod else ""))
            # Le plus recemment modifie d'abord : c'est la que sont les articles
            # de l'annee. Sans date, l'ordre du nom sert de repli.
            subs.sort(key=lambda x: (x[1] == "", "" if not x[1] else "~" + x[1], rank(x[0])), reverse=False)
            subs.sort(key=lambda x: x[1], reverse=True)
            queue = [u for u, _m in subs][:6] + queue
            continue
        for loc, block in re.findall(r"<url>\s*<loc>\s*([^<\s]+)\s*</loc>(.*?)</url>", xml, re.S):
            ntitle = re.search(r"<news:title>([^<]+)</news:title>", block)
            if ntitle and _similar(ntitle.group(1), title) >= RESOLVE_MIN:
                return loc
            if len(want) >= 4:
                slug = set(_plain(urlparse(loc).path.rsplit("/", 1)[-1] or urlparse(loc).path).split())
                if sum(1 for w in want if w in slug) >= max(4, round(len(want) * 0.7)):
                    return loc
    return None


def resolve(item):
    """L'adresse de l'article d'origine, ou None."""
    title, site = publisher_of(item)
    return article_on_site(site, title) if title and site else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="refetch cached URLs too")
    ap.add_argument("--render", action="store_true",
                    help="second attempt through headless Chrome when the static "
                         "page yields nothing readable (slow: ~8 s per page)")
    args = ap.parse_args()

    if not ITEMS.exists():
        raise SystemExit("%s absent — lance d'abord tools/veille_to_watchitems.py" % ITEMS)

    items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
    # The cache is ALWAYS loaded, even on a refresh: --refresh means "fetch these
    # again", not "forget what worked". Dropping it here is what let a single
    # refresh trade six working excerpts for the day's failures, and it defeated
    # the guard below by leaving nothing to compare against.
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    urls = []
    item_of = {}
    for item in items:
        url = (item.get("source") or {}).get("url") or ""
        if not url or url in urls:
            continue
        item_of[url] = item
        # Un lien d'agregateur en echec est retente : c'est l'article d'origine
        # qui sera lu, et il a pu etre retrouve depuis.
        agg = any(a in url for a in AGGREGATORS) and not cache.get(url, {}).get("ok") \
            and not cache.get(url, {}).get("unresolved")
        if args.refresh or url not in cache or agg:
            urls.append(url)

    print("%d URL(s) uniques à récupérer (%d déjà en cache)" % (len(urls), len(cache)))
    if urls:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            def one(u):
                if any(a in u for a in AGGREGATORS):
                    orig = resolve(item_of.get(u, {}))
                    if not orig:
                        return {"ok": False, "reason": "article d'origine introuvable", "unresolved": True}
                    res = fetch(orig, args.render)
                    res["resolvedUrl"] = orig
                    return res
                return fetch(u, args.render)
            for url, result in zip(urls, pool.map(one, urls)):
                # A refresh must never trade a success for a failure: sites
                # rate-limit, block a user agent for a day, or go down. Six
                # working excerpts were lost to a single --refresh before this.
                if not result.get("ok") and cache.get(url, {}).get("ok"):
                    result = cache[url]
                cache[url] = result
                flag = "OK  " if result["ok"] else "----"
                detail = ("%d car." % len(result["text"])) if result["ok"] else result["reason"]
                if result.get("resolvedUrl"):
                    detail += "  <- " + result["resolvedUrl"][:60]
                print("  %s %-58s %s" % (flag, url[:58], detail))

    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ok = sum(1 for v in cache.values() if v.get("ok"))
    print("\n%d/%d extraits récupérés -> %s" % (ok, len(cache), CACHE.relative_to(ROOT)))
    print("Relance ensuite tools/veille_to_watchitems.py pour les intégrer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
