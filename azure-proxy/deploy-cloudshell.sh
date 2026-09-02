# ============================================================================
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
#
# Deux precautions, apprises a la dure. Le tampon d'entree est vide avant de
# lire : quelqu'un qui colle la commande AVEC les lignes d'explication qui la
# suivent verrait sinon `read` avaler la ligne suivante comme si c'etait la
# cle - en silence, puisque la saisie est masquee. Et la forme de la saisie est
# verifiee : une cle Azure n'a ni espace ni diese, donc ce qui en contient est
# une ligne collee par erreur, pas une cle.
flush_stdin() { read -r -t 0.3 -N 100000 _junk 2>/dev/null || true; }

key_looks_wrong() {
  case "$1" in
    "" )                 echo "vide" ;;
    *[[:space:]]* )      echo "elle contient un espace" ;;
    "#"* )               echo "elle commence par #, c'est une ligne de commentaire" ;;
    * ) [ ${#1} -lt 20 ] && echo "elle fait ${#1} caracteres, c'est trop court" ;;
  esac
}

if [ -z "${AOAI_KEY:-}" ]; then
  for _try in 1 2 3; do
    flush_stdin
    read -rsp "Cle Azure OpenAI (la saisie reste invisible) : " AOAI_KEY; echo
    _why="$(key_looks_wrong "${AOAI_KEY:-}")"
    [ -z "$_why" ] && break
    echo "  Cela ne ressemble pas a une cle : $_why."
    echo "  Collez UNIQUEMENT la cle, sans les lignes qui l'entourent."
    AOAI_KEY=""
  done
fi
[ -n "${AOAI_KEY:-}" ] || die "aucune cle valide saisie."

# Un secret propre au proxy, pour que l'endpoint ne soit pas ouvert a tous.
SHARED="$(openssl rand -hex 24)"

WORK="$(mktemp -d)" || die "impossible de creer un dossier temporaire."
cd "$WORK" || die "impossible d'entrer dans $WORK"

echo "  écriture de function_app.py"
cat > function_app.py <<'PROXY_EOF'
"""RegWatch chat proxy — an Azure Function that holds the key so the page does not.

RegWatch is a static file. Anything written into it is published: the deployed
page is downloadable by anyone, so a shared Azure OpenAI key baked in would be a
public key, billed to the firm by whoever finds it. This Function is where the
key lives instead. The page calls it and never sees a secret.

It speaks the OpenAI chat-completions shape on purpose, so RegWatch's existing
"OpenAI-compatible" mode points at it with no code change:

    endpoint = https://<app>.azurewebsites.net/api/v1

Application settings (Azure portal -> Configuration, or `az functionapp config
appsettings set`):

    AZURE_OPENAI_API_KEY        the firm's key — set here, nowhere else
    AZURE_OPENAI_ENDPOINT       https://<resource>.services.ai.azure.com
    AZURE_OPENAI_DEPLOYMENT     e.g. gpt-5.4-mini
    AZURE_OPENAI_API_VERSION    optional, defaults below
    REGWATCH_ALLOWED_ORIGINS    comma-separated, e.g. https://jcsssss.github.io
    REGWATCH_SHARED_SECRET      optional; when set, callers must send it in
                                the x-regwatch-key header

On what protects this endpoint — worth reading before deploying:

  The origin allowlist stops a browser on another site from using your quota,
  because a browser will not lie about Origin. It is NOT a security boundary:
  curl sends whatever header it likes. It is a cost guard, not a lock.

  A real lock is Easy Auth (Authentication -> Microsoft, require authentication),
  which admits only tenant accounts and needs no code here. Its session cookie is
  same-site, so it works when the page is served from this same Function App —
  which is also how you stop publishing the page itself. See README.md.

  REGWATCH_SHARED_SECRET sits in between: revocable and rate-limitable, but it
  has to reach the browser, so treat it as a throttle rather than a secret. It
  is accepted as a bearer token too, which is what RegWatch's "API key" box
  already sends - so switching to it needs no change in the page.

Nothing about a request is logged beyond its shape. The bodies carry client
questions and regulatory content, and an internal tool has no business keeping
them in Application Insights.
"""

import json
import logging
import os
import urllib.error
import urllib.request

import azure.functions as func

app = func.FunctionApp()

DEFAULT_API_VERSION = "2024-10-21"
MAX_BODY = 1024 * 1024          # a conversation, not an upload
UPSTREAM_TIMEOUT = 120


def _settings():
    missing = [name for name in ("AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT",
                                 "AZURE_OPENAI_DEPLOYMENT") if not os.environ.get(name)]
    return {
        "key": os.environ.get("AZURE_OPENAI_API_KEY", ""),
        "endpoint": os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/"),
        "deployment": os.environ.get("AZURE_OPENAI_DEPLOYMENT", ""),
        "version": os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
        "missing": missing,
    }


def allowed_origins():
    raw = os.environ.get("REGWATCH_ALLOWED_ORIGINS", "")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def cors_headers(origin):
    """Echo the caller's origin when it is allowed, so credentials stay possible.

    A wildcard would work for this endpoint today and would stop working the day
    Easy Auth is turned on, because a credentialed request rejects `*`.
    """
    allowed = allowed_origins()
    value = origin if (origin and origin.rstrip("/") in allowed) else (allowed[0] if allowed else "")
    headers = {
        "Access-Control-Allow-Headers": "Content-Type, Authorization, api-key, x-regwatch-key",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    }
    if value:
        headers["Access-Control-Allow-Origin"] = value
        headers["Access-Control-Allow-Credentials"] = "true"
    return headers


def reply(status, payload, origin):
    return func.HttpResponse(
        json.dumps(payload) if not isinstance(payload, (bytes, bytearray)) else payload,
        status_code=status, mimetype="application/json", headers=cors_headers(origin))


def error(status, message, origin):
    # The OpenAI error shape, because RegWatch already reads it to tell the three
    # failure modes apart.
    return reply(status, {"error": {"message": message}}, origin)


@app.route(route="v1/chat/completions", methods=["POST", "OPTIONS"],
           auth_level=func.AuthLevel.ANONYMOUS)
def chat_completions(req: func.HttpRequest) -> func.HttpResponse:
    origin = req.headers.get("Origin", "")

    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=cors_headers(origin))

    allowed = allowed_origins()
    if allowed and origin and origin.rstrip("/") not in allowed:
        logging.warning("origine refusée")
        return error(403, "This origin is not allowed to use the RegWatch proxy.", origin)

    secret = os.environ.get("REGWATCH_SHARED_SECRET", "")
    if secret:
        # Accept it either in its own header or as the bearer token, because the
        # bearer is what RegWatch's "API key" box already sends: a consultant
        # pastes the shared secret there and nothing in the page changes.
        bearer = req.headers.get("Authorization", "")
        bearer = bearer[7:].strip() if bearer.lower().startswith("bearer ") else ""
        if secret not in (req.headers.get("x-regwatch-key", ""), bearer):
            return error(401, "Missing or wrong RegWatch proxy key.", origin)

    cfg = _settings()
    if cfg["missing"]:
        return error(500, "Proxy not configured: %s missing from the application "
                          "settings." % ", ".join(cfg["missing"]), origin)

    raw = req.get_body() or b"{}"
    if len(raw) > MAX_BODY:
        return error(413, "Request body too large.", origin)
    try:
        payload = json.loads(raw)
    except ValueError:
        return error(400, "Body is not JSON.", origin)
    if not isinstance(payload, dict) or not payload.get("messages"):
        return error(400, "Body must be a chat-completions request with `messages`.", origin)

    # On Azure the deployment travels in the URL, not the body; leaving `model`
    # in place makes some API versions reject the call.
    payload.pop("model", None)

    url = "%s/openai/deployments/%s/chat/completions?api-version=%s" % (
        cfg["endpoint"], cfg["deployment"], cfg["version"])
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "api-key": cfg["key"]})

    try:
        with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT) as response:
            logging.info("ok %d octets", len(raw))
            return reply(200, response.read(), origin)
    except urllib.error.HTTPError as e:
        # Pass Azure's own message through untouched: RegWatch reads it to say
        # whether the deployment name, the key or a parameter is the problem,
        # and a rewritten message would break that.
        body = e.read() or json.dumps({"error": {"message": e.reason}}).encode()
        logging.warning("amont HTTP %d", e.code)
        return reply(e.code, body, origin)
    except Exception:                                          # noqa: BLE001
        logging.exception("amont injoignable")
        return error(502, "The proxy could not reach Azure OpenAI.", origin)


@app.route(route="v1/health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    """Is the proxy configured? Says which settings are missing, never their values."""
    cfg = _settings()
    return reply(200, {
        "ok": not cfg["missing"],
        "missing": cfg["missing"],
        "deployment": cfg["deployment"] or None,
        "apiVersion": cfg["version"],
        "allowedOrigins": allowed_origins(),
        "sharedSecret": bool(os.environ.get("REGWATCH_SHARED_SECRET")),
    }, req.headers.get("Origin", ""))
PROXY_EOF

echo "  écriture de requirements.txt"
cat > requirements.txt <<'PROXY_EOF'
azure-functions
PROXY_EOF

echo "  écriture de host.json"
cat > host.json <<'PROXY_EOF'
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "excludedTypes": "Request" }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
PROXY_EOF

step() { echo; echo "== $1"; }
run()  { "$@" || die "echec : $*"; }

step "1/5  groupe de ressources"
# Creer un groupe demande un droit que beaucoup de comptes n'ont pas. Un groupe
# existant est donc reutilise sans y toucher, et l'echec de creation explique
# quoi faire au lieu de renvoyer le message brut d'Azure.
GROUP_WAS_OURS=""
if az group show -n "$RG" -o none 2>/dev/null; then
  echo "   deja present, reutilise (rien n'y est modifie)."
elif az group create -n "$RG" -l "$LOCATION" -o none 2>/dev/null; then
  GROUP_WAS_OURS=1
else
  echo
  echo "!! impossible de creer le groupe '$RG' — le compte n'a pas ce droit,"
  echo "   ou le groupe appartient a une autre souscription."
  echo
  echo "   Relancez en reutilisant un groupe existant, par exemple :"
  echo "       RG=Agent_mapping bash ~/regwatch-deploy.sh"
  echo
  echo "   Vos groupes disponibles :"
  az group list --query "[].name" -o tsv 2>/dev/null | sed 's/^/       /'
  exit 1
fi

# Un groupe reutilise a sa propre region ; suivre la sienne evite de creer des
# ressources a l'autre bout du continent par rapport a ce qui existe deja.
_rg_loc="$(az group show -n "$RG" --query location -o tsv 2>/dev/null || true)"
if [ -n "$_rg_loc" ] && [ "$_rg_loc" != "$LOCATION" ]; then
  echo "   region du groupe : $_rg_loc (au lieu de $LOCATION) — on suit le groupe."
  LOCATION="$_rg_loc"
fi

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

# Ne JAMAIS proposer de supprimer un groupe qu'on n'a pas cree : ici il
# contient la ressource Azure OpenAI, et un `group delete` l'emporterait avec.
if [ -n "${GROUP_WAS_OURS:-}" ]; then
  TEARDOWN="     az group delete -n $RG --yes
     (ce groupe a ete cree par ce script, il ne contient que le proxy)"
else
  TEARDOWN="     az functionapp delete -n $APP -g $RG
     az storage account delete -n $STORAGE -g $RG --yes

     NE SUPPRIMEZ PAS le groupe '$RG' : il existait avant et contient
     d'autres ressources, dont la ressource Azure OpenAI."
fi

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

  Pour supprimer ce qui a ete cree ici :
$TEARDOWN
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
