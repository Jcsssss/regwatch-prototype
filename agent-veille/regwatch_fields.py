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
    parsed = page_date(html)
    if parsed:
        return parsed, DATE_FROM_PAGE
    guess = iso_date(model_date)
    if guess:
        return guess, DATE_FROM_MODEL
    return "", DATE_NONE


def source_excerpt(page_text):
    """The opening lines the agent already has in hand, trimmed to a readable size."""
    text = re.sub(r"\s+", " ", str(page_text or "")).strip()
    if len(text) <= MAX_EXCERPT:
        return text
    cut = text[:MAX_EXCERPT]
    stop = cut.rfind(". ")
    return (cut[:stop + 1] if stop > MAX_EXCERPT * 0.5 else cut.rstrip()) + " […]"
