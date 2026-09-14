#!/usr/bin/env python3
"""Embarquer dans l'outil les phrases ancrees, une fois relues.

    python3 tools/prose_to_js.py            # seulement les blocs relus
    python3 tools/prose_to_js.py --drafts   # brouillons compris, marques

    -> src/reg/nis2/data_prose.js

La barriere de relecture
  Par defaut, seuls les blocs dont « reviewed » vaut vrai sont embarques. C'est
  la meme regle que la file de veille : rien ne rejoint une fiche pays sans
  qu'un humain ait tranche, et une slide qui part chez un client merite au moins
  autant de soin.

  L'option --drafts existe pour montrer la chaine avant relecture. Elle ne
  contourne pas la regle, elle la deplace : chaque bloc non relu est marque, et
  le generateur porte la mention « brouillon, a relire » sur la slide. Un
  document qui sort de l'outil doit dire lui-meme ce qu'il vaut - le dire
  seulement dans une conversation ne protege personne.

Les citations
  Elles sont conservees telles quelles, entre crochets, en fin de puce. Une
  phrase de droit sans sa source n'est pas verifiable, et une slide dont on ne
  peut pas remonter a l'article n'est pas defendable devant un client.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGAL = ROOT / "data" / "legal"
OUT = ROOT / "src" / "reg" / "nis2" / "data_prose.js"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drafts", action="store_true",
                    help="embarquer aussi les blocs non relus, en les marquant")
    args = ap.parse_args()

    out, stats = {}, {"relus": 0, "brouillons": 0, "ecartes": 0}
    for f in sorted(LEGAL.glob("*-prose.json")):
        iso = f.name.split("-")[0].upper()
        blocks = json.loads(f.read_text(encoding="utf-8"))
        keep = {}
        for key, v in blocks.items():
            if not v.get("bullets"):
                continue
            if v.get("reviewed"):
                keep[key] = {"b": v["bullets"]}
                stats["relus"] += 1
            elif args.drafts:
                keep[key] = {"b": v["bullets"], "d": 1}
                stats["brouillons"] += 1
            else:
                stats["ecartes"] += 1
        if keep:
            out[iso] = keep

    OUT.write_text(
        "/* ---- Phrases redigees a partir des seuls textes legaux du pays.\n"
        "   Genere par tools/legal_prose.py, embarque par tools/prose_to_js.py.\n"
        "   Un bloc marque `d:1` n'a pas encore ete relu : la slide le dit. ---- */\n"
        "const PROSE = %s;\n" % json.dumps(out, ensure_ascii=False,
                                           separators=(",", ":")),
        encoding="utf-8")
    print("%d pays, %d blocs relus, %d brouillons, %d ecartes"
          % (len(out), stats["relus"], stats["brouillons"], stats["ecartes"]))
    print("%d Ko -> %s" % (OUT.stat().st_size // 1024, OUT.relative_to(ROOT)))


if __name__ == "__main__":
    main()
