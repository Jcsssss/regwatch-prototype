#!/usr/bin/env python3
"""Embarquer le code source de l'outil dans l'outil, pour l'assistant technique.

    python3 tools/build_devcode.py            # -> src/data_devcode.js

La documentation dit ce qu'un module fait et pourquoi. Elle ne dit pas ce que
fait la ligne 240. Un assistant technique qui ne peut pas lire le code répond
juste jusqu'au moment où la question devient précise, et c'est précisément là
qu'on a besoin de lui.

Il n'y a pas de serveur : pour que la page lise le code, le code doit être dans
la page. 648 Ko de source, ce serait +37 % sur le fichier livré ; compressés et
encodés, 275 Ko, soit +16 %. On compresse donc, et la page décompresse au
premier usage avec DecompressionStream - présent dans Chrome, Edge, Firefox et
Safari récents. Là où il manque, l'assistant le dit et se rabat sur la
documentation, plutôt que de répondre à côté sans prévenir.

Ce qui entre : le code de l'application, la feuille de style et le squelette
HTML, le script de construction, la chaîne Python de veille et le proxy.

Ce qui n'entre pas : les fichiers de données - ils sont déjà dans la page et
doubleraient sa taille - le dossier ressources, l'environnement virtuel, et tout
ce qui ressemble à un secret. Un fichier public ne contient pas de clé.
"""

import base64
import gzip
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data_devcode.js"
SEP = "\n\x00FILE\x00 "        # séparateur improbable dans du code

GROUPS = [
    ("src", "app_*.js"),
    ("src", "shell_top.html"),
    ("src", "build.sh"),
    ("tools", "*.py"),
    ("agent-veille", "*.py"),
    ("azure-proxy", "function_app.py"),
]

# Un fichier public ne contient pas de secret. Le test porte sur la forme : une
# clé inconnue doit être vue comme une clé connue.
SECRET = re.compile(
    r"(api[_-]?key|secret|password|passwd|client[_-]?secret)\s*[:=]\s*[\"'][A-Za-z0-9/+_.-]{16,}"
    r"|[A-Za-z0-9]{72,}", re.I)

MAX_FILE = 120_000          # un fichier plus gros n'est pas lu, il est parcouru


def collect():
    files = {}
    for folder, pattern in GROUPS:
        for path in sorted((ROOT / folder).glob(pattern)):
            rel = str(path.relative_to(ROOT))
            if path.name.startswith("data_") or path.name == "bundle.js":
                continue          # les données sont déjà dans la page
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if len(text) > MAX_FILE:
                text = text[:MAX_FILE] + "\n\n[... fichier tronqué ...]\n"
            files[rel] = text
    return files


def main():
    files = collect()
    if not files:
        raise SystemExit("aucun fichier collecté")

    blob = SEP.join("%s\n%s" % (path, text) for path, text in sorted(files.items()))

    hit = SECRET.search(blob)
    if hit:
        line = blob[:hit.start()].count("\n") + 1
        raise SystemExit("secret possible ligne %d du corpus : %s…\nRien n'est écrit."
                         % (line, hit.group(0)[:24]))

    packed = base64.b64encode(gzip.compress(blob.encode("utf-8"), 9)).decode("ascii")

    # L'index reste en clair : lister les fichiers ne doit pas coûter une
    # décompression, et c'est la première chose que l'assistant demande.
    index = [{"path": p, "lines": t.count("\n") + 1, "bytes": len(t.encode("utf-8"))}
             for p, t in sorted(files.items())]

    OUT.write_text(
        "/* ---- Code source de l'outil, embarqué par tools/build_devcode.py.\n"
        "   Lu par l'assistant technique de l'onglet Développeur. Compressé :\n"
        "   la page le décompresse au premier usage. Ne pas éditer. ---- */\n"
        "const DEV_CODE_INDEX = %s;\n"
        "const DEV_CODE_SEP = \"\\n\\u0000FILE\\u0000 \";\n"
        "const DEV_CODE_GZ = \"%s\";\n"
        % (json.dumps(index, ensure_ascii=False, indent=1), packed),
        encoding="utf-8")

    raw = len(blob.encode("utf-8"))
    print("%d fichiers, %d Ko de source" % (len(files), raw // 1024))
    print("  compressé + encodé : %d Ko (%d %% du brut)"
          % (len(packed) // 1024, round(100 * len(packed) / raw)))
    print("  -> %s" % OUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
