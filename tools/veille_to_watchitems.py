#!/usr/bin/env python3
"""Convert the NIS 2 watch agent's Excel output into RegWatch WatchItems.

Source  : agent_veille_NIS2.xlsx / table `tblVeille`
          (github.com/aurelienbrun-alt/Agent_mapping - "agent de veille")
Targets : data/watch-items.json  - the exchange contract, for a hosted RegWatch
          src/reg/nis2/data_watch.js      - `const WATCH_QUEUE = [...]`, for the standalone build

Stdlib only: the workbook is read straight from the OOXML zip, so this runs on any
Python 3 without openpyxl and without touching the agent's repository.

    python3 tools/veille_to_watchitems.py <path/to/agent_veille_NIS2.xlsx>
"""

import json
import codecs
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, timedelta
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
WATCH_TABLE = "tblVeille"
EXCEL_EPOCH = date(1899, 12, 30)  # Excel's day 0, with the 1900 leap-year bug baked in

ROOT = Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------- #
# Which cells of the comparative workbook a source would change.
#
# A validator's real question is "which cells do I edit?", not "what should a
# client do?". This router answers it deterministically: theme keywords -> a
# short list of field labels, resolved to real cell references through
# data/excel-cellmap.json (country -> row, field -> column).
#
# Deliberately rule-based for now. Once the agent runs against RegWatch, the
# model picks from the SAME catalogue of field labels and the code still
# resolves the addresses - so a model can never invent a cell reference.
# --------------------------------------------------------------------------- #
# The routes below are written in French and English. The sources are not: a
# Czech page never says "sanction", a German one never says "référentiel". The
# terms in tools/theme_terms.py are folded in at load time so the pattern stays
# readable here and the vocabulary stays editable there.
try:
    from theme_terms import terms_for as _terms_for
except ImportError:                                    # pragma: no cover
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from theme_terms import terms_for as _terms_for
    except ImportError:
        def _terms_for(_sheet):
            return []


def _widen(pattern, sheet_name):
    """Add the source-language terms for this sheet, and anchor the left edge.

    The terms are stems on purpose - "enregistr" has to catch "enregistrement",
    "registrace" and "registrácia" at once - so the right edge stays open. The
    left edge must not: without it "fine" matched inside "define" and filed an
    article about defining national strategies under Sanctions. One-sided is the
    correct amount of strictness here, not a compromise.
    """
    words = [re.escape(w) for w in _terms_for(sheet_name)]
    body = pattern + ("|" + "|".join(words) if words else "")
    return r"(?<!\w)(?:%s)" % body


CELL_ROUTES = [
    (r"enregistr|registration|inscri|immatricul|déclaration des entités",
     "Registration - P1",
     ["Registration availability", "Authority in charge of registration",
      "Registration deadline", "Method of registration"]),
    (r"incident|notification|signalement|déclaration d'incident|reporting",
     "Incident reporting - P1",
     ["Organism official name to report incident", "Method for incident reporting",
      "Date of incident reporting becoming mandatory", "Name and link of web platform"]),
    (r"sanction|amende|pénalit|astreinte|fine",
     "Sanctions - P2",
     ["Financial sanctions", "Types of additional penalties",
      "Addition of penalties not included in the directive"]),
    (r"audit|contrôle|inspection|certification|supervis|vigilance",
     "Audit & Controls - P1",
     ["Audit explicitly planned by the transposition", "Organism in charge of the audit",
      "Framework used during audit"]),
    (r"référentiel|framework|exigence|norme|standard|mesures de sécurité|guide",
     "Cybersecurity frameworks - P1",
     ["Name and link of framework", "Framework last publication date",
      "Dedicated framework to NIS 2", "Number of cyber requirements for EE"]),
    (r"autorité|authority|agence|désignation|point de contact|ANSSI|BSI|NÚKIB|ACN",
     "Authority - P3",
     ["Consolidated list of authorities", "Number of  authorities involved in NIS2"]),
    (r"loi|décret|transposition|journal officiel|entrée en vigueur|arrêté|règlement|ordonnance|publi",
     "ID - P1",
     ["Entry into force of the transposition", "Transposition finalized",
      "Name of principal transposition text", "Additional texts (in support of principal text)"]),
]
MAX_TARGET_CELLS = 6



# --------------------------------------------------------------------------- #
# Rows written before the agent learned to tell an article from an index.
#
# The agent now refuses to file a listing page, but it only re-examines a page
# when that page changes - so the rows already in tblVeille stay. Rather than
# leave a third of the queue pointing at FAQ categories and authority home
# pages, the same URL test is applied on the way out.
#
# URL only, no refetch: the shapes below are unambiguous, and a converter that
# needed the network would stop being runnable offline.
# --------------------------------------------------------------------------- #
INDEX_URL = re.compile(
    r"/(category|categories|policies|policy|topics?|tags?|search|index)(/|$)"
    r"|/(news|actualites|aktuelles|nieuws|home)/?$"
    r"|/portale/home|/web/[a-z-]+/?$", re.I)


def is_index_url(url):
    return bool(INDEX_URL.search(url or ""))


def load_excerpts():
    """Opening lines of each article, fetched by tools/fetch_excerpts.py.

    A validator should read the source's own words before trusting a generated
    summary, so the card leads with this. Missing entries fall back to the AI
    summary at render time.
    """
    path = ROOT / "data" / "excerpt-cache.json"
    if not path.exists():
        return {}
    cache = json.loads(path.read_text(encoding="utf-8"))
    return {url: v["text"] for url, v in cache.items() if v.get("ok") and v.get("text")}


# Below this, a "body" is a stub, a language switcher or a consent page rather
# than an article. Measured: real bodies run to 2 500 characters and beyond,
# while the failures came back at 20, 110 and 278.
MIN_BODY = 500


def load_bodies():
    """Full article text, for routing only - never shown to a reader.

    Separate from load_excerpts() because the two are trusted differently: the
    excerpt is displayed and must be the source's own opening lines, the body is
    only ever matched against keywords.
    """
    path = ROOT / "data" / "excerpt-cache.json"
    if not path.exists():
        return {}
    cache = json.loads(path.read_text(encoding="utf-8"))
    return {url: v["body"] for url, v in cache.items()
            if v.get("ok") and len(v.get("body") or "") >= MIN_BODY}


def load_translations():
    """Translations from agent-veille/translate_items.py, keyed by source text.

    Two shapes are accepted: {text: "english"} written by the first version, and
    {text: {"en": ..., "fr": ...}} written since excerpts needed both languages.
    A missing entry simply falls back to the original.
    """
    path = ROOT / "data" / "translations-cache.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {k: ({"en": v} if isinstance(v, str) else v) for k, v in raw.items()}


def translated(trans, text, lang):
    return (trans.get((text or "").strip()) or {}).get(lang, "")


TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")
REPR_HEAD = re.compile(r"^\s*[\(\[]\s*['\"]")
REPR_SPLIT = re.compile(r"['\"]\s*,\s*['\"]")

try:
    from ftfy import fix_text as _fix_text
except ImportError:                                   # pragma: no cover
    def _fix_text(text):
        """Without ftfy the text passes through unrepaired rather than mangled.

        `pip install ftfy` to get the mojibake repair; the rest still works.
        """
        return text


def _unwrap_repr(text):
    """Pull the text out of a Python repr the agent stored instead of a string.

    Six excerpts arrived as `('title', 'body …')` and four of those were cut
    mid-string, so ast.literal_eval refuses them outright. Splitting on the
    quote-comma-quote boundary and keeping the longest piece survives the
    truncation, which literal_eval never will.
    """
    if not REPR_HEAD.match(text or ""):
        return text
    body = text.strip().lstrip("([").strip()
    pieces = REPR_SPLIT.split(body)
    return max(pieces, key=len).strip().strip("'\"").rstrip(")]").strip("'\" ")


def _unescape(text):
    """Escape sequences that arrived as literal characters.

    A repr writes a non-breaking space as the four characters \\xa0; once the
    repr is unwrapped those are still text, and decoding them is what turns the
    bytes back into the mojibake that can then be repaired.
    """
    if "\\x" not in text and "\\u" not in text:
        return text
    try:
        return codecs.decode(text, "unicode_escape")
    except Exception:                                 # noqa: BLE001
        return text


def plain_excerpt(text):
    """The source's opening lines, as readable text.

    Four layers of upstream damage, undone in the order they were applied.
    Titles and summaries are clean - the agent writes those itself - so this is
    only ever about the raw `Extrait source` column and the fetch cache.

      1. a repr of a tuple, often truncated mid-string
      2. escape sequences that arrived as literal characters
      3. mojibake: UTF-8 decoded as cp1252, which is why every non-French,
         non-English excerpt read as gibberish
      4. HTML: Google News wraps the excerpt in an anchor, and the card escapes
         what it renders, so the markup showed up literally
    """
    if not text:
        return ""
    text = _fix_text(_unescape(_unwrap_repr(text)))
    return WS.sub(" ", TAG.sub(" ", text)).strip()



def load_dates():
    """Dates re-resolved from the live pages by agent-veille/refresh_dates.py.

    Rows written before the agent stopped inventing dates keep whatever it
    asserted then. This cache overrides them - and clears a date it cannot
    establish rather than leaving a false one on screen.
    """
    path = ROOT / "data" / "date-cache.json"
    if not path.exists():
        return {}
    return {u: v for u, v in json.loads(path.read_text(encoding="utf-8")).items()
            if v.get("ok")}


def load_cellmap():
    path = ROOT / "data" / "excel-cellmap.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))["sheets"]


# A sentence ends at . ! ? or a newline, but not inside an abbreviation or a
# number. Good enough for quoting: a sentence cut one clause early is still the
# source's own words, which a paraphrase never is.
SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9«\"])")
MAX_VERBATIM = 4
MIN_SENTENCE = 40
MAX_SENTENCE = 320


def verbatim_for(body, sheets):
    """The sentences that actually triggered each routed theme.

    Until now the card showed the article's opening lines - a headline, usually
    - while the router had decided the item was about sanctions on the strength
    of a paragraph further down. More than half the time the displayed text did
    not mention the theme it was filed under. This quotes the sentence that did.

    Only the source's own words, never a summary: a validator checking a
    regulatory text has to read what was published.
    """
    if not body or not sheets:
        return []
    sentences = [x.strip() for x in SENTENCE.split(body)]
    sentences = [x for x in sentences if MIN_SENTENCE <= len(x) <= MAX_SENTENCE]
    out, seen = [], set()
    for pattern, sheet, _labels in CELL_ROUTES:
        if sheet not in sheets:
            continue
        rx = re.compile(pattern, re.I)
        # Prefer the sentence carrying the most of the theme's vocabulary. The
        # first match is usually the article's definitional opening, which is
        # true, generic, and tells a validator nothing.
        best = None
        for sentence in sentences:
            hits = rx.findall(sentence)
            if not hits or sentence in seen:
                continue
            if best is None or len(hits) > best[0]:
                best = (len(hits), sentence, rx.search(sentence).group(0))
        if best:
            seen.add(best[1])
            out.append({"sheet": sheet, "term": best[2], "text": best[1]})
        if len(out) >= MAX_VERBATIM:
            break
    return out


def target_cells(cellmap, iso, *texts):
    """Resolve the workbook cells a source most likely affects, for one country.

    Fed the agent's own analysis AND the article body, united rather than
    swapped. Measured on sixteen live pages, routing on the body alone gains 13
    themes and loses 22: some pages yield a language switcher instead of an
    article, and the keyword list is French and English while the sources are
    Czech, German, Dutch. The agent's summary is doing translation work, which
    is exactly why it must stay in the mix.

    United, the body can only add. A theme added wrongly is visible to the
    validator and dismissed in a second; a theme never raised is invisible.
    """
    if not cellmap or iso == "EU":
        return []
    blob = " ".join(t for t in texts if t).lower()
    out = []
    for pattern, sheet_name, labels in CELL_ROUTES:
        if not re.search(pattern, blob, re.I):
            continue
        sheet = cellmap.get(sheet_name)
        if not sheet:
            continue
        row = sheet["rows"].get(iso)
        if not row:
            continue
        by_label = {f["label"].strip(): f for f in sheet["fields"]}
        for label in labels:
            field = by_label.get(label.strip())
            if not field or not field["writable"]:
                continue
            out.append({
                "sheet": sheet_name,
                "field": field["label"].strip(),
                "cell": "%s%d" % (field["column"], row),
            })
            if len(out) >= MAX_TARGET_CELLS:
                return out
    return out

# tblVeille writes country names as free French text; RegWatch keys on ISO codes.
COUNTRY_ISO = {
    "allemagne": "DE", "autriche": "AT", "belgique": "BE", "bulgarie": "BG",
    "chypre": "CY", "croatie": "HR", "danemark": "DK", "espagne": "ES",
    "estonie": "EE", "finlande": "FI", "france": "FR", "grece": "GR",
    "hongrie": "HU", "irlande": "IE", "italie": "IT", "lettonie": "LV",
    "lituanie": "LT", "luxembourg": "LU", "malte": "MT", "norvege": "NO",
    "pays-bas": "NL", "pologne": "PL", "portugal": "PT", "republique tcheque": "CZ",
    "tchequie": "CZ", "roumanie": "RO", "royaume-uni": "GB", "slovaquie": "SK",
    "slovenie": "SI", "suede": "SE",
    # EU-wide items have no country record in RegWatch - see REPORT below.
    "union europeenne": "EU", "ue": "EU", "europe": "EU", "eu": "EU",
}

# `Fiabilité source` -> the source.type vocabulary the Watch inbox renders.
RELIABILITY_TYPE = {
    "officielle": "official",
    "presse (agregateur) - a verifier": "unofficial",
}

# `Statut` -> RegWatch status. The agent always writes "À valider"; "À traiter"
# only appears on the workbook's hand-seeded rows.
STATUS_MAP = {"a valider": "pending", "a traiter": "pending"}


CELL_ROUTES = [(_widen(pattern, sheet), sheet, labels)
               for pattern, sheet, labels in CELL_ROUTES]


def fold(value):
    """Lowercase and strip accents, so 'Républe tchèque' and 'Republique tcheque' match."""
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def col_index(ref):
    letters = re.match(r"([A-Z]+)", ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def cell_value(cell):
    inline = cell.find(NS + "is")
    if inline is not None:
        return "".join(t.text or "" for t in inline.iter(NS + "t"))
    v = cell.find(NS + "v")
    return v.text if v is not None else ""


def read_table(xlsx_path, table_name):
    """Yield the table's rows as dicts, keyed by header label."""
    with zipfile.ZipFile(xlsx_path) as z:
        sheet_target = None
        for name in z.namelist():
            if "/tables/" in name:
                xml = z.read(name).decode("utf-8")
                if re.search(r'displayName="%s"' % table_name, xml):
                    # xl/tables/tableN.xml is related to exactly one worksheet
                    sheet_target = table_name
                    break
        if sheet_target is None:
            raise SystemExit("table %s not found in %s" % (table_name, xlsx_path))

        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(NS + "t"))
                      for si in root.findall(NS + "si")]

        for name in sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet")):
            root = ET.fromstring(z.read(name))
            rows = list(root.iter(NS + "row"))
            if not rows:
                continue

            def val(c):
                raw = cell_value(c)
                if c.get("t") == "s" and shared and raw.isdigit():
                    return shared[int(raw)]
                return raw

            headers = {col_index(c.get("r")): val(c) for c in rows[0]}
            if "Titre" not in headers.values():
                continue
            for row in rows[1:]:
                record = {h: "" for h in headers.values()}
                for c in row:
                    header = headers.get(col_index(c.get("r")))
                    if header:
                        record[header] = val(c)
                if any(str(v).strip() for v in record.values()):
                    yield record
            return


def to_iso_date(value):
    """tblVeille mixes ISO strings (agent-written) with Excel serials (seeded rows)."""
    text = str(value or "").strip()
    if not text:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}[T ].*", text):
        return text[:10]
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return (EXCEL_EPOCH + timedelta(days=int(float(text)))).isoformat()
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", text)
    if m:
        return "%s-%s-%s" % (m.group(3), m.group(2), m.group(1))
    return ""


def split_countries(value):
    """'France; Union Européenne' -> ['FR', 'EU']; unknown labels are reported, not dropped."""
    parts = [p for p in re.split(r"[;,/]| et ", str(value or "")) if p.strip()]
    codes, unknown = [], []
    for part in parts:
        code = COUNTRY_ISO.get(fold(part))
        if code:
            if code not in codes:
                codes.append(code)
        else:
            unknown.append(part.strip())
    return codes, unknown


def plain_dashes(text):
    """Em and en dashes render as long strokes and read badly in a link preview;
    the site uses a plain hyphen throughout, so normalise at the boundary rather
    than hunting them in the UI afterwards."""
    return str(text or "").replace("\u2014", "-").replace("\u2013", "-")


def first(record, *headers):
    for h in headers:
        v = str(record.get(h, "") or "").strip()
        if v:
            return plain_dashes(v)
    return ""


def build_items(rows):
    items, report = [], {"unmapped_countries": {}, "no_country": 0, "eu_wide": 0, "with_cells": 0, "index_pages": 0, "index_urls": {}}
    cellmap = load_cellmap()
    excerpts = load_excerpts()
    bodies = load_bodies()
    trans = load_translations()
    dates = load_dates()
    if not trans:
        print("  note: data/translations-cache.json absent - pas de titres anglais "
              "(lance tools/translate_items.py)")
    if not excerpts:
        print("  note: data/excerpt-cache.json absent - pas d'extraits d'article "
              "(lance tools/fetch_excerpts.py)")
    if cellmap is None:
        print("  note: data/excel-cellmap.json absent - no target cells "
              "(run tools/excel_cellmap.py first)")

    for record in rows:
        title = first(record, "Titre")
        if not title:
            continue

        # A listing page is not a publication; keep it out of the queue.
        page_kind = first(record, "Type de page")
        url = first(record, "URL source")
        probed = dates.get(url) or {}
        if not page_kind and probed.get("kind"):
            page_kind = probed["kind"]
        if page_kind == "index" or (not page_kind and is_index_url(url)):
            report["index_pages"] += 1
            report["index_urls"][url] = report["index_urls"].get(url, 0) + 1
            continue

        # Tier 1 : l'agent patché écrit une colonne ISO. On la préfère à la table
        # de correspondance locale, qui n'est plus qu'un repli pour les lignes
        # écrites avant le patch.
        iso_col = first(record, "ISO")
        if iso_col:
            codes = [c.strip().upper() for c in iso_col.split(";") if c.strip()]
            unknown = []
        else:
            codes, unknown = split_countries(record.get("Pays / Zone"))
        for label in unknown:
            report["unmapped_countries"][label] = report["unmapped_countries"].get(label, 0) + 1
        if not codes:
            report["no_country"] += 1
            continue

        base_id = first(record, "ID") or "veille-" + str(abs(hash(title)))[:10]
        detected = to_iso_date(record.get("Date détection")) or date.today().isoformat()
        reliability = fold(record.get("Fiabilité source"))
        source_type = RELIABILITY_TYPE.get(reliability, "unofficial")
        score = first(record, "Score pertinence IA")

        for code in codes:
            if code == "EU":
                report["eu_wide"] += 1
            item = {
                # --- fields the Watch inbox already renders ---
                "id": base_id if len(codes) == 1 else "%s-%s" % (base_id, code),
                "detected": detected,
                "iso": code,
                "title": title,
                # The source's own opening lines. The patched agent stores them
                # directly; the re-fetch cache is only a fallback for rows written
                # before the patch.
                "excerpt": plain_excerpt(first(record, "Extrait source")
                                         or excerpts.get(first(record, "URL source"), "")),
                # The agent's written synthesis - shown inside the AI panel.
                "summary": first(record, "Résumé") or "No summary provided by the agent.",
                # English renderings; the UI picks by interface language.
                "titleEn": translated(trans, title, "en"),
                "summaryEn": translated(trans, first(record, "Résumé"), "en"),
                # The excerpt arrives in the source's language, so it carries a
                # rendering for each interface language; the original stays in
                # `excerpt` for a validator who needs the published wording.
                "excerptEn": translated(trans, plain_excerpt(
                    first(record, "Extrait source") or excerpts.get(first(record, "URL source"), "")), "en"),
                "excerptFr": translated(trans, plain_excerpt(
                    first(record, "Extrait source") or excerpts.get(first(record, "URL source"), "")), "fr"),
                "source": {
                    "name": first(record, "Autorité émettrice", "Source d'origine") or "Watch agent",
                    "url": first(record, "URL source"),
                    "type": source_type,
                },
                "status": STATUS_MAP.get(fold(record.get("Statut")), "pending"),
                # Advice aimed at a client company - kept, but it is NOT what the
                # validator acts on; `targetCells` is.
                "clientAdvice": first(record, "Actions recommandées"),
                # --- agent context, surfaced to the validator as decision support ---
                "agent": {
                    "score": int(score) if score.isdigit() else None,
                    "justification": first(record, "Raison pertinence IA ", "Raison pertinence IA"),
                    "obligations": first(record, "Obligations principales"),
                    "impact": first(record, "Niveau impact", "Score impact"),
                    "entities": first(record, "Entités concernées"),
                    # A date re-read from the live page beats one the agent asserted
                    # before it could read pages; an unestablished date is left empty.
                    "publishedOn": (probed.get("date") if probed
                                    else to_iso_date(record.get("Date publication"))),
                    # flux | page | ia | inconnue - dit si la date est un fait ou une inférence
                    "dateOrigin": (probed.get("origin") if probed
                                   else first(record, "Origine date")),
                    "inForceOn": to_iso_date(record.get("Date entrée en vigueur")),
                    "textType": first(record, "Type de texte"),
                },
            }
            _body = bodies.get(first(record, "URL source"), "")
            item["targetCells"] = target_cells(
                cellmap, code, title, item["summary"], item["agent"]["textType"],
                item["agent"]["obligations"], _body)
            # The sentences that triggered the routing, quoted from the source.
            item["verbatim"] = verbatim_for(
                _body, {c["sheet"] for c in item["targetCells"]})
            if item["targetCells"]:
                report["with_cells"] += 1
            items.append(item)

    # An objective reliability score, computed here so it is regenerated with
    # everything else rather than patched on afterwards. The agent's own score
    # returns 8 or 9 for 84% of items and sorts nothing; this one is built from
    # facts a validator can check - see tools/reliability.py.
    # Aliased on import: this module has its own load_bodies(), and a bare
    # `from reliability import load_bodies` would shadow it as a local for the
    # whole function - including the call made further up.
    try:
        from reliability import find_duplicates as _find_dupes
        from reliability import load_bodies as _rel_bodies
        from reliability import score_item as _score_item
    except ImportError:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).resolve().parent))
        try:
            from reliability import find_duplicates as _find_dupes
            from reliability import load_bodies as _rel_bodies
            from reliability import score_item as _score_item
        except ImportError:
            _find_dupes = None
    if _find_dupes:
        _bodies = _rel_bodies()
        _dupes = _find_dupes(items)
        for _it in items:
            _it["reliability"] = _score_item(_it, _bodies, _dupes.get(_it["id"]))
        report["duplicates"] = len(_dupes)
        report["lowTrust"] = sum(1 for i in items if i["reliability"]["score"] < 30)

    items.sort(key=lambda i: (i["detected"], i["id"]), reverse=True)
    return items, report


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    xlsx = Path(sys.argv[1]).expanduser()
    if not xlsx.exists():
        raise SystemExit("workbook not found: %s" % xlsx)

    items, report = build_items(read_table(xlsx, WATCH_TABLE))

    json_path = ROOT / "data" / "watch-items.json"
    json_path.parent.mkdir(exist_ok=True)
    payload = {
        "generatedOn": date.today().isoformat(),
        "source": "agent de veille NIS2 - tblVeille",
        "count": len(items),
        "items": items,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    js_path = ROOT / "src" / "reg" / "nis2" / "data_watch.js"
    js_path.write_text(
        "/* ---- Watch queue - generated from the NIS 2 watch agent (tblVeille).\n"
        "   Regenerate: python3 tools/veille_to_watchitems.py <agent_veille_NIS2.xlsx>\n"
        "   Picked up by build.sh when present; app_part1.js falls back to the\n"
        "   demo WATCH_QUEUE in data_c4.js when it is not. Do not edit by hand. ---- */\n"
        "const WATCH_QUEUE_AGENT = %s;\n" % json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("%d watch items -> %s" % (len(items), json_path.relative_to(ROOT)))
    print("%d watch items -> %s" % (len(items), js_path.relative_to(ROOT)))
    print("  %d item(s) carry target cells in the comparative workbook" % report["with_cells"])
    if report["index_pages"]:
        print("  %d ligne(s) écartées : page d'index, pas une publication"
              % report["index_pages"])
        for u, n in sorted(report["index_urls"].items(), key=lambda kv: -kv[1])[:8]:
            print("      %3dx %s" % (n, u[:74]))
    if report["eu_wide"]:
        print("  note: %d EU-wide item(s) carry iso 'EU' - RegWatch has no EU record yet"
              % report["eu_wide"])
    if report["no_country"]:
        print("  dropped: %d row(s) with no recognisable country" % report["no_country"])
    for label, n in sorted(report["unmapped_countries"].items(), key=lambda kv: -kv[1]):
        print("  unmapped country label: %r (%dx)" % (label, n))


if __name__ == "__main__":
    main()
