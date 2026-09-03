#!/usr/bin/env python3
"""Translate watch items into the interface languages.

    python3 agent-veille/translate_items.py "<path to agent de veille>/.env"

Two different problems, one pass.

The agent writes its analysis in French whatever the source language, so an
English-speaking reader got a French interface's worth of content: title and
summary are translated to English.

The excerpt is a harder case. It is the source's own opening lines, so it
arrives in Polish, Czech, Dutch or German — unreadable to most of the team in
either interface language. It is now translated into BOTH English and French,
and the original is kept: the card shows the reader's language and offers the
source's own words underneath. That was the reason for not translating it
before — a validator checking a regulatory text must be able to read it as
published — and keeping the original satisfies it without leaving fifteen
items unreadable.

Cache shape: {source text: {"en": ..., "fr": ...}}, only the languages actually
requested. Values written by an older version were plain strings meaning
English, and are read as such.

Output: data/translations-cache.json. veille_to_watchitems.py reads it offline
and emits titleEn / summaryEn / excerptEn / excerptFr.
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
BATCH = 8    # long excerpts in big batches invite the model to echo them


def load_env_file(path):
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def find_env(explicit=None):
    """The first .env that exists, in the order a person would expect: an
    explicit path, then the repository root (where the SharePoint settings
    already live), then a copy beside the agent."""
    for candidate in (explicit, str(ROOT / ".env"), str(ROOT / "agent-veille" / ".env")):
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def main():
    env = find_env(sys.argv[1] if len(sys.argv) > 1 else None)
    if env:
        load_env_file(env)
        print("configuration lue dans %s" % env)

    key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").rstrip("/")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    if not (key and endpoint and deployment):
        raise SystemExit("Azure config manquante — voir agent-veille/check_azure.py")

    items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    # An older cache mapped text -> english string; normalise it in place.
    for text, value in list(cache.items()):
        if isinstance(value, str):
            cache[text] = {"en": value}

    def have(text, lang):
        return isinstance(cache.get(text), dict) and cache[text].get(lang)

    # The agent already writes French, so title and summary only need English.
    # The excerpt is in the source's language and needs both.
    want = []
    for item in items:
        for field, langs in (("title", ("en",)), ("summary", ("en",)),
                             ("excerpt", ("en", "fr"))):
            text = (item.get(field) or "").strip()
            if not text:
                continue
            for lang in langs:
                if not have(text, lang) and (text, lang) not in want:
                    want.append((text, lang))

    print("%d segment(s) à traduire (%d déjà en cache)" % (len(want), len(cache)))

    from openai import AzureOpenAI
    client = AzureOpenAI(api_key=key, azure_endpoint=endpoint,
                         api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
                         timeout=90, max_retries=3)

    LANG_NAME = {"en": "English", "fr": "French"}
    def system_prompt(lang):
        return ("You translate EU cybersecurity regulatory watch items into %s. "
                "Translate faithfully and keep the register factual. Keep proper nouns, "
                "authority names and legal citations as they are (ANSSI, BSI, NÚKIB, "
                "KRITIS, NIS2, KSC…). Do not summarise, do not add or drop information. "
                "If a passage is already in %s, return it unchanged. "
                "Reply with a JSON array of translations, in the same order as the input, "
                "and nothing else." % (LANG_NAME[lang], LANG_NAME[lang]))

    # Grouped by target language first: one system prompt per request.
    by_lang = {}
    for text, lang in want:
        by_lang.setdefault(lang, []).append(text)

    # Batched per target language, and the batches are cut inside a language:
    # a batch straddling two would need two system prompts, and silently
    # dropping the overflow would leave those segments untranslated for good.
    batches = []
    for lang in sorted(by_lang):
        texts = by_lang[lang]
        for start in range(0, len(texts), BATCH):
            batches.append((lang, texts[start:start + BATCH]))

    done, total = 0, len(want)
    if not batches:
        print("  rien de nouveau à traduire.")
    for lang, chunk in batches:
        payload = json.dumps(chunk, ensure_ascii=False)
        try:
            r = client.chat.completions.create(
                model=deployment,
                messages=[{"role": "system", "content": system_prompt(lang)},
                          {"role": "user", "content": payload}],
            )
            raw = (r.choices[0].message.content or "").strip()
            raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
            out = json.loads(raw)
            if not isinstance(out, list) or len(out) != len(chunk):
                raise ValueError("réponse de longueur %s pour %d entrées"
                                 % (len(out) if isinstance(out, list) else "?", len(chunk)))
            for src, dst in zip(chunk, out):
                cache.setdefault(src, {})[lang] = str(dst).strip()
            done += len(chunk)
            print("  %s  %d/%d" % (lang, done, total))
        except Exception as error:
            # A failed batch leaves those segments untranslated; the UI falls back
            # to the original, which is degraded but never wrong.
            print("  lot %s ignoré : %s" % (lang, str(error)[:110]))
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        time.sleep(0.4)

    # --- verification pass -------------------------------------------------
    #
    # A batch of twenty long segments sometimes comes back with a few echoed
    # rather than translated: three Czech and two German excerpts returned
    # word for word. The prompt allows an echo on purpose ("if it is already in
    # the target language, return it unchanged"), so the failure is invisible
    # unless it is looked for.
    #
    # Each echoed segment is retried once, alone, with an instruction that
    # removes the option. What still comes back identical is genuinely already
    # in that language - most EU and Irish items are - and is marked so it is
    # never retried again.
    suspects = [(text, lang)
                for text, value in cache.items() if isinstance(value, dict)
                for lang in ("en", "fr")
                if value.get(lang, "").strip() == text.strip()
                and not value.get(lang + "Same")]
    if suspects:
        print("\n%d segment(s) revenus a l'identique, reprise un par un" % len(suspects))
        confirmed = 0
        for text, lang in suspects:
            firm = ("Translate the following text into %s. It is NOT in %s. "
                    "Output only the translation, no quotes, no commentary."
                    % (LANG_NAME[lang], LANG_NAME[lang]))
            try:
                r = client.chat.completions.create(
                    model=deployment,
                    messages=[{"role": "system", "content": firm},
                              {"role": "user", "content": text}])
                out = (r.choices[0].message.content or "").strip().strip('"')
            except Exception as error:                # noqa: BLE001
                print("  repris sans succes : %s" % str(error)[:90])
                continue
            if out and out.strip() != text.strip():
                cache[text][lang] = out
            else:
                # Already in that language; stop asking.
                cache[text][lang + "Same"] = True
                confirmed += 1
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("  %d traduits a la reprise, %d confirmes deja dans la langue"
              % (len(suspects) - confirmed, confirmed))

    print("\n%d traductions en cache -> %s" % (len(cache), CACHE.relative_to(ROOT)))
    print("Relance tools/veille_to_watchitems.py pour les intégrer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
