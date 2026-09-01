#!/usr/bin/env python3
"""Extract the REC transposition workbook into country records.

    python3 tools/rec_to_countries.py "ressources/REC/VF.Suivi transposition REC en Europe.xlsx"

REC (directive (EU) 2022/2557, "resilience of critical entities") is tracked in
its own workbook with its own columns, and this deliberately does not force it
into the NIS 2 shape. The two directives ask different questions: NIS 2 counts
cyber requirements and audit frequencies, REC turns on whether the state has
designated its critical entities and how it made that designation. Sharing a
schema would have meant a dozen empty columns on both sides.

What IS shared is the core every regulation has - identity, maturity, the
national text, authorities, written sections, sources - so the map, the level
chips, the country list and the ordering work unchanged.

Notes on the source, from mapping it:
  - 27 countries (the EU 27; no Norway or UK, REC being an EU directive)
  - the maturity column already uses the same 1-4 scale as NIS 2
  - fill rate is about 62%: identity, maturity, summary and link are complete,
    the authority / registration / alignment columns are between 22% and 41%
  - one date is left as an Excel serial, and columns M-O are used below the
    header row without one, so both are handled explicitly rather than trusted
  - the "Suivi actus" sheet is a stale snapshot (it still has Croatia at
    maturity 1 where the main sheet says 4) and is ignored

Output: data/rec-countries.json, src/reg/rec/data_countries.js
"""

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import openpyxl
except ImportError:
    raise SystemExit("pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
SHEET = "résumé par pays"
BLANK = {"", "nc", "n.c", "n.c.", "na", "n/a", "n.a.", "tbc", "tbd", "aucun information",
         "aucune information", "pas de precision", "-", "--", "?", "non communiqué"}

# The workbook is in French; the rest of RegWatch keys on ISO codes.
ISO = {
    "Allemagne": "DE", "Autriche": "AT", "Belgique": "BE", "Bulgarie": "BG", "Chypre": "CY",
    "Croatie": "HR", "Danemark": "DK", "Espagne": "ES", "Estonie": "EE", "Finlande": "FI",
    "France": "FR", "Grèce": "GR", "Hongrie": "HU", "Irlande": "IE", "Italie": "IT",
    "Lettonie": "LV", "Lituanie": "LT", "Luxembourg": "LU", "Malte": "MT", "Pays-Bas": "NL",
    "Pologne": "PL", "Portugal": "PT", "République tchèque": "CZ", "Roumanie": "RO",
    "Slovaquie": "SK", "Slovénie": "SI", "Suède": "SE",
}

# Columns by header label; the sheet's own wording, trimmed.
COLS = {
    "Pays": "country", "Date entrée en vigueur": "inForce", "Maturité": "maturity",
    "Nom": "lawName", "Résumé": "summary", "Lien": "linkLabel", "Autorité": "authority",
    "Mise en cohérence avec les autres règlementations": "alignment",
    "Enregistrement des entités": "registration", "Avancement": "progress",
    "Dernière MAJ": "lastUpdate", "Criticité": "criticality", "Commentaire": "comment",
}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10]
    text = re.sub(r"\s+", " ", str(value)).strip().replace("—", "-").replace("–", "-")
    return "" if text.lower().strip(" .") in BLANK else text


def as_date(value):
    """A date, or "" - never a guess.

    Three shapes appear in the column: a real datetime, an Excel serial that
    lost its format (Portugal), and free text like "annoncé, 1er août 2025".
    The first two are dates; the third is a statement about a date and is kept
    as a note instead.
    """
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10], ""
    if isinstance(value, (int, float)) and 30000 < value < 60000:
        # Excel's day zero is 1899-12-30 for the 1900 date system.
        return (date(1899, 12, 30).toordinal() + int(value)), ""
    text = clean(value)
    if not text:
        return "", ""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m:
        return m.group(0), ""
    return "", text          # keep the wording, do not invent a date


def serial_to_iso(ordinal):
    return date.fromordinal(ordinal).isoformat()


def split_lines(text):
    """The written columns hold several sentences; the UI renders one per line."""
    if not text:
        return []
    parts = re.split(r"(?<=[.;])\s+(?=[A-ZÀ-ÖØ-Þ0-9«])", text)
    return [p.strip() for p in parts if len(p.strip()) > 2]


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    path = Path(sys.argv[1]).expanduser()
    wb = openpyxl.load_workbook(path, data_only=True)
    # The "Lien" column holds a label; the URL is an Excel hyperlink on the cell,
    # and data_only=True drops hyperlinks. Loading a second time keeps them - all
    # 27 rows carry one, so skipping this would throw away every official link.
    wb_links = openpyxl.load_workbook(path)
    if SHEET not in wb.sheetnames:
        raise SystemExit('feuille "%s" absente (présentes : %s)' % (SHEET, ", ".join(wb.sheetnames)))
    ws = wb[SHEET]
    ws_links = wb_links[SHEET]

    by_label = {}
    for cell in ws[1]:
        label = clean(cell.value)
        if label in COLS:
            by_label[COLS[label]] = cell.column
    missing = [k for k in ("country", "maturity", "summary") if k not in by_label]
    if missing:
        raise SystemExit("colonnes essentielles absentes : %s" % ", ".join(missing))

    # The NIS 2 records already carry flag, region and English name for the same
    # countries; reusing them keeps one country spelled one way across modules.
    nis = {c["iso"]: c for c in
           json.loads((ROOT / "data" / "countries.json").read_text(encoding="utf-8"))["countries"]}

    records, report = [], {"rows": 0, "unknown": [], "dateNotes": 0, "extras": 0}
    for row in ws.iter_rows(min_row=2):
        name_fr = clean(row[by_label["country"] - 1].value)
        if not name_fr:
            continue
        report["rows"] += 1
        iso = ISO.get(name_fr)
        if not iso:
            report["unknown"].append(name_fr)
            continue

        get = lambda key: clean(row[by_label[key] - 1].value) if key in by_label else ""
        def link(key):
            if key not in by_label:
                return ""
            cell = ws_links.cell(row=row[0].row, column=by_label[key])
            return cell.hyperlink.target if cell.hyperlink else ""
        raw = lambda key: row[by_label[key] - 1].value if key in by_label else None

        in_force, in_force_note = as_date(raw("inForce"))
        if isinstance(in_force, int):
            in_force = serial_to_iso(in_force)
        if in_force_note:
            report["dateNotes"] += 1
        last_update, _ = as_date(raw("lastUpdate"))
        if isinstance(last_update, int):
            last_update = serial_to_iso(last_update)

        base = nis.get(iso, {})
        maturity = raw("maturity")
        maturity = int(maturity) if isinstance(maturity, (int, float)) else None

        # Columns M and beyond carry links and notes without a header. They are
        # kept, labelled as unstructured, rather than dropped or guessed at.
        extras = []
        for cell in row[max(by_label.values()):]:
            v = clean(cell.value)
            if v:
                extras.append(v)
        report["extras"] += len(extras)

        sections = {}
        for key, label in (("registration", "reg"), ("alignment", "other"), ("progress", "prog")):
            lines = split_lines(get(key))
            if lines:
                sections[label] = sections.get(label, []) + lines

        records.append({
            # ---- the core every regulation shares ----
            "iso": iso,
            "name": base.get("name", name_fr),
            "nameFr": name_fr,
            "flag": base.get("flag", ""),
            "region": base.get("region", ""),
            "eu": True,
            "maturity": maturity,
            "lastUpdate": last_update or "",
            "summary": get("summary"),
            "transposed": bool(in_force),
            "lawInForce": in_force,
            "law": get("lawName"),
            "authorities": ([{"name": get("authority").split("=")[0].strip(),
                              "role": get("authority")}] if get("authority") else []),
            "sections": sections,
            # A key, not a sentence: the interface is bilingual and this line is
            # generated, so it must not arrive already written in one language.
            "timeline": ([{"date": in_force, "textKey": "tl.recInForce"}] if in_force else []),
            # `name` and `url`, the shape the source registry renders. A label
            # with no URL is not a source, so it is left out rather than shown
            # as a dead link.
            "sources": ([{"name": get("linkLabel") or "Texte national",
                          "url": link("linkLabel"), "type": "official"}]
                        if link("linkLabel") else []),
            # ---- what is specific to REC ----
            "rec": {
                "progress": get("progress"),
                "criticality": get("criticality"),
                "registration": get("registration"),
                "alignment": get("alignment"),
                "inForceNote": in_force_note,
                "comment": get("comment"),
                "unstructured": extras,
            },
        })

    records.sort(key=lambda r: r["name"])
    payload = {"regulation": "rec", "workbook": path.name,
               "generated": date.today().isoformat(), "countries": records}
    (ROOT / "data" / "rec-countries.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    out = ROOT / "src" / "reg" / "rec"
    out.mkdir(parents=True, exist_ok=True)
    (out / "data_countries.js").write_text(
        "/* ---- REC country records, from the transposition workbook.\n"
        "   Generated by tools/rec_to_countries.py - do not edit by hand.\n"
        "   Shares the core fields with NIS 2 (identity, maturity, law, sections)\n"
        "   and keeps what is specific to REC under `rec`. ---- */\n"
        "const REC_COUNTRIES = %s;\n"
        % json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")

    filled = lambda key: sum(1 for r in records if r["rec"].get(key) or r.get(key))
    print("%d pays extraits sur %d lignes" % (len(records), report["rows"]))
    if report["unknown"]:
        print("  pays non reconnus : %s" % ", ".join(report["unknown"]))
    print("  transposés (date)  : %d" % sum(1 for r in records if r["lawInForce"]))
    print("  nom de la loi      : %d" % sum(1 for r in records if r["law"]))
    print("  autorité           : %d" % sum(1 for r in records if r["authorities"]))
    print("  criticité          : %d" % filled("criticality"))
    print("  enregistrement     : %d" % filled("registration"))
    print("  cohérence          : %d" % filled("alignment"))
    print("  dates en texte     : %d (conservées comme note, pas converties)" % report["dateNotes"])
    print("  liens officiels    : %d" % sum(1 for r in records if r["sources"]))
    print("  cellules hors en-tête récupérées : %d" % report["extras"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
