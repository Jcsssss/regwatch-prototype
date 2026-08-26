# Synchronisation classeur comparatif → fiches pays

Sens unique : **le classeur sur SharePoint fait foi**, RegWatch en est un miroir
en lecture. Rien n'est jamais réécrit dans le classeur — ni par le code, ni par
l'outil. C'est ce qui garantit que les formules, la mise en forme conditionnelle
et les slicers du classeur client ne peuvent pas être abîmés par un bug d'ici.

## La chaîne

```
SharePoint ──(1)──> copie locale ──(2)──> src/data_excel.js ──(3)──> le site
```

Tout se lance depuis **le dossier du projet**, dans le Terminal, avec le
`venv/` du projet — le python du système n'a pas `requests` :

```bash
cd ~/Downloads/regwatch-prototype

# 1. récupérer le classeur depuis SharePoint (Microsoft Graph, lecture seule)
./venv/bin/python tools/sharepoint_fetch.py

# 2. l'importer via la cartographie des champs
./venv/bin/python tools/excel_to_countries.py data/.cache/comparative.xlsx

# 3. reconstruire le site
zsh src/build.sh
```

La copie locale atterrit dans `data/.cache/`, qui est ignoré par git — comme le
cache de jeton, qui contient un jeton de rafraîchissement.

## Ce qu'il faut obtenir de l'IT avant que ça tourne

`sharepoint_fetch.py` est écrit et son encodage de lien est vérifié, mais il n'a
pas encore été exécuté contre le vrai SharePoint : cela demande des éléments que
nous n'avons pas.

| | Pour démarrer (code d'appareil) | Pour planifier (app-only) |
|---|---|---|
| Inscription d'application Entra ID | souhaitable | **obligatoire** |
| Permission | `Sites.Read.All` **déléguée** | **`Sites.Selected`** (application) |
| Portée réelle | ce que vous pouvez déjà ouvrir | **un seul site**, autorisé par l'admin |
| Consentement administrateur | non | **oui** |
| Intervention humaine | une connexion, puis silence | aucune |

### La permission à demander : `Sites.Selected`, jamais `Files.Read.All`

En **délégué**, l'application agit en votre nom : elle ne peut atteindre aucun
fichier que vous ne pouvez pas déjà ouvrir. Aucune exposition nouvelle.

En **application**, il n'y a plus d'utilisateur derrière. `Files.Read.All`
signifierait alors *tous les fichiers du tenant*, sites privés compris — hors de
question pour lire un classeur. `Sites.Selected` n'accorde **rien** par défaut :
un administrateur autorise ensuite l'application sur les seuls sites choisis. La
restriction tient à la configuration du tenant, pas à la bonne conduite du code.

Le brouillon de demande est dans `tools/demande-IT.md`.

### Avant le premier lancement

Le `venv/` du projet et le `.env` sont déjà en place. Si tu repars d'un clone :

```bash
python3 -m venv venv
./venv/bin/pip install requests openpyxl
cp .env.example .env      # puis renseigner l'URL et le tenant
```

`.env` et `venv/` sont ignorés par git.

**Commence par le code d'appareil.** Il fonctionne sur un compte ordinaire, sans
consentement administrateur : tu signes une fois dans le navigateur, le jeton de
rafraîchissement est mis en cache, les exécutions suivantes sont silencieuses.
C'est suffisant pour prouver la chaîne de bout en bout.

L'app-only est la cible pour la synchro planifiée, mais il demande une
inscription d'application et un consentement administrateur — donc l'IT.

### Configuration

```
SHAREPOINT_FILE_URL=<le lien « Copier le lien » du classeur dans SharePoint>
GRAPH_TENANT_ID=<identifiant de tenant, ou wavestone.com>
GRAPH_CLIENT_ID=<inscription d'application>          # optionnel en test
GRAPH_CLIENT_SECRET=<secret>                         # app-only uniquement
```

Pas d'identifiant de site ni de drive à chercher : Graph résout le lien de
partage directement.

En l'absence de `GRAPH_CLIENT_ID`, le script utilise le client public d'Azure
CLI pour prouver la plomberie. **À remplacer par une inscription Wavestone avant
toute planification** — un outil interne ne doit pas s'authentifier sous
l'identité d'un client Microsoft.

## Ce que l'import fait, et ne fait pas

Il **ajoute** ce que la fiche pays n'a pas : sept champs typés et deux sections
entières (sanctions, autorités détaillées).

Il **n'écrase pas** les champs existants. La comparaison classeur / fiches donne
145 valeurs concordantes et **132 divergentes**, de deux natures :

- le classeur est plus succinct et la fiche enrichie — écraser perdrait de
  l'information ;
- les deux se contredisent sur un fait — quelqu'un doit arbitrer.

Tant que cet arbitrage n'a pas eu lieu, appliquer mécaniquement « le classeur
fait foi » dégraderait l'outil sur la moitié des champs, sans que personne ne le
voie. La réconciliation est la seconde moitié du travail.
