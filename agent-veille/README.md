# Agent de veille — tout ce qui touche à la collecte

Ce dossier regroupe le code RegWatch relatif à l'agent de veille réglementaire :
préflight, tests, patchs à appliquer à l'agent, et intégration.

## L'agent RegWatch (depuis le 18 septembre 2026)

La veille tourne désormais **depuis ce dépôt** : `regwatch_agent.py`. Il reprend le déroulé
de l'ancien agent (flux RSS, pages web avec sélecteur CSS et récolte des liens, API ; tri par
le modèle ; contenus anciens écartés ; doublons ; fiche complète) et écrit **les mêmes colonnes**
que l'ancien classeur, dans `data/veille/records.json`. Le convertisseur les lit comme il lisait
le classeur : la file de veille de l'interface garde tous ses champs.

```sh
python3 agent-veille/regwatch_agent.py pipeline    # une passe complète, jusqu'au site reconstruit
python3 agent-veille/regwatch_agent.py run --dry   # lire les sources sans appeler le modèle
python3 agent-veille/regwatch_agent.py run --only "BSI"   # une seule source, pour tester
```

| Fichier | Contenu |
|---|---|
| `data/veille/sources.json` | le registre (76 sources, 51 actives), à modifier à la main |
| `data/veille/records.json` | toutes les détections, anciennes et nouvelles |
| `data/veille/state.json` | pages déjà vues, URL déjà jugées, date de la dernière passe complète |

La fenêtre de recherche part de la **dernière passe complète** (moins 3 jours, 60 jours au plus) :
un agent qui n'a pas tourné pendant un mois ne perd pas ce mois-là. Configuration Azure dans
`.env`. Le registre, les détections et la mémoire de l'ancien agent ont été importés le
18 septembre 2026 (`regwatch_agent.py import <classeur> --state <state.json>`), y compris les
33 détections du 28 août qui n'étaient jamais arrivées dans l'outil.

### Ce qu'un doublon doit prouver

Un élément écarté comme doublon ne revient jamais : c'est le seul rejet que personne ne voit,
et il a coûté une détection. Le 30 septembre 2026, l'article annonçant l'inscription de la
transposition française à l'ordre du jour de l'Assemblée nationale a été rangé comme doublon
d'un article du 23 août sur une réflexion d'organisation après le piratage de la DGFiP. Même
pays, même directive, fait différent.

Trois garde-fous, du plus mou au plus dur :

1. **la règle écrite** : un doublon rapporte le même **événement**, pas le même sujet ; une
   étape de procédure franchie n'est jamais un doublon d'un contenu qui ne l'annonce pas ; en
   cas d'hésitation, ce n'est pas un doublon. Un élément en trop se rejette d'un clic dans la
   file, un élément manquant ne se voit pas ;
2. **le fait commun doit être nommé**, et l'identifiant désigné doit exister dans la liste
   montrée au modèle. Sur la même détection, le modèle a répondu « doublon de
   `REG-202609301409??-001` » — un identifiant inventé ;
3. **les mots d'étape sont vérifiés par le code** (`STEP_WORDS`) : si le nouvel élément nomme
   une étape — ordre du jour, vote, adoption, promulgation, publication au journal officiel,
   entrée en vigueur, ouverture d'un enregistrement — que l'élément désigné ne nomme pas, ce
   n'est pas un doublon, quoi qu'en dise le modèle. C'est ce troisième garde-fou qui a récupéré
   la détection ; les deux premiers n'ont pas suffi.

Chaque rejet écrit maintenant sa raison et son fait commun dans le journal.

### L'espace de « NIS 2 », et ce qu'il cachait

Google News traite `NIS2` et `NIS 2` comme deux mots différents. Les requêtes du registre
étaient écrites collées : tout ce qui écrit « NIS 2 » avec l'espace — c'est-à-dire une bonne
part de la presse française — était invisible depuis le premier jour. Le rapport de la Cour des
comptes européenne sur la non-application de la directive (21 septembre 2026) n'est jamais
arrivé dans la file pour cette seule raison.

Les neuf requêtes Google News du registre demandent maintenant les deux graphies
(`"NIS 2" OR NIS2`). Trois sources françaises ont été ajoutées le 30 septembre 2026 :

| Source | Type | Pourquoi |
| --- | --- | --- |
| Assemblée nationale, dossier législatif `DLR5L17N50731` | Page web | L'étape parlementaire à la source, sans passer par la presse. Le sélecteur ne retient que le titre et le bloc des étapes : la page ne « bouge » que quand la procédure avance. |
| IT Social | RSS | Presse spécialisée française qui suit la transposition ; son flux est propre et daté. |
| L'Embarqué | Page web | Absent de Google News : aucune requête ne pouvait le voir. Pas de flux non plus, donc la une du site est surveillée. |

Une page surveillée n'est pas analysée à sa première visite : l'agent mémorise son contenu et
ne signale que ce qui s'y ajoute ensuite. Ces deux sources se tairont donc jusqu'au prochain
changement de la page.

### Un tri qui garde ce qu'un consultant attend

Le tri écartait « les rapports sans obligation ». C'est juste pour une étude d'éditeur, faux
pour un rapport public qui constate qu'un État n'applique pas la directive : c'est précisément
une information de veille. Le prompt distingue maintenant les deux, et garde explicitement les
étapes parlementaires d'un texte de transposition.

Deux garde-fous complètent la règle :

- **chaque rejet écrit sa raison** dans le journal, avec le score. Un rejet muet ne se relit
  pas, et c'est ce silence qui avait laissé passer le rapport de la Cour des comptes ;
- **une étape nommée dans le titre est rattrapée** : si le titre contient un mot d'étape
  (`STEP_WORDS`) et parle de NIS 2, l'élément entre dans la file comme « incertain », et c'est
  le validateur qui tranche — pas le modèle.

### Rattraper une passe

```sh
python3 agent-veille/regwatch_agent.py run --since 2026-09-15 --recheck --only "Google News FR"
```

`--since` élargit la fenêtre, `--recheck` rouvre les URL déjà écartées (les éléments déjà
retenus ne sont pas retouchés), `--only` limite aux sources dont le nom contient ce texte. Une
passe ainsi bornée ne devient pas la « dernière passe complète » : la fenêtre ordinaire de la
prochaine passe reste celle qu'elle aurait été.

## Historique : l'ancien agent, et nos modifications

| | Dépôt | Qui peut y écrire |
|---|---|---|
| **L'agent** `nis2_agent_v2.py` | `aurelienbrun-alt/Agent_mapping` | son auteur |
| **Nos adaptations** | ici, `agent-veille/` | nous |

Nous n'avons pas les droits sur le dépôt de l'agent, et le modifier directement
ne serait pas souhaitable même si nous les avions : c'est son travail, et il
tourne en production chez lui. Nos changements prennent donc la forme de
**modules déposés à côté de l'agent** plus un **patch documenté**, pas d'un fork
silencieux.

**À trancher avec l'équipe** : l'agent est un livrable interne Wavestone hébergé
sur un compte personnel, sans fichier de licence, écrit par un stagiaire. Le jour
où il part, la veille dépend d'un dépôt que personne ne contrôle. Rapatrier le
code sous un dépôt d'équipe est une décision à prendre avec lui et l'équipe, pas
une chose à faire unilatéralement. Ce dossier est prêt à l'accueillir.

## Réutiliser l'agent pour d'autres réglementations (REC, DORA, CRA)

L'agent est **déjà partiellement multi-réglementation** : son message de
démarrage annonce « NIS2 / CRA / PWDE » et `tblVeille` porte une colonne
`Règlementation IA`. Ce qui reste spécifique à NIS 2 :

| Élément | Aujourd'hui | Pour généraliser |
|---|---|---|
| Liste de sources | un onglet `tblSources` unique | une colonne `Réglementation` par source, ou un classeur par réglementation |
| Invites IA | « pertinence NIS 2 » en dur | le nom et le périmètre de la réglementation en paramètre |
| Table de sortie | `tblVeille` unique | une table par réglementation, ou la colonne `Règlementation` comme clé |
| Cellules cibles | carte du classeur NIS 2 | une carte par classeur comparatif (voir `tools/excel_cellmap.py`) |

Aucune de ces généralisations ne demande de réécriture : ce sont des paramètres
à extraire. Le vrai travail pour REC sera de **constituer le registre de sources**,
pas d'adapter le code.

## Fichiers

| Fichier | Rôle |
|---|---|
| `regwatch_fields.py` | correctifs Tier 1 à déposer près de l'agent (voir `patch-tier1.md`) |
| `patch-tier1.md` | les points d'insertion exacts, avec le pourquoi |
| `regwatch_push.py` | envoi de fin de run vers l'API RegWatch (mode B) |
| `integration-regwatch.md` | contrat d'API et modes d'intégration |
| `check_azure.py` | préflight de la configuration Azure OpenAI |
| `smoke_agent.py` | test de la moitié « collecte », sans clé ni coût |
| `probe_dates.py` | mesure la part des pages exposant une vraie date |
| `translate_items.py` | traduit titres et synthèses en anglais, avec cache |
