# RegWatch — Cahier des charges
## Outil interne de veille réglementaire multi-directives (module 1 : NIS 2)

**Version 1.2 — juillet 2026 — document de travail interne Wavestone**
Prototype fonctionnel associé : *RegWatch — NIS 2 Transposition Tracker* (artifact web).

---

## 1. Contexte et objectifs

### 1.1 Constat
Le suivi des transpositions de la directive NIS 2 (27 États membres + Royaume-Uni + Norvège) repose aujourd'hui sur :
- des stagiaires qui se répartissent les pays et recherchent manuellement les nouveautés (sites officiels, presse, LinkedIn) ;
- un classeur Excel de KPIs et des supports PowerPoint (decks WATCH, WID) mis à jour à la main ;
- un agent de collecte développé récemment en interne (scraping de sources + classification/analyse par IA) qui écrit lui aussi dans un classeur Excel, sans porte de validation humaine avant publication ;
- une connaissance dispersée entre documents, sans point d'accès unique ni historique structuré.

Ce fonctionnement est chronophage, à faible valeur ajoutée pour les équipes, et fragile (perte de connaissance à chaque rotation de stagiaires, risque d'incohérences entre supports).

### 1.2 Objectifs de l'outil
1. **Centraliser** toutes les informations de veille NIS 2 (statuts, lois, frameworks, autorités, échéances, KPIs, sources) dans un référentiel unique consultable par tous les employés Wavestone — l'outil **se substitue intégralement aux classeurs Excel actuels** : toute information qu'on pouvait y consulter ou y mettre à jour doit exister dans l'outil et rester modifiable à la main.
2. **Automatiser la collecte** : surveillance des sources officielles et non officielles, détection et pré-résumé des nouveautés par IA, à charge pour un consultant de **valider avant publication**.
3. **Visualiser** l'avancement via une cartographie européenne interactive (niveaux de maturité 1–4, sémantique identique aux supports WID) et des KPIs comparatifs.
4. **Exporter** les données (Excel/CSV, image de carte, à terme trames de slides) pour alimenter les livrables clients.
5. **Être extensible** à d'autres réglementations (DORA, CER, CRA, AI Act…) sans refonte : le modèle de données est générique, NIS 2 n'est que le premier module.

### 1.3 Bénéfices attendus
- Temps stagiaires réorienté de la recherche brute vers la validation et l'analyse.
- Une seule source de vérité, datée et sourcée, pour les consultants et les livrables (WID, articles RiskInsight).
- Traçabilité complète : qui a validé quoi, quand, sur la base de quelle source.

---

## 2. Utilisateurs et rôles

| Rôle | Qui | Droits |
|---|---|---|
| **Lecteur** | Tout employé Wavestone (SSO) | Consultation de tout le contenu **publié**, exports |
| **Validateur** | Core team NIS 2 (désignée par réglementation) | Lecteur + accès à la file de validation, valider/rejeter/éditer, saisie manuelle, gestion des sources |
| **Administrateur** (V2) | 1–2 personnes | Validateur + gestion des rôles, des réglementations et du paramétrage du pipeline |

- Volumétrie cible : **quelques dizaines d'utilisateurs** ; pas d'exigence de montée en charge.
- Les items **en attente de validation ne sont visibles que des validateurs**.
- Les saisies manuelles issues d'échanges de place (informations pas encore publiques) portent un indicateur **« interne — ne pas diffuser »** jusqu'à publication officielle.

---

## 3. Périmètre fonctionnel

### 3.1 V1 (must have)
1. **Dashboard cartographique** : carte d'Europe choroplèthe par niveau de maturité (1 = travaux préliminaires, 2 = projet de loi au parlement, 3 = loi approuvée / framework provisoire ou indisponible, 4 = loi + framework final), tuiles KPI calculées (x/27 transposés, à l'heure, retard moyen, statuts frameworks), fil des dernières mises à jour validées, export PNG de la carte.
2. **Fiches pays structurées** (29 pays) : identité et statut, loi de transposition, framework et nombre d'exigences EE/IE, autorités, enregistrement, notification d'incidents, contrôles/audits, spécificités de périmètre, articulation avec les autres réglementations, recommandations Wavestone, prochaines étapes, **chronologie des événements**, **sources typées** (officielle / non officielle à vérifier / saisie consultant).
3. **File de validation (« Watch inbox »)** : file des items détectés (pipeline) et saisis (manuel) ; actions valider → publication (ajout à la chronologie du pays, mise à jour de la date de fiche) / rejeter (avec motif) ; journal des items traités.
4. **Saisie manuelle** : formulaire pays/date/titre/résumé/source/type, alimentant la même file.
5. **Édition manuelle complète des fiches** (validateurs) : chaque fiche pays est modifiable **champ à champ** — statut/maturité, tous les champs KPI, rubriques (ajout/modification/suppression de puces), chronologie, autorités, sources. Les fiches combinent ainsi deux flux : la **partie automatique** (événements publiés depuis la file de veille validée, marqués comme tels) et la **partie manuelle** (le reste du contenu, maintenu par les consultants). Chaque fiche éditée porte un marqueur « edited » avec la date ; retour possible aux données importées ; en production, journalisation auteur + horodatage.
6. **Vue Insights/KPIs** : tableau comparatif filtrable reprenant **toutes les colonnes du classeur KPI** (maturité, transposition, retard, framework, exigences EE/IE, échéances de conformité EE/IE, fréquences d'audit EE/IE, auto-évaluation, organe d'audit, canal d'enregistrement, canal incidents), graphiques (exigences EE vs IE, retards de transposition), **export CSV (séparateur « ; »)**.
7. **Registre des sources** : liste des sources surveillées et citées, avec niveau de confiance.
8. **Rôles lecteur/validateur** (SSO Entra ID en production).

### 3.2 V2 (should have)
- **Pipeline de collecte automatisé en production** (voir §5) — la V1 peut démarrer avec la file alimentée manuellement + alertes simples (RSS/newsletters), l'UX étant déjà prête.
- Notifications Teams/e-mail : nouvel item en file, changement de niveau d'un pays.
- Export XLSX natif et génération de trames PPTX (carte + tuiles au format WID).
- Deuxième réglementation activée (DORA ou CER) pour valider la généricité.
- Historique des modifications au niveau du champ (audit trail complet), diff entre versions de fiche.

### 3.3 Hors périmètre
- Données clients ou livrables clients (l'outil ne contient que de l'information réglementaire).
- Accès externe (clients) — pourrait devenir un produit dérivé, non couvert ici.

---

## 4. Modèle de données (générique multi-réglementations)

```
Regulation (nis2, dora, cer…)
 ├─ MaturityScale        # libellés des niveaux 1..n, propres à la réglementation
 ├─ CountryStatus        # 1 par (regulation × pays)
 │   ├─ maturity_level, framework_status (final|temporaire|aucun)
 │   ├─ kpi_fields (JSON typé : loi, dates, retard, req_EE/IE, délais, audit, enregistrement, incident…)
 │   ├─ Section[]        # rubriques configurables (framework, enregistrement, incidents, audits, périmètre, autres régl., reco)
 │   │   └─ Bullet[] ── source_ref
 │   ├─ Event[]          # chronologie : date, texte, source_ref, origine (pipeline|manuel), validated_by/at
 │   ├─ Authority[]
 │   └─ SourceRef[]
 ├─ Source               # registre : nom, URL, type (officielle|non officielle|manuelle), portée (UE|pays), méthode de collecte
 └─ WatchItem            # file de veille : detected_at, pays, titre, résumé, source, statut (pending|validated|rejected),
                         #   flag interne, action suggérée, validé_par/le, motif de rejet,
                         #   score_pertinence + justification, obligations, impact (issus de l'agent de collecte, cf. §5)
```

Principes :
- **Toute assertion publiée référence une source** (officielle, ou non officielle validée, ou saisie consultant).
- Les rubriques de fiche sont **configurables par réglementation** : DORA n'aura pas les mêmes sections que NIS 2, sans changement de schéma.
- Les KPIs sont des champs typés pour rester filtrables/exportables (pas du texte libre).
- Reprise de l'existant : import initial depuis le classeur KPI et les decks WATCH (déjà réalisé dans le prototype pour NIS 2 — 29 pays).

---

## 5. Pipeline de collecte automatisée et workflow de validation

### 5.1 Décision retenue : intégrer l'agent de veille existant plutôt qu'en construire un nouveau
Un agent de collecte NIS 2 a déjà été développé en interne (par un stagiaire, toujours présent dans les équipes) et couvre l'essentiel de la chaîne décrite plus bas. **RegWatch ne redéveloppe pas cette brique : il l'intègre**, ce qui réduit le chantier V2 à un travail d'adaptation/branchement plutôt qu'à un développement neuf (cf. roadmap §9). Le pipeline cible reste néanmoins décrit ci-dessous pour documenter ce que fait l'agent et ce qui doit changer pour s'insérer dans RegWatch.

### 5.2 Chaîne de traitement — état actuel de l'agent existant
```
[Task Scheduler] → [Sources déclarées (RSS/pages web/API)] → [Nettoyage & dédoublonnage] →
[Classification IA — Mistral : score de pertinence + justification] → [Analyse détaillée IA — Mistral : résumé, obligations, impact] →
[Écriture dans le classeur Excel de veille] + [Découverte de nouvelles sources → à valider]
```
Chaque étape, telle qu'implémentée aujourd'hui :
1. **Déclenchement récurrent** par Task Scheduler (Windows), fréquence paramétrable.
2. **Collecte** : le script lit la liste des sources déclarées dans un onglet Excel (RSS, pages web, API) et récupère les nouveaux contenus.
3. **Nettoyage** : suppression des doublons, contrôle des dates, exclusion des contenus trop anciens.
4. **Classification IA (Mistral)** : score de pertinence NIS 2 + justification pour chaque contenu collecté.
5. **Analyse détaillée IA (Mistral)** : pour les contenus retenus — résumé, obligations identifiées, impact.
6. **Publication actuelle** : les résultats sont ajoutés directement dans la table Excel de veille (ligne = source + analyse). L'agent régénère aussi un dashboard de suivi à chaque exécution (articles analysés, ajouts, erreurs).
7. **Découverte de sources** : l'agent peut proposer de nouvelles sources, ajoutées dans Excel comme « à valider ».

### 5.3 Ce qui doit changer pour l'intégrer à RegWatch
| Point | État actuel de l'agent | Adaptation nécessaire |
|---|---|---|
| **Sortie / cible d'écriture** | Écrit directement dans le classeur Excel (publication immédiate, pas de porte de validation humaine) | Rediriger la sortie vers la **file de validation RegWatch** (`WatchItem`, statut `pending`) via un appel API ou un fichier d'échange le temps que l'API existe. **Aucun item ne doit être publié sur une fiche pays sans passage par un validateur** — c'est une exigence non négociable posée dès le §1.2 de ce document ; le score IA de l'agent est une aide au tri, jamais une décision de publication. |
| **Champs produits** | Score + justification, résumé, obligations, impact | Mapper sur `WatchItem` : `score`/`justification` (déjà prévus comme aide à la priorisation dans la file), `résumé`, et deux champs à ajouter au modèle — `obligations` et `impact` (cf. §4) — affichés sur la carte de l'item en file de validation. |
| **Découverte de sources** | Ajoute les nouvelles sources dans Excel, « à valider » | Alimente directement le **registre de sources RegWatch** avec le statut « à valider » (même sémantique, cible différente) — pas de nouveau concept à créer. |
| **Déclenchement** | Task Scheduler sur un poste/serveur donné | Conservable tel quel en V1 (le script appelle l'API RegWatch en fin de run) ; en V2, migration possible vers un déclencheur cloud (Azure Function planifiée) si le poste actuel n'est pas fiable en continu (cf. risques §10). |
| **Fournisseur IA** | Mistral, déjà en usage et déjà budgété | Le sujet « quel LLM utiliser » est donc déjà tranché par l'existant — Azure OpenAI n'est plus une recommandation par défaut mais une **alternative** si Mistral devait être remplacé. L'interface IA de RegWatch reste conçue de façon pluggable (entrée : texte source + contexte pays ; sortie : JSON typé) pour ne pas dépendre de ce choix. |

### 5.4 Règles de gouvernance
- Rien n'est visible des lecteurs sans validation ; les items pending sont réservés aux validateurs — **y compris les items produits par l'agent existant**, qui doivent transiter par la Watch inbox comme n'importe quelle détection automatique.
- Le score de pertinence et l'analyse Mistral sont affichés au validateur comme aide à la décision, jamais comme statut de publication.
- Toute validation/rejet est tracée (qui, quand, motif) ; toute **édition manuelle de fiche** l'est également (auteur, date, champs modifiés), et la fiche distingue visuellement ce qui a été publié automatiquement (file de veille) de ce qui est maintenu à la main.
- Les sources non officielles ne peuvent être publiées qu'accompagnées d'une vérification ou requalifiées après confirmation officielle.
- Revue périodique du registre de sources (liens morts, nouvelles autorités, sources découvertes par l'agent).

---

## 6. Exports
| Export | Contenu | Version |
|---|---|---|
| CSV (« ; ») | Matrice KPI complète (compatible Excel FR) | V1 (fait dans le prototype) |
| PNG | Carte de maturité (fond + couleurs du thème) | V1 (fait dans le prototype) |
| XLSX | Classeur multi-onglets (KPI, chronologies, sources) | V2 |
| PPTX | Trames de slides format WID (carte, tuiles, tableaux) | V2 |

---

## 7. Exigences non fonctionnelles
- **Langue** : interface et contenu en **anglais** (réutilisable par les bureaux internationaux).
- **Sécurité** : outil interne uniquement ; SSO Entra ID ; pas de données clients ; les items « internes » (informations de place non publiques) sont limités aux validateurs jusqu'à publication officielle ; HTTPS ; journalisation des actions de validation.
- **Simplicité** : lecture « 3 clics max » — carte → pays → détail ; tout élément détaillé accessible mais jamais imposé.
- **Identité visuelle** : conformité à la **charte graphique Wavestone** (appliquée dans le prototype) — violet `#451DC7` pour les titres et l'accent principal, vert énergique `#04F06A` réservé à l'accentuation (≤ 5 % des surfaces, jamais de texte blanc sur vert), Accent 3 `#250F6B` en fin de rampe de maturité, couleurs fonctionnelles de la charte pour les infographies (`#4682B4`) et les statuts (`#FFCA4A` avertissement, `#FF2A49` alerte), typographie **Aptos / Aptos SemiBold** (repli Segoe UI).
- **Accessibilité** : palettes validées daltonisme et contrastes (rampe séquentielle mono-teinte, paires de séries testées CVD) en modes clair **et** sombre, navigation clavier.
- **Disponibilité** : usage bureau, criticité faible (best effort) ; sauvegarde quotidienne de la base suffit.
- **Traçabilité** : chaque donnée publiée = source + date + validateur.

---

## 8. Architecture cible et options d'hébergement

### 8.1 V0 — le prototype livré (démonstration)
Application web **autonome monofichier** (HTML/CSS/JS, aucune dépendance externe), données NIS 2 réelles embarquées, workflow de validation simulé en local, habillage conforme à la charte graphique Wavestone. Sert à démontrer l'usage et obtenir le go interne — pas de backend, pas de persistance partagée.

Distribution du prototype :
- **fichier local** `regwatch.html` (dossier `regwatch-prototype/`, avec sources et README) : s'ouvre par double-clic sur n'importe quel poste, sans installation ni réseau ;
- **version en ligne** (artifact Claude, privé par défaut, partageable par lien) pour les démonstrations à distance.

### 8.2 V1/V2 — architecture de production proposée
```
[SPA web (même UX que le prototype)]
        │ HTTPS + SSO Entra ID
[API backend (REST)]  ──  [Base de données PostgreSQL]
        │
[Agent de collecte existant — Task Scheduler, sources RSS/web/API, Mistral (score + analyse)]
        │ adapté pour écrire dans la file de validation RegWatch (au lieu du classeur Excel), cf. §5.3
[Notifications Teams / e-mail]  (V2)
```
- **Option A — Azure Wavestone (recommandée)** : App Service ou Container Apps + Azure Database for PostgreSQL + Entra ID ; l'agent de collecte existant est conservé (poste/scheduler actuel ou migration vers Azure Functions en V2 si besoin de fiabilité continue), Mistral reste le fournisseur IA. Cohérent avec l'écosystème interne, coût modeste (< 200 €/mois d'infrastructure à cette volumétrie) — d'autant réduit que la brique collecte + IA est déjà amortie.
- **Option B — Power Platform** (Power Apps + Dataverse + Power Automate + Copilot Studio) : plus rapide à faire valider, mais carte interactive, exports et pipeline multi-sources nettement plus contraints. À réserver si la DSI refuse tout développement spécifique.
- **Option C — mutualisation** sur une plateforme interne existante si disponible.

Stack proposée (option A) : front léger (le prototype est déjà en vanilla JS, portable vers React si standard interne), API Node.js ou Python (FastAPI), PostgreSQL, IaC minimal.

### 8.3 Reprise de données
- Import du classeur KPI (mapping direct — déjà modélisé) et des fiches WATCH (copier/structurer, une fois).
- Le prototype contient déjà la totalité du contenu NIS 2 à jour de juin–juillet 2026 : il peut servir de **jeu de données initial** exporté en JSON.

---

## 9. Roadmap indicative

| Phase | Contenu | Durée indicative |
|---|---|---|
| **V0 — Démo** | Prototype livré (ce document + artifact) ; recueil de feedback consultants/CTC | fait |
| **Cadrage DSI** | Choix hébergement + accès IA, validation sécurité | 2–3 semaines |
| **V1** | Backend + base + SSO + reprise de données + UX du prototype + saisie/validation + exports CSV/PNG | 6–8 semaines (1–2 dev) |
| **V1.5** | **Intégration de l'agent de collecte existant** : ajout de l'endpoint API pour recevoir ses résultats en `pending`, mapping des champs (score, obligations, impact), bascule découverte de sources → registre RegWatch ; test en parallèle de l'Excel avant coupure. Notifications Teams. | +2–3 semaines (intégration, pas un pipeline à écrire) |
| **V2** | XLSX/PPTX, 2ᵉ réglementation (DORA ou CER), audit trail fin, éventuelle migration du scheduler vers le cloud | 4–6 semaines |

Charge de fonctionnement cible : **≈ 0,5 à 1 j/semaine de validation** pour la core team (contre plusieurs jours de recherche manuelle aujourd'hui), + maintenance technique légère.

---

## 10. Risques et points d'attention

| Risque | Impact | Mitigation |
|---|---|---|
| Sites d'autorités hétérogènes / sans RSS, scraping fragile | Trous de collecte | Registre de sources avec état de santé ; fallback recherche web ; la validation humaine reste le filet |
| Qualité IA (faux positifs, mauvais pays) | Bruit dans la file | Score de confiance, règles de routage simples, feedback de rejet réinjecté dans les prompts |
| Langues sources (23+) | Résumés inexacts | LLM multilingues + lien systématique vers la source originale pour vérification |
| Adoption (retour à l'Excel) | Outil mort | Exports = ce que les équipes produisent déjà ; import initial complet pour être utile dès le jour 1 |
| Informations non publiques saisies à la main | Fuite | Flag « interne », visibilité restreinte aux validateurs, revue avant toute diffusion |
| Dépendance à un fournisseur IA | Blocage | Interface IA pluggable (cf. §5.3) — Mistral aujourd'hui, remplaçable sans refonte |
| Divergences entre sources internes (ex. délais du classeur KPI vs decks WATCH) | Incohérences | Règle « le document le plus récent fait foi », champ « dernière mise à jour » visible sur chaque fiche |
| Agent de collecte jamais exécuté en production réelle | Fiabilité et volumétrie réelles inconnues au moment du cadrage | Phase de test en parallèle (agent alimente la file de validation RegWatch pendant plusieurs semaines, Excel actuel conservé en secours) avant toute coupure de l'ancien processus |
| Connaissance de l'agent concentrée sur un seul stagiaire (encore présent à ce jour) | Risque classique de perte de connaissance si le stagiaire part avant la passation | Documenter le fonctionnement de l'agent et faire la passation technique **pendant que le stagiaire est disponible** — priorité avant tout autre chantier V1.5 |
| Sortie actuelle de l'agent = écriture directe en Excel, sans porte de validation humaine | Contredit l'exigence de validation obligatoire avant publication (§1.2) si l'agent est branché tel quel | Adapter impérativement la sortie de l'agent pour alimenter la file `pending` de RegWatch avant toute mise en production (cf. §5.3) — ne jamais autoriser une écriture directe sur une fiche pays |

---

## 11. Annexe — couverture du prototype livré

| Exigence | Statut dans le prototype |
|---|---|
| Carte maturité 1–4 + non-UE suivis (UK, NO) | ✅ interactive, export PNG, thèmes clair/sombre |
| 29 fiches pays complètes (données réelles juin–juillet 2026) | ✅ |
| Chronologies d'événements par pays | ✅ |
| Rôles lecteur/validateur | ✅ (sélecteur en en-tête ; SSO en production) |
| File de validation + saisie manuelle + traçabilité | ✅ (persistance locale navigateur, simulée) |
| Édition manuelle complète des fiches (statut, KPIs, rubriques, chronologie, autorités, sources) | ✅ (bouton « Edit record » en mode validateur ; marqueur « edited » ; retour aux données importées possible) |
| KPIs, graphiques EE/IE et retards, export CSV « ; » | ✅ (matrice avec toutes les colonnes du classeur KPI) |
| Registre des sources typées | ✅ |
| Multi-réglementations | ✅ maquetté (onglets DORA/CER/CRA « planned », modèle générique) |
| Intégration de l'agent de collecte existant (branchement sur la file de validation, mapping des champs), notifications, XLSX/PPTX | ❌ V1.5/V2 (cf. roadmap §9 — travail d'intégration, la brique collecte + IA existe déjà) |
