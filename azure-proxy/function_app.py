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
    AZURE_OPENAI_DEPLOYMENT     e.g. gpt-5.4-mini (the default model)
    AZURE_OPENAI_DEPLOYMENTS    optional, comma-separated: the deployments a
                                caller may pick by sending `model` (the report
                                generator offers them). Anything else falls back
                                to AZURE_OPENAI_DEPLOYMENT. Listed by /v1/health.
    AZURE_OPENAI_API_VERSION    optional, defaults below
    REGWATCH_ALLOWED_ORIGINS    comma-separated, e.g. https://jcsssss.github.io
                                (a server-side check; the BROWSER-side CORS
                                 headers come from the Function App's own CORS
                                 settings — see `az functionapp cors add`)
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
        "deployments": deployments(),
        "version": os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION),
        "missing": missing,
    }


def deployments():
    """The deployments a caller may choose, the default first.

    Azure's data plane does not list the deployments of a resource (that is the
    management API, with other credentials), so the list is a setting. It is
    also an allowlist: a caller cannot point the firm's key at a deployment
    nobody chose to expose."""
    default = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "")
    extra = [d.strip() for d in os.environ.get("AZURE_OPENAI_DEPLOYMENTS", "").split(",") if d.strip()]
    return [d for i, d in enumerate([default] + extra) if d and d not in ([default] + extra)[:i]]


def allowed_origins():
    raw = os.environ.get("REGWATCH_ALLOWED_ORIGINS", "")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def cors_headers(origin):
    """The headers this function puts on its own responses.

    CORS here is split between two layers, and the split was measured, not
    assumed:

      the preflight   belongs to the platform. The Functions host answers
                      OPTIONS before the function is invoked, so with no origins
                      declared on the Function App it returns 204 with nothing
                      and the browser blocks. `az functionapp cors add` fixes
                      that, and only that.

      the responses   belong to us. Once the platform CORS was configured, a
                      POST still came back with exactly ONE
                      Access-Control-Allow-Origin - ours. The platform does not
                      stamp actual responses here, so dropping these headers
                      would remove them entirely.

    Echoing the caller's origin rather than a wildcard keeps credentialed
    requests possible, which a `*` forbids.
    """
    allowed = allowed_origins()
    value = origin if (origin and origin.rstrip("/") in allowed) else (allowed[0] if allowed else "")
    headers = {
        "Access-Control-Allow-Headers": "Content-Type, Authorization, api-key, x-regwatch-key",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
        # Rarely reached: the host answers preflights itself. Kept so the route
        # stays correct if that ever stops being true.
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
    # in place makes some API versions reject the call. A `model` that names an
    # allowed deployment selects it; any other value (the page sends a default
    # model name with every chat turn) keeps the default deployment.
    asked = payload.pop("model", None)
    deployment = asked if asked in cfg["deployments"] else cfg["deployment"]

    url = "%s/openai/deployments/%s/chat/completions?api-version=%s" % (
        cfg["endpoint"], deployment, cfg["version"])
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
        "deployments": cfg["deployments"],
        "apiVersion": cfg["version"],
        "allowedOrigins": allowed_origins(),
        "sharedSecret": bool(os.environ.get("REGWATCH_SHARED_SECRET")),
    }, req.headers.get("Origin", ""))
