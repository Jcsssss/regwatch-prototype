#!/usr/bin/env python3
"""Smoke test for the watch agent's collection half — no API key, no cost.

The agent has two halves: collect (RSS/web/API + Excel) and analyse (Azure
OpenAI). Only the second needs credentials. This exercises the first, so a
failure can be attributed before spending a real run:

  - the agent module imports and its dependencies are installed
  - the watch workbook opens and tblSources / tblVeille are readable
  - the declared sources are reachable and parse into items

    python3 tools/smoke_agent.py "<path to agent de veille>" [--feeds N]

Reads only. Nothing is written to the workbook, no state.json is touched.
"""

import argparse
import os
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("agent_dir", help="folder holding nis2_agent_v2.py")
    ap.add_argument("--feeds", type=int, default=3, help="how many RSS sources to probe")
    args = ap.parse_args()

    agent_dir = Path(args.agent_dir).expanduser()
    script = agent_dir / "nis2_agent_v2.py"
    if not script.exists():
        raise SystemExit("nis2_agent_v2.py introuvable dans %s" % agent_dir)

    workbook = agent_dir / "agent_veille_NIS2.xlsx"
    # The module reads EXCEL_FILE at import time and refuses to load without it.
    os.environ.setdefault("EXCEL_FILE", str(workbook))
    os.environ.setdefault("AZURE_OPENAI_API_KEY", "smoke-test-not-used")
    os.environ.setdefault("AZURE_OPENAI_ENDPOINT", "https://smoke.openai.azure.com")
    sys.path.insert(0, str(agent_dir))

    print("1. import du module agent")
    try:
        import nis2_agent_v2 as agent
    except ImportError as error:
        print("   ECHEC — dépendance manquante : %s" % error)
        print("   -> pip install -r requirements.txt")
        return 1
    print("   OK — %d fonctions exposées" % sum(1 for n in dir(agent) if callable(getattr(agent, n))))

    print("\n2. lecture du classeur de veille")
    if not workbook.exists():
        print("   ECHEC — classeur absent : %s" % workbook)
        return 1
    from openpyxl import load_workbook
    wb = load_workbook(workbook, data_only=True)
    _, _, src_headers, src_rows = agent.get_table_data(wb, agent.SOURCE_TABLE_NAME)
    _, _, _, watch_rows = agent.get_table_data(wb, agent.WATCH_TABLE_NAME)
    print("   OK — tblSources : %d lignes | tblVeille : %d lignes" % (len(src_rows), len(watch_rows)))

    name_col = agent.find_column_name(src_headers, ["Source"])
    type_col = agent.find_column_name(src_headers, ["Type"])
    url_col = agent.find_column_name(src_headers, ["URL / Endpoint", "URL"])
    active_col = agent.find_column_name(src_headers, ["Actif"])

    feeds = []
    for row in src_rows:
        if str(agent.row_value(row, active_col, "")).strip().lower() in ("non", "no", "false", "0"):
            continue
        if str(agent.row_value(row, type_col, "")).strip().upper() != "RSS":
            continue
        url = str(agent.row_value(row, url_col, "")).strip()
        if url:
            feeds.append((str(agent.row_value(row, name_col, "?")), url))
    print("   sources RSS actives : %d" % len(feeds))

    print("\n3. collecte réelle sur %d flux (aucun appel IA)" % min(args.feeds, len(feeds)))
    total, failures = 0, 0
    for name, url in feeds[:args.feeds]:
        try:
            items = agent.fetch_rss_items(name, url)
            total += len(items)
            print("   OK   %-42s %3d entrées" % (name[:42], len(items)))
        except Exception as error:
            failures += 1
            print("   FAIL %-42s %s" % (name[:42], str(error)[:60]))

    print("\n%s" % ("-" * 62))
    if failures:
        print("Collecte partielle : %d flux en échec sur %d." % (failures, min(args.feeds, len(feeds))))
    print("%d entrées récupérées. La moitié collecte fonctionne." % total)
    print("Reste à valider la moitié IA : python3 tools/check_azure.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
