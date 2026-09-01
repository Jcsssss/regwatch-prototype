# L'assistant RegWatch — mise en route

L'onglet **Assistant** répond aux questions des consultants à partir des seules
données RegWatch. Il a besoin d'un endpoint de modèle ; la clé reste chez vous.

## Option 2 — la clé dans votre navigateur (ce qui est en place)

1. Ouvrez `regwatch.html`, onglet **Assistant**, bouton ⚙.
2. Mode **Azure OpenAI**, puis :
   - Endpoint : `https://<votre-ressource>.openai.azure.com`
   - Déploiement : le nom exact du déploiement (portail Azure → Deployments)
   - Clé API : `AZURE_OPENAI_API_KEY`
3. **Tester la connexion** avant d'enregistrer.

La clé est écrite dans le `localStorage` de ce navigateur et n'est envoyée qu'à
l'endpoint saisi. Elle ne fait jamais partie du fichier publié — donc rien à
craindre côté GitHub Pages, mais ne la saisissez pas sur un poste partagé.

### Si « Tester la connexion » échoue avec une erreur réseau

C'est le cas le plus probable au premier essai, et ce n'est pas un problème de
clé. Azure OpenAI ne répond pas au *preflight* CORS, donc le navigateur bloque
l'appel avant qu'il ne parte : la requête n'atteint jamais Azure. Repli :

```sh
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_ENDPOINT="https://xxx.openai.azure.com"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
python3 tools/chat_proxy.py
```

(ou simplement `python3 tools/chat_proxy.py` si `agent-veille/.env` est déjà
rempli — le proxy le lit.)

Puis dans l'assistant : mode **Compatible OpenAI**, endpoint
`http://localhost:8787/v1`, clé : n'importe quoi (elle est ignorée, la vraie
reste dans le proxy).

Le proxy n'écoute que sur `localhost`, ne stocke rien, et n'est **pas** ce qu'il
faut déployer : c'est l'Azure Function de l'option 1 qui prendra sa place, et
seul le champ « Endpoint » changera.

## Ce que l'assistant peut lire

Il n'a rien dans son prompt : il appelle des outils et lit ce qu'ils renvoient.
Les outils sont dans `src/app_corpus.js`.

| Outil | Ce qu'il sert |
|---|---|
| `list_countries` | une ligne par pays — maturité, transposition, retard, organisme d'audit |
| `get_country` | la fiche complète, jusqu'à 8 pays, sections citables |
| `query_kpi` | les 33 indicateurs du classeur comparatif × 29 pays |
| `search_corpus` | recherche par mots-clés dans les sections et la veille |
| `scope_rules` | les règles de périmètre nationales |
| `official_documents` | les dossiers SharePoint par pays |
| `draw_chart` | dessine un graphique sous la réponse (moteur `src/app_kpi.js`) |

Les puces grises au-dessus de chaque réponse montrent quels outils ont tourné :
c'est ce qui rend la réponse vérifiable.

## Limites à connaître avant de montrer l'outil à un client

- **Aucun inventaire de sites.** RegWatch ne connaît aucune entité cliente. Sur
  une question de périmètre, l'assistant expose les règles nationales et le dit :
  la conclusion est une hypothèse à confirmer par le consultant.
- **La conversation n'est pas enregistrée.** Recharger la page l'efface. C'est
  volontaire : un consultant y colle du détail client, qui n'a rien à faire sur
  disque dans un prototype.
- **Les éléments de veille sont de l'actualité datée**, pas du droit établi.
  L'assistant doit les étiqueter comme tels ; vérifiez qu'il le fait.
- Le modèle peut toujours se tromper en *résumant* ce qu'un outil a renvoyé.
  Les sources citées sont là pour que ce soit rattrapable en un clic.
