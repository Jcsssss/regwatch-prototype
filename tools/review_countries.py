#!/usr/bin/env python3
"""Check every country record against the CYBER WATCH inventory.

    python3 tools/review_countries.py            # report
    python3 tools/review_countries.py --apply    # align maturity on the workbook

The workbook is the source of truth for country data, but the records were
written by hand before the import existed. This says, field by field, where the
two disagree - starting with the maturity level, which drives the map colour,
the level chip and the country ordering.

`--apply` rewrites ONLY the maturity level in src/reg/nis2/data_c*.js, because that is
the one field where the workbook is unambiguously authoritative and the record
carries no extra nuance. Every other divergence is reported, never overwritten:
several are cases where the record is richer than the cell, and choosing between
them is a consultant's call.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCEL = ROOT / "data" / "countries-from-excel.json"
RECORDS = ROOT / "data" / "countries.json"

# Fields worth comparing, and whether the workbook wins outright.
COMPARE = [
    ("maturity", "Niveau de maturité", True),
    ("transposed", "Transposé", False),
    ("lawInForce", "Loi en vigueur", False),
    ("delayMonths", "Retard (mois)", False),
    ("fw", "Statut du cadre", False),
    ("reqEE", "Exigences EE", False),
    ("reqIE", "Exigences EI", False),
    ("complianceEE", "Conformité EE (mois)", False),
    ("complianceIE", "Conformité EI (mois)", False),
    ("auditFreqEE", "Fréq. audit EE", False),
    ("auditFreqIE", "Fréq. audit EI", False),
    ("selfAssessFreq", "Fréq. auto-éval.", False),
]

# The workbook stores the framework status as free text; the record as a code.
FW_MAP = {"final": "final", "yes": "final", "temporary": "temporary",
          "temporaire": "temporary", "no": "none", "non": "none", "none": "none"}


def norm(key, value):
    if value is None or value == "":
        return None
    if key == "fw":
        return FW_MAP.get(str(value).strip().lower(), str(value).strip().lower())
    if key == "transposed":
        return bool(value) if isinstance(value, bool) else str(value).strip().lower() in ("yes", "oui", "true", "1")
    if isinstance(value, (int, float)):
        return value
    return str(value).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="align maturity on the workbook")
    args = ap.parse_args()

    excel = json.loads(EXCEL.read_text(encoding="utf-8"))["records"]
    records = json.loads(RECORDS.read_text(encoding="utf-8"))["countries"]

    rows, mat_fix, counts = [], [], {"same": 0, "diff": 0, "missing": 0}
    for c in sorted(records, key=lambda x: x["name"]):
        flat = (excel.get(c["iso"]) or {}).get("flat", {})
        diffs = []
        for key, label, authoritative in COMPARE:
            a, b = norm(key, flat.get(key)), norm(key, c.get(key))
            if a is None:
                counts["missing"] += 1
                continue
            if a == b:
                counts["same"] += 1
                continue
            counts["diff"] += 1
            diffs.append((label, a, b, authoritative))
            if key == "maturity" and authoritative:
                mat_fix.append((c["iso"], c["name"], b, a))
        if diffs:
            rows.append((c["iso"], c["name"], diffs))

    print("=== Niveau de maturité : classeur vs fiche ===\n")
    if not mat_fix:
        print("  toutes les fiches sont alignées sur le classeur.")
    for iso, name, was, now in mat_fix:
        print("  %s %-16s fiche %s  ->  classeur %s" % (iso, name[:16], was, now))

    print("\n=== Autres divergences, par pays ===\n")
    for iso, name, diffs in rows:
        other = [d for d in diffs if d[0] != "Niveau de maturité"]
        if not other:
            continue
        print("  %s %s" % (iso, name))
        for label, a, b, _ in other:
            print("      %-22s classeur %-26s fiche %s" % (label, str(a)[:26], str(b)[:30]))

    print("\n%d valeurs concordantes, %d divergentes, %d absentes du classeur"
          % (counts["same"], counts["diff"], counts["missing"]))

    if args.apply and mat_fix:
        changed = 0
        for part in ("data_c1.js", "data_c2.js", "data_c3.js", "data_c4.js"):
            path = ROOT / "src" / "reg" / "nis2" / part
            text = path.read_text(encoding="utf-8")
            before = text
            for iso, _, was, now in mat_fix:
                # Rewrite maturity only inside that country's own object.
                pattern = re.compile(r'(iso:\s*"%s"[\s\S]{0,600}?maturity:\s*)(\d)' % iso)
                text, n = pattern.subn(lambda m: m.group(1) + str(now), text, count=1)
                changed += n
            if text != before:
                path.write_text(text, encoding="utf-8")
        print("\n%d niveau(x) de maturité alignés sur le classeur." % changed)
        print("Relance: node tools/export_countries.js && zsh src/build.sh")
    elif mat_fix:
        print("\n--apply pour aligner les %d niveaux sur le classeur." % len(mat_fix))
    return 0


if __name__ == "__main__":
    sys.exit(main())
