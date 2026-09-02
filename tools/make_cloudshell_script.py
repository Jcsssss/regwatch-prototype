#!/usr/bin/env python3
"""Build a single paste-into-Cloud-Shell script that deploys the proxy.

    python3 tools/make_cloudshell_script.py

The work machine that has the Azure access cannot clone this repository, so the
files have to travel some other way. Azure Cloud Shell is the way that needs
nothing installed and no GitHub account: it runs in the portal, it already has
`az`, and it has its own filesystem.

The script is GENERATED from azure-proxy/ rather than written by hand, so the
code that gets deployed is the code that is in the repository - a hand-copied
version would drift the first time the proxy changes.

Output: azure-proxy/deploy-cloudshell.sh
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "azure-proxy"
FILES = ["function_app.py", "requirements.txt", "host.json"]
OUT = SRC / "deploy-cloudshell.sh"

HEAD = r'''#!/usr/bin/env bash
# ============================================================================
#  RegWatch — déploiement du proxy depuis Azure Cloud Shell
#
#  À coller entièrement dans Cloud Shell (portail Azure, icône >_ , mode Bash).
#  Ne demande ni git, ni compte GitHub, ni fichier local.
#
#  Généré par tools/make_cloudshell_script.py — ne pas modifier à la main.
# ============================================================================
set -euo pipefail

# ---- à ajuster si besoin ---------------------------------------------------
APP="${APP:-regwatch-proxy}"                 # doit être unique dans tout Azure
RG="${RG:-rg-regwatch}"
LOCATION="${LOCATION:-westeurope}"
STORAGE="${STORAGE:-stregwatch$RANDOM}"      # 3-24 car., minuscules et chiffres
ENDPOINT="${ENDPOINT:-https://nis2agent-resource.services.ai.azure.com}"
DEPLOYMENT="${DEPLOYMENT:-gpt-5.4-mini}"
API_VERSION="${API_VERSION:-2024-10-21}"
ORIGINS="${ORIGINS:-https://jcsssss.github.io}"
# ---------------------------------------------------------------------------

echo "Application : $APP     groupe : $RG     région : $LOCATION"
echo

# La clé est demandée, jamais écrite dans le script ni dans l'historique.
read -rsp "Clé Azure OpenAI (la saisie reste invisible) : " AOAI_KEY; echo
[ -n "$AOAI_KEY" ] || { echo "!! clé vide, on s'arrête."; exit 1; }

# Un secret partagé, pour que l'endpoint ne soit pas ouvert à tous. C'est ce que
# les consultants colleront dans le champ « Clé API » de RegWatch.
SHARED="$(openssl rand -hex 24)"

WORK="$(mktemp -d)"; cd "$WORK"
echo "dossier de travail : $WORK"
'''

TAIL = r'''
echo
echo "== 1/5  groupe de ressources"
az group create -n "$RG" -l "$LOCATION" -o none

echo "== 2/5  compte de stockage ($STORAGE)"
az storage account create -n "$STORAGE" -g "$RG" -l "$LOCATION" \
  --sku Standard_LRS --allow-blob-public-access false -o none

echo "== 3/5  Function App (Python 3.11, plan Consumption)"
az functionapp create -n "$APP" -g "$RG" \
  --storage-account "$STORAGE" --consumption-plan-location "$LOCATION" \
  --runtime python --runtime-version 3.11 --functions-version 4 --os-type Linux -o none

echo "== 4/5  réglages — le seul endroit où la clé est écrite"
az functionapp config appsettings set -n "$APP" -g "$RG" --settings \
  AZURE_OPENAI_API_KEY="$AOAI_KEY" \
  AZURE_OPENAI_ENDPOINT="$ENDPOINT" \
  AZURE_OPENAI_DEPLOYMENT="$DEPLOYMENT" \
  AZURE_OPENAI_API_VERSION="$API_VERSION" \
  REGWATCH_ALLOWED_ORIGINS="$ORIGINS" \
  REGWATCH_SHARED_SECRET="$SHARED" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  ENABLE_ORYX_BUILD=true -o none
unset AOAI_KEY

echo "== 5/5  publication du code"
zip -qr proxy.zip function_app.py requirements.txt host.json
az functionapp deployment source config-zip -n "$APP" -g "$RG" --src proxy.zip -o none

echo
echo "Vérification (peut demander une minute le temps du premier démarrage)…"
URL="https://$APP.azurewebsites.net/api/v1"
for i in 1 2 3 4 5 6; do
  sleep 10
  if curl -fsS "$URL/health" 2>/dev/null; then echo; break; fi
  echo "  … pas encore prêt ($i/6)"
done

cat <<INFO

============================================================================
  À reporter dans RegWatch : engrenage -> mode « Compatible OpenAI »

     Endpoint  : $URL
     Clé API   : $SHARED

  Cette « clé » n'est PAS la clé Azure : c'est un secret propre au proxy,
  révocable seul, sans toucher au compte Azure OpenAI. La vraie clé reste
  dans les réglages de la Function et ne descend jamais dans un navigateur.

  Notez-la maintenant — elle n'est pas réaffichée. Pour la retrouver :
     az functionapp config appsettings list -n $APP -g $RG \
       --query "[?name=='REGWATCH_SHARED_SECRET'].value" -o tsv

  Pour la changer plus tard :
     az functionapp config appsettings set -n $APP -g $RG \
       --settings REGWATCH_SHARED_SECRET="\$(openssl rand -hex 24)"

  Pour tout supprimer :
     az group delete -n $RG --yes
============================================================================
INFO
'''


def main():
    if not SRC.exists():
        raise SystemExit("azure-proxy/ introuvable")
    parts = [HEAD]
    for name in FILES:
        body = (SRC / name).read_text(encoding="utf-8")
        if "\nPROXY_EOF\n" in body:
            raise SystemExit("%s contient le délimiteur PROXY_EOF" % name)
        # Quoted delimiter: the file content is written verbatim, no shell
        # expansion of the $ and ` that Python code is full of.
        parts.append("\necho \"  écriture de %s\"\ncat > %s <<'PROXY_EOF'\n%s\nPROXY_EOF\n"
                     % (name, name, body.rstrip("\n")))
    parts.append(TAIL)
    OUT.write_text("".join(parts), encoding="utf-8")
    OUT.chmod(0o755)
    print("%s écrit (%d lignes, %.1f Ko)"
          % (OUT.relative_to(ROOT), OUT.read_text(encoding="utf-8").count("\n"),
             OUT.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
