# RegWatch — veille réglementaire NIS 2 et REC

Prototype interne Wavestone. Suivi de la transposition de **NIS 2** (27 États membres,
plus le Royaume-Uni et la Norvège en comparateurs) et de **REC** (27 pays), avec la file
de veille alimentée par l'agent, un assistant ancré sur les données, et l'export Excel.

## Ouvrir l'outil

Le site tient dans **un seul fichier HTML**. Aucun serveur, aucune installation, aucune
connexion nécessaire pour le consulter : double-cliquez, ou copiez le fichier sur une clé,
dans Teams ou en pièce jointe.

Il en existe **deux versions**, produites par le même build :

| | fichier | taille | pour qui |
|---|---|---|---|
| **client** | `regwatch.html`, `index.html` | ~1,6 Mo | ce qui est publié et ce qui circule |
| **équipe** | `regwatch-equipe.html` | ~2,0 Mo | interne : rôle Développeur en plus |

En ligne (GitHub Pages) :

- client — <https://jcsssss.github.io/regwatch-prototype/>
- équipe — <https://jcsssss.github.io/regwatch-prototype/regwatch-equipe.html>

> **Ce que Pages expose.** Le dépôt est privé, mais Pages sert **tout son arbre** : le code
> source, les README et `data/` répondent 200 à qui a l'URL. Seul `.env` est hors d'atteinte,
> parce qu'il n'est pas versionné. À savoir avant de diffuser un lien, et à traiter — si le
> code doit rester privé — en publiant depuis une branche qui ne contient que les fichiers
> HTML, pas en retirant la version équipe.

Les validations faites dans l'outil sont enregistrées **dans le navigateur** (localStorage) :
chaque poste a son propre état, rien n'est partagé ni envoyé.

## Les rôles

Le sélecteur en haut à droite change ce qui est visible. Il ne protège rien : c'est un
confort de lecture, pas un contrôle d'accès.

- **Lecteur** — les fiches pays et l'historique. La file de veille lui est masquée : rien
  d'incertain ne lui est montré.
- **Validateur** — voit chaque élément détecté par l'agent, la phrase de la source qui l'a
  déclenché, et tranche. Aucune fiche ne bouge sans son accord.
- **Développeur** *(version équipe uniquement)* — un onglet de plus, **Assistant technique**,
  qui répond sur l'architecture en lisant la documentation et le code embarqués.

L'onglet **Diagnostic** — l'environnement du navigateur courant, affiché sans rien
transmettre — ne suit pas le rôle : il est replié derrière la **roue crantée** à côté du
sélecteur, ouverte à n'importe quel rôle. C'est l'information qu'on demande à quelqu'un qui
signale un problème ; l'obliger à changer de rôle pour la lire n'avait pas de sens. Il reste
absent de la barre d'onglets tant que la roue n'a pas été pressée, et l'état est mémorisé
dans le navigateur comme le rôle et la langue. La roue n'existe que dans la version équipe.

## Reconstruire

```sh
zsh src/build.sh          # produit les deux versions et les copie à la racine
```

Le script **exige zsh** et se relance de lui-même s'il est appelé autrement : ses listes de
fichiers sont des tableaux, et bash n'en prendrait que le premier élément — ce qui produisait
un fichier amputé de 90 % que `node --check` validait sans rien dire. Il compare donc aussi
les octets écrits à la somme des entrées, et échoue si la concaténation est partielle.

La copie vers `regwatch.html`, `index.html` et `regwatch-equipe.html` fait partie du build :
il n'y a plus d'étape manuelle à ne pas oublier.

Deux corpus doivent être régénérés quand leur source change — le build les prend s'ils
existent, et s'en passe sinon :

```sh
python3 tools/build_devdocs.py   # documentation -> src/data_devdocs.js
python3 tools/build_devcode.py   # code source   -> src/data_devcode.js
```

## Contenu du dossier

| | |
|---|---|
| `regwatch.html`, `index.html` | la version client, à distribuer telle quelle |
| `regwatch-equipe.html` | la version équipe |
| `src/` | les sources et le script de build |
| `tools/` | conversion des classeurs, KPI, export Excel, comparaisons |
| `agent-veille/` | tout ce qui touche à la collecte — voir son propre README |
| `azure-proxy/` | le proxy qui porte la clé du cabinet — voir son propre README |
| `data/` | états intermédiaires versionnés : file de veille, caches, mesures |
| `ressources/` | documents de travail — le dossier est suivi, **son contenu ne l'est pas** (`ressources/*` est ignoré) |
| `regwatch-cahier-des-charges.md` | le produit cible |

### Dans `src/`

- `shell_top.html` — squelette de page et feuille de style (charte Wavestone)
- `app_*.js` — l'application : routage, carte, fiches, file de veille, KPI, assistant
- `reg/nis2/`, `reg/rec/` — les données propres à chaque réglementation ; ajouter DORA,
  c'est ajouter un dossier et une ligne dans `build.sh`
- `map_data.js` — fond de carte, généré par `convert_map.py`
- `build.sh` — la construction

## La chaîne de veille, en bref

L'agent de collecte vit **dans un autre dépôt** (celui de son auteur) ; ce dépôt-ci porte ce
qui l'entoure : le registre de sources, la conversion de son classeur vers la file de veille,
le routage vers les cellules du classeur comparatif, le score de fiabilité et les mesures.
`agent-veille/README.md` détaille l'organisation.

```sh
python3 agent-veille/health.py     # l'état de la file, et ce qui a bougé depuis la référence
python3 agent-veille/health.py --probe   # en plus : quelles sources du registre bloquent l'agent
python3 agent-veille/collect.py    # une passe de collecte sur le registre de l'agent
python3 tools/veille_to_watchitems.py <classeur.xlsx>   # classeur -> file de veille
```

Les liens Google News mènent à une page de consentement, pas à l'article.
`tools/fetch_excerpts.py` retrouve alors l'article chez son éditeur (même identifiant
d'article dans la recherche RSS de Google News, puis flux, recherche WordPress ou plan de site
de l'éditeur) ; la file affiche l'extrait et le lien direct. Cela marche surtout sur les
articles récents : la recherche de Google News ne remonte pas loin.

`health.py` crie quand la file vieillit : les pourcentages restent identiques pendant que la
veille s'arrête, c'est le seul symptôme qui ne se voit pas tout seul.

## Vue européenne

L'onglet **Vue européenne** reprend les graphiques de l'étude comparative NIS 2 (transposition,
périmètre, incidents, enregistrement, référentiel, audits, sanctions), rangés comme la fiche
pays. Tout est recalculé à l'ouverture depuis les données du classeur Cyber Watch embarquées
dans l'outil : il suffit de régénérer les données et de reconstruire pour que les graphiques
suivent. Un filtre limite la comparaison à l'UE, aux pays transposés ou non, ou à une
sélection libre.

Chaque graphique propose un titre calculé depuis les données. Le consultant peut le réécrire
et ajouter son analyse ; ces textes restent dans son navigateur.

Chaque visuel se télécharge en PNG (bouton sur le graphique), avec son titre, son analyse et
sa source ; « Télécharger tous les visuels » les rassemble dans une archive ZIP, rangés par section.

**Mes visuels.** L'assistant (la baleine) crée des visuels du même style sur demande : « fais une
carte des pays qui demandent les plages IP à l'enregistrement ». L'IA ne calcule aucun chiffre :
elle choisit la feuille, la colonne et la forme (outils `describe_columns` puis `create_visual`),
et l'outil compte les pays dans le classeur. Le bouton « Ajouter à Mes visuels » enregistre la
description du visuel (pas ses chiffres) dans la section **Mes visuels** de la vue européenne, où
il se recalcule avec les données. Quand l'IA regroupe des réponses en texte libre, le
regroupement est affiché sous le visuel pour vérification.

Données utilisées :

```sh
python3 tools/sheets_to_countries.py <classeur.xlsx>   # feuilles P1 à P3 -> data_sheets.js
python3 tools/sectors_to_js.py <classeur.xlsx>         # feuille Sectors - P3 -> data_sectors.js
```

La feuille Sectors - P3 alimente aussi la fenêtre « Secteurs couverts » de la fiche pays, qui
montre maintenant le périmètre retenu par le pays (sous-secteurs ajoutés, précisions, écarts).

## Deux langues

Tout le site s'affiche en français ou en anglais, y compris le contenu : cases du classeur,
fiches rédigées, secteurs, exigences, thèmes, REC, registre des sources. Le contenu n'est tenu
que dans une langue ; ses traductions sont faites une fois, hors ligne, et embarquées :

```sh
node tools/content_i18n.js        # traduit les textes nouveaux -> src/data_content_i18n.js
```

À relancer après chaque mise à jour des données, avant le build. Le script lit la
configuration Azure OpenAI dans `.env`, ne traduit que ce qui manque, et garde tout dans
`data/content-i18n.json` (versionné) : une traduction corrigée à la main dans ce fichier est
conservée. Les noms officiels (lois, autorités, plateformes, référentiels) restent tels quels.
Un texte absent du dictionnaire s'affiche dans sa langue d'origine.

À l'affichage, `tc(texte)` donne la version de la langue courante. Les valeurs du classeur
sont traduites au moment de l'affichage seulement : la vue européenne classe les pays sur
leurs valeurs anglaises d'origine. Les slides générées suivent la langue choisie dans la
fenêtre de génération, dates comprises.

## Vos retours

Le bouton **Vos retours**, à droite des onglets, ouvre le Microsoft Forms de l'équipe dans une
fenêtre, avec un lien pour l'ouvrir dans un nouvel onglet (utile quand le navigateur refuse la
connexion Microsoft dans une page tierce). Les réponses arrivent dans le tableau du formulaire,
et son propriétaire est prévenu par courriel. Les deux adresses du formulaire sont en tête de
`src/app_feedback.js`.

## Assistant

L'assistant métier n'est plus un onglet : il s'ouvre depuis la **baleine en bas à droite**
de chaque page, dans un panneau qui se superpose à la page sans la quitter, à la manière du
volet Copilot des applications Office. Il sait quelle page est consultée : sur une fiche pays,
il l'annonce, propose des questions sur ce pays, et y rapporte les questions qui n'en nomment
pas. L'ancienne adresse `#/insights` ouvre le panneau.

Les deux assistants — métier et technique — passent par le proxy Azure du cabinet, qui porte
la clé : elle n'est **jamais** dans la page. Conséquence à connaître : le proxy n'accepte que
l'origine publiée, donc **les assistants ne fonctionnent pas depuis un fichier ouvert en
local**. Le message affiché explique alors comment lancer le proxy local
(`python3 tools/chat_proxy.py`). Tout le reste de l'outil fonctionne hors ligne.

## Charte graphique

Violet `#451DC7` (titres, accent principal), vert `#04F06A` (accentuation ≤ 5 %, jamais de
texte blanc dessus), `#250F6B` en accent profond, fonctionnels `#4682B4` (infographies) et
`#FFCA4A` / `#FF2A49` (statuts). Police Aptos, repli Segoe UI. Les palettes de la carte et
des graphiques sont validées contraste et daltonisme, en clair comme en sombre.
