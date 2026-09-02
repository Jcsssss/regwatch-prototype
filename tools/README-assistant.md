# L'assistant RegWatch — mise en route

L'onglet **Assistant** répond aux questions des consultants à partir des seules
données RegWatch. Il a besoin d'un endpoint de modèle ; la clé reste chez vous.

## Mise en route pour un consultant

L'endpoint du proxy de l'équipe est déjà pré-rempli dans l'outil. Il ne reste
qu'une chose à faire, une seule fois par navigateur :

1. Ouvrir `https://jcsssss.github.io/regwatch-prototype`, onglet **Assistant**.
2. Bouton ⚙ → coller la **clé du proxy** dans « Clé API » → Enregistrer.

Cette clé n'est pas la clé Azure : c'est un secret propre au proxy, demandez-la
à l'équipe NIS 2. Elle reste dans le `localStorage` de ce navigateur et n'est
envoyée qu'au proxy.

**Ouvrez la page publiée, pas le fichier local.** Un `regwatch.html` ouvert en
double-clic a pour origine `null`, que le proxy refuse (403).

## Où vit la clé Azure

Nulle part dans l'outil. Elle est dans les réglages de la Function App
(`azure-proxy/`), et ne descend jamais dans un navigateur. Le proxy est ce qui
rend cela possible — voir `azure-proxy/README.md` pour son déploiement et pour
ce qui protège réellement son endpoint.

## Utiliser sa propre clé Azure plutôt que le proxy

Toujours possible : ⚙ → mode **Azure OpenAI** → endpoint, déploiement, clé. Une
configuration déjà présente dans un navigateur n'est jamais écrasée par les
valeurs par défaut.

Si le test échoue avec une erreur réseau, c'est le CORS : Azure OpenAI ne répond
pas au préflight depuis une page web. Repli local :

```sh
python3 tools/chat_proxy.py     # lit le .env du dépôt
```

puis mode **Compatible OpenAI**, endpoint `http://localhost:8787/v1`.

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
