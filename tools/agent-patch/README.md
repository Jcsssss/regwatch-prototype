# Brancher l'agent de veille sur RegWatch

Deux modes, selon l'infrastructure disponible. Le mode A marche aujourd'hui, sans rien
héberger. Le mode B est la cible, et devient possible dès que RegWatch a un backend.

---

## Mode A — export manuel (actif aujourd'hui)

Aucune infrastructure. L'agent tourne comme d'habitude et écrit dans son classeur ;
RegWatch lit ce classeur.

```bash
# 1. après un run de l'agent, régénérer les items
python3 tools/veille_to_watchitems.py "<chemin>/agent_veille_NIS2.xlsx"

# 2. reconstruire le site
zsh src/build.sh
```

Produit `data/watch-items.json` (le contrat) et `src/data_watch.js` (le bundle standalone).
Sans `src/data_watch.js`, le build retombe sur la file de démo de `data_c4.js` — la démo
reste donc toujours constructible, y compris sans le classeur.

**Limite assumée** : deux commandes manuelles après chaque run hebdomadaire.

---

## Mode B — push automatique (cible)

L'agent appelle RegWatch en fin de run. Plus d'étape manuelle : un run de l'agent
alimente directement la file de validation.

### Côté agent — 3 lignes

Copier `regwatch_push.py` à côté de `nis2_agent_v2.py`, puis dans `run_agent()`,
**juste après `save_state(state)`** :

```python
from regwatch_push import push_to_regwatch
push_to_regwatch(added_items)
```

Placement volontaire : le classeur est déjà sauvegardé, donc un échec du push ne coûte
ni la collecte ni les appels Azure OpenAI du run. Le module ne lève jamais d'exception
et ne fait rien tant que `REGWATCH_API_URL` n'est pas défini — on peut donc le poser
dans le repo avant que l'API existe.

Ajouter au `.env` de l'agent :

```
REGWATCH_API_URL=https://regwatch.<host>/api/watch-items
REGWATCH_API_TOKEN=<jeton émis par RegWatch>
REGWATCH_PUSH_TIMEOUT=30
```

### Côté RegWatch — l'endpoint à implémenter

`POST /api/watch-items` — `Authorization: Bearer <token>`

```json
{
  "source": "agent de veille NIS2",
  "runAt": "2026-08-17T08:41:12+02:00",
  "count": 14,
  "items": [
    {
      "id": "REG-20260814115203",
      "detected": "2026-08-14",
      "iso": "IT",
      "title": "…",
      "summary": "…",
      "source": { "name": "ACN", "url": "https://…", "type": "official" },
      "status": "pending",
      "action": "…",
      "agent": {
        "score": 8,
        "justification": "…",
        "obligations": "…",
        "impact": "Fort",
        "entities": "…",
        "publishedOn": "2026-08-07",
        "inForceOn": "",
        "textType": "actualité réglementaire"
      }
    }
  ]
}
```

Trois règles non négociables côté serveur :

1. **`status` est forcé à `pending` à l'ingestion**, quoi que contienne la charge utile.
   Rien ne se publie sans validateur humain (cahier des charges §1.2 et §5.4).
2. **`id` est la clé d'idempotence.** Un re-run qui repousse le même item ne doit pas
   créer de doublon ni écraser une décision de validation déjà prise.
3. **`iso` est validé contre la liste des fiches pays.** Un code inconnu est rejeté avec
   un message explicite, pas silencieusement ignoré.

Réponse attendue : `200` avec `{ "accepted": n, "duplicates": n, "rejected": [...] }`.

---

## Ce qui reste à corriger en amont

Ces points sont des rustines côté RegWatch tant qu'ils ne sont pas traités dans l'agent :

| Problème | Rustine actuelle | Vrai correctif |
|---|---|---|
| `Pays / Zone` en texte libre français, séparateurs incohérents (`France; UE`, `France;Union Européenne`) | table de correspondance dupliquée dans `veille_to_watchitems.py` et `regwatch_push.py` | ajouter une colonne `ISO` à `tblVeille` et supprimer les deux tables |
| `Date détection` tantôt ISO, tantôt série Excel | normalisation à la lecture | écrire une date ISO systématiquement |
| Items UE (~20 %) sans fiche pays cible | `iso: "EU"`, affichés mais non publiables | créer une fiche « Union européenne » dans RegWatch |
| Analyses en français, interface en anglais | aucune | trancher la langue de l'outil |
| Agent attaché à un poste (`run_agent.bat` → chemin OneDrive nominatif) | aucune | Azure Function planifiée (cahier des charges §5.3) |
