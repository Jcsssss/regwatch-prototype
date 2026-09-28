#!/usr/bin/env python3
"""Ou vit la carte des cellules du classeur comparatif, et comment la lire.

Une carte par reglementation : data/cellmap/<reg>.json (nis2, rec, dora...).
Elle dit, pour chaque feuille du classeur, ou se trouve la ligne d'en-tete, la
ligne de chaque pays et la colonne de chaque champ - c'est ce qui permet a la
veille de nommer la cellule exacte qu'une source ferait changer, et aux
extracteurs de savoir quelle ligne lire pour quel pays.

Pourquoi un fichier par reglementation
  NIS 2 et REC n'ont pas le meme classeur. Tant qu'il n'y en avait qu'un, la
  carte pouvait s'appeler data/excel-cellmap.json ; des le second, ce nom ne
  dit plus de quel classeur il parle. Les anciens chemins restent lus, pour
  qu'une copie du depot faite avant ce changement continue de fonctionner.

Regenerer une carte apres une modification du classeur :

    python3 tools/excel_cellmap.py "<classeur.xlsx>" --reg nis2
    python3 tools/excel_cellmap.py "<classeur.xlsx>" --reg nis2 --check   # sans ecrire
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REG = "nis2"
LEGACY = ROOT / "data" / "excel-cellmap.json"


def path_for(reg=DEFAULT_REG):
    """Le fichier de la reglementation ; l'ancien chemin sert encore de repli."""
    p = ROOT / "data" / "cellmap" / ("%s.json" % reg)
    if p.exists():
        return p
    if reg == DEFAULT_REG and LEGACY.exists():
        return LEGACY
    return p


def load(reg=DEFAULT_REG):
    """La carte, ou {} si elle n'a pas encore ete construite."""
    p = path_for(reg)
    if not p.exists():
        return {}
    data = json.loads(p.read_text(encoding="utf-8"))
    return data.get("sheets", data)


def full(reg=DEFAULT_REG):
    """La carte avec ses metadonnees (nom du classeur, compteurs)."""
    p = path_for(reg)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
