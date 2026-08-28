# Patch Tier 1 — champs fiables en sortie d'agent

Déposer `regwatch_fields.py` à côté de `nis2_agent_v2.py`, puis appliquer les
quatre points ci-dessous. Chacun est indépendant et réversible.

```python
from regwatch_fields import (
    iso_codes, iso_date, resolve_publish_date, source_excerpt,
)
```

---

## 1. La date de publication cesse d'être inventée

**C'est le correctif le plus important du lot.**

Aujourd'hui, `fetch_web_page_items()` (~ligne 641) fait :

```python
today = datetime.now().strftime("%Y-%m-%d")
return [{..., "publish_date": today, ...}]
```

puis `run_agent()` (~ligne 2102) laisse le modèle écraser cette valeur :

```python
effective_publish_date = publish_date
if is_web_page and real_date_str:
    effective_publish_date = real_date_str
```

Une page web reçoit donc **la date du jour**, corrigée au mieux par une
**supposition** du modèle. D'où des articles réellement publiés en 2024 datés de
2026 dans le classeur.

### Ce que dit la mesure

Sonde sur les URLs réellement suivies (`probe_dates.py`) :

- **7 %** des pages surveillées exposent une date lisible par machine ;
- **37 %** des items pointent vers des **pages institutionnelles permanentes** —
  `ncsc.nl/en/about-us/statutory-mandate`, `acn.gov.it/portale/home`,
  `digital-strategy.ec.europa.eu/en/policies/…`, `gov.pl/web/cyfryzacja`.

Ces pages n'ont pas de date de publication **parce que ce ne sont pas des
publications**. Ce sont des pages permanentes qu'on édite. Le problème n'est donc
pas une extraction défaillante : c'est qu'on affirme une date qui n'existe pas.

### Le remplacement

```python
publish_date, date_source = resolve_publish_date(
    source_type=item.get("source_type"),
    feed_date=item.get("publish_date_feed"),   # date du flux RSS, si flux
    html=item.get("pending_html"),             # HTML brut, si page web
    model_date=real_date_str,                  # la supposition, en dernier recours
)
row_values["Date publication"] = publish_date          # peut rester vide
row_values["Origine date"] = date_source               # flux | page | ia | inconnue
```

Ordre volontaire : la date d'un flux est publiée par l'autorité elle-même, une
date extraite est lue dans la page, une date du modèle est une inférence. **La
date du jour n'est plus une option** — une page modifiée aujourd'hui ne dit rien
de la date de son contenu.

Prérequis : conserver le HTML brut dans l'item (`pending_html`), déjà téléchargé
dans `fetch_web_page_items()`, et garder la date du flux séparément dans
`fetch_rss_items()`.

Ajouter la colonne **`Origine date`** à `tblVeille`. Elle permet de distinguer un
fait d'une inférence sans ouvrir la source, et de filtrer sur les seules dates
fiables.

---

## 2. Codes ISO à côté des noms de pays

`Pays / Zone` reste tel quel ; on ajoute une colonne **`ISO`** :

```python
row_values["ISO"] = iso_codes(row_values["Pays / Zone"])   # "France; UE" -> "FR;EU"
```

Supprime la table de correspondance dupliquée côté RegWatch, qui casse
silencieusement à chaque orthographe nouvelle (`France;Union Européenne`,
`France; UE`, `Republique tcheque`…).

---

## 3. Dates normalisées à l'écriture

Le classeur mélange chaînes ISO et numéros de série Excel dans la même colonne.
Passer chaque date par `iso_date()` avant écriture :

```python
row_values["Date détection"]        = iso_date(now)
row_values["Date entrée en vigueur"] = iso_date(analysis.get("date_entree_vigueur"))
```

---

## 4. Conserver le texte de la source

L'agent télécharge déjà le contenu (`MAX_WEB_CHARS = 12000`), l'envoie à l'IA,
puis le jette. Ajouter une colonne **`Extrait source`** :

```python
row_values["Extrait source"] = source_excerpt(
    item.get("pending_text")     # pages web : le texte de la page
    or item.get("summary"))      # RSS : le resume du flux, ecrit par la source
```

Six cents caractères suffisent. Aujourd'hui RegWatch retélécharge chaque article
pour récupérer ce texte et n'y parvient que pour **83 items sur 164** — les liens
d'agrégateur résolvent vers un mur de consentement. L'agent, lui, a le texte en
main au moment de l'analyse.

Cette seule colonne rend `tools/fetch_excerpts.py` inutile et fait passer la
couverture de 51 % à 100 %.

---

## Colonnes à ajouter à `tblVeille`

| Colonne | Contenu | Remplace |
|---|---|---|
| `ISO` | `FR`, `FR;EU` | la table de correspondance côté RegWatch |
| `Origine date` | `flux` / `page` / `ia` / `inconnue` | une date affirmée sans preuve |
| `Extrait source` | 600 premiers caractères | un retéléchargement à 51 % de réussite |

Aucune colonne existante n'est modifiée ni supprimée : le patch est additif, et
un run non patché continue de fonctionner.


---

## 5. Une page d'index n'est pas une publication

Ajouté après vérification de trois items signalés comme faux : une FAQ, une page
de politique de la Commission, et une catégorie de FAQ - trois pages permanentes
déposées dans la file comme s'il s'agissait d'articles parus le jour même.

`classify_page(url, html)` tranche sur des signaux vérifiables, pas sur un avis
de modèle : forme de l'URL, `og:type`, densité de liens, présence d'une date
lisible. Il rend `article`, `index` ou `incertain` avec ses motifs.

```python
page_kind, page_why = classify_page(url, item.get("pending_html"))
if page_kind == "index":
    continue          # journalisé, compté, jamais écrit dans tblVeille
```

Mesuré sur six pages réelles, dont les trois signalées : **6/6 conformes**.
Le seuil de densité de liens est calé pour ne pas attraper un vrai article de
l'ANSSI (55 liens, ratio 115), qui serait autrement écarté par sa navigation.

Ajouter la colonne **`Type de page`** à `tblVeille` pour garder la trace de la
décision.

## 6. La date lue dans le corps de la page

`page_date()` ne lisait que les métadonnées. La page d'aide NIS 2 de l'ANSSI
affiche « Mis à jour le : 24/10/2024 » dans son texte, sans le déclarer en
métadonnée - l'outil affichait donc « publié le 11 juin 2026 » pour un contenu
de 2024.

`page_text_date()` lit ces mentions en français, anglais, allemand et
néerlandais. Sur l'exemple ci-dessus, la date remonte correctement à 2024-10-24.
