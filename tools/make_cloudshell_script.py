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

Shape of the output, and why it matters: the pasted block only WRITES a file,
which the person then runs. A block pasted straight into an interactive shell
runs *in* that shell, so `set -e` and `exit` close the session, and `read` can
swallow a newline still sitting in the paste buffer and come back empty. Both
happened. As a saved script, `read` gets a real terminal and a failure ends the
script instead of the session.

Output: azure-proxy/deploy-cloudshell.sh
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "azure-proxy"
FILES = ["function_app.py", "requirements.txt", "host.json"]
OUT = SRC / "deploy-cloudshell.sh"

HEAD = r'''# ============================================================================
#  RegWatch — proxy Azure : ÉTAPE 1 sur 2
#
#  Collez ce bloc entier dans Cloud Shell (portail Azure, icône >_ , Bash).
#  Il n'exécute rien : il écrit un script. Vous le lancerez à l'étape 2.
#
#  Généré par tools/make_cloudshell_script.py — ne pas modifier à la main.
# ============================================================================
cat > ~/regwatch-deploy.sh <<'REGWATCH_DEPLOY_EOF'
#!/usr/bin/env bash
set -uo pipefail

# ---- à ajuster si besoin ---------------------------------------------------
APP="${APP:-regwatch-proxy}"                 # doit être unique dans tout Azure
RG="${RG:-rg-regwatch}"                      # ex. RG=Agent_mapping pour réutiliser le vôtre
LOCATION="${LOCATION:-westeurope}"
ENDPOINT="${ENDPOINT:-https://nis2agent-resource.services.ai.azure.com}"
DEPLOYMENT="${DEPLOYMENT:-gpt-5.4-mini}"
API_VERSION="${API_VERSION:-2024-10-21}"
ORIGINS="${ORIGINS:-https://jcsssss.github.io}"
# Nom de stockage deterministe : relancer le script reutilise le meme compte
# au lieu d'en semer un nouveau a chaque essai.
STORAGE="${STORAGE:-st$(echo "$APP" | tr -cd 'a-z0-9' | cut -c1-16)}"
# ---------------------------------------------------------------------------

die() { echo; echo "!! $*"; echo "   Rien n'a ete supprime. Corrigez et relancez : bash ~/regwatch-deploy.sh"; exit 1; }

echo "Application : $APP"
echo "Groupe      : $RG"
echo "Region      : $LOCATION"
echo "Stockage    : $STORAGE"
echo

# La cle est demandee ici, jamais ecrite dans le script ni dans l'historique.
# Une saisie vide est redemandee plutot que de faire echouer le script.
if [ -z "${AOAI_KEY:-}" ]; then
  for _try in 1 2 3; do
    read -rsp "Cle Azure OpenAI (la saisie reste invisible) : " AOAI_KEY; echo
    [ -n "$AOAI_KEY" ] && break
    echo "  (vide — reessayez)"
  done
fi
[ -n "${AOAI_KEY:-}" ] || die "aucune cle saisie."

# Un secret propre au proxy, pour que l'endpoint ne soit pas ouvert a tous.
SHARED="$(openssl rand -hex 24)"

WORK="$(mktemp -d)" || die "impossible de creer un dossier temporaire."
cd "$WORK" || die "impossible d'entrer dans $WORK"
'''

TAIL = r'''
step() { echo; echo "== $1"; }
run()  { "$@" || die "echec : $*"; }

step "1/5  groupe de ressources"
run az group create -n "$RG" -l "$LOCATION" -o none

step "2/5  compte de stockage ($STORAGE)"
if az storage account show -n "$STORAGE" -g "$RG" -o none 2>/dev/null; then
  echo "   deja present, reutilise."
else
  run az storage account create -n "$STORAGE" -g "$RG" -l "$LOCATION" \
    --sku Standard_LRS --allow-blob-public-access false -o none
fi

step "3/5  Function App (Python 3.11, plan Consumption)"
if az functionapp show -n "$APP" -g "$RG" -o none 2>/dev/null; then
  echo "   deja presente, reutilisee."
else
  run az functionapp create -n "$APP" -g "$RG" \
    --storage-account "$STORAGE" --consumption-plan-location "$LOCATION" \
    --runtime python --runtime-version 3.11 --functions-version 4 --os-type Linux -o none
fi

step "4/5  reglages — le seul endroit ou la cle est ecrite"
run az functionapp config appsettings set -n "$APP" -g "$RG" --settings \
  AZURE_OPENAI_API_KEY="$AOAI_KEY" \
  AZURE_OPENAI_ENDPOINT="$ENDPOINT" \
  AZURE_OPENAI_DEPLOYMENT="$DEPLOYMENT" \
  AZURE_OPENAI_API_VERSION="$API_VERSION" \
  REGWATCH_ALLOWED_ORIGINS="$ORIGINS" \
  REGWATCH_SHARED_SECRET="$SHARED" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  ENABLE_ORYX_BUILD=true -o none
unset AOAI_KEY

step "5/5  publication du code"
run zip -qr proxy.zip function_app.py requirements.txt host.json
az functionapp deployment source config-zip -n "$APP" -g "$RG" --src proxy.zip -o none \
  || az functionapp deploy -n "$APP" -g "$RG" --src-path proxy.zip --type zip -o none \
  || die "la publication a echoue."

URL="https://$APP.azurewebsites.net/api/v1"
echo
echo "Verification (le premier demarrage peut prendre une minute)…"
OK=""
for i in 1 2 3 4 5 6 7 8; do
  sleep 12
  if curl -fsS "$URL/health" 2>/dev/null; then echo; OK=1; break; fi
  echo "   … pas encore pret ($i/8)"
done
[ -n "$OK" ] || echo "   !! /health ne repond pas encore. Reessayez dans deux minutes :  curl $URL/health"

cat <<INFO

============================================================================
  A reporter dans RegWatch : engrenage -> mode « Compatible OpenAI »

     Endpoint  : $URL
     Cle API   : $SHARED

  Cette « cle » n'est PAS la cle Azure : c'est un secret propre au proxy,
  revocable seul, sans toucher au compte Azure OpenAI. La vraie cle reste
  dans les reglages de la Function et ne descend jamais dans un navigateur.

  Notez-la maintenant. Pour la retrouver plus tard :
     az functionapp config appsettings list -n $APP -g $RG \
       --query "[?name=='REGWATCH_SHARED_SECRET'].value" -o tsv

  Pour la changer :
     az functionapp config appsettings set -n $APP -g $RG \
       --settings REGWATCH_SHARED_SECRET="\$(openssl rand -hex 24)"

  Pour tout supprimer :
     az group delete -n $RG --yes
============================================================================
INFO
REGWATCH_DEPLOY_EOF

chmod +x ~/regwatch-deploy.sh
echo
echo "Script ecrit : ~/regwatch-deploy.sh"
echo
echo "ETAPE 2 — lancez-le :"
echo "    bash ~/regwatch-deploy.sh"
echo
echo "Pour reutiliser votre groupe de ressources existant :"
echo "    RG=Agent_mapping bash ~/regwatch-deploy.sh"
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
