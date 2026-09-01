# ressources/ — matériel source, gardé en local

Ce dossier reçoit les fichiers à partir desquels RegWatch est construit :
classeurs comparatifs, decks WATCH, charte graphique, gabarits de slides.

**Le dossier est suivi par git, son contenu ne l'est pas.** Ce n'est pas une
précaution abstraite : GitHub Pages sert l'intégralité de l'arborescence du
dépôt, donc un fichier déposé ici et poussé deviendrait téléchargeable à une
URL publique — même si le dépôt est privé. Vérifiable :

    curl -I https://jcsssss.github.io/regwatch-prototype/data/countries.json

Pour pousser un fichier délibérément, il faut donc le dire explicitement :

    git add -f ressources/<fichier>

## Ce qui est attendu ici

| Fichier | Sert à |
|---|---|
| `CYBER WATCH5_Technical inventory.xlsx` | classeur comparatif NIS 2 — source des fiches pays et des KPI |
| *(à venir)* classeur comparatif REC | même rôle pour le module REC |
| `CYBER WATCH3_…pptx` | deck de veille NIS 2 |
| `template-pays.pptx` | gabarit des slides pays générées |
| `Guidelines nouvelle charte graphique.pdf` | charte graphique Wavestone |

## Les outils qui lisent ce dossier

Tous prennent un chemin en argument — rien n'est codé en dur, c'est ce qui rend
la chaîne réutilisable pour une deuxième réglementation :

    python3 tools/excel_cellmap.py     "ressources/<classeur>.xlsx"   # cartographie des cellules
    python3 tools/excel_to_countries.py "ressources/<classeur>.xlsx"  # fiches pays
    python3 tools/kpi_extract.py        "ressources/<classeur>.xlsx"  # table des indicateurs
    python3 tools/embed_deck_template.py "ressources/template-pays.pptx"
