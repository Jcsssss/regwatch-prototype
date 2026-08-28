"""Tier 1 field fixes for the NIS 2 watch agent — drop-in, no rewrite.

Copy next to `nis2_agent_v2.py` and wire the four call sites listed in
patch-tier1.md. Each function is standalone and side-effect free, so the patch
stays reviewable and reversible.

What this fixes, and why it matters downstream:

1. ISO country codes. tblVeille stores country names as free French text with
   inconsistent separators ("France;Union Européenne", "France; UE"). RegWatch
   keys on ISO, so the mapping table currently lives — duplicated — on the
   consuming side, where it breaks silently on any new spelling.

2. Consistent ISO dates. The workbook mixes ISO strings and Excel serials in the
   same column.

3. The source's own opening lines. The agent already downloads the page text to
   analyse it, then discards it. Keeping ~600 characters means a validator can
   read what the source actually published instead of a generated summary. Today
   RegWatch re-downloads every article to recover this and only succeeds for
   half of them, because aggregator links resolve to consent walls.

4. Date provenance. This is the one that changes the numbers. For a "Page web"
   source the agent sets the publication date to *today*, then lets the model
   overwrite it with a guess — so an article published in 2024 can be filed
   under 2026. Measured on the live sources: only 7% of monitored pages expose a
   machine-readable date at all, because 37% of what the agent tracks are
   permanent institutional pages (home pages, "about us", policy landing pages)
   which have no publication date by nature.

   The fix is not a better guess. It is to stop asserting a date we do not have:
   record where the date came from, and leave it empty when there is none.
"""

import json
import re
import unicodedata
from datetime import date, datetime, timedelta

EXCEL_EPOCH = date(1899, 12, 30)
MAX_EXCERPT = 600

COUNTRY_ISO = {
    "allemagne": "DE", "autriche": "AT", "belgique": "BE", "bulgarie": "BG",
    "chypre": "CY", "croatie": "HR", "danemark": "DK", "espagne": "ES",
    "estonie": "EE", "finlande": "FI", "france": "FR", "grece": "GR",
    "hongrie": "HU", "irlande": "IE", "italie": "IT", "lettonie": "LV",
    "lituanie": "LT", "luxembourg": "LU", "malte": "MT", "norvege": "NO",
    "pays-bas": "NL", "pologne": "PL", "portugal": "PT", "republique tcheque": "CZ",
    "tchequie": "CZ", "roumanie": "RO", "royaume-uni": "GB", "slovaquie": "SK",
    "slovenie": "SI", "suede": "SE",
    "union europeenne": "EU", "ue": "EU", "europe": "EU", "eu": "EU",
}

# Where a publication date came from. Written to tblVeille so a reader can tell
# a fact from an inference without opening the source.
DATE_FROM_FEED = "flux"          # the RSS entry carried it — trustworthy
DATE_FROM_PAGE = "page"          # parsed out of the page markup
DATE_FROM_MODEL = "ia"           # the model inferred it — treat as a hint
DATE_NONE = "inconnue"           # no date exists; a page change is not a publication


def _fold(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def iso_codes(zone):
    """'France; Union Européenne' -> 'FR;EU'. Unknown labels are dropped, and the
    original free-text column stays untouched beside this one."""
    out = []
    for part in re.split(r"[;,/]| et ", str(zone or "")):
        code = COUNTRY_ISO.get(_fold(part))
        if code and code not in out:
            out.append(code)
    return ";".join(out)


def iso_date(value):
    """Any of the shapes the workbook currently holds -> YYYY-MM-DD, or ''."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if not text:
        return ""
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        return text[:10]
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return (EXCEL_EPOCH + timedelta(days=int(float(text)))).isoformat()
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)
    if m:
        d, mo, y = m.groups()
        return "%s-%02d-%02d" % (y, int(mo), int(d))
    return ""


def page_date(html):
    """Read a real publication date out of the page markup, or ''.

    Deterministic and free — no model call. It only succeeds on pages that are
    actually articles, which is the point: a blank answer here is information,
    not a failure.
    """
    if not html:
        return ""
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            blob = json.loads(m.group(1))
        except Exception:
            continue
        for node in (blob if isinstance(blob, list) else [blob]):
            if isinstance(node, dict):
                for field in ("datePublished", "dateModified"):
                    got = iso_date(node.get(field))
                    if got:
                        return got
    for key in ("article:published_time", "og:article:published_time",
                "article:modified_time", "og:updated_time", "datePublished",
                "date", "DC.date", "pubdate"):
        m = re.search(r'<meta[^>]+(?:property|name|itemprop)=["\']%s["\'][^>]+content=["\']([^"\']+)'
                      % re.escape(key), html, re.I)
        if m:
            got = iso_date(m.group(1))
            if got:
                return got
    m = re.search(r'<time[^>]+datetime=["\']([^"\']+)', html, re.I)
    if m:
        got = iso_date(m.group(1))
        if got:
            return got
    # <time>14 July, 2026</time> - the value is the element's text, not an attribute.
    m = re.search(r"<time[^>]*>([^<]{4,40})</time>", html, re.I)
    if m:
        return iso_date(m.group(1)) or parse_long_date(m.group(1))
    return ""


def resolve_publish_date(source_type, feed_date, html, model_date):
    """Return (date, provenance). Never invents a date.

    Order matters: a feed date is published by the authority itself, a parsed
    page date is read from the page, and a model date is an inference. Today's
    date is not an option — a page changing today says nothing about when its
    content was published.
    """
    feed = iso_date(feed_date)
    if feed:
        return feed, DATE_FROM_FEED
    parsed = page_date(html) or page_text_date(html)
    if parsed:
        return parsed, DATE_FROM_PAGE
    guess = iso_date(model_date)
    if guess:
        return guess, DATE_FROM_MODEL
    return "", DATE_NONE



# Visible "updated on" lines, in the languages the monitored authorities publish
# in. Metadata is preferred, but plenty of institutional pages carry the date
# only in the body - the ANSSI NIS 2 help centre is one.
TEXT_DATE = [
    # French
    r"[Mm]is\s+à\s+jour\s+le\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Dd]erni[èe]re\s+mise\s+à\s+jour\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Pp]ubli[ée]e?\s+le\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    # English
    r"[Ll]ast\s+updated?\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Ll]ast\s+updated?\s*:?\s*(\d{4}-\d{2}-\d{2})",
    r"[Pp]ublished\s*(?:on)?\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    # German
    r"[Zz]uletzt\s+aktualisiert\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})",
    r"[Vv]er(?:ö|oe)ffentlicht\s*(?:am)?\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})",
    # Dutch
    r"[Ll]aatst\s+bijgewerkt\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
    r"[Gg]epubliceerd\s*(?:op)?\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
    # Spanish / Portuguese
    r"[Úú]ltima\s+actualizaci[óo]n\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Úú]ltima\s+atualiza[çc][ãa]o\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Pp]ublicad[oa]\s*(?:el|em)?\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    # Italian
    r"[Uu]ltimo\s+aggiornamento\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Pp]ubblicato\s*(?:il)?\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    # Polish / Czech / Slovak
    r"[Oo]statnia\s+aktualizacja\s*:?\s*(\d{1,2}[.\-]\d{1,2}[.\-]\d{4})",
    r"[Pp]osledn[íi]\s+aktualizace\s*:?\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})",
    r"[Pp]osledn[áa]\s+aktualiz[áa]cia\s*:?\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})",
    # Nordics
    r"[Ss]enast\s+uppdaterad\s*:?\s*(\d{4}-\d{2}-\d{2})",
    r"[Ss]idst\s+opdateret\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Ss]ist\s+oppdatert\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Pp][äa]ivitetty\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})",
    # Baltics / Hungarian / Romanian / Greek / Bulgarian / Croatian / Slovene
    r"[Vv]iimati\s+uuendatud\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})",
    r"[Pp][ēe]d[ēe]jo\s+reizi\s+atjaunin[āa]ts\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})",
    r"[Aa]tnaujinta\s*:?\s*(\d{4}-\d{2}-\d{2})",
    r"[Uu]tolj[áa]ra\s+friss[íi]tve\s*:?\s*(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})",
    r"[Uu]ltima\s+actualizare\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})",
    r"Τελευταία\s+ενημέρωση\s*:?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{4})",
    r"[Пп]оследна\s+актуализация\s*:?\s*(\d{1,2}[.\-]\d{1,2}[.\-]\d{4})",
    r"[Pp]osljednje\s+a[žz]uriranje\s*:?\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})",
    r"[Zz]adnja\s+posodobitev\s*:?\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})",
]

# A page that indexes other pages is not a publication. Treating one as an
# article is how a category listing ends up in the queue dated today.
INDEX_URL = re.compile(
    r"/(category|categories|policies|policy|topics?|tags?|search|news/?$|"
    r"actualites/?$|aktuelles/?$|home/?$|index)(/|$)|/portale/home|/web/[a-z-]+/?$", re.I)
# og:type values that say outright "this is not an article".
INDEX_OGTYPE = {"website", "policy", "profile", "object"}



# Month names, for the "21 mai 2026" form that most institutional sites use in
# their body copy. Numeric dates are the exception, not the rule, on these sites.
MONTHS = {}
for _lang, _names in {
    "fr": "janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre",
    "en": "january february march april may june july august september october november december",
    "de": "januar februar marz april mai juni juli august september oktober november dezember",
    "nl": "januari februari maart april mei juni juli augustus september oktober november december",
    "es": "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre",
    "it": "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre",
    "pt": "janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro",
    "pl": "stycznia lutego marca kwietnia maja czerwca lipca sierpnia wrzesnia pazdziernika listopada grudnia",
    "sv": "januari februari mars april maj juni juli augusti september oktober november december",
    "da": "januar februar marts april maj juni juli august september oktober november december",
    "fi": "tammikuuta helmikuuta maaliskuuta huhtikuuta toukokuuta kesakuuta heinakuuta elokuuta syyskuuta lokakuuta marraskuuta joulukuuta",
    "cs": "ledna unora brezna dubna kvetna cervna cervence srpna zari rijna listopadu prosince",
    "ro": "ianuarie februarie martie aprilie mai iunie iulie august septembrie octombrie noiembrie decembrie",
}.items():
    for _i, _n in enumerate(_names.split(), 1):
        MONTHS[_n] = _i
# Short English/German forms seen in <time> elements.
MONTHS.update({"jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
               "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12, "okt": 10, "dez": 12})

_LONG_DATE = re.compile(r"(\d{1,2})(?:er|st|nd|rd|th|\.)?\s+([A-Za-zÀ-ÿ]{3,12})\.?,?\s+(\d{4})")


def parse_long_date(text):
    """'21 mai 2026', '14 July, 2026', '15. Marz 2026' -> ISO, or ''."""
    for m in _LONG_DATE.finditer(str(text or "")):
        day, name, year = m.groups()
        key = _fold_month(name)
        month = MONTHS.get(key) or MONTHS.get(key[:3])
        if month and 1 <= int(day) <= 31:
            return "%s-%02d-%02d" % (year, month, int(day))
    return ""


def _fold_month(name):
    import unicodedata
    t = unicodedata.normalize("NFD", name.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def page_text_date(html):
    """A date printed in the page body, when the markup carries none."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)[:20000]
    for pattern in TEXT_DATE:
        m = re.search(pattern, text)
        if m:
            got = iso_date(m.group(1)) or parse_long_date(m.group(1))
            if got:
                return got
    # "Mis à jour le 21 mai 2026" and friends, where the label is followed by a
    # spelled-out month rather than digits.
    for label in (r"[Mm]is\s+à\s+jour", r"[Pp]ubli[ée]e?", r"[Ll]ast\s+updated?",
                  r"[Pp]ublished", r"[Vv]er(?:ö|oe)ffentlicht", r"[Gg]epubliceerd"):
        m = re.search(label + r"[^.\d]{0,14}(\d{1,2}[^,\d]{2,14}\d{4})", text)
        if m:
            got = parse_long_date(m.group(1))
            if got:
                return got
    return ""


def classify_page(url, html):
    """Is this an article, or a page that lists other pages?

    Returns (kind, reasons). Deterministic on purpose: the decision to file
    something as a regulatory publication should not depend on a model's mood,
    and every signal here is checkable by opening the page.
    """
    positive, negative = [], []
    if INDEX_URL.search(url or ""):
        negative.append("url d'index")
    else:
        # A multi-word slug is how a publication is named; a section is one word.
        last = [p for p in (url or "").rstrip("/").split("/") if p][-1:]
        if last and last[0].count("-") >= 2:
            positive.append("slug d'article")

    if html:
        m = re.search(r'og:type"[^>]*content="([^"]+)', html, re.I)
        og = (m.group(1).lower() if m else "")
        if og == "article":
            positive.append("og:type=article")
        elif og in INDEX_OGTYPE:
            negative.append("og:type=%s" % og)

        # Navigation inflates the link count on any site, so the bar is set where
        # only a genuine listing clears it - the ANSSI news article sits at 55
        # links / ratio 115 and must not be caught.
        links = len(re.findall(r"<a\s[^>]*href=", html))
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
        ratio = len(text) // max(links, 1)
        if links >= 90 and ratio < 100:
            negative.append("page de liens (%d liens, ratio %d)" % (links, ratio))

        if page_date(html) or page_text_date(html):
            positive.append("date lisible")
        else:
            negative.append("aucune date")

    reasons = positive + negative
    if len(positive) >= 2:
        return "article", reasons
    # Two independent negatives before refusing to file a page: "no date" alone
    # is weak, since a dated article can simply omit its metadata.
    if len(negative) >= 2 and not positive:
        return "index", negative
    if len(negative) >= 3:
        return "index", negative
    return ("article" if positive and not negative else "incertain"), reasons



# --------------------------------------------------------------------------- #
# Turning an index page into the feed it never published.
#
# A listing page is not an article, but it knows where the articles are. Nine of
# the twenty-nine authorities publish no RSS at all; for them, reading the links
# off their news page IS the feed. For the rest it recovers what would otherwise
# be lost when a summary page is skipped.
# --------------------------------------------------------------------------- #

# Anchors that are navigation, not content.
SKIP_LINK = re.compile(
    r"(^|/)(login|search|contact|about|privacy|cookie|legal|sitemap|rss|feed|"
    r"accessibilit|mentions-legales|impressum|kontakt)(/|$|\.)|"
    r"^(mailto:|tel:|javascript:|#)", re.I)
SKIP_EXT = re.compile(r"\.(css|js|png|jpe?g|gif|svg|ico|zip|xlsx?|docx?)($|\?)", re.I)


def harvest_links(base_url, html, limit=25):
    """Article links found on an index page, best first.

    Deliberately conservative: a link qualifies only if it stays on the same
    host, goes deeper than the index itself, and carries a multi-word slug -
    the shape of a publication rather than of a section. Anchor text is kept
    because it is usually the article's title, which saves a fetch.
    """
    if not html:
        return []
    try:
        from urllib.parse import urljoin, urlparse
    except ImportError:
        return []

    host = urlparse(base_url).netloc.lower()
    base_depth = len([p for p in urlparse(base_url).path.split("/") if p])
    base_path = urlparse(base_url).path.lower().rstrip("/") + "/"
    seen, out = set(), []

    for m in re.finditer(r'<a\s[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', html, re.I | re.S):
        href, label = m.group(1).strip(), m.group(2)
        if SKIP_LINK.search(href) or SKIP_EXT.search(href):
            continue
        url = urljoin(base_url, href)
        parts = urlparse(url)
        if parts.scheme not in ("http", "https") or parts.netloc.lower() != host:
            continue
        segments = [p for p in parts.path.split("/") if p]
        if len(segments) <= base_depth:
            continue                      # same level or above: a sibling section
        # The decisive signal: an article listed on a news page lives UNDER that
        # page's path. Without this, /topics/... and /audience/... come back as
        # articles because they are deep and hyphenated too.
        if base_depth and not parts.path.lower().startswith(base_path):
            continue
        last = segments[-1]
        if last.count("-") < 2 and not re.search(r"\d{4,}", last):
            continue                      # not a publication slug
        clean = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", label)).strip()
        key = url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        out.append({"url": url, "title": clean[:180]})
        if len(out) >= limit:
            break
    return out


def source_excerpt(page_text):
    """The opening lines the agent already has in hand, trimmed to a readable size."""
    text = re.sub(r"\s+", " ", str(page_text or "")).strip()
    if len(text) <= MAX_EXCERPT:
        return text
    cut = text[:MAX_EXCERPT]
    stop = cut.rfind(". ")
    return (cut[:stop + 1] if stop > MAX_EXCERPT * 0.5 else cut.rstrip()) + " […]"
