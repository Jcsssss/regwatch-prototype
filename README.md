# RegWatch : prototype NIS 2

Prototype autonome de l'outil de veille réglementaire NIS 2 (EU-27 + Royaume-Uni + Norvège).

## Ouvrir le site

**`regwatch.html` est le site complet, en un seul fichier.** Il n'a besoin d'aucun serveur,
d'aucune installation et d'aucune connexion internet :

- double-cliquez sur `regwatch.html` → il s'ouvre dans le navigateur ;
- pour le montrer sur un autre ordinateur : copiez ce seul fichier (clé USB, Teams,
  OneDrive, e-mail) et double-cliquez dessus là-bas.

**Déploiement Netlify (ou tout hébergeur statique)** : `index.html` est une copie
identique de `regwatch.html`, nommée ainsi pour être reconnue comme page d'accueil.
Après chaque mise à jour de `regwatch.html`, refaire `cp regwatch.html index.html`
avant de redéployer. Attention : un déploiement Netlify est accessible à quiconque a
l'URL — le contenu est public par nature (pas de données clients), mais pour un usage
interne préférez une URL non diffusée ou une protection par mot de passe.

Les actions de validation faites dans le prototype sont stockées localement dans le
navigateur (localStorage) — chaque machine a donc son propre état de démonstration.

## Modifier une fiche pays

1. En haut à droite, passer le rôle sur **Validator (NIS 2 core team)**.
2. Ouvrir une fiche pays → bouton **« ✎ Edit record »** (sous la date de mise à jour).
3. Tout est modifiable : statut/maturité, champs KPI, rubriques (ajouter/supprimer des
   puces), chronologie, autorités, sources. **Save & publish** met à jour carte, listes,
   matrice KPI et exports ; **Reset to imported data** restaure la fiche d'origine.

Les fiches combinent deux flux : les événements publiés automatiquement depuis la
**Watch inbox** validée (marqués en vert dans la chronologie) et le contenu maintenu
à la main par les consultants (le reste).

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `regwatch.html` | Le site autonome (à distribuer tel quel) |
| `regwatch-cahier-des-charges.md` | Cahier des charges du produit cible |
| `src/` | Sources séparées + script de build |

### Sources (`src/`)

- `shell_top.html` — structure de page + feuille de style (charte graphique Wavestone)
- `data_meta.js` — régulations, niveaux de maturité, sources globales
- `data_c1.js` … `data_c4.js` — les 29 fiches pays + file de veille
- `app_part1.js` / `app_part2.js` — logique applicative (routing, carte, graphiques, validation)
- `map_data.js` — fond de carte Europe (SVG généré)
- `convert_map.py` — génère `map_data.js` à partir d'un GeoJSON Europe
  (`https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson`)
- `build.sh` — reconstruit `regwatch.html` à partir des sources (`zsh build.sh`, nécessite Node)

## Charte graphique

Couleurs et typographie conformes à la charte Wavestone : violet `#451DC7`
(titres, accent principal), vert énergique `#04F06A` (accentuation ≤ 5 %, jamais
de texte blanc sur vert), Accent 3 `#250F6B`, couleurs fonctionnelles `#4682B4`
(infographies), `#FFCA4A` / `#FF2A49` (statuts). Police Aptos (repli Segoe UI).
Les palettes de la carte et des graphiques sont validées contrastes + daltonisme,
en mode clair et sombre.
