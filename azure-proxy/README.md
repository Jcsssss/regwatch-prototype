# Le proxy RegWatch sur Azure

RegWatch est un fichier statique : **tout ce qu'on y écrit est publié**. La page
déployée se télécharge sans authentification — une clé Azure OpenAI glissée
dedans serait une clé publique, facturée au cabinet par qui la trouve.

Ce proxy est l'endroit où la clé vit à la place. La page l'appelle et ne voit
jamais de secret.

Il parle la forme *chat completions* d'OpenAI, donc le mode **Compatible
OpenAI** de RegWatch pointe dessus sans changer une ligne de l'outil.

---

## 0. Depuis un poste sans git ni compte GitHub — Azure Cloud Shell

C'est le chemin à prendre quand les accès Azure sont sur une machine qui ne peut
pas cloner ce dépôt. Cloud Shell tourne dans le navigateur du portail : elle a
déjà `az`, son propre système de fichiers, et ne demande aucune installation.

1. Portail Azure → l'icône `>_` en haut → **Bash**. À l'écran d'accueil,
   *No storage account required* suffit.
2. **Étape 1** — coller tout le contenu de `deploy-cloudshell.sh`. Ce bloc
   n'exécute rien : il écrit `~/regwatch-deploy.sh`.
3. **Étape 2** — lancer le script :

   ```sh
   bash ~/regwatch-deploy.sh
   # ou, pour réutiliser un groupe de ressources existant :
   RG=Agent_mapping bash ~/regwatch-deploy.sh
   ```

Il crée les ressources, publie, vérifie, et affiche à la fin l'endpoint et le
secret à reporter dans RegWatch.

**Pourquoi en deux temps.** Un bloc collé s'exécute *dans* le shell interactif :
un `set -e` ou un `exit` y ferme la session, et `read` peut avaler un retour à
la ligne resté dans le tampon du collage et revenir vide. Les deux sont arrivés.
Écrit puis lancé, `read` reçoit un vrai terminal et un échec arrête le script,
pas la console.

Le script est rejouable : groupe, stockage et Function App existants sont
réutilisés au lieu d'échouer, et le nom du compte de stockage est déterministe
pour ne pas en semer un nouveau à chaque essai.

Il **ne contient aucun secret** — la clé Azure est demandée à la saisie, en
invisible, et n'est écrite ni dans le script ni dans l'historique du shell. Il
peut donc voyager par n'importe quel canal : un copier-coller depuis l'autre
poste, un mail à soi-même, ou la vue GitHub du fichier dans le navigateur du PC
(bouton *Copy raw file*).

Le script est **généré** depuis les fichiers de ce dossier :

```sh
python3 tools/make_cloudshell_script.py
```

Ne le modifiez pas à la main — corrigez `function_app.py` et régénérez, sinon le
code déployé cesse d'être le code du dépôt.

Si `config-zip` échoue sur une version récente d'`az`, la commande équivalente
est `az functionapp deploy --src-path proxy.zip --type zip -n "$APP" -g "$RG"`.

---

## 1. Déployer depuis un poste qui a le dépôt

Une fois, depuis ce dossier. Remplacez le nom de l'application par le vôtre —
il doit être unique dans tout Azure.

```sh
az login
az group create -n rg-regwatch -l westeurope

az storage account create -n stregwatchproxy -g rg-regwatch -l westeurope --sku Standard_LRS

az functionapp create \
  -n regwatch-proxy -g rg-regwatch \
  --storage-account stregwatchproxy \
  --consumption-plan-location westeurope \
  --runtime python --runtime-version 3.11 --functions-version 4 \
  --os-type Linux
```

Les réglages. **C'est le seul endroit où la clé est écrite.**

```sh
az functionapp config appsettings set -n regwatch-proxy -g rg-regwatch --settings \
  AZURE_OPENAI_API_KEY="<la clé du cabinet>" \
  AZURE_OPENAI_ENDPOINT="https://nis2agent-resource.services.ai.azure.com" \
  AZURE_OPENAI_DEPLOYMENT="gpt-5.4-mini" \
  AZURE_OPENAI_API_VERSION="2024-10-21" \
  REGWATCH_ALLOWED_ORIGINS="https://jcsssss.github.io"
```

Puis publier :

```sh
func azure functionapp publish regwatch-proxy --python
```

Ajoutez un secret partagé pour que l'endpoint ne soit pas ouvert à tous — le
script Cloud Shell le fait automatiquement :

```sh
az functionapp config appsettings set -n regwatch-proxy -g rg-regwatch \
  --settings REGWATCH_SHARED_SECRET="$(openssl rand -hex 24)"
```

(`func` vient d'Azure Functions Core Tools : `brew tap azure/functions && brew install azure-functions-core-tools@4`.)

Vérifier — cette route ne révèle aucune valeur, seulement ce qui manque :

```sh
curl https://regwatch-proxy.azurewebsites.net/api/v1/health
```

## 2. Brancher RegWatch

Engrenage → mode **Compatible OpenAI** → endpoint :

```
https://regwatch-proxy.azurewebsites.net/api/v1
```

Le champ « Clé API » : n'importe quoi si vous n'avez pas mis de
`REGWATCH_SHARED_SECRET`, le secret sinon (voir plus bas).

## 3. Ce qui protège réellement cet endpoint

À lire avant de le laisser tourner. Les trois options ne sont pas équivalentes.

### La liste d'origines — un garde-fou de coût, pas une serrure

`REGWATCH_ALLOWED_ORIGINS` empêche une page d'un autre site d'utiliser votre
quota : un navigateur ne ment pas sur son `Origin`. Mais `curl` envoie l'en-tête
qu'il veut. **C'est une protection contre l'abus par navigateur, pas contre
quelqu'un qui vise votre endpoint.** Nécessaire, jamais suffisante.

### Le secret partagé — un limiteur, pas un secret

```sh
az functionapp config appsettings set -n regwatch-proxy -g rg-regwatch \
  --settings REGWATCH_SHARED_SECRET="$(openssl rand -hex 24)"
```

Il est accepté dans l'en-tête `x-regwatch-key` **ou comme jeton bearer** — c'est
ce que le champ « Clé API » de RegWatch envoie déjà, donc rien ne change dans la
page : le consultant colle ce secret au lieu de la clé Azure.

Gain réel : la vraie clé ne quitte jamais Azure, et ce secret-ci se révoque en
une commande sans toucher au compte Azure OpenAI. Limite : il doit atteindre le
navigateur, donc il finit dans un `localStorage` et peut être lu par qui a accès
au poste. **Traitez-le comme un limiteur d'usage.**

### Easy Auth — la vraie serrure, et elle ne demande aucun code

Portail → la Function App → **Authentication** → *Add identity provider* →
Microsoft → *Require authentication*. Seuls les comptes du tenant passent.

Une réserve technique qui compte : le cookie de session Easy Auth est
*same-site*. Il ne sera donc **pas** envoyé par une page servie depuis
`jcsssss.github.io` vers `azurewebsites.net`. Pour que cette option fonctionne,
il faut servir la page depuis la même origine que le proxy — ce qui, au passage,
règle aussi le fait que la page soit publique aujourd'hui :

```sh
# la page rejoint le proxy, tout devient une seule origine protégée
az functionapp deployment source config-zip -n regwatch-proxy -g rg-regwatch --src site.zip
```

C'est la configuration cible si l'outil doit tourner sur tous les postes sans
que personne ne saisisse quoi que ce soit. Elle demande d'abandonner GitHub
Pages comme lieu de publication — ce qui est plutôt une bonne nouvelle.

## 4. Ce qui n'est pas journalisé

Rien du contenu. Les corps de requête portent des questions de consultants et du
contenu réglementaire client ; seules la taille et le code de retour amont sont
tracés. Si vous activez Application Insights, cela reste vrai.

## 5. Coût

Le plan Consumption facture à l'exécution : le premier million d'appels par mois
est gratuit, et RegWatch en fait 2 ou 3 par question. Le coût réel de l'outil
reste celui des jetons du modèle, mesuré autour de quelques dizaines de dollars
par mois pour dix consultants — le proxy n'y ajoute rien de perceptible.
