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
    return iso_date(m.group(1)) if m else ""


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
    r"[Mm]is\s+à\s+jour\s+le\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Dd]erni[èe]re\s+mise\s+à\s+jour\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Pp]ubli[ée]\s+le\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Ll]ast\s+updated?\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})",
    r"[Ll]ast\s+updated?\s*:?\s*(\d{4}-\d{2}-\d{2})",
    r"[Zz]uletzt\s+aktualisiert\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})",
    r"[Ll]aatst\s+bijgewerkt\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
]

# A page that indexes other pages is not a publication. Treating one as an
# article is how a category listing ends up in the queue dated today.
INDEX_URL = re.compile(
    r"/(category|categories|policies|policy|topics?|tags?|search|news/?$|"
    r"actualites/?$|aktuelles/?$|home/?$|index)(/|$)|/portale/home|/web/[a-z-]+/?$", re.I)
# og:type values that say outright "this is not an article".
INDEX_OGTYPE = {"website", "policy", "profile", "object"}


def page_text_date(html):
    """A date printed in the page body, when the markup carries none."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)[:20000]
    for pattern in TEXT_DATE:
        m = re.search(pattern, text)
        if m:
            got = iso_date(m.group(1))
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


def source_excerpt(page_text):
    """The opening lines the agent already has in hand, trimmed to a readable size."""
    text = re.sub(r"\s+", " ", str(page_text or "")).strip()
    if len(text) <= MAX_EXCERPT:
        return text
    cut = text[:MAX_EXCERPT]
    stop = cut.rfind(". ")
    return (cut[:stop + 1] if stop > MAX_EXCERPT * 0.5 else cut.rstrip()) + " […]"
