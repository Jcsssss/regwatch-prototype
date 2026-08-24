#!/usr/bin/env python3
"""Preflight for the NIS 2 watch agent: can it actually reach Azure OpenAI?

Run this BEFORE the first real run. It makes one tiny completion call — a few
tokens, negligible cost — and turns Azure's errors into plain answers, because
the three failure modes look alike from the outside but need different fixes.

    export AZURE_OPENAI_API_KEY="..."
    export AZURE_OPENAI_ENDPOINT="https://xxx.openai.azure.com"
    export AZURE_OPENAI_DEPLOYMENT="the-deployment-name"
    python3 tools/check_azure.py

Or point it at the agent's own .env:

    python3 tools/check_azure.py "/path/to/agent de veille/.env"
"""

import os
import re
import sys

CHECKS = []


def list_deployments(endpoint, key):
    """Best effort: ask the resource which deployments actually exist.

    Turns "DeploymentNotFound" from a dead end into an answer. The data-plane
    listing is not served by every api-version, so this is advisory only — a
    failure here means "could not check", never "no deployments".
    """
    try:
        import json
        import urllib.request
        url = "%s/openai/deployments?api-version=2023-03-15-preview" % endpoint
        req = urllib.request.Request(url, headers={"api-key": key})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.load(response)
        names = [d.get("id") or d.get("model") for d in data.get("data", [])]
        return [n for n in names if n]
    except Exception:
        return None


def load_env_file(path):
    """Minimal .env reader — avoids depending on python-dotenv for a preflight."""
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main():
    if len(sys.argv) > 1:
        path = sys.argv[1]
        if not os.path.exists(path):
            print("!! .env introuvable : %s" % path)
            return 2
        load_env_file(path)
        print("config lue depuis %s\n" % path)

    key = os.getenv("AZURE_OPENAI_API_KEY", "")
    endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT", "") or "").rstrip("/")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
    version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")

    print("clé API      : %s" % ("absente" if not key else "%s… (%d caractères)" % (key[:6], len(key))))
    print("endpoint     : %s" % (endpoint or "absent"))
    print("déploiement  : %s" % (deployment or "ABSENT"))
    print("api_version  : %s\n" % version)

    if not key:
        print("!! AZURE_OPENAI_API_KEY manquante.")
        return 1
    if not endpoint or not endpoint.startswith("https://"):
        print("!! AZURE_OPENAI_ENDPOINT absent ou invalide.")
        print("   Attendu la ressource seule, sans chemin :")
        print("   https://<nom-ressource>.openai.azure.com")
        return 1
    if re.search(r"/openai|/deployments|/chat", endpoint):
        print("!! L'endpoint contient un chemin. Garde uniquement la racine :")
        print("   https://<nom-ressource>.openai.azure.com")
        return 1
    if not deployment:
        print("!! AZURE_OPENAI_DEPLOYMENT manquant — c'est le point le plus souvent oublié.")
        print("   Ce n'est PAS le nom du modèle : c'est le nom donné au déploiement")
        print("   dans Azure AI Foundry / portail Azure. À demander à qui gère la ressource.")
        return 1

    try:
        from openai import AzureOpenAI
    except ImportError:
        print("!! SDK absent :  pip install openai")
        return 1

    client = AzureOpenAI(api_key=key, azure_endpoint=endpoint,
                         api_version=version, timeout=30, max_retries=0)
    try:
        r = client.chat.completions.create(
            model=deployment,
            messages=[{"role": "user", "content": "Réponds exactement : OK"}],
            max_completion_tokens=16,
        )
    except Exception as error:
        text = str(error)
        print("ÉCHEC de l'appel de test.\n")
        if "DeploymentNotFound" in text or "404" in text:
            print("-> Le déploiement %r n'existe pas sur cette ressource." % deployment)
            print("   La clé et l'endpoint sont probablement bons ; c'est le NOM du")
            print("   déploiement qui est faux.")
            available = list_deployments(endpoint, key)
            if available:
                print("\n   Déploiements disponibles sur cette ressource :")
                for name in available:
                    print("     - %s" % name)
                print("\n   Reprends l'un de ces noms dans AZURE_OPENAI_DEPLOYMENT.")
            elif available == []:
                print("\n   La ressource ne déclare aucun déploiement : il faut en créer un")
                print("   dans Azure AI Foundry avant que l'agent puisse tourner.")
            else:
                print("\n   (listing des déploiements indisponible — demande le nom exact,")
                print("   onglet Deployments dans Azure AI Foundry)")
        elif "401" in text or "Access denied" in text or "invalid_api_key" in text.lower():
            print("-> Clé refusée (401). Clé erronée, révoquée, ou d'une autre ressource")
            print("   que celle de l'endpoint.")
        elif "403" in text:
            print("-> Accès interdit (403). Restriction réseau/IP ou clé sans droit")
            print("   sur ce déploiement.")
        elif "429" in text:
            print("-> Quota atteint (429). La configuration est bonne, la ressource est")
            print("   saturée ou le quota du déploiement est à zéro.")
        elif "max_completion_tokens" in text or "max_tokens" in text:
            print("-> Le déploiement refuse le paramètre de longueur utilisé ici.")
            print("   Sans gravité pour l'agent : il gère déjà ce repli.")
        else:
            print("-> Erreur brute :")
        print("\n%s" % text[:600])
        return 1

    answer = (r.choices[0].message.content or "").strip()
    print("OK — le déploiement %r répond : %r" % (deployment, answer))
    usage = getattr(r, "usage", None)
    if usage:
        print("   tokens : %s prompt / %s complétion" % (usage.prompt_tokens, usage.completion_tokens))
    print("\nLa configuration Azure est bonne. L'agent peut tourner.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
