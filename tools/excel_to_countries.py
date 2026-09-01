#!/usr/bin/env python3
"""Import the comparative workbook into the country records.

    python3 tools/excel_to_countries.py "ressources/CYBER WATCH5_Technical inventory.xlsx"

Reads the workbook through data/field-mapping.json (which field goes where) and
data/excel-cellmap.json (which cell holds it), and produces the layer the country
page renders on top of its hand-written prose:

    data/countries-from-excel.json   the exchange format
    src/reg/nis2/data_excel.js                for the standalone build

Read-only on the workbook - this is the "Excel is the source of truth" direction
agreed for country data, so nothing is ever written back.

Why a layer rather than a replacement: the workbook holds terse values ("Yes",
"Same modalities as in the directives") while the existing records hold written
prose. Overwriting would trade readable context for cell contents. The layer adds
what the workbook alone knows - sanctions, authority detail, the seven typed
fields the record was missing - and leaves the prose alone.
"""

import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    raise SystemExit("pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
MAPPING = ROOT / "data" / "field-mapping.json"
CELLMAP = ROOT / "data" / "excel-cellmap.json"
OUT_JSON = ROOT / "data" / "countries-from-excel.json"
OUT_JS = ROOT / "src" / "reg" / "nis2" / "data_excel.js"

# Values that mean "nothing to say" and should not become a bullet.
EMPTY = {"", "na", "n/a", "n.a.", "tbc", "tbd", "to be confirmed", "-", "--", "-",
         "none", "nc", "n.c.", "n. c.", "non communiqué", "not communicated", "?"}


def _is_empty(text):
    """Consultants write "not known" a dozen ways; normalise before deciding."""
    t = re.sub(r"[\s.]+", " ", text.strip().lower()).strip()
    return t in EMPTY or t.replace(" ", "") in {x.replace(" ", "").replace(".", "") for x in EMPTY}


def clean(value):
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()[:10]
    text = re.sub(r"\s+", " ", str(value)).strip()
    # The site uses a plain hyphen throughout; normalise here rather than in the UI.
    text = text.replace("\u2014", "-").replace("\u2013", "-")
    return "" if _is_empty(text) else text


def as_number(value):
    """Keep typed fields typed: a comparison table stops comparing on '36 months'."""
    text = clean(value)
    m = re.search(r"-?\d+(?:[.,]\d+)?", text.replace(" ", "").replace(" ", ""))
    if not m:
        return None
    num = float(m.group().replace(",", "."))
    return int(num) if num == int(num) else num


NUMERIC = {"maturity", "delayMonths", "reqEE", "reqIE", "complianceEE", "complianceIE",
           "auditFreqEE", "auditFreqIE", "selfAssessFreq", "regDeadlineMonths",
           "authorityCount"}
BOOLEAN = {"transposed"}


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    path = Path(sys.argv[1]).expanduser()
    if not path.exists():
        raise SystemExit("workbook not found: %s" % path)
    if not MAPPING.exists():
        raise SystemExit("run tools/field_mapping.py --json first")

    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    sheets = json.loads(CELLMAP.read_text(encoding="utf-8"))["sheets"]
    wb = openpyxl.load_workbook(path, data_only=True)

    isos = sorted({iso for s in sheets.values() for iso in s["rows"]})
    out = {}
    filled_flat = filled_sec = 0

    for iso in isos:
        flat, sections = {}, {}
        for field in mapping["fields"]:
            sheet = field["sheet"]
            row = sheets[sheet]["rows"].get(iso)
            if row is None or sheet not in wb.sheetnames:
                continue
            raw = wb[sheet]["%s%d" % (field["column"], row)].value
            value = clean(raw)
            if not value:
                continue

            if field["kind"] == "flat":
                key = field["target"]
                if key in NUMERIC:
                    num = as_number(raw)
                    if num is not None:
                        flat[key] = num
                        filled_flat += 1
                elif key in BOOLEAN:
                    flat[key] = value.strip().lower() in ("yes", "oui", "true", "1")
                    filled_flat += 1
                else:
                    flat[key] = value
                    filled_flat += 1
            elif field["kind"] == "section":
                # A bare "Yes" says nothing without its question, so the label
                # travels with the value.
                bullet = "%s : %s" % (field["field"], value)
                sections.setdefault(field["target"], []).append(bullet)
                filled_sec += 1

        if flat or sections:
            out[iso] = {"flat": flat, "sections": sections}

    payload = {"workbook": path.name, "countries": len(out), "records": out}
    OUT_JSON.parent.mkdir(exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_JS.write_text(
        "/* ---- Country data imported from the comparative workbook.\n"
        "   Generated by tools/excel_to_countries.py - do not edit by hand.\n"
        "   The workbook on SharePoint is the source of truth; this is its mirror. ---- */\n"
        "const EXCEL_DATA = %s;\n" % json.dumps(out, ensure_ascii=False, indent=1),
        encoding="utf-8")

    print("%d pays importés" % len(out))
    print("  valeurs typées   : %d" % filled_flat)
    print("  puces de section : %d" % filled_sec)
    per = {}
    for rec in out.values():
        for key in rec["sections"]:
            per[key] = per.get(key, 0) + len(rec["sections"][key])
    print("  par section      : %s" % ", ".join("%s=%d" % kv for kv in sorted(per.items())))
    print("\n-> %s\n-> %s" % (OUT_JSON.relative_to(ROOT), OUT_JS.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
