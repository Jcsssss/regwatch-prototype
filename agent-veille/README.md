# Agent de veille — tout ce qui touche à la collecte

Ce dossier regroupe le code RegWatch relatif à l'agent de veille réglementaire :
préflight, tests, patchs à appliquer à l'agent, et intégration.

## Où vit l'agent, et où vivent nos modifications

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
