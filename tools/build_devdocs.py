#!/usr/bin/env python3
"""Rassembler la documentation de l'outil en un corpus interrogeable.

    python3 tools/build_devdocs.py            # -> src/data_devdocs.js

L'assistant de l'onglet Développeur ne doit pas raconter ce qu'il croit savoir
d'un outil qui lui ressemble : il répond sur celui-ci. Son corpus est donc fait
des textes que le dépôt porte déjà - les README, le cahier des charges, et les
en-têtes de chaque module, qui expliquent le pourquoi d'une décision et pas
seulement son quoi.

Rien n'est réécrit ici. Un corpus paraphrasé vieillit sans qu'on s'en aperçoive,
alors qu'un en-tête de fichier vieillit avec le fichier : quand quelqu'un change
le code et son commentaire, le corpus suit à la prochaine construction.

Ce qui est exclu, et pourquoi
  .env et tout ce qui ressemble à un secret - le corpus part dans un fichier
  HTML public, une clé qui y entrerait serait publiée.
  Les instructions destinées aux agents (CLAUDE.md, .claude/) - elles parlent de
  comment travailler sur le dépôt, pas de l'outil.
  ressources/ - documents clients.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data_devdocs.js"

MAX_SECTION = 4200          # au-delà, une section se lit mal et coûte cher
MAX_TOTAL = 260_000         # garde-fou : le corpus part dans le fichier livré

# Les documents du projet, avec le titre sous lequel ils seront cités.
DOCS = [
    ("README.md", "Prise en main de l'outil"),
    ("regwatch-cahier-des-charges.md", "Cahier des charges"),
    ("agent-veille/README.md", "Agent de veille - organisation"),
    ("agent-veille/integration-regwatch.md", "Agent de veille - intégration"),
    ("agent-veille/patch-tier1.md", "Agent de veille - correctifs à appliquer"),
    ("azure-proxy/README.md", "Proxy Azure"),
    ("tools/README-assistant.md", "Assistant - conception"),
    ("tools/README-sync.md", "Synchronisation avec le classeur"),
    ("tools/demande-IT.md", "Demande IT"),
]

# Les modules dont l'en-tête vaut documentation, avec des mots-clés français.
#
# Les docstrings sont en anglais et les questions arriveront en français : sans
# ces mots-clés, « router un élément vers une cellule » ne remontait pas le
# module qui fait exactement cela. Traduire les docstrings serait pire - elles
# vivent avec le code et doivent rester dans sa langue.
CODE = [
    ("src/app_chat.js", "Assistant : transport et outils",
     "assistant modèle appel outils invite proxy jetons"),
    ("src/app_corpus.js", "Assistant : accès aux données",
     "assistant données pays recherche outils ancrage sources citées"),
    ("src/app_reg.js", "Registre des réglementations",
     "réglementation NIS2 REC DORA CRA onglets bascule module ajouter"),
    ("src/app_kpi.js", "Moteur de graphiques",
     "graphique indicateur KPI croisement barres camembert palette"),
    ("src/app_kpi_xlsx.js", "Export Excel",
     "export Excel xlsx classeur graphiques feuille téléchargement"),
    ("src/app_part2.js", "Vues pays, file de veille, sources",
     "fiche pays file veille validation sources registre affichage rôle"),
    ("src/build.sh", "Construction du fichier unique",
     "build construire compiler fichier unique bundle zsh reconstruire déployer"),
    ("tools/veille_to_watchitems.py", "Conversion du classeur de veille",
     "conversion classeur tblVeille routage router cellule thème verbatim "
     "extrait date provenance élément de veille"),
    ("tools/reliability.py", "Score de fiabilité",
     "score fiabilité note doublon pénalité composante objectif"),
    ("tools/theme_terms.py", "Vocabulaire des thèmes",
     "thème vocabulaire langue terme routage mots-clés multilingue"),
    ("tools/excel_cellmap.py", "Carte des cellules du classeur",
     "cellule classeur comparatif carte feuille colonne ligne pays"),
    ("tools/fetch_excerpts.py", "Récupération des articles",
     "article extrait corps page scraping récupérer texte source cache"),
    ("tools/export_sources.py", "Export des sources vers l'agent",
     "source registre tblSources export flux autorité ajouter"),
    ("tools/compare_watch.py", "Comparaison avec la veille du cabinet",
     "comparaison veille presse cabinet manque bruit couverture"),
    ("tools/make_deck_pptx.py", "Génération de la présentation",
     "présentation slides PowerPoint pptx deck charte"),
    ("agent-veille/collect.py", "Passe de collecte",
     "collecte flux RSS fenêtre agrégateur éditeur notation pertinence"),
    ("agent-veille/health.py", "Rapport de santé",
     "santé indicateurs régression référence fraîcheur exploitation vérifier"),
    ("agent-veille/discover_sources.py", "Découverte de sources",
     "découverte source candidat proposition validateur crawl domaine"),
    ("agent-veille/discover_feeds.py", "Sondage des flux d'autorités",
     "flux autorité sondage RSS vérifier disponible"),
    ("agent-veille/translate_items.py", "Traduction des éléments",
     "traduction traduire anglais français cache lot vérification"),
    ("azure-proxy/function_app.py", "Proxy Azure - code",
     "proxy Azure clé secret CORS origine plafond jetons déploiement"),
]

# Ce qui ne doit jamais entrer dans un fichier publié. Le test porte sur la
# forme, pas sur une liste de valeurs : une clé inconnue doit aussi être vue.
SECRET = re.compile(
    r"(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*[\"']?[A-Za-z0-9/+_-]{16,}"
    r"|[A-Za-z0-9]{60,}", re.I)


def sections_from_markdown(path, title):
    """Un document découpé sur ses titres de niveau 2 : une section, une idée."""
    text = (ROOT / path).read_text(encoding="utf-8")
    parts, current, head = [], [], title
    for line in text.splitlines():
        if line.startswith("## "):
            if any(l.strip() for l in current):
                parts.append((head, "\n".join(current).strip()))
            head, current = line[3:].strip(), []
        else:
            current.append(line)
    if any(l.strip() for l in current):
        parts.append((head, "\n".join(current).strip()))
    return [{"src": path, "title": "%s - %s" % (title, h) if h != title else title,
             "text": t[:MAX_SECTION]} for h, t in parts if t]


def header_of(path):
    """L'en-tête d'un module : sa docstring Python, ou son premier bloc de
    commentaires. C'est là que vit le pourquoi."""
    text = (ROOT / path).read_text(encoding="utf-8")
    if path.endswith(".py"):
        m = re.search(r'^\s*(?:#![^\n]*\n)?(?:#[^\n]*\n)*\s*"""(.*?)"""', text, re.S)
        return m.group(1).strip() if m else ""
    if path.endswith(".sh"):
        lines = []
        for line in text.splitlines()[1:]:
            if line.startswith("#"):
                lines.append(line.lstrip("# ").rstrip())
            elif lines:
                break
        return "\n".join(lines).strip()
    # JavaScript : le premier bloc /* ... */ du fichier.
    m = re.search(r"/\*(.*?)\*/", text, re.S)
    if not m:
        return ""
    return re.sub(r"^\s*\*? ?", "", m.group(1), flags=re.M).strip()


def facts():
    """Les chiffres mesurés, pour que l'assistant cite des faits datés plutôt
    que des ordres de grandeur."""
    out = []
    base = ROOT / "data" / "health-baseline.json"
    if base.exists():
        h = json.loads(base.read_text(encoding="utf-8"))
        out.append("Rapport de santé du %s (agent-veille/health.py) :" % h.get("date"))
        for key, label in [
            ("items", "éléments dans la file de veille"),
            ("daysSinceRun", "jours depuis la dernière détection de l'agent"),
            ("officialShare", "% issus d'une source officielle"),
            ("aggregatorShare", "% issus d'un agrégateur"),
            ("itemsWithExcerpt", "% avec un extrait de la source"),
            ("datesEstablished", "% dont la date de publication est établie"),
            ("datesFromFeed", "% dont la date vient d'un flux"),
            ("itemsRouted", "% routés vers une cellule du classeur"),
            ("itemsWithVerbatim", "% avec un passage cité de la source"),
            ("reliabilityMedian", "score de fiabilité médian sur 100"),
            ("feedsWorking", "flux d'autorités exploitables"),
            ("candidatesWaiting", "sources proposées en attente"),
        ]:
            if key in h:
                out.append("  %s : %s" % (label, h[key]))
    return "\n".join(out)


def main():
    corpus = []
    for path, title in DOCS:
        if (ROOT / path).exists():
            corpus.extend(sections_from_markdown(path, title))
        else:
            print("  absent, ignoré : %s" % path)
    for path, title, keys in CODE:
        if not (ROOT / path).exists():
            print("  absent, ignoré : %s" % path)
            continue
        head = header_of(path)
        if head:
            corpus.append({"src": path, "title": title, "keys": keys,
                           "text": head[:MAX_SECTION]})

    measured = facts()
    if measured:
        corpus.append({"src": "data/health-baseline.json",
                       "title": "Chiffres mesurés", "text": measured})

    for i, s in enumerate(corpus):
        s["id"] = "d%03d" % i

    payload = json.dumps(corpus, ensure_ascii=False, indent=1)

    # Un secret qui entrerait ici serait publié avec le fichier livré : on
    # échoue plutôt que d'écrire, et on dit où regarder.
    hit = SECRET.search(payload)
    if hit:
        offender = next((s["src"] for s in corpus if hit.group(0)[:40] in json.dumps(s, ensure_ascii=False)), "?")
        raise SystemExit("secret possible dans %s : %s…\nCorpus non écrit."
                         % (offender, hit.group(0)[:24]))
    if len(payload) > MAX_TOTAL:
        raise SystemExit("corpus de %d octets, au-delà du garde-fou de %d"
                         % (len(payload), MAX_TOTAL))

    OUT.write_text(
        "/* ---- Documentation de l'outil, rassemblée par tools/build_devdocs.py.\n"
        "   Corpus de l'assistant de l'onglet Développeur. Ne pas éditer à la\n"
        "   main : régénérer après avoir modifié un README ou un en-tête. ---- */\n"
        "const DEV_DOCS = %s;\n" % payload, encoding="utf-8")
    print("%d sections, %d Ko -> %s"
          % (len(corpus), len(payload) // 1024, OUT.relative_to(ROOT)))
    by_src = {}
    for s in corpus:
        by_src[s["src"]] = by_src.get(s["src"], 0) + 1
    print("  %d fichiers documentés" % len(by_src))
    return 0


if __name__ == "__main__":
    sys.exit(main())
