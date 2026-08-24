#!/usr/bin/env python3
"""Turn the hand-made country slides into a token template.

Input : ressources/CYBER WATCH3_Deciphering NIS2 transpositions...pptx (Germany, by hand)
Output: ressources/template-pays.pptx

The design is kept byte-for-byte — same layouts, same groups, same fonts, same
Wavestone icons. Only the body text of each block is replaced by a `{{token}}`,
so `build_country_deck.py` can fill it for any country without doing any
geometry. Blocks are found by their heading text ("Autorités", "Contrôles", …),
which is the one stable identifier in this deck: the shapes themselves are all
called `TextBox 62` / `TextBox 63` and three different groups are named `Group 99`.

Run once. Re-run only if the source deck's design changes.

    python3 tools/make_country_template.py
"""

import copy
import re
import sys
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.oxml.ns import qn as QN
except ImportError:
    raise SystemExit("pip install python-pptx")

BODY_INK = RGBColor(0x00, 0x00, 0x00)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ressources" / "CYBER WATCH3_Deciphering NIS2 transpositions in Western and Eastern Europe.pptx"
OUT = ROOT / "ressources" / "template-pays.pptx"

# Block heading (as written in the deck) -> token placed in that block's body.
BLOCKS = {
    "etapes cles dans le processus de transposition": "key_steps",
    "autorites": "authorities",
    "enregistrement des entites": "registration",
    "controles": "controls",
    "notifications d'incidents": "incident_reporting",
    "exigences de cybersecurite": "cyber_requirements",
    "secteurs additionnels": "additional_sectors",
    "secteurs publics": "public_sectors",
    "correspondance a d'autres reglementations": "other_regulations",
    "processus d'enregistrement": "registration_process",
    "recommandations wavestone": "wavestone_reco",
}


def fold(text):
    """Accent- and case-insensitive key, so 'Contrôles' matches 'controles'."""
    import unicodedata
    t = unicodedata.normalize("NFD", str(text or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s ]+", " ", t).strip().lower().replace("’", "'")


def iter_text_shapes(shapes):
    """Yield every text-bearing shape, descending into groups."""
    for sh in shapes:
        if sh.shape_type == 6:  # GROUP
            yield from iter_text_shapes(sh.shapes)
        elif sh.has_text_frame:
            yield sh


def iter_groups(shapes):
    """Yield (group, [its text shapes, at any depth below it])."""
    for sh in shapes:
        if sh.shape_type != 6:
            continue
        yield sh, list(iter_text_shapes(sh.shapes))
        yield from iter_groups(sh.shapes)


def set_token(shape, token):
    """Replace the body with a single `{{token}}` paragraph, keeping its formatting.

    The first run of the first paragraph carries the block's base style (size,
    font, colour). We keep that run, retype it, and drop everything else — the
    generator clones it when it writes the real content back in.
    """
    tf = shape.text_frame
    paras = tf.paragraphs
    if not paras or not paras[0].runs:
        tf.text = "{{%s}}" % token
        return
    first = paras[0].runs[0]
    first.text = "{{%s}}" % token
    for r in paras[0].runs[1:]:
        r._r.getparent().remove(r._r)

    # Keep one body paragraph as a second style prototype. Paragraph 0 is the
    # section heading (no bullet); paragraph 1 carries the block's bullet glyph
    # and indent. The generator needs both, then drops this marker.
    body_proto = next((p for p in paras[1:] if p.runs), None)
    for p in paras[1:]:
        if p is not body_proto:
            p._p.getparent().remove(p._p)
    if body_proto is not None:
        body_proto.runs[0].text = "{{proto_body}}"
        for r in body_proto.runs[1:]:
            r._r.getparent().remove(r._r)

    # The kept run happens to be the block's section heading — bold, violet, and
    # sometimes carrying a hyperlink. The generator clones it for every output
    # paragraph, so normalise it to plain body style first; headings re-apply
    # bold and violet explicitly when they are written back.
    for run in [first] + ([body_proto.runs[0]] if body_proto is not None else []):
        run.font.bold = False
        run.font.underline = False
        run.font.color.rgb = BODY_INK
        rPr = run._r.find(QN("a:rPr"))
        if rPr is not None:
            for tag in ("a:hlinkClick", "a:hlinkMouseOver"):
                for node in rPr.findall(QN(tag)):
                    rPr.remove(node)


def main():
    if not SRC.exists():
        raise SystemExit("source deck not found: %s" % SRC)

    prs = Presentation(str(SRC))

    # Drop the cover: the template is the two country slides only.
    xml_slides = prs.slides._sldIdLst
    cover = list(xml_slides)[0]
    prs.part.drop_rel(cover.rId)
    xml_slides.remove(cover)

    placed, pending = [], dict(BLOCKS)
    for slide in prs.slides:
        # A block is one group holding a heading shape and a body shape. Document
        # order between the two is NOT stable (some groups list the body first),
        # so pair them inside the group rather than by position.
        for group, texts in iter_groups(slide.shapes):
            heading = next((t for t in texts if fold(t.text_frame.text) in pending), None)
            if heading is None:
                continue
            token = pending[fold(heading.text_frame.text)]
            bodies = [t for t in texts if t is not heading and len(t.text_frame.text) > 60]
            if not bodies:
                continue
            body = max(bodies, key=lambda t: len(t.text_frame.text))
            placed.append((token, body.text_frame.text))
            set_token(body, token)
            del pending[fold(heading.text_frame.text)]

        # Title, maturity caption and date, on both slides.
        for sh in iter_text_shapes(slide.shapes):
            txt = sh.text_frame.text
            if "Transposition de la directive NIS2 en" in txt:
                set_token(sh, "title")
            elif "Date de dernière mise à jour" in txt:
                set_token(sh, "last_update")
            elif fold(txt).startswith("loi approuvee par les autorites"):
                set_token(sh, "maturity_caption")

    OUT.parent.mkdir(exist_ok=True)
    prs.save(str(OUT))

    print("template written: %s (%d slides)" % (OUT.relative_to(ROOT), len(prs.slides.__iter__.__self__._sldIdLst)))
    print("tokens placed: %d/%d" % (len(placed), len(BLOCKS)))
    for token, original in placed:
        print("  {{%-20s}} <- %s" % (token, original.replace("\n", " ")[:64]))
    if pending:
        print("NOT FOUND: %s" % ", ".join(pending.values()))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
