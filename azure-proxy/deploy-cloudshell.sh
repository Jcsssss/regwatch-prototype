#!/usr/bin/env bash
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
