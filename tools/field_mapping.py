#!/usr/bin/env python3
"""Map the comparative workbook's 136 fields onto the country record.

    python3 tools/field_mapping.py            # coverage report
    python3 tools/field_mapping.py --json     # write data/field-mapping.json

This is the piece the Excel -> tool sync depends on. The workbook holds 136
fields per country across 7 sheets; the country record exposes ~25 flat fields
and 7 prose sections. Wiring a sync before knowing which is which would import
into the void, so the mapping is declared here, explicitly, and the script
reports what is left uncovered rather than pretending the job is done.

Three kinds of target:

  flat    a typed field on the record (dates, counts, months) — sortable,
          filterable, chartable. This is where a KPI can come from.
  section a bullet inside one of the record's prose sections — readable context.
  none    deliberately not surfaced (working notes, split EE/IE duplicates,
          columns superseded by another).

A field mapped to `flat` must stay typed end to end: writing "36 months (EE)"
into a numeric field is how a comparison table stops being comparable.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CELLMAP = ROOT / "data" / "excel-cellmap.json"
OUT = ROOT / "data" / "field-mapping.json"

# workbook field label -> (target kind, record key)
#   ("flat", "reqEE")      a typed field
#   ("section", "fw")      a bullet in that section
#   ("none", "reason")     deliberately not surfaced
MAPPING = {
    "ID - P1": {
        "Maturity Level": ("flat", "maturity"),
        "Entry into force of the transposition": ("flat", "lawInForce"),
        "Transposition finalized": ("flat", "transposed"),
        "Transposition (semester)": ("none", "derivable from lawInForce"),
        "Transposition (year)": ("none", "derivable from lawInForce"),
        "Exceeded time from EU deadline (month)": ("flat", "delayMonths"),
        "Type of document for principal transposition text": ("section", "fw"),
        "Name of principal transposition text ": ("flat", "law"),
        "Additional texts (in support of principal text)": ("section", "fw"),
    },
    "Cybersecurity frameworks - P1": {
        "Cybersecurity framework directives published": ("flat", "fw"),
        "Dedicated framework to NIS 2": ("section", "fw"),
        "Name and link of framework": ("flat", "fwName"),
        "Framework last publication date": ("section", "fw"),
        "Classification of IS": ("section", "fw"),
        "Rules of classification": ("section", "fw"),
        "Number of cyber themes for EE": ("section", "fw"),
        "Number of cyber themes for EI ": ("section", "fw"),
        "Number of cyber requirements for EE": ("flat", "reqEE"),
        "Number of cyber requirements for EI": ("flat", "reqIE"),
        "Does it rely on other frameworks?": ("section", "fw"),
        "Existence of a presumption of compliance": ("section", "fw"),
        "Reasons and sectors of presumption ": ("section", "fw"),
        "Compliance deadline to framework from effective date for EE (months)": ("flat", "complianceEE"),
        "Compliance deadline to framework from effective date for EI (months)": ("flat", "complianceIE"),
        "Gradual compliance to reach target level": ("section", "fw"),
        "Level of compliance to reach for EE": ("section", "fw"),
        "Level of compliance to reach for EI": ("section", "fw"),
        "List of compliance levels": ("section", "fw"),
        "Other national regulatory framework ": ("section", "other"),
        "Name of national regulatory frameworks": ("section", "other"),
        "Other national guidance / standards ": ("section", "other"),
        "Name of other national guidance / standards ": ("section", "other"),
    },
    "Registration - P1": {
        "Registration availability ": ("section", "reg"),
        "Authority in charge of registration": ("flat", "regAuthority"),
        "Types of registration": ("section", "reg"),
        "Registration deadline": ("flat", "regDeadline"),
        "Method of registration": ("flat", "regTool"),
        "Deadline of registration (months)": ("flat", "regDeadlineMonths"),
        "Deadline to submit new information (months)": ("section", "reg"),
        "Date of reference for registration deadline": ("section", "reg"),
        "Notification from the authority of the eligibility": ("section", "reg"),
        "Tools for self assessment": ("section", "reg"),
        "Specific law requirements": ("section", "reg"),
        "Contract with providers of cyber services (third party)": ("section", "reg"),
    },
    "Incident reporting - P1": {
        "Organism type to report incident2 NOUVELLE COLONNE": ("section", "inc"),
        "Organism official name to report incident": ("flat", "incidentAuthority"),
        "Date of incident reporting becoming mandatory": ("flat", "incidentMandatoryFrom"),
        "Method for incident reporting": ("flat", "incidentMethod"),
        "Name and link of web platform": ("section", "inc"),
        "Mandatory information required": ("section", "inc"),
        "Major incident definition in the transposition": ("section", "inc"),
        "Size thresholds / criteria to consider an incident as major": ("section", "inc"),
        "Timeline": ("section", "inc"),
        "Any other relavant comments ": ("section", "inc"),
        "Organism type to report incident  ANCIENNE COLONNE": ("none", "superseded by the NOUVELLE COLONNE"),
    },
    "Audit & Controls - P1": {
        "Audit explicitly planned by the transposition": ("section", "aud"),
        "Organism in charge of the audit": ("flat", "auditBody"),
        "Typology of auditor(s)": ("section", "aud"),
        "Detailed - Organism in charge of the audit": ("section", "aud"),
        "Audit billing model": ("section", "aud"),
        "Audit to be conducted by entity (self-assessment)": ("section", "aud"),
        "First deadline for self-assessment": ("section", "aud"),
        "Frequency for next self-assessments (months)": ("flat", "selfAssessFreq"),
        "First audit deadline expected for EE (from effective date, months)": ("section", "aud"),
        "Frequency for next audits for EE (from first audit deadline, months)": ("flat", "auditFreqEE"),
        "First audit deadline expected for EI (from effective date, months)": ("section", "aud"),
        "Frequency for next audits for IE (from first audit deadline, months)": ("flat", "auditFreqIE"),
        "Framework used during audit": ("section", "aud"),
        "Evidence requested during audit": ("section", "aud"),
        "Certification requested during audit": ("section", "aud"),
        "Audit format and deliverable": ("section", "aud"),
        "Criteria for externals auditors / accreditation for auditors": ("section", "aud"),
        "Reason of unexpected audit  ": ("section", "aud"),
    },
    "Sanctions - P2": {
        "Compliance with the sanctions set out in the Directive": ("section", "sanctions"),
        "Financial sanctions ": ("flat", "sanctionMax"),
        "Ban on practicing for legal representative": ("section", "sanctions"),
        "Suspension of cyber certification ": ("section", "sanctions"),
        "Addition of penalties not included in the directive": ("section", "sanctions"),
        "Types of additional penalties": ("section", "sanctions"),
        "Reccuring or temporary  financial sanctions": ("section", "sanctions"),
        "Individual financial sanction": ("section", "sanctions"),
        "Individual banishment sanction": ("section", "sanctions"),
        "Recidivism aggravating factors": ("section", "sanctions"),
        "Public injunction": ("section", "sanctions"),
        "Withdrawal of certifications": ("section", "sanctions"),
        "Suspension of all or part of the entity's activities": ("section", "sanctions"),
        "Corrective control measures ": ("section", "sanctions"),
        "Criminal penalties": ("section", "sanctions"),
        "Financial penalties for the public sector as provided for in the Directive": ("section", "sanctions"),
    },
    "Authority - P3": {
        "Number of  authorities involved in NIS2": ("flat", "authorityCount"),
        "Consolidated list of authorities": ("flat", "authorities"),
        "Transposition authority": ("section", "authorities"),
        "Audit authority": ("section", "authorities"),
        "Registration authority": ("section", "authorities"),
        "Incident notification authority": ("section", "authorities"),
        "Multi sectoral authorities ": ("section", "authorities"),
        "Number of sectoral authorities ": ("section", "authorities"),
        "List of sectoral authorities (only if yes and option available)": ("section", "authorities"),
        "Authority member of EU Network ": ("section", "authorities"),
        "Authority member  of NIS Cooperation Group": ("section", "authorities"),
        "Authority member  of EU- CyClone ": ("section", "authorities"),
    },
}

import re as _re


def norm_label(s):
    return _re.sub(r"\s+", " ", str(s or "")).strip().lower()


# Repeated on every sheet as a convenience copy of ID - P1's value, and the
# checklist columns that only make sense read as a group.
GLOBAL = {
    norm_label("Maturity Level"): ("none", "copy of ID - P1"),
    norm_label("Répartition"): ("none", "working note"),
    norm_label("Repartition"): ("none", "working note"),
    norm_label("Column1"): ("none", "empty column"),
}
for _f in ["ISO 27001/27002", "IEC 62443", "NIST CSF", "NIST SP 800.53",
           "CIS Controls", "NIS 1", "CyFun Belge"]:
    GLOBAL[norm_label(_f)] = ("section", "fw")
for _f in ["Name", "Address", "Coordinates", "Classification",
           "List of member states where service is provided",
           "Identity of the main entity", "National company identification number (tax, SIRET, etc.)",
           "Single point of contact", "Role of the point of contact", "IP ranges",
           "Domain names", "Classification of sector and subsector   (EE/EI)",
           "List of Information Systems", "List of information for registration"]:
    GLOBAL[norm_label(_f)] = ("section", "reg")
for _f in ["Major incident definition is the same as in the directive",
           "Specificity on timeline regarding EU directive timeline",
           "Timeline Directive NIS2",
           "Early warning within 24 hours. Incident report within 72 hours"]:
    GLOBAL[norm_label(_f)] = ("section", "inc")
for _f in ["First audit deadline expected for EE (from effective date in months)",
           "Frequency for next audits for EE (from first audit date in months)",
           "First audit deadline expected for EI (from effective date in months)",
           "Frequency for next audits for IE (from first audit date in months)"]:
    GLOBAL[norm_label(_f)] = ("section", "aud")
for _f in ["Compliance deadline to framework is different between EE and EI",
           "Compliance target level is different between EE and EI",
           "Compliance deadline to framework from effective date for EE (months)",
           "Compliance deadline to framework from effective date for EI (months)"]:
    GLOBAL.setdefault(norm_label(_f), ("section", "fw"))

# Sections the record does not have yet — surfacing these fields means adding them.
NEW_SECTIONS = {"sanctions": "Sanctions and enforcement",
                "authorities": "Authorities (detail)"}
# Flat keys the record does not have yet.
NEW_FLAT = {"regAuthority", "regDeadline", "regDeadlineMonths", "incidentAuthority",
            "incidentMandatoryFrom", "sanctionMax", "authorityCount"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="write data/field-mapping.json")
    args = ap.parse_args()

    sheets = json.loads(CELLMAP.read_text(encoding="utf-8"))["sheets"]
    total = mapped = 0
    rows = []
    uncovered = []

    for sheet, data in sheets.items():
        # Workbook headers carry stray spaces and double spaces; match on a
        # normalised key so the mapping is not hostage to typing accidents.
        table = {norm_label(k): v for k, v in MAPPING.get(sheet, {}).items()}
        for field in data["fields"]:
            label = field["label"]
            total += 1
            hit = table.get(norm_label(label)) or GLOBAL.get(norm_label(label))
            if hit:
                mapped += 1
                rows.append({"sheet": sheet, "field": label.strip(), "column": field["column"],
                             "kind": hit[0], "target": hit[1], "writable": field["writable"]})
            else:
                uncovered.append((sheet, label.strip()))

    kinds = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1

    print("champs du classeur : %d" % total)
    print("cartographiés      : %d (%d%%)" % (mapped, round(100 * mapped / total)))
    print("  dont %s" % ", ".join("%s=%d" % kv for kv in sorted(kinds.items())))
    print("non couverts       : %d" % len(uncovered))

    flat_targets = {r["target"] for r in rows if r["kind"] == "flat"}
    print("\nchamps typés visés : %d" % len(flat_targets))
    print("  déjà sur la fiche : %s" % ", ".join(sorted(flat_targets - NEW_FLAT)))
    print("  À AJOUTER         : %s" % ", ".join(sorted(flat_targets & NEW_FLAT)))
    sect = {r["target"] for r in rows if r["kind"] == "section"}
    print("\nsections visées    : %s" % ", ".join(sorted(sect)))
    print("  À AJOUTER         : %s" % ", ".join(sorted(sect & set(NEW_SECTIONS))))

    if uncovered:
        print("\nnon couverts, par onglet :")
        by = {}
        for sheet, label in uncovered:
            by.setdefault(sheet, []).append(label)
        for sheet, labels in by.items():
            print("  %s (%d)" % (sheet, len(labels)))
            for label in labels[:6]:
                print("      %s" % label[:66])
            if len(labels) > 6:
                print("      … et %d autres" % (len(labels) - 6))

    if args.json:
        OUT.write_text(json.dumps({
            "workbook": "CYBER WATCH5_Technical inventory.xlsx",
            "mappedFields": mapped, "totalFields": total,
            "newFlatFields": sorted(NEW_FLAT), "newSections": NEW_SECTIONS,
            "fields": rows,
            "uncovered": [{"sheet": s, "field": f} for s, f in uncovered],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("\n-> %s" % OUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
