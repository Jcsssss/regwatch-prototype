"""Drop-in module for the NIS 2 watch agent: push a run's new rows to RegWatch.

Copy this file next to `nis2_agent_v2.py`, then add two lines to `run_agent()`,
immediately after `save_state(state)` (i.e. once the Excel write has succeeded):

    from regwatch_push import push_to_regwatch
    push_to_regwatch(added_items)

`added_items` already holds one dict per appended tblVeille row, keyed by column
name — the exact shape this module maps from.

Design rules, in order of importance:

1. **Never break the run.** Excel stays the system of record for the agent. Every
   failure here is caught and logged; the agent's exit status is unaffected. A
   RegWatch outage must not cost a week of collection and its Azure OpenAI spend.
2. **Never publish.** Items are posted as `pending`. RegWatch decides nothing on
   its own — a human validator does, per the governance rule.
3. **Opt-in.** Without `REGWATCH_API_URL` set, this is a no-op, so the module can
   sit in the repo before the API exists.

Configuration (add to the agent's `.env`):

    REGWATCH_API_URL=https://regwatch.<host>/api/watch-items
    REGWATCH_API_TOKEN=<bearer token issued by RegWatch>
    REGWATCH_PUSH_TIMEOUT=30

The country table below mirrors `tools/veille_to_watchitems.py` in the RegWatch
repo. Keep the two in sync, or better: have the agent write an ISO code into
tblVeille and delete both tables.
"""

import json
import logging
import os
import re
import unicodedata
from datetime import date, datetime, timedelta

try:
    import requests
except ImportError:  # the agent already depends on requests; guard anyway
    requests = None

EXCEL_EPOCH = date(1899, 12, 30)

COUNTRY_ISO = {
    "allemagne": "DE", "autriche": "AT", "belgique": "BE", "bulgarie": "BG",
    "chypre": "CY", "croatie": "HR", "danemark": "DK", "espagne": "ES",
    "estonie": "EE", "finlande": "FI", "france": "FR", "grece": "GR",
    "hongrie": "HU", "irlande": "IE", "italie": "IT", "lettonie": "LV",
    "lituanie": "LT", "luxembourg": "LU", "malte": "MT", "norvege": "NO",
    "pays-bas": "NL", "pologne": "PL", "portugal": "PT", "republique tcheque": "CZ",
    "tchequie": "CZ", "roumanie": "RO", "royaume-uni": "GB", "slovaquie": "SK",
    "slovenie": "SI", "suede": "SE",
    "union europeenne": "EU", "ue": "EU", "europe": "EU", "eu": "EU",
}

RELIABILITY_TYPE = {
    "officielle": "official",
    "presse (agregateur) - a verifier": "unofficial",
}


def _fold(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def _iso_date(value):
    """tblVeille holds ISO strings, datetimes and Excel serials depending on the row."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        return text[:10]
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return (EXCEL_EPOCH + timedelta(days=int(float(text)))).isoformat()
    return ""


def _first(row, *keys):
    for k in keys:
        v = str(row.get(k, "") or "").strip()
        if v:
            return v
    return ""


def _countries(value):
    codes = []
    for part in re.split(r"[;,/]| et ", str(value or "")):
        code = COUNTRY_ISO.get(_fold(part))
        if code and code not in codes:
            codes.append(code)
    return codes


def to_watch_items(rows):
    """Map tblVeille row dicts to RegWatch WatchItems. One row may yield several
    items when it covers more than one country."""
    items = []
    for row in rows:
        title = _first(row, "Titre")
        if not title:
            continue
        codes = _countries(row.get("Pays / Zone"))
        if not codes:
            logging.warning(
                "RegWatch: pays non reconnu (%r) — item non poussé : %s",
                row.get("Pays / Zone"), title[:80],
            )
            continue

        base_id = _first(row, "ID")
        score = _first(row, "Score pertinence IA")
        for code in codes:
            items.append({
                "id": base_id if len(codes) == 1 else "%s-%s" % (base_id, code),
                "detected": _iso_date(row.get("Date détection")) or date.today().isoformat(),
                "iso": code,
                "title": title,
                "summary": _first(row, "Résumé") or "No summary provided by the agent.",
                "source": {
                    "name": _first(row, "Autorité émettrice", "Source d'origine") or "Watch agent",
                    "url": _first(row, "URL source"),
                    "type": RELIABILITY_TYPE.get(_fold(row.get("Fiabilité source")), "unofficial"),
                },
                "status": "pending",  # never anything else — validation is a human act
                "action": _first(row, "Actions recommandées"),
                "agent": {
                    "score": int(score) if score.isdigit() else None,
                    "justification": _first(row, "Raison pertinence IA ", "Raison pertinence IA"),
                    "obligations": _first(row, "Obligations principales"),
                    "impact": _first(row, "Niveau impact", "Score impact"),
                    "entities": _first(row, "Entités concernées"),
                    "publishedOn": _iso_date(row.get("Date publication")),
                    "inForceOn": _iso_date(row.get("Date entrée en vigueur")),
                    "textType": _first(row, "Type de texte"),
                },
            })
    return items


def push_to_regwatch(added_items):
    """POST this run's new rows to RegWatch. Returns True on success, False otherwise.

    Never raises: the Excel workbook is already saved by the time this runs, and a
    failed push must not fail the run.
    """
    url = (os.getenv("REGWATCH_API_URL") or "").strip()
    if not url:
        return False  # not configured yet — silent no-op by design
    if requests is None:
        logging.error("RegWatch: module 'requests' indisponible, push ignoré.")
        return False
    if not added_items:
        logging.info("RegWatch: aucune nouvelle ligne à pousser.")
        return True

    try:
        items = to_watch_items(added_items)
    except Exception as error:  # a mapping bug must not fail the run either
        logging.exception("RegWatch: échec du mapping, push abandonné : %s", error)
        return False

    if not items:
        logging.warning("RegWatch: %d ligne(s) ajoutée(s) mais 0 item mappable.", len(added_items))
        return False

    headers = {"Content-Type": "application/json"}
    token = (os.getenv("REGWATCH_API_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token

    payload = {
        "source": "agent de veille NIS2",
        "runAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "count": len(items),
        "items": items,
    }

    try:
        response = requests.post(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            timeout=float(os.getenv("REGWATCH_PUSH_TIMEOUT", "30")),
        )
        response.raise_for_status()
    except Exception as error:
        # Excel keeps the data; the push can be replayed by re-running the
        # RegWatch-side converter on the workbook.
        logging.error("RegWatch: push échoué (%s). Les lignes restent dans Excel.", error)
        print("ATTENTION : envoi vers RegWatch échoué — les lignes sont bien dans Excel.")
        return False

    logging.info("RegWatch: %d item(s) poussé(s) vers %s", len(items), url)
    print(f"RegWatch : {len(items)} item(s) envoyés en file de validation.")
    return True
