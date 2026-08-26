#!/usr/bin/env python3
"""Translate watch-item titles and summaries into English.

    python3 agent-veille/translate_items.py "<path to agent de veille>/.env"

The agent writes its analysis in French whatever the source language, so an
English-speaking reader gets a French interface's worth of content. This
translates the two fields a reader scans — title and summary — and caches every
result, so a re-run only pays for what is new.

NOT translated: the article excerpt. That is the source's own wording, and a
validator checking a regulatory text must read it as published. Same reason the
original French title is kept alongside the translation rather than replaced.

Output: data/translations-cache.json, keyed by source text. veille_to_watchitems.py
reads it offline and emits `titleEn` / `summaryEn` on each item.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "data" / "watch-items.json"
CACHE = ROOT / "data" / "translations-cache.json"
BATCH = 20


def load_env_file(path):
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main():
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        load_env_file(sys.argv[1])

    key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").rstrip("/")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    if not (key and endpoint and deployment):
        raise SystemExit("Azure config manquante — voir agent-veille/check_azure.py")

    items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    todo = []
    for item in items:
        for field in ("title", "summary"):
            text = (item.get(field) or "").strip()
            if text and text not in cache and text not in todo:
                todo.append(text)

    print("%d segment(s) à traduire (%d déjà en cache)" % (len(todo), len(cache)))
    if not todo:
        print("rien à faire.")
        return 0

    from openai import AzureOpenAI
    client = AzureOpenAI(api_key=key, azure_endpoint=endpoint,
                         api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
                         timeout=90, max_retries=3)

    system = ("You translate EU cybersecurity regulatory watch items into English. "
              "Translate faithfully and keep the register factual. Keep proper nouns, "
              "authority names and legal citations as they are (ANSSI, BSI, NÚKIB, "
              "KRITIS, NIS2, KSC…). Do not summarise, do not add or drop information. "
              "Reply with a JSON array of translations, in the same order as the input, "
              "and nothing else.")

    done = 0
    for start in range(0, len(todo), BATCH):
        chunk = todo[start:start + BATCH]
        payload = json.dumps(chunk, ensure_ascii=False)
        try:
            r = client.chat.completions.create(
                model=deployment,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": payload}],
            )
            raw = (r.choices[0].message.content or "").strip()
            raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
            out = json.loads(raw)
            if not isinstance(out, list) or len(out) != len(chunk):
                raise ValueError("réponse de longueur %s pour %d entrées"
                                 % (len(out) if isinstance(out, list) else "?", len(chunk)))
            for src, dst in zip(chunk, out):
                cache[src] = str(dst).strip()
            done += len(chunk)
            print("  %d/%d" % (done, len(todo)))
        except Exception as error:
            # A failed batch leaves those segments untranslated; the UI falls back
            # to the original, which is degraded but never wrong.
            print("  lot %d ignoré : %s" % (start // BATCH + 1, str(error)[:110]))
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        time.sleep(0.4)

    print("\n%d traductions en cache -> %s" % (len(cache), CACHE.relative_to(ROOT)))
    print("Relance tools/veille_to_watchitems.py pour les intégrer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
