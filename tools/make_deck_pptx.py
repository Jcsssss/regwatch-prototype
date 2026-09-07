#!/usr/bin/env python3
"""La présentation RegWatch en trois slides, au format PowerPoint.

    python3 tools/make_deck_pptx.py            # -> RegWatch - presentation.pptx

Trois slides pour comprendre l'outil en entier : ce que le consultant a sous les
yeux, comment la veille remonte de la source publiée jusqu'à la cellule du
classeur comparatif, et ce qui fait tenir l'assistant.

C'est un deck de lecture, pas de projection : la densité y est voulue, on doit
pouvoir le parcourir seul, sans commentaire. Les schémas sont dessinés en formes
PowerPoint natives et le graphique est un vrai graphique - tout reste editable,
rien n'est aplati en image.

La police est Aptos : la charte du cabinet, et le défaut de Microsoft 365, donc
présente sur le poste pro.

Chaque chiffre est repris du jeu de données ou du code de l'outil, avec sa source
en commentaire, pour qu'aucune affirmation du deck ne soit invérifiable.
"""

import sys
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Inches, Pt
except ImportError:
    raise SystemExit("pip install python-pptx")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "RegWatch - presentation.pptx"

# Charte, reprise de src/shell_top.html sans altération.
VIOLET = RGBColor(0x45, 0x1D, 0xC7)
VIOLET_DEEP = RGBColor(0x25, 0x0F, 0x6B)
VIOLET_SOFT = RGBColor(0xEC, 0xE7, 0xFB)
GREEN = RGBColor(0x04, 0xF0, 0x6A)
GREEN_SOFT = RGBColor(0xCA, 0xFE, 0xE0)
INK = RGBColor(0x16, 0x12, 0x2E)
INK2 = RGBColor(0x41, 0x3B, 0x60)
MUTED = RGBColor(0x6F, 0x6B, 0x8C)
LINE = RGBColor(0xE4, 0xE1, 0xF0)
LINE2 = RGBColor(0xCF, 0xCA, 0xE1)
SURF2 = RGBColor(0xF0, 0xEE, 0xF8)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

# Rampe séquentielle d'une seule teinte, pour une grandeur : le poids d'une
# composante du score. Deux teintes auraient suggéré deux natures.
RAMP = [RGBColor(0x25, 0x0F, 0x6B), RGBColor(0x3D, 0x1F, 0xD1),
        RGBColor(0x6A, 0x4C, 0xE0), RGBColor(0x9A, 0x85, 0xEE),
        RGBColor(0xC9, 0xBE, 0xF7)]
RAMP_INK = [WHITE, WHITE, WHITE, WHITE, VIOLET_DEEP]

UI = "Aptos"
W, H = 13.333, 7.5
RAIL = 1.0
X = 1.75
TXTW = W - X - 0.9


def box(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE):
    sh = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(0.75)
    sh.shadow.inherit = False
    sh.text_frame.word_wrap = True
    return sh


def text(slide, x, y, w, h, runs, size=10, color=INK, bold=False,
         space=None, caps=False, align=PP_ALIGN.LEFT, spacing=1.3,
         anchor=MSO_ANCHOR.TOP):
    """`runs` : une chaîne, une liste de runs, ou une liste de paragraphes.

    Une liste de tuples fait plusieurs runs dans un paragraphe, ce qui permet de
    colorer un membre de phrase sans casser le retour à la ligne ; une liste de
    listes fait plusieurs paragraphes.
    """
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    fill_text(tb.text_frame, runs, size, color, bold, space, caps, align, spacing, anchor)
    return tb


def fill_text(tf, runs, size=10, color=INK, bold=False, space=None, caps=False,
              align=PP_ALIGN.LEFT, spacing=1.3, anchor=MSO_ANCHOR.TOP):
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    paras = runs if isinstance(runs, list) and runs and isinstance(runs[0], list) else [runs]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        chunks = para if isinstance(para, list) else [(para, color, bold)]
        for chunk in chunks:
            content, col, bd = chunk if isinstance(chunk, tuple) else (chunk, color, bold)
            r = p.add_run()
            r.text = content.upper() if caps else content
            r.font.size = Pt(size)
            r.font.name = UI
            r.font.bold = bd
            r.font.color.rgb = col
            if space:
                r.font._rPr.set("spc", str(int(space * 100)))


def label(slide, x, y, w, content, color=MUTED, size=8.5, space=1.6):
    """Un intitulé de section : capitales espacées, discrètes."""
    return text(slide, x, y, w, 0.22, content, size=size, color=color,
                caps=True, space=space)


def rail(slide, number, title):
    box(slide, 0, 0, RAIL, H, fill=SURF2)
    box(slide, RAIL, 0, 0.008, H, fill=LINE)
    text(slide, 0, 0.5, RAIL, 0.4, number, size=15, bold=True, color=VIOLET,
         align=PP_ALIGN.CENTER)
    # Le rail porte le rang de la slide : l'ordre de lecture est une information,
    # pas un ornement.
    tb = text(slide, RAIL / 2 - 1.6, H / 2 - 0.25, 3.2, 0.5, title, size=8.5,
              color=MUTED, caps=True, space=2.4, align=PP_ALIGN.CENTER)
    tb.rotation = 270
    dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(RAIL / 2 - 0.035),
                                 Inches(H - 0.62), Inches(0.07), Inches(0.07))
    dot.fill.solid()
    dot.fill.fore_color.rgb = VIOLET
    dot.line.fill.background()
    dot.shadow.inherit = False


def head(slide, eyebrow, title, sub=None):
    label(slide, X, 0.6, TXTW, eyebrow, size=9, space=2)
    text(slide, X, 0.9, TXTW, 0.5, title, size=25, bold=True, spacing=1.1)
    if sub:
        text(slide, X, 1.42, 9.6, 0.4, sub, size=11, color=INK2, spacing=1.35)


def rule(slide, y, width=TXTW):
    box(slide, X, y, width, 0.008, fill=LINE)


# ---------------------------------------------------------------- slide 1

def slide_one(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    box(s, 0, 0, W, H, fill=WHITE)
    rail(s, "01", "Ce qu'on a sous les yeux")
    head(s, "L'interface", "Cinq onglets, une fiche par pays, deux rôles.",
         "Un seul fichier HTML de 1,6 Mo : pas d'installation, pas de compte, "
         "pas de connexion requise. Il s'ouvre chez le client comme il s'envoie "
         "par mail, et bascule entre français et anglais sur l'intégralité du contenu.")

    # Les cinq onglets : c'est la structure réelle de l'outil (src/app_reg.js).
    tabs = [
        ("Vue d'ensemble", "La carte d'Europe, l'état de transposition pays par pays, "
                           "et les écarts qui sautent aux yeux."),
        ("Pays", "La fiche complète d'un État : sa loi, son autorité, ses obligations, "
                 "sa chronologie."),
        ("Boîte de veille", "Ce que l'agent a trouvé depuis hier, en attente de "
                            "validation par un consultant."),
        ("Assistant", "Une question en français, une réponse tirée des seules "
                      "données de l'outil, sources citées."),
        ("Sources", "D'où vient chaque information : autorités nationales, textes "
                    "officiels, presse spécialisée."),
    ]
    label(s, X, 2.28, TXTW, "Les cinq onglets")
    colw = TXTW / 5
    for i, (name, desc) in enumerate(tabs):
        cx = X + i * colw
        chip = box(s, cx, 2.56, colw - 0.28, 0.34, fill=VIOLET_SOFT,
                   shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        chip.adjustments[0] = 0.28
        fill_text(chip.text_frame, name, size=9.5, bold=True, color=VIOLET_DEEP,
                  align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, cx, 3.02, colw - 0.28, 0.9, desc, size=8.5, color=INK2, spacing=1.3)

    rule(s, 4.06)

    # 30 champs par fiche (clés de COUNTRIES_1, src/reg/nis2/data_c1.js).
    label(s, X, 4.28, 6.4, "Une fiche pays réunit 30 champs comparables")
    groups = [
        ("Transposition", "loi, date d'entrée en vigueur, retard en mois"),
        ("Référentiel", "cadre national imposé, son nom, son état d'avancement"),
        ("Périmètre", "entités essentielles et importantes, effectifs concernés"),
        ("Audit", "organisme compétent, fréquence, auto-évaluation"),
        ("Signalement", "méthode et outil d'enregistrement des incidents"),
        ("Traçabilité", "autorités, chronologie, sources de chaque affirmation"),
    ]
    gw = 6.4 / 2
    for i, (name, detail) in enumerate(groups):
        gx, gy = X + (i % 2) * gw, 4.62 + (i // 2) * 0.62
        box(s, gx, gy + 0.05, 0.028, 0.34, fill=VIOLET)
        text(s, gx + 0.16, gy, gw - 0.35, 0.2, name, size=9.5, bold=True, color=INK)
        text(s, gx + 0.16, gy + 0.21, gw - 0.35, 0.22, detail, size=8.5, color=MUTED)

    # Les deux rôles : seul le validateur voit la file et tranche (app_part2.js).
    bx = X + 6.9
    label(s, bx, 4.28, TXTW - 6.9, "Deux rôles, une seule vérité")
    facts = [
        ("Lecteur", "consulte les fiches et l'historique. Il ne voit pas la file "
                    "de veille : rien d'incertain ne lui est montré."),
        ("Validateur", "voit chaque élément détecté, la phrase de la source qui l'a "
                       "déclenché, et tranche. Aucune fiche ne bouge sans son accord."),
    ]
    fy = 4.62
    for name, detail in facts:
        box(s, bx, fy + 0.05, 0.028, 0.34, fill=GREEN)
        text(s, bx + 0.16, fy, TXTW - 7.1, 0.2, name, size=9.5, bold=True, color=INK)
        text(s, bx + 0.16, fy + 0.21, TXTW - 7.1, 0.6, detail, size=8.5,
             color=INK2, spacing=1.3)
        fy += 0.95
    text(s, bx, 6.5, TXTW - 6.9,
         0.3, "Chaque validation est horodatée et signée dans la fiche.",
         size=8.5, color=MUTED)


# ---------------------------------------------------------------- slide 2

def slide_two(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    box(s, 0, 0, W, H, fill=WHITE)
    rail(s, "02", "Comment la veille remonte")
    head(s, "La chaîne de veille",
         "De la source publiée à la cellule du classeur comparatif.",
         "L'agent ne résume pas : il rapporte. Chaque étape ci-dessous produit un "
         "fait vérifiable, et la dernière est tenue par un humain.")

    # Le pipeline réel : agent-veille/ puis tools/veille_to_watchitems.py.
    steps = [
        ("Sonder", ["29 autorités nationales,", "22 flux vérifiés"]),
        ("Récupérer", ["l'article intégral,", "dans sa langue"]),
        ("Classer", ["7 thèmes, 316 termes", "en 21 langues"]),
        ("Noter", ["5 composantes", "factuelles"]),
        ("Valider", ["un consultant", "tranche"]),
    ]
    label(s, X, 2.3, TXTW, "Cinq étapes, dans cet ordre")
    sw = TXTW / 5
    for i, (name, detail) in enumerate(steps):
        cx = X + i * sw
        last = i == len(steps) - 1
        ch = box(s, cx, 2.58, sw - 0.14, 0.5,
                 fill=GREEN_SOFT if last else VIOLET_SOFT,
                 shape=MSO_SHAPE.CHEVRON)
        fill_text(ch.text_frame, name, size=10.5, bold=True,
                  color=RGBColor(0x0B, 0x6E, 0x3D) if last else VIOLET_DEEP,
                  align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, cx + 0.22, 3.2, sw - 0.4, 0.5,
             [[(line, INK2, False)] for line in detail], size=8.5, spacing=1.3)

    rule(s, 3.92)

    # Score de fiabilité : poids de tools/reliability.py, inchangés.
    label(s, X, 4.12, 6.6, "Le score de fiabilité, sur 100")
    text(s, X, 4.42, 6.6, 0.3,
         "Aucune de ces composantes n'est une opinion : chacune est un fait "
         "constatable sur l'élément.", size=9, color=INK2)
    parts = [("Source", 30), ("Texte", 25), ("Date", 20),
             ("Utilité", 15), ("Fraîcheur", 10)]
    barw, bx0, by = 6.6, X, 4.86
    for i, (name, weight) in enumerate(parts):
        w = barw * weight / 100
        seg = box(s, bx0, by, w, 0.46, fill=RAMP[i])
        fill_text(seg.text_frame, str(weight), size=11, bold=True, color=RAMP_INK[i],
                  align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, bx0 - (0.35 if i == len(parts) - 1 else 0), by + 0.54,
             w + (0.35 if i == len(parts) - 1 else 0), 0.2, name,
             size=8.5, bold=True, color=INK,
             align=PP_ALIGN.RIGHT if i == len(parts) - 1 else PP_ALIGN.LEFT)
        bx0 += w
    text(s, X, 5.74, 6.6, 0.5,
         [[("Pénalités : ", INK, True),
           ("− 10 si la date de publication est postérieure à la détection, ce qui "
            "est impossible ;  − 15 si l'élément répète un article déjà vu du même "
            "domaine.", INK2, False)]], size=8.5, spacing=1.3)
    text(s, X, 6.34, 6.6, 0.6,
         [[("Pourquoi pas le score du modèle : ", INK, True),
           ("sur 89 éléments il renvoie 8 ou 9 pour 84 % d'entre eux. Il trie donc "
            "une liste au hasard, et ne s'audite pas.", INK2, False)]],
         size=8.5, spacing=1.3)

    # Ce que la file donne au validateur.
    vx = X + 7.1
    label(s, vx, 4.12, TXTW - 7.1, "Ce que le validateur reçoit")
    items = [
        ("La phrase, citée", "le passage exact de la source qui a déclenché le "
                             "classement, dans sa langue d'origine."),
        ("La cible", "les cellules du classeur comparatif que l'élément vient "
                     "contredire ou compléter."),
        ("La provenance de la date", "lue dans un flux, relevée sur la page, ou "
                                     "non établie — jamais devinée en silence."),
    ]
    iy = 4.46
    for name, detail in items:
        box(s, vx, iy + 0.04, 0.028, 0.3, fill=VIOLET)
        text(s, vx + 0.16, iy, TXTW - 7.3, 0.2, name, size=9.5, bold=True, color=INK)
        text(s, vx + 0.16, iy + 0.21, TXTW - 7.3, 0.6, detail, size=8.5,
             color=INK2, spacing=1.3)
        iy += 0.82
    text(s, vx, 6.98, TXTW - 7.1, 0.3,
         "89 éléments en file · 388 cellules visées", size=8.5, color=MUTED)


# ---------------------------------------------------------------- slide 3

def slide_three(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    box(s, 0, 0, W, H, fill=WHITE)
    rail(s, "03", "Ce qui tient l'ensemble")
    head(s, "L'assistant, la clé, et la suite",
         "L'assistant ne sait que ce que l'outil contient.",
         "Il n'a pas accès à Internet ni à ses propres souvenirs : huit outils lui "
         "sont exposés, et hors de ce périmètre il dit qu'il ne sait pas.")

    # Chemin réel d'une requête (src/app_chat.js + azure-proxy/function_app.py).
    label(s, X, 2.3, 6.9, "Le chemin d'une question")
    flow = [
        ("La page", ["assemble la question", "et les données utiles"]),
        ("Proxy Azure", ["porte la clé du cabinet,", "n'accepte que notre origine"]),
        ("Azure OpenAI", ["répond, sous plafond", "de jetons partagé"]),
    ]
    fw, gap = 1.95, 0.5
    fx = X
    for i, (name, detail) in enumerate(flow):
        b = box(s, fx, 2.6, fw, 0.62, fill=WHITE, line=LINE2,
                shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        b.adjustments[0] = 0.14
        fill_text(b.text_frame, name, size=10.5, bold=True, color=VIOLET_DEEP,
                  align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, fx, 3.3, fw, 0.5, [[(line, MUTED, False)] for line in detail],
             size=8, align=PP_ALIGN.CENTER, spacing=1.3)
        if i < len(flow) - 1:
            ar = box(s, fx + fw + 0.1, 2.83, gap - 0.2, 0.16, fill=LINE2,
                     shape=MSO_SHAPE.RIGHT_ARROW)
            ar.adjustments[0] = 0.45
        fx += fw + gap
    text(s, X, 3.95, 6.9, 0.5,
         [[("La clé du cabinet n'est jamais dans la page. ", INK, True),
           ("Elle vit côté serveur ; le fichier HTML peut circuler librement, il "
            "ne contient aucun secret.", INK2, False)]], size=9, spacing=1.35)

    rule(s, 4.55, 6.9)

    # Les 8 outils exposés au modèle (CHAT_TOOLS, src/app_chat.js).
    label(s, X, 4.75, 6.9, "Les huit outils, et rien d'autre")
    tools = [
        ("list_countries", "la liste des pays suivis"),
        ("get_country", "la fiche complète d'un pays"),
        ("query_kpi", "un indicateur croisé sur tous les pays"),
        ("search_corpus", "une recherche plein texte dans les fiches"),
        ("watch_items", "les éléments de veille et leur statut"),
        ("scope_rules", "les règles de périmètre d'un pays"),
        ("official_documents", "les 116 textes officiels référencés"),
        ("draw_chart", "un graphique construit à la demande"),
    ]
    tw = 6.9 / 2
    for i, (name, detail) in enumerate(tools):
        tx, ty = X + (i % 2) * tw, 5.08 + (i // 2) * 0.42
        text(s, tx, ty, 1.55, 0.2, name, size=8.5, bold=True, color=VIOLET)
        text(s, tx + 1.6, ty, tw - 1.75, 0.2, detail, size=8.5, color=INK2)
    text(s, X, 6.86, 6.9, 0.4,
         "Si la donnée n'est pas dans l'outil, il le dit. Il ne comble jamais un "
         "trou par une supposition.", size=8.5, color=MUTED, spacing=1.3)

    # Le socle multi-réglementation.
    ax = X + 7.35
    aw = TXTW - 7.35
    label(s, ax, 2.3, aw, "Un socle, plusieurs réglementations")
    text(s, ax, 2.6, aw, 0.6,
         "Chaque réglementation a ses propres fichiers de données et son propre "
         "vocabulaire ; l'affichage, lui, est mutualisé. Ajouter DORA ne demande "
         "pas de réécrire l'outil.", size=9, color=INK2, spacing=1.35)
    regs = [("NIS 2", "29 pays · veille active", True),
            ("REC", "27 pays · socle en place", True),
            ("DORA", "module prévu", False),
            ("CRA", "module prévu", False)]
    ry = 3.5
    for name, detail, live in regs:
        box(s, ax, ry + 0.03, 0.028, 0.28, fill=VIOLET if live else LINE2)
        text(s, ax + 0.16, ry, 1.1, 0.2, name, size=9.5, bold=True,
             color=INK if live else MUTED)
        text(s, ax + 1.15, ry + 0.02, aw - 1.3, 0.2, detail, size=8.5, color=MUTED)
        ry += 0.42

    box(s, ax, 5.35, aw, 1.55, fill=VIOLET_SOFT)
    text(s, ax + 0.25, 5.58, aw - 0.5, 1.1,
         [[("Ce qui sort de l'outil", INK, True)],
          [("Un export Excel qui embarque de vrais graphiques, pas seulement les "
            "données — la feuille s'ouvre et se retravaille comme un classeur "
            "ordinaire, sans macro ni complément.", INK2, False)]],
         size=9, spacing=1.35)


def main():
    prs = Presentation()
    prs.slide_width = Inches(W)
    prs.slide_height = Inches(H)
    slide_one(prs)
    slide_two(prs)
    slide_three(prs)
    prs.save(OUT)
    print("3 slides -> %s (%.0f Ko)" % (OUT.name, OUT.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
