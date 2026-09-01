#!/usr/bin/env python3
"""Fetch the comparative workbook from SharePoint via Microsoft Graph.

The country data pipeline reads a workbook; until now that was a copy sitting in
ressources/, which is fine for a demo and wrong for anything else. The workbook
that matters lives on SharePoint and is edited by consultants. This fetches it.

    # once: put the config in .env  (see --help-config)
    python3 tools/sharepoint_fetch.py
    python3 tools/excel_to_countries.py data/.cache/comparative.xlsx

Read-only by design, and scoped as narrowly as Graph allows. Nothing is ever
written back — the workbook stays the source of truth and RegWatch its mirror.
Requesting write scope would put the client's formulas, conditional formatting
and slicers within reach of a bug for no benefit.

On permissions, the distinction that matters to a security reviewer:

  delegated (device code)   The app acts AS the signed-in person and can never
                            reach a file that person could not already open.
                            Granting it adds no exposure to the tenant.

  application (unattended)  The app acts as itself, with no user. `Files.Read.All`
                            here would mean every file in the tenant — not
                            acceptable for one workbook. Use `Sites.Selected`
                            instead: it grants NOTHING by default, and an admin
                            then authorises exactly one site. See README-sync.md.

Two ways to authenticate:

  device code (default)   A person signs in once in a browser. Needs no admin
                          consent, so it works today, on an intern's account.
                          The refresh token is cached, so later runs are silent.
                          Right for getting started and for a laptop.

  client credentials      App-only, unattended, no human. Needs an Entra app
                          registration with Files.Read.All APPLICATION permission
                          and admin consent. Right for the scheduled sync.

No msal dependency: both flows are a couple of HTTP calls, and one less library
in an internal tool is one less thing to keep current.
"""

import argparse
import base64
import re
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    raise SystemExit("pip install requests")

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / ".cache"
TOKEN_CACHE = CACHE_DIR / "graph-token.json"
DEFAULT_OUT = CACHE_DIR / "comparative.xlsx"

AUTHORITY = "https://login.microsoftonline.com"
GRAPH = "https://graph.microsoft.com/v1.0"
# Public client id shipped by Microsoft for Azure CLI. Usable for device-code
# sign-in when no app registration exists yet — handy to prove the plumbing,
# but a Wavestone registration should replace it before anything is scheduled.
FALLBACK_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"

CONFIG_HELP = """
Add to your .env (or export them):

    SHAREPOINT_FILE_URL=https://wavestone.sharepoint.com/:x:/r/sites/.../CYBER%20WATCH5....xlsx
    GRAPH_TENANT_ID=<tenant id or domain, e.g. wavestone.com>

  Device-code sign-in (no admin consent needed):
    GRAPH_CLIENT_ID=<app registration id>      # optional while testing

  Unattended, app-only (needs Sites.Selected APPLICATION + admin consent,
  then the admin authorises this one site — see tools/README-sync.md):
    GRAPH_CLIENT_ID=<app registration id>
    GRAPH_CLIENT_SECRET=<secret>

SHAREPOINT_FILE_URL is the plain "Copy link" URL of the workbook in SharePoint.
No site id or drive id to hunt down: Graph resolves the share link directly.
"""


def load_env_file(path):
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def share_token(url):
    """A sharing URL -> the `u!...` token Graph accepts on /shares/{token}.

    Documented encoding: base64 of the URL, '=' stripped, '/'->'_', '+'->'-'.
    """
    b64 = base64.b64encode(url.encode("utf-8")).decode("ascii")
    return "u!" + b64.rstrip("=").replace("/", "_").replace("+", "-")



def parse_sharepoint_url(url):
    """Pull host, site and item path out of a SharePoint URL.

    Two shapes have to work. A "Copy link" on a file gives the path in the URL
    path itself. A link copied from the browser address bar while looking at a
    folder gives `.../Forms/AllItems.aspx?id=<server-relative path>` - there the
    path in the URL is the *view page*, and the real one is in `id=`. Reading the
    path component alone would resolve to "Forms/AllItems.aspx", which exists and
    is not what anyone meant.

    A path-based lookup also beats a share token: the copied link carries
    volatile query parameters (`e=`, `csf=`) that belong to the browsing session,
    not to the item. Resolving host + site + path ignores them entirely.
    """
    import urllib.parse as up
    parsed = up.urlparse(url)
    query = up.parse_qs(parsed.query)
    # A folder view puts the real server-relative path in `id`.
    raw = up.unquote(query.get("id", [""])[0]) or up.unquote(parsed.path)
    m = re.match(r"^/:\w:/[a-z]/sites/([^/]+)/(.+)$", raw) or \
        re.match(r"^/sites/([^/]+)/(.+)$", raw)
    if not m:
        return None
    rel = m.group(2).split("/")
    return {"host": parsed.netloc, "site": m.group(1),
            "library": rel[0], "path": "/".join(rel[1:]),
            "tenant_hint": parsed.netloc.split(".")[0] + ".onmicrosoft.com"}


def resolve_site(token, info):
    headers = {"Authorization": "Bearer " + token}
    site_ref = "%s:/sites/%s" % (info["host"], info["site"])
    r = requests.get("%s/sites/%s" % (GRAPH, site_ref), headers=headers, timeout=60)
    if r.status_code != 200:
        raise SystemExit("site %s -> HTTP %d\n%s" % (info["site"], r.status_code, r.text[:300]))
    return r.json()["id"]


def list_folder(token, info, depth=2):
    """Inventory a folder without downloading anything.

    This exists because of bandwidth, not curiosity: the point is to see what a
    folder holds - names, sizes, dates - and then fetch the one file that
    matters, rather than pulling a whole knowledge-management folder over a
    phone connection.
    """
    headers = {"Authorization": "Bearer " + token}
    site_id = resolve_site(token, info)

    def children(path):
        quoted = requests.utils.quote(path)
        url = ("%s/sites/%s/drive/root:/%s:/children" % (GRAPH, site_id, quoted)) if path \
              else ("%s/sites/%s/drive/root/children" % (GRAPH, site_id))
        out, nxt = [], url + "?$top=200&$select=name,size,folder,file,lastModifiedDateTime"
        while nxt:
            r = requests.get(nxt, headers=headers, timeout=60)
            if r.status_code != 200:
                raise SystemExit("dossier -> HTTP %d\n%s" % (r.status_code, r.text[:300]))
            data = r.json()
            out.extend(data.get("value", []))
            nxt = data.get("@odata.nextLink")
        return out

    rows = []
    def walk(path, level):
        for it in sorted(children(path), key=lambda x: x["name"].lower()):
            here = path + "/" + it["name"] if path else it["name"]
            is_dir = "folder" in it
            rows.append({"path": here, "name": it["name"], "level": level,
                         "folder": is_dir,
                         "count": (it.get("folder") or {}).get("childCount", 0),
                         "size": it.get("size", 0),
                         "modified": (it.get("lastModifiedDateTime") or "")[:10]})
            if is_dir and level + 1 < depth:
                walk(here, level + 1)

    walk(info["path"], 0)
    return rows


def fetch_by_path(token, info, out_path):
    """Resolve site -> drive item by path, rather than by share token."""
    headers = {"Authorization": "Bearer " + token}
    site_ref = "%s:/sites/%s" % (info["host"], info["site"])
    r = requests.get("%s/sites/%s" % (GRAPH, site_ref), headers=headers, timeout=60)
    if r.status_code != 200:
        return None, "site %s -> HTTP %d" % (info["site"], r.status_code)
    site_id = r.json()["id"]

    # The library shows as "Documents partages" in a French UI but Graph's
    # default drive is the same list, so root-relative addressing works.
    quoted = requests.utils.quote(info["path"])
    url = "%s/sites/%s/drive/root:/%s" % (GRAPH, site_id, quoted)
    meta = requests.get(url, headers=headers, timeout=60)
    if meta.status_code != 200:
        return None, "fichier -> HTTP %d" % meta.status_code
    item = meta.json()

    content = requests.get(url + ":/content", headers=headers, timeout=180)
    content.raise_for_status()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(content.content)
    return {"name": item.get("name"), "size": item.get("size"),
            "modified": (item.get("lastModifiedDateTime") or "")[:19].replace("T", " "),
            "by": ((item.get("lastModifiedBy") or {}).get("user") or {}).get("displayName", "?"),
            "bytes": len(content.content)}, None


def token_client_credentials(tenant, client_id, secret):
    r = requests.post("%s/%s/oauth2/v2.0/token" % (AUTHORITY, tenant), timeout=30, data={
        "client_id": client_id, "client_secret": secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials"})
    if r.status_code != 200:
        raise SystemExit("échec de l'authentification app-only (%d) :\n%s" % (r.status_code, r.text[:400]))
    return r.json()["access_token"]


def token_device_code(tenant, client_id):
    """Reuse a cached refresh token when possible; otherwise ask for a sign-in."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    scope = "https://graph.microsoft.com/Sites.Read.All offline_access"

    if TOKEN_CACHE.exists():
        cached = json.loads(TOKEN_CACHE.read_text(encoding="utf-8"))
        if cached.get("refresh_token"):
            r = requests.post("%s/%s/oauth2/v2.0/token" % (AUTHORITY, tenant), timeout=30, data={
                "client_id": client_id, "grant_type": "refresh_token",
                "refresh_token": cached["refresh_token"], "scope": scope})
            if r.status_code == 200:
                data = r.json()
                TOKEN_CACHE.write_text(json.dumps(data), encoding="utf-8")
                return data["access_token"]
            print("  (jeton en cache périmé, nouvelle connexion demandée)")

    r = requests.post("%s/%s/oauth2/v2.0/devicecode" % (AUTHORITY, tenant), timeout=30,
                      data={"client_id": client_id, "scope": scope})
    if r.status_code != 200:
        raise SystemExit("impossible de démarrer la connexion (%d) :\n%s" % (r.status_code, r.text[:400]))
    flow = r.json()
    print("\n" + flow["message"] + "\n")

    deadline = time.time() + flow.get("expires_in", 900)
    interval = flow.get("interval", 5)
    while time.time() < deadline:
        time.sleep(interval)
        r = requests.post("%s/%s/oauth2/v2.0/token" % (AUTHORITY, tenant), timeout=30, data={
            "client_id": client_id, "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": flow["device_code"]})
        if r.status_code == 200:
            data = r.json()
            TOKEN_CACHE.write_text(json.dumps(data), encoding="utf-8")
            print("connecté.")
            return data["access_token"]
        err = r.json().get("error", "")
        if err == "authorization_pending":
            continue
        if err == "slow_down":
            interval += 5
            continue
        raise SystemExit("connexion refusée : %s\n%s" % (err, r.text[:300]))
    raise SystemExit("délai de connexion dépassé.")


def fetch(token, file_url, out_path):
    headers = {"Authorization": "Bearer " + token}
    tok = share_token(file_url)

    meta = requests.get("%s/shares/%s/driveItem" % (GRAPH, tok), headers=headers, timeout=60)
    if meta.status_code == 403:
        raise SystemExit("accès refusé (403). En app-only : la permission Sites.Selected "
                         "est-elle accordée ET ce site précis autorisé pour l'application ? "
                         "En délégué : as-tu accès à ce site dans SharePoint ?")
    if meta.status_code == 404:
        raise SystemExit("fichier introuvable (404). Vérifie SHAREPOINT_FILE_URL — "
                         "utilise le lien « Copier le lien » du fichier dans SharePoint.")
    if meta.status_code != 200:
        raise SystemExit("Graph a répondu %d :\n%s" % (meta.status_code, meta.text[:400]))
    item = meta.json()

    content = requests.get("%s/shares/%s/driveItem/content" % (GRAPH, tok),
                           headers=headers, timeout=180)
    content.raise_for_status()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(content.content)

    return {
        "name": item.get("name"),
        "size": item.get("size"),
        "modified": (item.get("lastModifiedDateTime") or "")[:19].replace("T", " "),
        "by": ((item.get("lastModifiedBy") or {}).get("user") or {}).get("displayName", "?"),
        "bytes": len(content.content),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("env", nargs="?", help="path to a .env holding the config")
    ap.add_argument("-o", "--out", default=str(DEFAULT_OUT))
    ap.add_argument("--check", action="store_true", help="ce qui est déduit du lien, sans authentification")
    ap.add_argument("--help-config", action="store_true", help="show the settings needed")
    ap.add_argument("--list", action="store_true",
                    help="inventorier un dossier (noms, tailles, dates) sans rien télécharger")
    ap.add_argument("--depth", type=int, default=2, help="profondeur d'inventaire (défaut 2)")
    ap.add_argument("--pick", help="chemin d'un fichier vu par --list, à récupérer")
    args = ap.parse_args()

    if args.help_config:
        print(CONFIG_HELP)
        return 0

    # Config first: --check must see the same .env the real run will use.
    if args.env and os.path.exists(args.env):
        load_env_file(args.env)
    for candidate in (ROOT / ".env", ROOT / "data" / ".cache" / ".env"):
        if candidate.exists():
            load_env_file(candidate)

    if args.check:
        url = (os.getenv("SHAREPOINT_FILE_URL") or (args.env if args.env and args.env.startswith("http") else "")).strip()
        if not url:
            raise SystemExit("passe l'URL SharePoint en argument, ou définis SHAREPOINT_FILE_URL.")
        info = parse_sharepoint_url(url)
        if not info:
            raise SystemExit("URL non reconnue. Attendu un lien « Copier le lien » de SharePoint.")
        print("Déduit du lien, sans aucune authentification :\n")
        for k, label in [("host", "hôte SharePoint"), ("site", "site"),
                         ("library", "bibliothèque"), ("path", "chemin du fichier"),
                         ("tenant_hint", "tenant probable")]:
            print("  %-18s %s" % (label, info[k]))
        try:
            r = requests.get("%s/%s/v2.0/.well-known/openid-configuration"
                             % (AUTHORITY, info["tenant_hint"]), timeout=20)
            if r.status_code == 200:
                guid = r.json()["issuer"].rstrip("/").split("/")[-2]
                print("  %-18s %s  (découvert publiquement)" % ("GRAPH_TENANT_ID", guid))
        except Exception:
            print("  %-18s non résolu — utilise le domaine tel quel" % "GRAPH_TENANT_ID")
        return 0
    file_url = (os.getenv("SHAREPOINT_FILE_URL") or "").strip()
    tenant = (os.getenv("GRAPH_TENANT_ID") or "").strip()
    client_id = (os.getenv("GRAPH_CLIENT_ID") or "").strip()
    secret = (os.getenv("GRAPH_CLIENT_SECRET") or "").strip()

    if file_url and not tenant:
        guess = parse_sharepoint_url(file_url)
        if guess:
            tenant = guess["tenant_hint"]
            print("note : GRAPH_TENANT_ID déduit du lien -> %s" % tenant)

    if not file_url or not tenant:
        print("Configuration incomplète.")
        print("  SHAREPOINT_FILE_URL : %s" % ("OK" if file_url else "MANQUANT"))
        print("  GRAPH_TENANT_ID     : %s" % ("OK" if tenant else "MANQUANT"))
        print(CONFIG_HELP)
        return 1

    if secret:
        if not client_id:
            raise SystemExit("GRAPH_CLIENT_SECRET fourni sans GRAPH_CLIENT_ID.")
        print("authentification app-only (sans interaction)…")
        token = token_client_credentials(tenant, client_id, secret)
    else:
        cid = client_id or FALLBACK_CLIENT_ID
        if not client_id:
            print("note : aucun GRAPH_CLIENT_ID — utilisation du client public Azure CLI.")
            print("       à remplacer par une inscription d'application Wavestone "
                  "avant toute planification.")
        print("authentification par code d'appareil…")
        token = token_device_code(tenant, cid)

    parsed = parse_sharepoint_url(file_url)

    if args.list:
        if not parsed:
            raise SystemExit("lien non analysable.")
        rows = list_folder(token, parsed, depth=args.depth)
        files = [r for r in rows if not r["folder"]]
        print("\n%s  (aucun fichier telecharge)\n" % parsed["path"])
        for r in rows:
            pad = "  " * r["level"]
            if r["folder"]:
                print("  %-58s %s" % (pad + r["name"] + "/", "%d élément(s)" % r["count"]))
            else:
                print("  %-58s %7d Ko   %s" % (pad + r["name"], r["size"] // 1024, r["modified"]))
        print("\n  %d fichier(s), %.1f Mo au total"
              % (len(files), sum(r["size"] for r in files) / 1048576.0))
        xl = [r for r in files if r["name"].lower().endswith((".xlsx", ".xlsm"))]
        if xl:
            print("\n  classeurs reperes :")
            for r in xl:
                print("    --pick \"%s\"   (%d Ko)" % (r["path"], r["size"] // 1024))
        return 0

    out = Path(args.out).expanduser()
    if args.pick:
        parsed = dict(parsed or {}, path=args.pick)
    info, why = (None, "lien non analysable")
    if parsed:
        info, why = fetch_by_path(token, parsed, out)
        if info is None:
            print("  résolution par chemin impossible (%s) — repli sur le lien de partage." % why)
    if info is None:
        info = fetch(token, file_url, out)
    print("\nclasseur récupéré depuis SharePoint")
    print("  nom             : %s" % info["name"])
    print("  modifié le      : %s  par %s" % (info["modified"], info["by"]))
    print("  taille          : %d Ko" % (info["bytes"] // 1024))
    print("  écrit dans      : %s" % out)
    print("\nEnsuite : python3 tools/excel_to_countries.py %s" % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
