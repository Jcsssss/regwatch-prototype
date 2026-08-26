# Demande à l'IT — accès en lecture à un classeur SharePoint

Brouillon à adapter. Deux versions : **A** pour démarrer (souvent aucune action
IT nécessaire), **B** pour la mise en production.

Le point qui décide de tout : **`Sites.Selected`**. C'est la permission qui
n'accorde **rien** par défaut et qu'un administrateur restreint ensuite à un
site unique. C'est elle qu'il faut demander, jamais `Files.Read.All` en
permission application, qui donnerait accès à l'ensemble du tenant.

---

## A — À tenter d'abord, sans solliciter l'IT

En mode délégué (code d'appareil), l'application agit **en votre nom** et ne peut
atteindre aucun fichier que vous ne pouvez pas déjà ouvrir. Aucune exposition
nouvelle, donc aucun arbitrage de sécurité à demander.

```bash
python3 tools/sharepoint_fetch.py
```

Si le classeur se télécharge, il n'y a rien à demander pour l'instant. Passez à
la version B seulement pour la synchronisation planifiée, ou si vous obtenez une
erreur `AADSTS7000218` (flux client public bloqué) ou `AADSTS50076` (accès
conditionnel).

---

## B — Le message à envoyer

> **Objet : demande d'inscription d'application Entra ID — lecture d'un classeur SharePoint (équipe Cyber)**
>
> Bonjour,
>
> Je travaille sur un outil interne à l'équipe Cyber qui centralise notre veille
> réglementaire NIS 2 pour l'Europe. Aujourd'hui, cette veille vit dans un
> classeur Excel sur SharePoint que les consultants mettent à jour à la main.
> L'outil doit **lire ce classeur** pour afficher les informations sous une forme
> consultable et comparable entre pays.
>
> **Ce dont j'ai besoin**
>
> Une inscription d'application Entra ID, avec la permission Microsoft Graph
> **`Sites.Selected`** en **permission d'application**, puis l'autorisation de
> cette application **sur un seul site SharePoint** :
>
> ```
> Site        : /sites/WICCYB-DIGITALCOMPLIANCE
> Fichier     : .../01 - Cyber watch EU/CYBER WATCH5_Technical inventory.xlsx
> Rôle demandé: read  (lecture seule)
> ```
>
> **Pourquoi `Sites.Selected` et pas `Files.Read.All`**
>
> `Files.Read.All` en permission d'application donnerait à l'outil un accès en
> lecture à **l'ensemble des fichiers du tenant**. Ce n'est ni nécessaire ni
> souhaitable pour lire un seul classeur.
>
> `Sites.Selected` fonctionne à l'inverse : elle n'accorde **aucun accès** par
> elle-même. Après le consentement, vous exécutez une commande qui autorise
> l'application sur les sites de votre choix — ici un seul. Tout autre site,
> y compris les sites privés, reste **inaccessible**, et cela ne dépend pas de la
> bonne conduite de l'outil mais de la configuration côté tenant.
>
> La commande d'autorisation, pour information :
>
> ```http
> POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
> {
>   "roles": ["read"],
>   "grantedToIdentities": [{ "application": { "id": "{app-id}", "displayName": "RegWatch" } }]
> }
> ```
>
> **Sur les données concernées**
>
> - Le contenu est de la **veille réglementaire publique** : lois de
>   transposition NIS 2, autorités nationales, échéances, référentiels de
>   cybersécurité. Aucune donnée client, aucune donnée personnelle.
> - L'accès demandé est **strictement en lecture**. L'outil n'écrit jamais dans
>   le classeur — c'est délibéré : une portée en écriture mettrait les formules
>   et la mise en forme conditionnelle du fichier à portée d'un défaut logiciel,
>   sans contrepartie.
> - Un seul fichier est lu, à une fréquence faible (une fois par jour au plus).
> - L'outil est **interne à Wavestone** et n'est pas exposé à l'extérieur.
>
> **Ce que je vous demande concrètement**
>
> 1. Créer l'inscription d'application (nom proposé :
>    `RegWatch — lecture veille NIS 2`).
> 2. Accorder `Sites.Selected` en permission d'application, avec le consentement
>    administrateur.
> 3. Autoriser l'application en **lecture** sur le seul site
>    `WICCYB-DIGITALCOMPLIANCE`.
> 4. Me transmettre l'**ID d'application (client ID)** et le mode
>    d'authentification retenu (secret client, certificat, ou identité managée si
>    l'outil est hébergé sur Azure — c'est l'option que je privilégie, elle évite
>    tout secret à faire tourner).
>
> Si vous préférez commencer sans inscription d'application, le mode **délégué**
> (code d'appareil) fonctionne avec mon propre compte et ne donne accès à rien de
> plus que ce que je peux déjà ouvrir. C'est ce que j'utilise aujourd'hui pour les
> tests ; l'inscription ne devient nécessaire que pour la synchronisation
> automatique, qui doit tourner sans intervention humaine.
>
> Je reste disponible pour en discuter.
>
> Bien cordialement,

---

## Ce qu'il faut leur transmettre, prêt à copier

| Élément | Valeur |
|---|---|
| Tenant | `5de96c96-c87c-4dce-aad9-f5c557b52ac1` (`digiplace.onmicrosoft.com`) |
| Hôte SharePoint | `digiplace.sharepoint.com` |
| Site | `WICCYB-DIGITALCOMPLIANCE` |
| Fichier | `CYBER WATCH5_Technical inventory.xlsx` |
| Permission | `Sites.Selected` (application), rôle `read` |
| Alternative sans IT | délégué / code d'appareil |

## Si l'IT propose autre chose

- **« Prenez `Sites.Read.All` en application »** → refusez poliment : même
  problème que `Files.Read.All`, c'est tout le tenant. `Sites.Selected` existe
  précisément pour ce cas.
- **« Utilisez un compte de service »** → acceptable, mais l'identité managée
  est meilleure : pas de mot de passe à faire tourner ni à stocker.
- **« Passez par un export automatique du fichier »** → viable en dépannage,
  mais le fichier exporté devra vivre quelque part, et vous aurez déplacé la
  question de la confidentialité plutôt que de la résoudre.
