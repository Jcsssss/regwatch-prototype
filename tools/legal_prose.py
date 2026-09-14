#!/usr/bin/env python3
"""Rediger les phrases des slides a partir des seuls textes legaux.

    python3 tools/legal_prose.py BE                 # tous les blocs
    python3 tools/legal_prose.py BE --only inc.process
    -> data/legal/BE-prose.json   (statut « draft », a relire)

Le principe, et la raison de chaque contrainte
  Le modele ne redige qu'a partir de passages qu'on lui remet, et doit citer
  pour chaque phrase le document et la page d'ou elle vient. Quand les passages
  ne portent pas la reponse, il doit ecrire NON TROUVE plutot que de deduire.

  Ce n'est pas de la prudence de facade : une slide de veille reglementaire qui
  part chez un client engage le cabinet. Une phrase sans citation verifiable n'a
  donc pas sa place, et une phrase plausible mais absente du texte est pire
  qu'une absence, parce qu'elle se lit comme du droit.

  La sortie est un brouillon. Rien n'entre dans l'outil avant qu'un validateur
  ait mis « reviewed » a vrai sur le bloc : c'est la meme regle que la file de
  veille, ou aucun element ne rejoint une fiche sans decision humaine.

Ce qui n'est pas genere
  La recommandation Wavestone. Elle n'est pas dans les textes, elle est un avis
  du cabinet : la faire ecrire par un modele reviendrait a lui faire signer un
  conseil. Le bloc reste a la main de l'equipe.

La recherche de passages
  Un score de recouvrement de termes, pas d'embeddings. C'est moins fin, mais
  chaque selection reste explicable - on voit quels mots ont fait remonter quel
  passage - et cela evite d'embarquer un index vectoriel pour cinq documents.
"""

import argparse
import json
import math
import os
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGAL = ROOT / "data" / "legal"

# Les blocs des slides, et ce qu'on cherche pour chacun.
BLOCKS = {
    "reg.deadlines": ("Échéances d'enregistrement des entités",
        "enregistrement délai échéance mois entité essentielle importante inscrire registre notifier"),
    "reg.platform": ("Disponibilité et fonctionnement de la plateforme d'enregistrement",
        "plateforme enregistrement guichet en ligne service portail inscription déclaration"),
    "reg.process": ("Processus d'enregistrement et informations demandées",
        "informations communiquer nom adresse coordonnées secteur sous-secteur identification"),
    "inc.process": ("Processus de notification des incidents et plateforme",
        "notification incident CSIRT autorité signaler transmettre alerte plateforme"),
    "inc.criteria": ("Critères de déclenchement d'une notification d'incident",
        "incident important significatif seuil critère perturbation grave préjudice"),
    "ctl.process": ("Modalités et processus de contrôle",
        "contrôle inspection audit vérification mesure de surveillance ex ante ex post"),
    "ctl.bodies": ("Organismes chargés du contrôle et des audits",
        "organisme accrédité auditeur autorité inspection certification conformité"),
    "fw.framework": ("Le référentiel de cybersécurité applicable",
        "référentiel cadre mesure de sécurité CyberFundamentals CyFun niveau assurance"),
    "fw.deadlines": ("Échéances de mise en conformité au référentiel",
        "délai conformité mois échéance transition présomption certification ISO"),
    "sec.private": ("Secteurs privés ajoutés par la transposition",
        "secteur annexe champ d'application entité essentielle importante activité"),
    "sec.public": ("Secteurs publics et administrations concernés",
        "administration publique service public autorité fédérale entité publique"),
    "corr": ("Articulation avec d'autres réglementations",
        "DORA règlement directive ISO 27001 NIS 1 norme référentiel équivalence"),
    "other": ("Autres informations importantes sur la transposition",
        "sanction amende obligation organe de direction formation responsabilité"),
}

STOP = set("le la les des de du un une et ou a au aux en dans pour par sur "
           "que qui est sont ce cette ces il elle son sa ses leur leurs plus "
           "the of and to in for with that are shall".split())

SYSTEM = (
    "Tu rédiges des puces pour une slide de veille réglementaire destinée à un "
    "client. Tu ne disposes que des passages fournis, extraits des textes légaux "
    "officiels du pays.\n\n"
    "Règles absolues :\n"
    "1. N'affirme que ce que les passages établissent. N'ajoute aucune "
    "connaissance extérieure, même exacte.\n"
    "2. Termine chaque puce par sa source entre crochets : [document, p.N].\n"
    "3. Si les passages ne permettent pas de répondre, écris exactement "
    "NON TROUVÉ et rien d'autre.\n"
    "4. Deux à quatre puces, une phrase chacune, en français, au présent. "
    "Mets en gras avec <b></b> les chiffres, délais, noms d'autorités et de "
    "plateformes. N'invente aucune date.\n"
    "5. Pas de préambule, pas de conclusion : les puces seules, une par ligne, "
    "sans tiret ni numéro.\n"
    "6. Écarte les passages qui ne répondent pas au sujet annoncé, même s'ils "
    "te sont fournis. La recherche est approximative et peut remonter du texte "
    "voisin : « enregistrement d'un nom de domaine » n'est pas « enregistrement "
    "d'une entité ». Mieux vaut deux puces justes que quatre dont deux à côté.")


def terms(s):
    return [w for w in re.findall(r"[\w'-]{3,}", s.lower()) if w not in STOP]


def retrieve(passages, query, k=12):
    """Les passages les plus proches de la question, par recouvrement de termes.
    Le score privilegie les termes rares : « incident » est partout, « ex ante »
    ne l'est pas, et c'est le second qui designe le bon article."""
    q = terms(query)
    df = Counter()
    toks = []
    for p in passages:
        t = set(terms(p["text"]))
        toks.append(t)
        for w in q:
            if w in t:
                df[w] += 1
    n = len(passages)
    scored = []
    for p, t in zip(passages, toks):
        s = sum(math.log(1 + n / (1 + df[w])) for w in q if w in t)
        if s > 0:
            scored.append((s, p))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:k]]


def ask(client, deployment, question, passages):
    ctx = "\n\n".join(
        "[%s, p.%d%s]\n%s" % (p["doc"], p["page"],
                              ", art. " + p["art"] if p["art"] else "", p["text"])
        for p in passages)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content":
             "Sujet de la slide : %s\n\nPassages disponibles :\n\n%s" % (question, ctx)}]
    # Les deploiements recents refusent `max_tokens` et imposent
    # `max_completion_tokens` ; certains refusent aussi de fixer la temperature.
    # On tente le jeu le plus complet puis on retire ce qui est refuse, plutot
    # que de coder en dur les usages d'un deploiement donne.
    attempts = [
        {"max_completion_tokens": 900, "temperature": 0.1},
        {"max_completion_tokens": 900},
        {"max_tokens": 900, "temperature": 0.1},
        {},
    ]
    last = None
    for extra in attempts:
        try:
            r = client.chat.completions.create(model=deployment, messages=msgs, **extra)
            return r.choices[0].message.content.strip(), r.usage
        except Exception as e:
            last = e
            if "unsupported" not in str(e).lower() and "not supported" not in str(e).lower():
                raise
    raise last


def load_env():
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("iso")
    ap.add_argument("--only", action="append", help="ne traiter que ce bloc")
    args = ap.parse_args()
    iso = args.iso.upper()

    src = LEGAL / ("%s.json" % iso)
    if not src.exists():
        raise SystemExit("corpus absent : lancez d'abord tools/legal_corpus.py %s" % iso)
    passages = json.loads(src.read_text(encoding="utf-8"))["passages"]

    load_env()
    try:
        from openai import AzureOpenAI
    except ImportError:
        raise SystemExit("pip install openai")
    key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").rstrip("/")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    if not (key and endpoint and deployment):
        raise SystemExit("configuration Azure incomplete : voir .env.example")
    client = AzureOpenAI(api_key=key, azure_endpoint=endpoint,
                         api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"))

    out_path = LEGAL / ("%s-prose.json" % iso)
    out = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}

    todo = args.only or list(BLOCKS)
    tin = tout = 0
    for key_ in todo:
        if key_ not in BLOCKS:
            print("bloc inconnu : %s" % key_)
            continue
        # Un bloc deja relu n'est pas regenere : la relecture serait perdue.
        if out.get(key_, {}).get("reviewed"):
            print("   %-16s deja relu, inchange" % key_)
            continue
        question, query = BLOCKS[key_]
        found = retrieve(passages, question + " " + query)
        if not found:
            out[key_] = {"status": "empty", "bullets": [], "sources": []}
            print("   %-16s aucun passage" % key_)
            continue
        text, usage = ask(client, deployment, question, found)
        tin += usage.prompt_tokens
        tout += usage.completion_tokens
        if text.strip().upper().startswith("NON TROUV"):
            out[key_] = {"status": "not-found", "bullets": [],
                         "sources": [p["doc"] for p in found[:3]], "reviewed": False}
            print("   %-16s NON TROUVÉ" % key_)
            continue
        bullets = [b.strip(" -•\t") for b in text.splitlines() if b.strip()]
        out[key_] = {"status": "draft", "reviewed": False, "bullets": bullets,
                     "sources": sorted({"%s p.%d" % (p["doc"], p["page"]) for p in found})}
        print("   %-16s %d puces" % (key_, len(bullets)))

    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n%d blocs -> %s" % (len(out), out_path.relative_to(ROOT)))
    print("tokens : %d en entree, %d en sortie" % (tin, tout))
    print("Relisez chaque bloc, puis passez \"reviewed\" a true pour l'embarquer.")


if __name__ == "__main__":
    main()
