#!/usr/bin/env python3
"""Generate a country's slides from the token template — the "1 click" export.

    node tools/export_countries.js            # once, after a data refresh
    python3 tools/build_country_deck.py DE    # -> out/RegWatch - Germany.pptx
    python3 tools/build_country_deck.py --all

Input : ressources/template-pays.pptx (built by make_country_template.py)
        data/countries.json           (built by export_countries.js)

The template carries the design; this script only fills `{{tokens}}`. No geometry,
no shape names, no coordinate math — which is why a designer can restyle the
template freely and generation keeps working, as long as the tokens survive.

Formatting: a content line starting with "# " becomes a section heading (bold,
Wavestone violet); every other line is a body paragraph. Paragraphs inherit the
template's own run style, so the output matches the hand-made deck.
"""

import argparse
import copy
import json
import re
import sys
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
except ImportError:
    raise SystemExit("pip install python-pptx")

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "ressources" / "template-pays.pptx"
COUNTRIES = ROOT / "data" / "countries.json"
OUTDIR = ROOT / "out"

VIOLET = RGBColor(0x45, 0x1D, 0xC7)
GREEN = RGBColor(0x03, 0xB4, 0x50)
BODY_INK = RGBColor(0x00, 0x00, 0x00)

# Country name in French, for the slide title. English names come from the data.
FR_NAME = {
    "AT": "Autriche", "BE": "Belgique", "BG": "Bulgarie", "CY": "Chypre",
    "CZ": "Tchéquie", "DE": "Allemagne", "DK": "Danemark", "EE": "Estonie",
    "ES": "Espagne", "FI": "Finlande", "FR": "France", "GB": "Royaume-Uni",
    "GR": "Grèce", "HR": "Croatie", "HU": "Hongrie", "IE": "Irlande",
    "IT": "Italie", "LT": "Lituanie", "LU": "Luxembourg", "LV": "Lettonie",
    "MT": "Malte", "NL": "Pays-Bas", "NO": "Norvège", "PL": "Pologne",
    "PT": "Portugal", "RO": "Roumanie", "SE": "Suède", "SI": "Slovénie",
    "SK": "Slovaquie",
}

MATURITY_CAPTION = {
    1: "Transposition non finalisée et cadre cyber non disponible",
    2: "Transposition engagée, cadre cyber encore partiel",
    3: "Loi adoptée, cadre cyber en cours de finalisation",
    4: "Loi approuvée par les autorités et cadre cyber disponible dans sa dernière version",
}

MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin",
             "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def fr_date(iso):
    if not iso or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(iso)):
        return str(iso or "")
    y, m, d = str(iso).split("-")
    return "%d %s %s" % (int(d), MONTHS_FR[int(m) - 1], y)


# --------------------------------------------------------------------------- #
# Content: RegWatch country record -> the eleven template blocks
# --------------------------------------------------------------------------- #

def build_content(c):
    sec = c.get("sections", {})

    def val(key, fallback="n.c."):
        """Fields exist but hold null for countries that have not published yet."""
        v = c.get(key)
        return fallback if v is None or v == "" else v

    timeline = sorted(c.get("timeline", []), key=lambda t: t.get("date", ""), reverse=True)
    key_steps = ["# Derniers événements"]
    key_steps += ["**%s** : %s" % (fr_date(t["date"]), t["text"]) for t in timeline[:4]]
    if c.get("next"):
        key_steps += ["# Prochaines étapes"] + list(c["next"])

    authorities = ["**%s** : %s" % (a["name"], a["role"]) for a in c.get("authorities", [])]

    # `scope` mixes public-sector scoping and extra in-scope sectors; route by keyword
    # and keep everything visible rather than silently dropping a bullet.
    scope = list(sec.get("scope", []))
    public = [s for s in scope if re.search(r"public|state|municipal|administration", s, re.I)]
    extra = [s for s in scope if s not in public] or scope

    registration = ["# Échéances"] + list(sec.get("reg", []))
    reg_process = ["# Processus et informations demandées"]
    if c.get("regTool"):
        reg_process.append("Canal d'enregistrement : **%s**." % c["regTool"])
    reg_process += list(sec.get("reg", []))[1:] or ["Détail non publié à ce jour."]

    cyber = ["# Framework"]
    if c.get("fwName"):
        cyber.append("Référentiel : **%s**." % c["fwName"])
    cyber += list(sec.get("fw", []))
    if c.get("reqEE") or c.get("reqIE"):
        cyber.append("Exigences : **%s** pour les EE, **%s** pour les EI." % (val("reqEE"), val("reqIE")))

    controls = ["# Modalités et processus de contrôles"]
    if c.get("auditBody"):
        line = "Organisme : **%s**." % c["auditBody"]
        if c.get("auditFreqEE") or c.get("auditFreqIE"):
            line += " Audit EE tous les **%s mois**, EI tous les **%s mois**." % (
                val("auditFreqEE"), val("auditFreqIE"))
        controls.append(line)
    controls += list(sec.get("aud", []))

    incident = ["# Processus et disponibilités de la plateforme"]
    if c.get("incidentMethod"):
        incident.append("Canal de notification : **%s**." % val("incidentMethod"))
    incident += list(sec.get("inc", []))

    return {
        "title": "Transposition de la directive NIS2 en %s" % FR_NAME.get(c["iso"], c["name"]),
        "last_update": "Date de dernière mise à jour : %s" % fr_date(c.get("lastUpdate")),
        "maturity_caption": MATURITY_CAPTION.get(c.get("maturity"), ""),
        "key_steps": key_steps,
        "authorities": authorities or ["Autorités non désignées à ce jour."],
        "registration": registration,
        "registration_process": reg_process,
        "controls": controls,
        "incident_reporting": incident,
        "cyber_requirements": cyber,
        # No leading heading here: the block already carries the title in the template.
        "additional_sectors": extra or ["Aucun ajout par rapport à la directive."],
        "public_sectors": public or ["Périmètre public non précisé."],
        "other_regulations": list(sec.get("other", [])) or ["Aucune correspondance publiée."],
        # Never generated: this is the consultant's own analysis.
        "wavestone_reco": list(sec.get("reco", [])) or ["À compléter par le consultant."],
    }


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

def iter_text_shapes(shapes):
    for sh in shapes:
        if sh.shape_type == 6:
            yield from iter_text_shapes(sh.shapes)
        elif sh.has_text_frame:
            yield sh


def write_lines(shape, lines):
    """Replace the token paragraph with `lines`, cloning its formatting.

    `**bold**` marks a bold run; a leading "# " marks a section heading.
    """
    tf = shape.text_frame
    base = tf.paragraphs[0]
    if not base.runs:
        tf.text = "\n".join(l.lstrip("# ") for l in lines)
        return

    # Snapshot the pristine XML BEFORE touching anything: paragraph 0 is the
    # heading style (no bullet), the "{{proto_body}}" paragraph is the body style
    # (bullet glyph + indent). Cloning after restyling would leak the heading
    # formatting into every following paragraph.
    proto_head = copy.deepcopy(base._p)
    proto_body = next((copy.deepcopy(p._p) for p in tf.paragraphs
                       if p.runs and p.runs[0].text.strip() == "{{proto_body}}"), proto_head)
    proto_r = copy.deepcopy(base.runs[0]._r)

    body = tf._txBody
    for para in tf.paragraphs:
        body.remove(para._p)

    for line in lines:
        heading = line.startswith("# ")
        text = line[2:] if heading else line

        body.append(copy.deepcopy(proto_head if heading else proto_body))
        para = tf.paragraphs[-1]
        for r in para.runs[1:]:
            r._r.getparent().remove(r._r)

        parts = [p for p in re.split(r"\*\*(.+?)\*\*", text) if p != ""]
        bolds = set(re.findall(r"\*\*(.+?)\*\*", text))
        anchor = para.runs[0]
        for j, part in enumerate(parts):
            if j == 0:
                cursor = anchor
            else:
                anchor._r.getparent().append(copy.deepcopy(proto_r))
                cursor = para.runs[-1]
            cursor.text = part
            cursor.font.bold = bool(heading or part in bolds)
            cursor.font.color.rgb = VIOLET if heading else BODY_INK


def set_maturity(slide, level):
    """Move the green marker onto the requested level.

    The gauge is four groups laid left to right; one of them is the green
    "selected" marker. Selecting level N swaps position AND digit between the
    green group and the grey group currently at slot N, so the row still reads
    1-2-3-4 from left to right.
    """
    gauges = []
    def scan(shapes):
        for sh in shapes:
            if sh.shape_type == 6:
                kids = list(sh.shapes)
                if kids and any("Number Bloc" in k.name for k in kids):
                    gauges.append(sh)
                    continue
                scan(kids)
    scan(slide.shapes)
    if len(gauges) != 4:
        return False

    def digit_shape(group):
        return next((k for k in group.shapes if k.has_text_frame and k.text_frame.text.strip()), None)

    def is_green(group):
        d = digit_shape(group)
        try:
            return d is not None and d.fill.fore_color.rgb == GREEN
        except Exception:
            return False

    green = next((g for g in gauges if is_green(g)), None)
    if green is None:
        return False

    gauges.sort(key=lambda g: g.left)
    slot_index = level - 1
    if not 0 <= slot_index < len(gauges):
        return False
    target = gauges[slot_index]
    if target is green:
        return True

    gd, td = digit_shape(green), digit_shape(target)
    green.left, target.left = target.left, green.left
    if gd is not None and td is not None:
        gd.text_frame.paragraphs[0].runs[0].text, td.text_frame.paragraphs[0].runs[0].text = (
            td.text_frame.paragraphs[0].runs[0].text, gd.text_frame.paragraphs[0].runs[0].text)
    return True


def generate(country, outdir):
    content = build_content(country)
    prs = Presentation(str(TEMPLATE))
    unfilled = set(content)

    for slide in prs.slides:
        for shape in iter_text_shapes(slide.shapes):
            paras = shape.text_frame.paragraphs
            if not paras:
                continue
            # The token sits in paragraph 0; a "{{proto_body}}" style prototype
            # may follow it, so match the paragraph, not the whole frame.
            m = re.fullmatch(r"\{\{(\w+)\}\}", paras[0].text.strip())
            if not m:
                continue
            token = m.group(1)
            value = content.get(token)
            if value is None:
                continue
            write_lines(shape, value if isinstance(value, list) else [value])
            unfilled.discard(token)
        set_maturity(slide, country.get("maturity", 1))

    outdir.mkdir(exist_ok=True)
    out = outdir / ("RegWatch - %s.pptx" % country["name"])
    prs.save(str(out))
    return out, unfilled


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("iso", nargs="?", help="country ISO code, e.g. DE")
    ap.add_argument("--all", action="store_true", help="generate every country")
    args = ap.parse_args()

    if not TEMPLATE.exists():
        raise SystemExit("template not found: %s — run tools/make_country_template.py" % TEMPLATE)
    if not COUNTRIES.exists():
        raise SystemExit("data not found: %s — run node tools/export_countries.js" % COUNTRIES)

    countries = json.loads(COUNTRIES.read_text(encoding="utf-8"))["countries"]
    if args.all:
        targets = countries
    elif args.iso:
        targets = [c for c in countries if c["iso"] == args.iso.upper()]
        if not targets:
            raise SystemExit("unknown country: %s" % args.iso)
    else:
        ap.error("give an ISO code or --all")

    for c in targets:
        out, unfilled = generate(c, OUTDIR)
        note = "  (unfilled: %s)" % ", ".join(sorted(unfilled)) if unfilled else ""
        print("%s -> %s%s" % (c["iso"], out.relative_to(ROOT), note))


if __name__ == "__main__":
    sys.exit(main())
