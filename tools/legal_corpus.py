#!/usr/bin/env python3
"""Decouper les textes legaux d'un pays en passages citables.

    python3 tools/legal_corpus.py BE            # lit ressources/Belgium/
    -> data/legal/BE.json

Ce que fait ce script, et ce qu'il ne fait pas
  Il transforme des PDF en passages, chacun portant sa source exacte : le
  document, la page, et l'article quand le texte en porte un. Il ne resume pas,
  il ne reformule pas, il ne classe pas. Tout jugement appartient a l'etape
  suivante, qui ne pourra citer que ce qui est ici.

  C'est la condition pour qu'une phrase produite plus tard soit verifiable : si
  le passage n'existe pas dans ce fichier, la phrase ne peut pas l'inventer.

Le decoupage
  Par article quand le texte en expose - « Art. 12. » en francais, « Artikel 12 »
  en neerlandais, « Article 12 » en anglais - sinon par paragraphe, avec une
  taille plafonnee. Un passage trop long noie la citation ; trop court, il perd
  le contexte qui la rend juste.

Deux pieges que ces documents tendent
  Les lois belges paraissent au Moniteur en deux colonnes, neerlandais a gauche
  et francais a droite. Lues en pleine largeur, les deux langues s'entrelacent
  ligne a ligne et le texte devient incitable. On detecte la mise en colonnes et
  on decoupe, en gardant le francais.

  Le PDF d'une loi est souvent le journal officiel entier : celui du 17 mai 2024
  fait 390 pages dont la loi NIS 2 n'occupe que les pages 49 a 106, le reste
  parlant d'aide sociale ou de formation professionnelle. Un filtre de
  pertinence ecarte les passages etrangers au sujet, sinon la recherche
  rapporterait du bruit avec la meme assurance que du droit.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "legal"

FOLDER = {
    "BE": "Belgium", "FR": "France", "DE": "Germany", "NL": "Netherlands",
    "IT": "Italy", "ES": "Spain", "PT": "Portugal", "HR": "Croatia",
}

ART = re.compile(r"^\s*(?:Art(?:icle|ikel)?\.?)\s*(\d+[a-z]?(?:/\d+)?)\s*[.\-–—:]?",
                 re.I | re.M)
MAX_CHARS = 1400
MIN_CHARS = 120


def run_pdftotext(pdf, crop=None):
    cmd = ["pdftotext", "-layout", "-enc", "UTF-8"]
    if crop:
        # pdftotext veut des entiers, et une hauteur qui tient dans la page.
        cmd += ["-x", str(int(crop[0])), "-y", "0",
                "-W", str(int(crop[1])), "-H", "1400"]
    out = subprocess.run(cmd + [str(pdf), "-"], capture_output=True)
    if out.returncode != 0:
        raise SystemExit("pdftotext a echoue sur %s" % pdf.name)
    return out.stdout.decode("utf-8", "replace").split("\f")


def page_width(pdf):
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True)
    m = re.search(r"Page size:\s*([\d.]+) x", info.stdout.decode("utf-8", "replace"))
    return float(m.group(1)) if m else 595.0


# Mots frequents, pour reconnaitre la langue d'une colonne sans dictionnaire.
# Ils doivent etre discriminants : « de » a ete retire des indices neerlandais,
# ou il est le plus courant de tous, parce qu'il l'est autant en francais - la
# colonne francaise passait alors pour neerlandaise et les deux colonnes se
# declaraient de la meme langue, donc pas de decoupe.
LANG_HINTS = {
    "fr": (" le ", " les ", " des ", " qui ", " est ", " pour ", " dans ", " aux "),
    "nl": (" het ", " van ", " een ", " wordt ", " worden ", " zijn ", " bij ", " niet "),
    "en": (" the ", " of ", " and ", " shall ", " with ", " that ", " are "),
}


def lang_score(text, lang):
    low = " " + text.lower().replace("\n", " ") + " "
    return sum(low.count(w) for w in LANG_HINTS[lang])


def pages(pdf, want="fr"):
    """Le texte du PDF, page par page, dans la langue voulue.

    Deux colonnes se reconnaissent a ceci : decoupees, chaque moitie rend un
    texte substantiel, et la langue des deux differe. Une page unique decoupee
    en deux donnerait au contraire des moities qui se completent dans la meme
    langue - on la laisse alors entiere."""
    full = run_pdftotext(pdf)
    w = page_width(pdf)
    left = run_pdftotext(pdf, (0, w / 2))
    right = run_pdftotext(pdf, (w / 2, w / 2 + 20))
    sample = lambda ps: "\n".join(ps[:40])
    lf, rt, fl = sample(left), sample(right), sample(full)
    if len(lf) < 0.25 * len(fl) or len(rt) < 0.25 * len(fl):
        return full, False
    best_l = max(LANG_HINTS, key=lambda k: lang_score(lf, k))
    best_r = max(LANG_HINTS, key=lambda k: lang_score(rt, k))
    if best_l == best_r:
        return full, False
    chosen = left if best_l == want else right if best_r == want else full
    return chosen, chosen is not full


# Le sujet. Un passage qui n'en porte aucune trace n'a rien a faire dans un
# corpus destine a repondre sur la transposition de NIS 2.
TOPIC = re.compile(
    r"NIS\s?2|s[ée]curit[ée] des r[ée]seaux|cybers[ée]curit|entit[ée]s? (?:essentielle|importante)"
    r"|incident|notification|CSIRT|autorit[ée] nationale|registre|enregistrement"
    r"|audit|certification|framework|cyberfundamentals|CyFun|r[ée]silience"
    r"|security measure|risk management|supervis", re.I)


def clean(s):
    s = s.replace("\xa0", " ").replace("’", "'")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def chunks(text, doc, page):
    """Les passages d'une page, avec leur article quand il y en a un."""
    text = clean(text)
    if len(text) < MIN_CHARS:
        return []
    cuts = [m.start() for m in ART.finditer(text)]
    spans = []
    if cuts:
        cuts = [0] + cuts if cuts[0] > 0 else cuts
        for i, a in enumerate(cuts):
            b = cuts[i + 1] if i + 1 < len(cuts) else len(text)
            spans.append(text[a:b])
    else:
        spans = re.split(r"\n\s*\n", text)

    out = []
    for sp in spans:
        sp = sp.strip()
        while len(sp) > MAX_CHARS:
            cut = sp.rfind(". ", 0, MAX_CHARS)
            cut = cut + 1 if cut > MIN_CHARS else MAX_CHARS
            out.append(sp[:cut].strip())
            sp = sp[cut:].strip()
        if len(sp) >= MIN_CHARS:
            out.append(sp)

    res = []
    for sp in out:
        m = ART.match(sp)
        res.append({"doc": doc, "page": page, "art": m.group(1) if m else None,
                    "text": sp})
    return res


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: legal_corpus.py <ISO>")
    iso = sys.argv[1].upper()
    folder = ROOT / "ressources" / FOLDER.get(iso, iso)
    if not folder.is_dir():
        raise SystemExit("dossier introuvable : %s" % folder)

    pdfs = sorted(folder.glob("*.pdf"))
    if not pdfs:
        raise SystemExit("aucun PDF dans %s" % folder)

    corpus, per_doc = [], {}
    for pdf in pdfs:
        doc = pdf.stem
        pgs, split = pages(pdf)
        raw = kept = 0
        for i, page in enumerate(pgs, 1):
            # Le filtre porte sur la page, pas sur le passage. Un mot du sujet
            # peut apparaitre par hasard - « enregistrement » se dit aussi d'un
            # valorisateur de dechets, et le journal officiel en parle. Trois
            # occurrences sur une page, en revanche, designent le sujet.
            if len(TOPIC.findall(page)) < 3:
                raw += len(chunks(page, doc, i))
                continue
            for ch in chunks(page, doc, i):
                raw += 1
                if TOPIC.search(ch["text"]):
                    corpus.append(ch)
                    kept += 1
        per_doc[doc] = kept
        print("   %-42s %3d p. %s %5d passages retenus sur %d"
              % (doc[:42], len(pgs), "2 col." if split else "1 col.", kept, raw))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / ("%s.json" % iso)
    out.write_text(json.dumps({"iso": iso, "documents": per_doc,
                               "passages": corpus}, ensure_ascii=False),
                   encoding="utf-8")
    print("\n%d passages, %d documents -> %s (%d Ko)"
          % (len(corpus), len(per_doc), out.relative_to(ROOT),
             out.stat().st_size // 1024))


if __name__ == "__main__":
    main()
