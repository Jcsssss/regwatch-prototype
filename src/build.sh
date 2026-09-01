#!/bin/zsh
# Build RegWatch from source parts.
# Outputs:
#   regwatch-artifact.html — artifact content (no doctype/html/body wrapper)
#   regwatch.html          — full standalone file (double-click to open anywhere)
#   test_light/dark/val.html — local test wrappers for headless screenshots
set -e
cd "$(dirname "$0")"

# data_watch.js is the watch agent's output (tools/veille_to_watchitems.py).
# Optional: without it the build falls back to the demo queue in data_c4.js.
AGENT_DATA=()
[ -f reg/nis2/data_watch.js ] && AGENT_DATA=(reg/nis2/data_watch.js)

# data_template.js is the base64 slide template (tools/embed_deck_template.py).
# Optional: without it the "Generate country slides" button reports it is absent.
DECK_TPL=()
[ -f reg/nis2/data_template.js ] && DECK_TPL=(reg/nis2/data_template.js)

# Shared shell, then one block per regulation (src/reg/<id>/), then the app.
# Adding DORA means adding a folder and one line here.
# Arrays, not strings: zsh does not word-split an unquoted scalar.
SHARED=(map_data.js data_meta.js data_flags.js)
NIS2=(reg/nis2/data_excel.js reg/nis2/data_docs.js reg/nis2/data_authorities.js
      reg/nis2/data_kpis.js
      reg/nis2/data_c1.js reg/nis2/data_c2.js reg/nis2/data_c3.js reg/nis2/data_c4.js)
REC=(reg/rec/data_countries.js)
APP=(app_i18n.js app_reg.js app_part1.js app_part2.js app_kpi.js app_kpi_xlsx.js
     app_corpus.js app_chat.js app_deck.js)

cat $SHARED $NIS2 $REC $AGENT_DATA $DECK_TPL $APP > bundle.js
node --check bundle.js

{ cat shell_top.html; echo '<script>'; cat bundle.js; echo '</script>'; } > regwatch-artifact.html

{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '</head><body>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > regwatch.html

{ echo '<!doctype html><html><head><meta charset="utf-8"></head><body>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > test_light.html

{ echo '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"></head><body>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > test_dark.html

{ echo '<!doctype html><html><head><meta charset="utf-8"></head><body>'
  echo '<script>localStorage.setItem("regwatch-proto-v1",JSON.stringify({overrides:{},manual:[],role:"validator"}));</script>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > test_val.html

ls -la regwatch.html regwatch-artifact.html
