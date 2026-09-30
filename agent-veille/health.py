#!/usr/bin/env python3
"""One page telling you whether the watch pipeline is healthier than last time.

    python3 agent-veille/health.py              # the state, and the drift
    python3 agent-veille/health.py --save       # make this run the reference

Every improvement to this pipeline over the past week was measured by hand, once,
and then forgotten. That is how a fix to the excerpts silently breaks the dates:
nobody looks at the dates that day. This reads the same numbers every time, from
the files the pipeline actually produces, and prints what moved since the last
saved run.

It computes nothing new and repairs nothing. It is a thermometer, and a
thermometer that changed the temperature would be useless.

Read it as: a metric that drops is a regression to explain, not a number to
accept. Several of these are known to be low - about half the items come from an
aggregator whose article text cannot be reached, which caps excerpts and dates at
once. The point is the direction, not the absolute.
"""

import argparse
import json
import re
import sys
import urllib.parse as up
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "data" / "watch-items.json"
EXCERPTS = ROOT / "data" / "excerpt-cache.json"
FEEDS_JS = ROOT / "src" / "reg" / "nis2" / "data_authorities.js"
CANDIDATES = ROOT / "data" / "source-candidates.json"
BASELINE = ROOT / "data" / "health-baseline.json"
PROBE = ROOT / "data" / "source-probe.json"
REGISTRY = ROOT / "data" / "watch-registry.json"

# Au-dela de ce silence, une source active merite une question : la requete
# est-elle encore bonne, le site a-t-il change d'adresse ? Deux mois laissent
# passer une autorite qui publie rarement sans laisser dormir une requete morte.
QUIET_DAYS = 60

AGGREGATORS = ("news.google.com", "news.yahoo.", "flipboard.", "msn.com")
MIN_BODY = 500

# Which way is better for each metric. A count that has no direction - the
# number of items collected, say - is reported without a verdict.
BETTER_UP = {
    "itemsWithExcerpt", "itemsWithBody", "datesEstablished", "datesFromFeed",
    "itemsRouted", "itemsWithVerbatim", "excerptsTranslated", "titlesTranslated", "feedsWorking",
    "officialShare", "reliabilityMedian", "reliabilityHigh", "usableBodies",
}
BETTER_DOWN = {
    "aggregatorShare", "impossibleDates", "duplicates", "reliabilityLow",
    "indexPagesRejected", "unreachableFeeds", "daysSinceRun", "sourcesBlocked",
    "sourcesQuiet", "sourcesNeverHeard",
}

# Au-delà, la file ne reflète plus la réalité : l'agent tourne une fois par
# semaine, deux semaines de silence sont une panne, pas un creux.
STALE_DAYS = 14


def load(path, default=None):
    if not path.exists():
        return default
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".js":
        return json.loads(text[text.index("["):text.rindex("]") + 1])
    return json.loads(text)


def host_of(item):
    return up.urlparse((item.get("source") or {}).get("url") or "").netloc.lower().removeprefix("www.")


def measure():
    payload = load(ITEMS, {"items": []})
    items = payload.get("items") or []
    cache = load(EXCERPTS, {})
    feeds = load(FEEDS_JS, [])
    cands = load(CANDIDATES, {})
    n = max(len(items), 1)

    bodies = {u: (v.get("body") or "") for u, v in cache.items() if v.get("ok")}
    used = {(i.get("source") or {}).get("url") or "" for i in items} - {""}
    live = {u: v for u, v in cache.items() if u in used}

    def share(k):
        return round(100 * k / n)

    scores = [(i.get("reliability") or {}).get("score") for i in items]
    scores = sorted(s for s in scores if s is not None)

    detected = sorted(i.get("detected", "") for i in items if i.get("detected"))
    last_run = detected[-1] if detected else ""
    stale = (date.today() - date.fromisoformat(last_run)).days if last_run else 9999

    return {
        "date": date.today().isoformat(),
        "lastRun": last_run,
        "daysSinceRun": stale,
        "items": len(items),
        "officialShare": share(sum(1 for i in items if (i.get("source") or {}).get("type") == "official")),
        "aggregatorShare": share(sum(1 for i in items if any(a in host_of(i) for a in AGGREGATORS))),
        "itemsWithExcerpt": share(sum(1 for i in items if (i.get("excerpt") or "").strip())),
        "itemsWithBody": share(sum(1 for i in items
                                   if len(bodies.get((i.get("source") or {}).get("url") or "", "")) >= MIN_BODY)),
        "datesEstablished": share(sum(1 for i in items
                                      if ((i.get("agent") or {}).get("publishedOn") or "").strip())),
        "datesFromFeed": share(sum(1 for i in items
                                   if (i.get("agent") or {}).get("dateOrigin") == "flux")),
        "impossibleDates": sum(1 for i in items
                               if ((i.get("agent") or {}).get("publishedOn") or "") > i.get("detected", "")),
        "itemsWithVerbatim": share(sum(1 for i in items if i.get("verbatim"))),
        "itemsRouted": share(sum(1 for i in items if i.get("targetCells"))),
        "excerptsTranslated": share(sum(1 for i in items
                                        if (i.get("excerpt") or "").strip() and i.get("excerptEn") and i.get("excerptFr"))),
        "titlesTranslated": share(sum(1 for i in items if i.get("titleEn"))),
        "duplicates": sum(1 for i in items if (i.get("reliability") or {}).get("duplicateOf")),
        "reliabilityMedian": scores[len(scores) // 2] if scores else 0,
        "reliabilityHigh": share(sum(1 for s in scores if s >= 70)),
        "reliabilityLow": share(sum(1 for s in scores if s < 30)),
        "sourcesReachable": len(live) and round(100 * sum(1 for v in live.values() if v.get("ok")) / len(live)),
        "usableBodies": sum(1 for v in live.values() if len(v.get("body") or "") >= MIN_BODY),
        "feedsWorking": sum(1 for f in feeds if f.get("kind") == "rss"),
        "unreachableFeeds": sum(1 for f in feeds if f.get("kind") == "down"),
        "candidatesWaiting": len((cands or {}).get("candidates") or []),
        "sourcesBlocked": sum(1 for v in ((load(PROBE, {}) or {}).get("sources") or {}).values()
                              if v.get("state") == "bloquee"),
        # Une source allumee qui ne rapporte plus ne produit aucune erreur :
        # elle lit, ne trouve rien, et se tait. C'est ainsi qu'une requete
        # Google News ecrite « NIS2 » a cesse pendant des mois de voir les
        # articles qui ecrivent « NIS 2 », sans que rien ne le signale.
        "sourcesQuiet": len(quiet_sources()[0]),
        "sourcesNeverHeard": len(quiet_sources()[1]),
    }


# ---------- les sources qui bloquent l'agent ----------
#
# Un site qui refuse les robots ne produit pas d'erreur dans la file : il ne
# produit plus rien. Le trou ne se voit donc pas, sauf a aller frapper a chaque
# porte. --probe le fait, avec l'identite qu'utilise la collecte, et garde pour
# chaque source la date depuis laquelle elle est bloquee.
#
# On ne contourne rien : une page de verification anti-robot est signalee, pas
# forcee. La reponse est de trouver un canal prevu pour les programmes (flux,
# API officielle) ou de suivre la source a la main.
CHALLENGE = re.compile(r"cf-chl|just a moment|captcha|access denied|attention required|"
                       r"are you a robot|incapsula|verify you are human|awswaf|challenge-platform", re.I)


def probe_sources():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import requests
    from concurrent.futures import ThreadPoolExecutor
    from collect import sources, WORKBOOK, UA, TIMEOUT
    srcs = sources(WORKBOOK)

    def one(src):
        try:
            r = requests.get(src["url"], headers=UA, timeout=TIMEOUT, allow_redirects=True)
            head = r.text[:6000]
            # AWS WAF (EUR-Lex) repond 202 avec un corps vide et l'en-tete
            # x-amzn-waf-action : challenge. Ce n'est pas une page, c'est un refus.
            if (r.headers.get("x-amzn-waf-action") or "").lower() in ("challenge", "captcha", "block"):
                return src, "bloquee", "HTTP %d (verification anti-robot AWS)" % r.status_code
            if r.status_code in (401, 403, 429) or CHALLENGE.search(head):
                return src, "bloquee", "HTTP %d%s" % (r.status_code, " (verification anti-robot)" if CHALLENGE.search(head) else "")
            if r.status_code >= 400:
                return src, "erreur", "HTTP %d" % r.status_code
            if "consent.google" in r.url:
                return src, "bloquee", "page de consentement"
            return src, "ok", "HTTP %d" % r.status_code
        except Exception as error:                      # noqa: BLE001
            return src, "erreur", type(error).__name__

    before = load(PROBE, {}) or {}
    prev = before.get("sources", {})
    today = date.today().isoformat()
    out = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for src, state, detail in pool.map(one, srcs):
            since = prev.get(src["url"], {}).get("since") if prev.get(src["url"], {}).get("state") == state else today
            out[src["url"]] = {"name": src["name"], "iso": src["iso"], "state": state, "detail": detail, "since": since}
    PROBE.write_text(json.dumps({"date": today, "sources": out}, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")
    return out


def quiet_sources():
    """(muettes depuis longtemps, jamais entendues) parmi les sources actives."""
    reg = (load(REGISTRY, {}) or {}).get("sources") or []
    limit = (date.today() - timedelta(days=QUIET_DAYS)).isoformat()
    quiet, never = [], []
    for r in reg:
        if not r.get("active"):
            continue
        if not r.get("last"):
            never.append(r)
        elif r["last"] < limit:
            quiet.append(r)
    quiet.sort(key=lambda r: r.get("last") or "")
    never.sort(key=lambda r: r.get("name", ""))
    return quiet, never


LABELS = [
    ("COLLECTE", [
        ("daysSinceRun", "jours depuis la dernière détection", ""),
        ("items", "éléments dans la file", ""),
        ("officialShare", "issus d'une source officielle", "%"),
        ("aggregatorShare", "issus d'un agrégateur", "%"),
        ("sourcesReachable", "URL qui répondent", "%"),
    ]),
    ("TEXTE DE LA SOURCE", [
        ("itemsWithExcerpt", "avec un extrait", "%"),
        ("itemsWithBody", "avec le corps de l'article", "%"),
        ("usableBodies", "corps exploitables en cache", ""),
    ]),
    ("DATES", [
        ("datesEstablished", "date de publication établie", "%"),
        ("datesFromFeed", "dont lue dans un flux", "%"),
        ("impossibleDates", "dates postérieures à la détection", ""),
    ]),
    ("EXPLOITATION", [
        ("itemsRouted", "routés vers le classeur", "%"),
        ("itemsWithVerbatim", "avec un passage cité de la source", "%"),
        ("titlesTranslated", "titres traduits", "%"),
        ("excerptsTranslated", "extraits traduits", "%"),
        ("duplicates", "quasi-doublons", ""),
    ]),
    ("FIABILITÉ", [
        ("reliabilityMedian", "score médian", "/100"),
        ("reliabilityHigh", "score ≥ 70", "%"),
        ("reliabilityLow", "score < 30", "%"),
    ]),
    ("REGISTRE", [
        ("feedsWorking", "flux d'autorités exploitables", ""),
        ("unreachableFeeds", "autorités injoignables", ""),
        ("candidatesWaiting", "sources proposées en attente", ""),
        ("sourcesBlocked", "sources qui bloquent l'agent (--probe)", ""),
        ("sourcesQuiet", "sources actives muettes depuis %d jours" % QUIET_DAYS, ""),
        ("sourcesNeverHeard", "sources actives qui n'ont jamais rien donné", ""),
    ]),
]


def verdict(key, now, before):
    if before is None or now == before:
        return "   ", ""
    delta = now - before
    sign = "+" if delta > 0 else ""
    if key in BETTER_UP:
        good = delta > 0
    elif key in BETTER_DOWN:
        good = delta < 0
    else:
        return "   ", "  (%s%d)" % (sign, delta)
    return ("OK " if good else "!! "), "  (%s%d)" % (sign, delta)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", action="store_true", help="prendre cette exécution comme référence")
    ap.add_argument("--probe", action="store_true",
                    help="interroger chaque source du registre et repérer celles qui bloquent l'agent")
    args = ap.parse_args()

    if args.probe:
        print("sondage des sources du registre…")
        probe_sources()
    now = measure()
    before = load(BASELINE)
    if before:
        print("état du %s — référence du %s\n" % (now["date"], before.get("date", "?")))
    else:
        print("état du %s — aucune référence enregistrée\n" % now["date"])

    # Une file qui vieillit ne se voit pas dans les parts : elles restent
    # identiques pendant que la veille s'arrête. C'est le seul indicateur qui
    # merite d'etre crie.
    if now["daysSinceRun"] >= STALE_DAYS:
        print("!! L'agent n'a rien détecté depuis %d jours (dernière détection le %s)."
              % (now["daysSinceRun"], now["lastRun"] or "?"))
        print("   Tout ce qui suit décrit une photo, pas la situation.\n")

    # Les sources bloquees sont nommees, pas seulement comptees : c'est une
    # liste a traiter, source par source.
    probe = load(PROBE, {}) or {}
    blocked = [v for v in (probe.get("sources") or {}).values() if v.get("state") == "bloquee"]
    if probe:
        age = (date.today() - date.fromisoformat(probe["date"])).days
        if blocked:
            print("!! %d source(s) du registre bloquent l'agent (sondage du %s) :" % (len(blocked), probe["date"]))
            for v in sorted(blocked, key=lambda x: x["since"]):
                print("   %-6s %-44s %-34s depuis le %s" % (v["iso"][:6], v["name"][:44], v["detail"][:34], v["since"]))
            print("   Chercher un canal prévu pour les programmes (flux, API officielle),")
            print("   ou suivre ces pages à la main. Ne pas forcer une vérification anti-robot.\n")
        if age >= STALE_DAYS:
            print("   (sondage vieux de %d jours : relancer avec --probe)\n" % age)
    else:
        print("   Aucun sondage des sources : lancer avec --probe pour repérer les blocages.\n")

    # Le silence d'une source ne remonte nulle part ailleurs : ni erreur, ni
    # chiffre en baisse. On le nomme donc, avec la date de sa derniere trouvaille.
    quiet, never = quiet_sources()
    if quiet or never:
        print("!! %d source(s) active(s) ne rapportent plus rien :" % (len(quiet) + len(never)))
        for r in quiet[:8]:
            print("   %-52s rien depuis le %s" % (r["name"][:52], r["last"]))
        for r in never[:8]:
            print("   %-52s rien depuis son ajout" % r["name"][:52])
        if len(quiet) + len(never) > 16:
            print("   ... et %d autres (data/watch-registry.json)" % (len(quiet) + len(never) - 16))
        print("   Vérifier la requête ou l'adresse avant de conclure que le pays est calme.\n")

    alerts = 0
    for section, rows in LABELS:
        print(section)
        for key, label, unit in rows:
            value = now.get(key, 0)
            flag, delta = verdict(key, value, (before or {}).get(key))
            if flag.startswith("!!"):
                alerts += 1
            print("  %s%-38s %5s%-4s%s" % (flag, label, value, unit, delta))
        print()

    if before:
        print("%d indicateur(s) en recul." % alerts if alerts else "Aucun recul.")
    if args.save:
        BASELINE.write_text(json.dumps(now, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("référence enregistrée -> %s" % BASELINE.relative_to(ROOT))
    else:
        print("--save pour faire de cette exécution la nouvelle référence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
